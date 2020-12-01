import { Context } from 'aws-lambda';
import { FazDeviceRegistration } from 'fortigate-autoscale/fortigate-faz-integration-strategy';

import { AutoscaleEnvironment } from '../../autoscale-environment';
import { CloudFunctionProxyAdapter, ReqType } from '../../cloud-function-proxy';
import {
    ConstantIntervalHeartbeatSyncStrategy,
    NoopRoutingEgressTrafficStrategy,
    PreferredGroupPrimaryElection
} from '../../context-strategy/autoscale-context';
import { ReusableLicensingStrategy } from '../../context-strategy/licensing-context';
import {
    NicAttachmentContext,
    NicAttachmentStrategy,
    NicAttachmentStrategyResult,
    NoopNicAttachmentStrategy
} from '../../context-strategy/nic-attachment-context';
import {
    NoopVpnAttachmentStrategy,
    VpnAttachmentStrategy,
    VpnAttachmentStrategyResult
} from '../../context-strategy/vpn-attachment-context';
import { waitFor, WaitForConditionChecker, WaitForPromiseEmitter } from '../../helper-function';
import { JSONable } from '../../jsonable';
import { VirtualMachineState } from '../../virtual-machine';
import { FortiGateAutoscale } from '../fortigate-autoscale';
import { FortiGateBootstrapConfigStrategy } from '../fortigate-bootstrap-config-strategy';
import { AwsLambdaInvocationProxy } from './aws-cloud-function-proxy';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsFortiGateBootstrapTgwStrategy } from './aws-fortigate-bootstrap-config-strategy';
import { AwsFazReactiveRegsitrationStrategy } from './aws-fortigate-faz-integration-strategy';
import { AwsHybridScalingGroupStrategy } from './aws-hybrid-scaling-group-strategy';
import {
    AwsLambdaInvocableExecutionTimeOutError,
    AwsLambdaInvocationPayload,
    AwsLambdaInvocable
} from './aws-lambda-invocable';
import { AwsNicAttachmentStrategy } from './aws-nic-attachment-strategy';
import { AwsPlatformAdapter, ScalingGroupState } from './aws-platform-adapter';
import { AwsRoutingEgressTrafficViaPrimaryVmStrategy } from './aws-routing-egress-traffic-via-primary-vm-strategy';
import { AwsTaggingAutoscaleVmStrategy } from './aws-tagging-autoscale-vm-strategy';
import { AwsTgwVpnAttachmentStrategy } from './aws-tgw-vpn-attachment-strategy';
import {
    AwsTgwVpnUpdateAttachmentRouteTableRequest,
    TransitGatewayContext
} from './transit-gateway-context';

/** ./aws-fortigate-autoscale-lambda-invocable
 * AWS FortiGate Autoscale - class, with capabilities:
 * inherited capabilities and
 * FortiGate bootstrap configuration
 * FortiGate hybrid licensing model
 * a secondary network interface
 */
