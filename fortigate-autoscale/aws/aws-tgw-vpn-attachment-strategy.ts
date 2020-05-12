import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import {
    VpnAttachmentStrategy,
    VpnAttachmentStrategyResult
} from '../../context-strategy/vpn-attachment-context';
import { waitFor, WaitForConditionChecker, WaitForPromiseEmitter } from '../../helper-function';
import { ResourceTag, TgwVpnAttachmentRecord } from '../../platform-adapter';
import { VirtualMachine } from '../../virtual-machine';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import {
    AwsPlatformAdapter,
    AwsVpnAttachmentState,
    AwsVpnConnection
} from './aws-platform-adapter';

export class AwsTgwVpnAttachmentStrategy implements VpnAttachmentStrategy {
    protected vm: VirtualMachine;
    protected platform: AwsPlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected bgpAsn: number;
    prepare(
        platform: AwsPlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine,
        bgpAsn = 65000
    ): Promise<void> {
        this.vm = vm;
        this.platform = platform;
        this.proxy = proxy;
        this.bgpAsn = bgpAsn;
        return Promise.resolve();
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
        const settings = this.platform.settings;
        const resourceTagPrefix = settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix)
            .value;
        const bgpAsn = Number(settings.get(AwsFortiGateAutoscaleSetting.AwsVpnBgpAsn).value);
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
        const tags: ResourceTag[] = [
            {
                key: 'AutoscaleTgwVpnResource',
                value: transitGatewayId
            },
            {
                key: 'ResourceGroup',
                value: resourceTagPrefix
            }
        ];
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

        const request = {
            attachmentId: vpnConnection.transitGatewayAttachmentId
        };
        this.platform.invokeAutoscaleFunction('updateTgwAttachmentRouteTable', request);

        // save the tgw vpn attachment record
        try {
            await this.platform.saveAwsTgwVpnAttachmentRecord(
                this.vm.id,
                this.vm.primaryPrivateIpAddress,
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
            await this.platform.deleteAwsTgwVpnAttachmentRecord(
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
        this.proxy.logAsDebug('calling AwsTgwVpnAttachmentStrategy.updateTgwAttachmentRouteTable');
        const waitForInterval = 5000;
        const emitter: WaitForPromiseEmitter<AwsVpnAttachmentState> = () => {
            return this.platform.getAwsTgwVpnAttachmentState(attachmentId);
        };

        const checker: WaitForConditionChecker<AwsVpnAttachmentState> = (
            state: AwsVpnAttachmentState,
            callCount: number
        ) => {
            // wait for up to 5 minutes
            if (callCount * waitForInterval > 300000) {
                throw new Error(
                    'maximum amount of waiting time:' +
                        ` ${(callCount * waitForInterval) / 1000} seconds, have been reached.`
                );
            }
            if (!(state in AwsVpnAttachmentState)) {
                throw new Error(`Unexpected state: ${state}.`);
            } else {
                return Promise.resolve(state === AwsVpnAttachmentState.Available);
            }
        };
        try {
            // wait for the transit gateway to become available
            await waitFor<AwsVpnAttachmentState>(emitter, checker, waitForInterval, this.proxy);
            const settings = this.platform.settings;
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
            this.proxy.logAsDebug(
                'called AwsTgwVpnAttachmentStrategy.updateTgwAttachmentRouteTable'
            );
        } catch (error) {
            this.proxy.logForError('Failed to complete updateTgwAttachmentRouteTable', error);
            this.proxy.logAsDebug(
                'called AwsTgwVpnAttachmentStrategy.updateTgwAttachmentRouteTable'
            );
            throw error;
        }
    }
    // protected listVpnAttachmentRecord;
}
