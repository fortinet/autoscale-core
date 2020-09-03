import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import {
    VpnAttachmentStrategy,
    VpnAttachmentStrategyResult
} from '../../context-strategy/vpn-attachment-context';
import {
    waitFor,
    WaitForConditionChecker,
    WaitForPromiseEmitter,
    WaitForMaxCount
} from '../../helper-function';
import { ResourceFilter, TgwVpnAttachmentRecord } from '../../platform-adapter';
import { VirtualMachine } from '../../virtual-machine';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsPlatformAdapter } from './aws-platform-adapter';
import {
    AwsVpnAttachmentState,
    AwsVpnConnection,
    AwsTgwVpnUpdateAttachmentRouteTableRequest
} from './transit-gateway-context';
import {
    AwsTgwLambdaInvocable,
    AwsLambdaInvocableExecutionTimeOutError
} from './aws-lambda-invocable';

const TAG_KEY_AUTOSCALE_TGW_VPN_RESOURCE = 'AutoscaleTgwVpnResource';
const TAG_KEY_RESOURCE_GROUP = 'ResourceGroup';

export class AwsTgwVpnAttachmentStrategy implements VpnAttachmentStrategy {
    protected vm: VirtualMachine;
    protected platform: AwsPlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected bgpAsn: number;
    constructor(platform: AwsPlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(vm: VirtualMachine, bgpAsn = 65000): Promise<void> {
        this.vm = vm;
        this.bgpAsn = bgpAsn;
        return Promise.resolve();
    }

    async tags(): Promise<ResourceFilter[]> {
        const settings = await this.platform.getSettings();
        const resourceTagPrefix = settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix)
            .value;
        const transitGatewayId = settings.get(AwsFortiGateAutoscaleSetting.AwsTransitGatewayId)
            .value;
        return [
            {
                key: TAG_KEY_AUTOSCALE_TGW_VPN_RESOURCE,
                value: transitGatewayId,
                isTag: true
            },
            {
                key: TAG_KEY_RESOURCE_GROUP,
                value: resourceTagPrefix,
                isTag: true
            }
        ];
    }

    async attach(): Promise<VpnAttachmentStrategyResult> {
        this.proxy.logAsDebug('calling AwsTgwVpnAttachmentStrategy.attach');
        // ASSERT: only allow 1 TGW VPN attachment per vm
        try {
            const vpnAttachmentRecord = await this.platform.getTgwVpnAttachmentRecord(
                this.vm.id,
                this.vm.primaryPublicIpAddress
            );
            if (vpnAttachmentRecord) {
                this.proxy.logAsWarning(
                    'Only one vpn attachment can be associated with' +
                        ` vm(id: ${this.vm.id}). One found (associated ip: ${vpnAttachmentRecord.ip}).`
                );
                this.proxy.logAsDebug('called AwsTgwVpnAttachmentStrategy.attach');
                return VpnAttachmentStrategyResult.ShouldContinue;
            }
        } catch (error) {}
        let customerGatewayCreated = false;
        let vpnConnectionCreated = false;
        const settings = await this.platform.getSettings();
        const resourceTagPrefix = settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix)
            .value;
        const bgpAsn = Number(settings.get(AwsFortiGateAutoscaleSetting.VpnBgpAsn).value);
        const transitGatewayId = settings.get(AwsFortiGateAutoscaleSetting.AwsTransitGatewayId)
            .value;
        const customerGatewayResourceName = [
            resourceTagPrefix,
            'customer-gateway',
            this.vm.id,
            this.vm.primaryPublicIpAddress
        ].join('-');
        const vpnResourceName = [
            resourceTagPrefix,
            'vpn-connection',
            this.vm.id,
            this.vm.primaryPublicIpAddress
        ].join('-');
        const tgwAttachmentResourceName = [
            resourceTagPrefix,
            'tgw-attachment-vpn',
            this.vm.id,
            this.vm.primaryPublicIpAddress
        ].join('-');