export class AwsFortiGateAutoscale<TReq, TContext, TRes>
    extends FortiGateAutoscale<TReq, TContext, TRes>
    implements NicAttachmentContext, TransitGatewayContext {
    nicAttachmentStrategy: NicAttachmentStrategy;
    vpnAttachmentStrategy: VpnAttachmentStrategy;
    get platform(): AwsPlatformAdapter {
        return super.platform as AwsPlatformAdapter;
    }
    set platform(p: AwsPlatformAdapter) {
        super.platform = p;
    }
    constructor(p: AwsPlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        super(p, e, x);
        // use AWS Hybrid scaling group strategy
        this.setScalingGroupStrategy(new AwsHybridScalingGroupStrategy(p, x));
        // use peferred group primary election for Hybrid licensing model
        this.setPrimaryElectionStrategy(new PreferredGroupPrimaryElection(p, x));
        // use a constant interval heartbeat sync strategy
        this.setHeartbeatSyncStrategy(new ConstantIntervalHeartbeatSyncStrategy(p, x));
        // use AWS resource tagging strategy
        this.setTaggingAutoscaleVmStrategy(new AwsTaggingAutoscaleVmStrategy(p, x));
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(new FortiGateBootstrapConfigStrategy(p, x, e));
        // use the Resuable licensing strategy
        this.setLicensingStrategy(new ReusableLicensingStrategy(p, x));
        // use the secondary nic attachment strategy to create and attach an additional nic
        // during launching
        this.setNicAttachmentStrategy(new AwsNicAttachmentStrategy(p, x));
        // use Noop vpn attachment strategy
        this.setVpnAttachmentStrategy(new NoopVpnAttachmentStrategy(p, x));
        // use the routing egress traffic via primary vm strategy
        this.setRoutingEgressTrafficStrategy(
            new AwsRoutingEgressTrafficViaPrimaryVmStrategy(p, x, e)
        );
        // use the reactive registration strategy for FAZ integration
        this.setFazIntegrationStrategy(new AwsFazReactiveRegsitrationStrategy(p, x));
    }
    setNicAttachmentStrategy(strategy: NicAttachmentStrategy): void {
        this.nicAttachmentStrategy = strategy;
    }
    setVpnAttachmentStrategy(strategy: VpnAttachmentStrategy): void {
        this.vpnAttachmentStrategy = strategy;
    }
    async handleNicAttachment(): Promise<NicAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling handleNicAttachment');
        if (!this.env.targetVm || this.env.targetVm.state === VirtualMachineState.Terminated) {
            return NicAttachmentStrategyResult.ShouldTerminateVm;
        }
        this.nicAttachmentStrategy.prepare(this.env.targetVm);
        try {
            const result = await this.nicAttachmentStrategy.attach();
            // ASSERT: the result is either Failed or Success
            if (result === NicAttachmentStrategyResult.Failed) {
                this.proxy.logAsError(
                    'Failed to complete nic attachment on ' + `vm(id: ${this.env.targetVm.id})`
                );
                this.proxy.logAsInfo('called handleNicAttachment');
                return NicAttachmentStrategyResult.ShouldTerminateVm;
            } else {
                this.proxy.logAsInfo('called handleNicAttachment');
                return NicAttachmentStrategyResult.ShouldContinue;
            }
        } catch (error) {
            this.proxy.logForError('Error in handling nic attachment.', error);
            this.proxy.logAsInfo('called handleNicAttachment');
            return NicAttachmentStrategyResult.ShouldTerminateVm;
        }
    }
    async handleNicDetachment(): Promise<NicAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling handleNicDetachment');
        this.nicAttachmentStrategy.prepare(this.env.targetVm);
        try {
            const result = await this.nicAttachmentStrategy.detach();
            // ASSERT: the result is either Failed or Success
            if (result === NicAttachmentStrategyResult.Failed) {
                this.proxy.logAsError(
                    'Failed to complete nic detachment on ' + `vm(id: ${this.env.targetVm.id})`
                );
                this.proxy.logAsInfo('called handleNicDetachment');
                return NicAttachmentStrategyResult.ShouldTerminateVm;
            } else {
                this.proxy.logAsInfo('called handleNicDetachment');
                return NicAttachmentStrategyResult.ShouldContinue;
            }
        } catch (error) {
            this.proxy.logForError('Error in handling nic detachment.', error);
            this.proxy.logAsInfo('called handleNicDetachment');
            return NicAttachmentStrategyResult.ShouldTerminateVm;
        }
    }
    async cleanupUnusedNic(): Promise<NicAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling cleanupUnusedNic');
        const emitter: WaitForPromiseEmitter<number> = () => {
            return this.nicAttachmentStrategy.cleanUp();
        };
        const checker: WaitForConditionChecker<number> = (failureNum, callCount) => {
            if (callCount >= 3) {
                throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
            }
            return Promise.resolve(failureNum === 0);
        };
        try {
            this.nicAttachmentStrategy.prepare(this.env.targetVm);
            await waitFor<number>(emitter, checker, 5000, this.proxy);
            this.proxy.logAsInfo('called cleanupUnusedNic');
            return NicAttachmentStrategyResult.Success;
        } catch (error) {
            this.proxy.logForError(
                'Cleanup incomplete. Some network interfaces cannot be deleted',
                error
            );
            this.proxy.logAsInfo('called cleanupUnusedNic');
            return NicAttachmentStrategyResult.Failed;
        }
    }
    async handleVpnAttachment(): Promise<VpnAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling handleVpnAttachment');
        await this.vpnAttachmentStrategy.prepare(this.env.targetVm);
        const result = await this.vpnAttachmentStrategy.attach();
        this.proxy.logAsInfo('called handleVpnAttachment');
        return result;
    }
    async handleVpnDetachment(): Promise<VpnAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling handleVpnDetachment');
        await this.vpnAttachmentStrategy.prepare(this.env.targetVm);
        const result = await this.vpnAttachmentStrategy.detach();
        this.proxy.logAsInfo('called handleVpnDetachment');
        return result;
    }

    async cleanupUnusedVpn(): Promise<VpnAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling cleanupUnusedVpn');
        await this.vpnAttachmentStrategy.prepare(this.env.targetVm);
        const errorCount = await this.vpnAttachmentStrategy.cleanup();
        this.proxy.logAsInfo('called cleanupUnusedVpn');
        return errorCount === 0
            ? VpnAttachmentStrategyResult.Success
            : VpnAttachmentStrategyResult.Failed;
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchingVm');
        await super.handleLaunchingVm();
        this.env.targetVm = await this.platform.getTargetVm();
        const settings = await this.platform.getSettings();
        const lifecycleItem = await this.platform.getLifecycleItem(this.env.targetVm.id);
        // handle nic attachment
        if (settings.get(AwsFortiGateAutoscaleSetting.EnableNic2).truthValue) {
            const nicAttachmentResult = await this.handleNicAttachment();
            if (nicAttachmentResult === NicAttachmentStrategyResult.ShouldTerminateVm) {
                // should abandon this lifecycle
                // REVIEW: does abandonning the lifecycle hook trigger a terminating event fom the
                // auto scaling group? so that it can go into the terminatingvm() workflow afterwards
                this.proxy.logAsInfo('called handleLaunchingVm');
                await this.platform.completeLifecycleAction(lifecycleItem, false);
                return '';
            }
        }
        // handle transit gateway vpn attachment
        if (settings.get(AwsFortiGateAutoscaleSetting.AwsEnableTransitGatewayVpn).truthValue) {
            const vpnAttachmentResult = await this.handleVpnAttachment();
            if (vpnAttachmentResult === VpnAttachmentStrategyResult.ShouldTerminateVm) {
                // should abandon this lifecycle
                // REVIEW: does abandonning the lifecycle hook trigger a terminating event fom the
                // auto scaling group? so that it can go into the terminatingvm() workflow afterwards
                await this.platform.completeLifecycleAction(lifecycleItem, false);
                this.proxy.logAsInfo('called handleLaunchingVm');
                return '';
            }
        }
        // NOTE: do not need to complete the lifecycle hook here. When fgt is fully configured,
        // it will complete the lifecycle hook.
        this.proxy.logAsInfo('called handleLaunchingVm');
        return '';
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleTerminatingVm');
        this.env.targetVm = await this.platform.getTargetVm();
        const settings = await this.platform.getSettings();
        // handle nic detachment
        if (settings.get(AwsFortiGateAutoscaleSetting.EnableNic2).truthValue) {
            await this.handleNicDetachment();
        }
        // handle transit gateway vpn attachment
        if (settings.get(AwsFortiGateAutoscaleSetting.AwsEnableTransitGatewayVpn).truthValue) {
            await this.handleVpnDetachment();
        }
        await super.handleTerminatingVm();
        this.proxy.logAsInfo('called handleTerminatingVm');
        return '';
    }

    async stopScalingGroup(groupNames?: string[]): Promise<void> {
        this.proxy.logAsInfo(
            `calling stopScalingGroup (${(groupNames && groupNames.join(', ')) || 'unspecified'})`
        );
        const settings = await this.platform.getSettings();
        if (!groupNames) {
            groupNames = [
                settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupName).value,
                settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupName).value
            ];
            this.proxy.logAsInfo(
                `added (${groupNames && groupNames.join(', ')}) to the group list.`
            );
        }
        const emitter: WaitForPromiseEmitter<Map<string, ScalingGroupState>> = () => {
            return this.platform.checkScalingGroupState(groupNames);
        };
        const checker: WaitForConditionChecker<Map<string, ScalingGroupState>> = stateMap => {
            this.proxy.logAsInfo(`Remaining time: ${this.proxy.getRemainingExecutionTime()}.`);
            if (this.proxy.getRemainingExecutionTime() < 30000) {
                throw new Error(
                    'Unable to complete because function execution is timing out in 30 seconds.'
                );
            }
            const runningGroups = Array.from(stateMap.values()).filter(
                state => state !== ScalingGroupState.Stopped
            );
            return Promise.resolve(runningGroups.length === 0);
        };
        // update each group and set cap and min size to 0 in order to fully stop the auto scaling group.
        await Promise.all(
            groupNames.map(name => {
                return this.platform.updateScalingGroupSize(name, 0, 0);
            })
        );
        await waitFor<Map<string, ScalingGroupState>>(emitter, checker, 5000, this.proxy, 0);
        this.proxy.logAsInfo(`called stopScalingGroup (${groupNames.join(', ')})`);
    }

    /**
     * @override FortiGateAutoscale
     */
    async onVmFullyConfigured(): Promise<void> {
        // the 1st hb is also the indication of the the vm becoming in-service.
        // complete the scaling group launching strategy
        await this.scalingGroupStrategy.completeLaunching(true);
        await super.onVmFullyConfigured();
    }
}

/**
 * AWS FortiGate Autoscale with Transit Gateway Integration - class, with capabilities:
 * inherited capabilities and
 * FortiGate bootstrap configuration
 * FortiGate hybrid licensing model
 * Single network interface
 * BGP VPN attachment for Transit Gateway Integration
 */
export class AwsFortiGateAutoscaleTgw<TReq, TContext, TRes> extends AwsFortiGateAutoscale<
    TReq,
    TContext,
    TRes
> {
    constructor(p: AwsPlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        super(p, e, x);
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(new AwsFortiGateBootstrapTgwStrategy(p, x, e));
        // use AWS Transit Gateway VPN attachment strategy
        this.setVpnAttachmentStrategy(new AwsTgwVpnAttachmentStrategy(p, x));
        // use Noop Nic attachment strategy
        this.setNicAttachmentStrategy(new NoopNicAttachmentStrategy(p, x));
        // use the Noop routing egress traffic strategy
        this.setRoutingEgressTrafficStrategy(new NoopRoutingEgressTrafficStrategy(p, x));
    }

    async handleTgwAttachmentRouteTable(payload: JSONable): Promise<void> {
        this.proxy.logAsInfo('calling handleTgwAttachmentRouteTable.');
        const request: AwsTgwVpnUpdateAttachmentRouteTableRequest = {
            attachmentId: payload.attachmentId as string
        };
        const strategy = this.vpnAttachmentStrategy as AwsTgwVpnAttachmentStrategy;
        await strategy.updateTgwAttachmentRouteTable(request.attachmentId);
        this.proxy.logAsInfo('called handleTgwAttachmentRouteTable.');
    }
}