        const tags: ResourceFilter[] = await this.tags();
        let customerGatewayId: string;
        let vpnConnection: AwsVpnConnection;
        try {
            // create a required customer gateway
            customerGatewayId = await this.platform.createAwsCustomerGateway(
                bgpAsn,
                this.vm.primaryPublicIpAddress,
                customerGatewayResourceName
            );
            customerGatewayCreated = true;
            // create the vpn AwsVpnConnection
            vpnConnection = await this.platform.createAwsTgwVpnConnection(
                bgpAsn,
                this.vm.primaryPublicIpAddress,
                customerGatewayId,
                transitGatewayId
            );
            vpnConnection.vmId = this.vm.id;
            vpnConnectionCreated = true;
        } catch (error) {
            this.proxy.logForError('Failed to create vpn connection.', error);
            // revert creation
            const reverts = [];
            if (customerGatewayCreated) {
                reverts.push(
                    this.platform.deleteAwsCustomerGateway(customerGatewayId).catch(err => {
                        this.proxy.logForError(
                            'Failed to delete aws customer gateway' + `(id: ${customerGatewayId}).`,
                            err
                        );
                        return true;
                    })
                );
            }
            if (vpnConnectionCreated) {
                reverts.push(
                    this.platform
                        .deleteAwsVpnConnection(vpnConnection.vpnConnectionId)
                        .catch(err => {
                            this.proxy.logForError(
                                'Failed to delete aws vpn connection' +
                                    ` (id: ${vpnConnection.vpnConnectionId}).`,
                                err
                            );
                            return true;
                        })
                );
            }
            await Promise.all(reverts);
            return VpnAttachmentStrategyResult.ShouldTerminateVm;
        }
        // tag the resources
        const tagTasks = [
            this.platform
                .tagResource(
                    [customerGatewayId],
                    [...tags, { key: 'Name', value: customerGatewayResourceName }]
                )
                .catch(err => {
                    this.proxy.logForError(
                        'tag not added to customer gateway' + ` (id: ${customerGatewayId})`,
                        err
                    );
                    return true;
                }),
            this.platform
                .tagResource(
                    [vpnConnection.vpnConnectionId],
                    [...tags, { key: 'Name', value: vpnResourceName }]
                )
                .catch(err => {
                    this.proxy.logForError(
                        'tag not added to vpn connection' +
                            ` (id: ${vpnConnection.vpnConnectionId})`,
                        err
                    );
                    return true;
                }),
            this.platform
                .tagResource(
                    [vpnConnection.transitGatewayAttachmentId],
                    [...tags, { key: 'Name', value: tgwAttachmentResourceName }]
                )
                .catch(err => {
                    this.proxy.logForError(
                        'tag not added to transit gateway attachment' +
                            ` (id: ${vpnConnection.transitGatewayAttachmentId})`,
                        err
                    );
                    return true;
                })
        ];

        // ASSERT: none of these tag task throws an error. error are caught and printed to log
        await Promise.all(tagTasks);

        // it takes a long time (several minutes) to complete updating the tgw route so
        // invoke a tgw vpn handler Lambda function to continue the updating route tasks
        // in order to not block the main autoscale handler function process.

        const request: AwsTgwVpnUpdateAttachmentRouteTableRequest = {
            attachmentId: vpnConnection.transitGatewayAttachmentId
        };
        const handlerName = settings.get(
            AwsFortiGateAutoscaleSetting.AwsTransitGatewayVpnHandlerName
        ).value;
        this.platform.invokeAutoscaleFunction(
            {
                ...request
            },
            handlerName,
            AwsTgwLambdaInvocable.UpdateTgwAttachmentRoutTable
        );