export abstract class AwsFortiGateAutoscaleLambdaInvocationHandler {
    abstract get proxy(): AwsLambdaInvocationProxy;
    abstract get platform(): AwsPlatformAdapter;
    /**
     *
     * @param {JSONable} payload the payload to pass to the invoked lambda function
     * @param {AwsLambdaInvocable} invocable the defined invocable options.
     */
    abstract executeInvocable(payload: JSONable, invocable: string): Promise<void>;
    async handleLambdaPeerInvocation(): Promise<void> {
        this.proxy.logAsInfo('calling handleLambdaPeerInvocation.');
        try {
            // init the platform. this step is important
            await this.platform.init();
            const requestType = await this.platform.getRequestType();
            const settings = await this.platform.getSettings();
            if (requestType !== ReqType.CloudFunctionPeerInvocation) {
                this.proxy.logAsWarning('Not a CloudFunctionPeerInvocation type request. Skip it.');
                this.proxy.logAsInfo('called handleLambdaPeerInvocation.');
                return;
            }
            const body = this.proxy.getReqBody();
            const functionEndpoint = this.proxy.context.functionName;
            if (!body) {
                throw new Error('Invalid request body.');
            }
            const extractPayload = (
                payload: JSONable
            ): {
                invocable: string;
                secretKey: string;
                executionTime: number;
                payload: JSONable;
            } => {
                const p: AwsLambdaInvocationPayload = {
                    invocable: undefined,
                    invocationSecretKey: undefined,
                    executionTime: undefined
                };
                Object.assign(p, payload);
                const invocable = p.invocable;
                const secretKey = p.invocationSecretKey;
                // if the payload carries an execution time, the execution time refers to its
                // time been already taken in preceeding relevant invocations.
                const executionTime = isNaN(p.executionTime) ? 0 : p.executionTime;
                delete p.invocable;
                delete p.invocationSecretKey;
                delete p.executionTime;
                return {
                    invocable: invocable,
                    secretKey: secretKey,
                    executionTime: executionTime,
                    payload: p
                };
            };

            const { invocable, secretKey, executionTime, payload } = extractPayload(body);

            const invocationSecretKey = this.platform.createAutoscaleFunctionInvocationKey(
                functionEndpoint,
                payload
            );

            // verify the invocation key
            if (!invocationSecretKey || invocationSecretKey !== secretKey) {
                throw new Error('Invalid invocation payload: invocationSecretKey not matched');
            }
            const currentExecutionStartTime = Date.now(); // ms
            const extendExecution = settings.get(
                AwsFortiGateAutoscaleSetting.AwsAutoscaleFunctionExtendExecution
            );
            const shouldExtendExecution: boolean = extendExecution && extendExecution.truthValue;
            try {
                await this.executeInvocable(payload, invocable);
            } catch (e) {
                if (
                    e instanceof AwsLambdaInvocableExecutionTimeOutError &&
                    e.extendExecution &&
                    shouldExtendExecution
                ) {
                    const maxExecutionTimeItem = settings.get(
                        AwsFortiGateAutoscaleSetting.AwsAutoscaleFunctionMaxExecutionTime
                    );
                    // the maximum execution time allowed for a cloud function
                    // NOTE: the time is set in second.
                    const maxExecutionTime =
                        maxExecutionTimeItem && Number(maxExecutionTimeItem.value);

                    // time taken in preceeding relevent invocations and time taken in
                    // current invocation.
                    // NOTE: this time is also in second.
                    const totalExecutionTime =
                        Math.floor((Date.now() - currentExecutionStartTime) / 1000) + executionTime;

                    // if max execution time not reached, create a new invocation to continue
                    if (totalExecutionTime < maxExecutionTime) {
                        await this.platform.invokeAutoscaleFunction(
                            payload,
                            functionEndpoint,
                            invocable,
                            // carry the total execution time to the next call.
                            totalExecutionTime
                        );
                        this.proxy.logAsInfo(
                            'AutoscaleFunctionExtendExecution is enabled.' +
                                ` Current total execution time is: ${totalExecutionTime} seconds.` +
                                ` Max execution time allowed is: ${maxExecutionTime} seconds.` +
                                ' Now invoke a new Lambda function to continue.'
                        );
                    } else {
                        this.proxy.logAsError(
                            'AutoscaleFunctionExtendExecution is enabled.' +
                                ` Current total execution time is: ${totalExecutionTime} seconds.` +
                                ` Max execution time allowed is: ${maxExecutionTime} seconds.` +
                                ' No more time allowed to wait so it timed out and failed.'
                        );
                        // extended execution reached max execution time allowed.
                        throw e;
                    }
                } else {
                    // not a AwsLambdaInvocableExecutionTimeOutError or not allow to extend execution.
                    throw e;
                }
            }
            this.proxy.logAsInfo('called handleLambdaPeerInvocation.');
            return;
        } catch (error) {
            // ASSERT: error is always an instance of Error
            this.proxy.logForError('called handleLambdaPeerInvocation.', error);
        }
    }
}

export class AwsFortiGateAutoscaleTgwLambdaInvocationHandler extends AwsFortiGateAutoscaleLambdaInvocationHandler {
    autoscale: AwsFortiGateAutoscaleTgw<JSONable, Context, void>;
    constructor(autoscale: AwsFortiGateAutoscaleTgw<JSONable, Context, void>) {
        super();
        this.autoscale = autoscale;
    }

    get proxy(): AwsLambdaInvocationProxy {
        return this.autoscale.proxy as AwsLambdaInvocationProxy;
    }

    get platform(): AwsPlatformAdapter {
        return this.autoscale.platform;
    }

    async executeInvocable(payload: JSONable, invocable: string): Promise<void> {
        if (invocable === AwsLambdaInvocable.UpdateTgwAttachmentRouteTable) {
            // KNOWN ISSUE: Sep. 01, 2020. AWS takes over 10 minutes to stablize a VPN
            // creation where the time was usually approx. 3 mins. The Lambda function that
            // handles the updateTgwAttachmentRouteTable process used to have a 5 minutes
            // execution time out which isn't enough in this situation.
            // updateTgwAttachmentRouteTable will time out and fail.
            // The solution:
            // The caller detects the 'Execution timeout' type error and create a new
            // request to continue to wait until the accumulated processing time
            // hit the maximum execution time: AwsAutoscaleFunctionMaxExecutionTime in the
            // settings. The ultimate time out ends the waiting with a proper error message,
            // and will not proceed. The waitFor time out will rely on the Lambda
            // function execution timeout time. It ends 10 seconds before the Lambda timeout
            // (can be retrieved with proxy.getRemainingExecutionTime()), invokes a new
            // Lambda function request to continue, passing the accumulated processing time
            // in the new request. Unless the VPN stablized, the process keeps creating new
            // invocation to wait.
            // There's a switch to toggle such feature on and off: AwsAutoscaleFunctionExtendExecution

            // NOTE: The invocable must be designed to support for running in extended invocations.
            await this.autoscale.handleTgwAttachmentRouteTable(payload).catch(e => {
                const error: AwsLambdaInvocableExecutionTimeOutError = e;
                error.extendExecution = true;
                throw error;
            });
        }
        // otherwise, no matching invocable, throw error
        throw new AwsLambdaInvocableExecutionTimeOutError(`No matchin invocable for: ${invocable}`);
    }
}