        // save the tgw vpn attachment record
        try {
            await this.platform.saveTgwVpnAttachmentRecord(
                this.vm.id,
                this.vm.primaryPublicIpAddress,
                vpnConnection.vpnConnectionId
            );
        } catch (error) {
            this.proxy.logForError('Failed to complete updateTgwVpnAttachmentRecord.', error);
            this.proxy.logAsDebug('called AwsTgwVpnAttachmentStrategy.attach');
            return VpnAttachmentStrategyResult.ShouldTerminateVm;
        }
        this.proxy.logAsDebug('called AwsTgwVpnAttachmentStrategy.attach');
        return VpnAttachmentStrategyResult.ShouldContinue;
    }
    async detach(): Promise<VpnAttachmentStrategyResult> {
        this.proxy.logAsDebug('calling AwsTgwVpnAttachmentStrategy.detach');
        let vpnAttachmentRecord: TgwVpnAttachmentRecord;
        try {
            vpnAttachmentRecord = await this.platform.getTgwVpnAttachmentRecord(
                this.vm.id,
                this.vm.primaryPublicIpAddress
            );
        } catch (error) {
            this.proxy.logForError(
                'No vpn attachment associated with this vm. stop processing.',
                error
            );
            this.proxy.logAsDebug('called AwsTgwVpnAttachmentStrategy.detach');
            return VpnAttachmentStrategyResult.ShouldContinue;
        }
        try {
            // the following components must be deleted one by one
            // delete vpn
            await this.platform.deleteAwsVpnConnection(vpnAttachmentRecord.vpnConnectionId);
            this.proxy.logAsDebug('vpn connection deleted.');
            // delete customer gateway
            await this.platform.deleteAwsCustomerGateway(vpnAttachmentRecord.customerGatewayId);
            this.proxy.logAsDebug('customer gateway deleted.');
            // delete vpn attachment record
            await this.platform.deleteTgwVpnAttachmentRecord(
                vpnAttachmentRecord.vmId,
                vpnAttachmentRecord.ip
            );
            this.proxy.logAsDebug('vpn attachment recored deleted.');
            this.proxy.logAsDebug('called AwsTgwVpnAttachmentStrategy.detach');
            return VpnAttachmentStrategyResult.ShouldContinue;
        } catch (error) {
            this.proxy.logForError('Failed to delete vpn component.', error);
            return VpnAttachmentStrategyResult.ShouldContinue;
        }
    }

    /**
     *
     * this process may take a long time (approx. 3 mins) to complete.
     * calling this method requires the function to have a longer excecution timeout.
     * @param {string} attachmentId tgw attachment id
     * @throw error
     * @returns {Promise<void>} void
     */
    async updateTgwAttachmentRouteTable(attachmentId: string): Promise<void> {
        this.proxy.logAsInfo('calling AwsTgwVpnAttachmentStrategy.updateTgwAttachmentRouteTable');
        const waitForInterval = 5000; // ms
        const timeBeforeRemainingExecution = 10000; // ms
        const emitter: WaitForPromiseEmitter<AwsVpnAttachmentState> = () => {
            return this.platform.getAwsTgwVpnAttachmentState(attachmentId);
        };

        const checker: WaitForConditionChecker<AwsVpnAttachmentState> = (
            state: AwsVpnAttachmentState,
            callCount: number
        ) => {
            // wait for nearly the end of Lambda Function execution timeout
            if (
                callCount * waitForInterval >
                this.proxy.getRemainingExecutionTime() - timeBeforeRemainingExecution
            ) {
                throw new AwsLambdaInvocableExecutionTimeOutError(
                    'Execution timeout. Maximum amount of waiting time:' +
                        ` ${(callCount * waitForInterval) / 1000} seconds, have been reached.`
                );
            }
            if (
                !Object.values(AwsVpnAttachmentState)
                    .map(s => s as string)
                    .includes(state)
            ) {
                throw new Error(`Unexpected state: ${state}.`);
            } else {
                this.proxy.logAsInfo(`vpn attachment state: ${state}.`);
                return Promise.resolve(state === AwsVpnAttachmentState.Available);
            }
        };
        try {
            // wait for the transit gateway to become available
            await waitFor<AwsVpnAttachmentState>(
                emitter,
                checker,
                waitForInterval,
                this.proxy,
                WaitForMaxCount.NoMaxCount
            );
            const settings = await this.platform.getSettings();
            const outboutRouteTable = settings.get(
                AwsFortiGateAutoscaleSetting.AwsTransitGatewayRouteTableOutbound
            ).value;
            const inboutRouteTable = settings.get(
                AwsFortiGateAutoscaleSetting.AwsTransitGatewayRouteTableInbound
            ).value;
            await this.platform.updateTgwVpnAttachmentRouting(
                attachmentId,
                outboutRouteTable,
                inboutRouteTable
            );
            this.proxy.logAsInfo(
                'called AwsTgwVpnAttachmentStrategy.updateTgwAttachmentRouteTable'
            );
        } catch (error) {
            this.proxy.logForError('Failed to complete updateTgwAttachmentRouteTable', error);
            this.proxy.logAsInfo(
                'called AwsTgwVpnAttachmentStrategy.updateTgwAttachmentRouteTable'
            );
            throw error;
        }
    }

    async cleanup(): Promise<number> {
        this.proxy.logAsInfo('calling AwsTgwVpnAttachmentStrategy.cleanup.');
        let errorCount = 0;
        const tags: ResourceFilter[] = await this.tags();
        const [vpnIdList, cgwIdList] = await Promise.all([
            this.platform.listAwsVpnConnectionIds(tags),
            this.platform.listAwsCustomerGatewayIds(tags)
        ]);
        await Promise.all(
            vpnIdList.map(vpnId => {
                this.platform
                    .deleteAwsVpnConnection(vpnId)
                    .then(() => {
                        return true;
                    })
                    .catch(vpnError => {
                        this.proxy.logForError(
                            `error in deleting vpn connection (id: ${vpnId})`,
                            vpnError
                        );
                        errorCount++;
                        return true;
                    });
            })
        );
        await Promise.all(
            cgwIdList.map(cgwId => {
                this.platform
                    .deleteAwsCustomerGateway(cgwId)
                    .then(() => {
                        return true;
                    })
                    .catch(cgwError => {
                        this.proxy.logForError(
                            `error in deleting customer gateway (id: ${cgwId})`,
                            cgwError
                        );
                        errorCount++;
                        return true;
                    });
            })
        );
        this.proxy.logAsInfo('called AwsTgwVpnAttachmentStrategy.cleanup.');
        return errorCount;
    }
}