/**
 * This handler must be deployed into a Lambda function with the following Environment Variables:
 * AUTOSCALE_ADMIN_USERNAME: contains the Autoscale admin user created in the FAZ (can be kms-encrypted)
 * AUTOSCALE_ADMIN_PASSWORD: contains the Autoscale admin password created in the FAZ (can be kms-encrypted)
 * FORTIANALYZER_IP: contain the public ip of the (only one) FortiAnalyzer registered to the Autoscale
 * FORTIANALYZER_PORT: contains the api port of the (only one) FortiAnalyzer registered to the Autoscale
 */
export class AwsFortiGateAutoscaleFazIntegrationHandler {
    autoscale: AwsFortiGateAutoscale<JSONable, Context, void>;
    constructor(autoscale: AwsFortiGateAutoscale<JSONable, Context, void>) {
        this.autoscale = autoscale;
    }
    get proxy(): AwsLambdaInvocationProxy {
        return this.autoscale.proxy as AwsLambdaInvocationProxy;
    }

    get platform(): AwsPlatformAdapter {
        return this.autoscale.platform;
    }

    async executeInvocable(payload: JSONable, invocable: string): Promise<void> {
        if (invocable === AwsLambdaInvocable.RegisterDeviceInFortiAnalyzer) {
            const deviceRegistration: FazDeviceRegistration = {
                vmId: payload.vmId as string,
                privateIp: payload.privateIp && String(payload.privateIp),
                publicIp: payload.publicIp && String(payload.publicIp)
            };
            // verify the required Lambda function environment variables.
            if (
                !(
                    process.env.AUTOSCALE_ADMIN_USERNAME &&
                    process.env.AUTOSCALE_ADMIN_PASSWORD &&
                    process.env.FORTIANALYZER_IP &&
                    process.env.FORTIANALYZER_PORT
                )
            ) {
                throw new Error("Lambda function doesn't have all required environment variables.");
            }
            // extract the autoscale admin user and faz info
            const username: string = await this.platform.getDecryptedEnvironmentVariable(
                'AUTOSCALE_ADMIN_USERNAME'
            );
            const password: string = await this.platform.getDecryptedEnvironmentVariable(
                'AUTOSCALE_ADMIN_PASSWORD'
            );
            const fazIp: string = process.env.FORTIANALYZER_IP;
            const fazPort: string = process.env.FORTIANALYZER_PORT;

            await this.autoscale.fazIntegrationStrategy
                .authorizeDevice(deviceRegistration, fazIp, fazPort, username, password)
                .catch(e => {
                    const error: AwsLambdaInvocableExecutionTimeOutError = e;
                    error.extendExecution = false;
                    throw error;
                });
        }
        // otherwise, no matching invocable, throw error
        throw new AwsLambdaInvocableExecutionTimeOutError(`No matchin invocable for: ${invocable}`);
    }
}
