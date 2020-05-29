import { AutoscaleEnvironment } from '../../autoscale-environment';
import { CloudFunctionProxyAdapter, ReqType } from '../../cloud-function-proxy';
import {
    PreferredGroupMasterElection,
    ConstantIntervalHeartbeatSyncStrategy
} from '../../context-strategy/autoscale-context';
import {
    NicAttachmentContext,
    NicAttachmentStrategy,
    NicAttachmentStrategyResult
} from '../../context-strategy/nic-attachment-context';
import {
    VpnAttachmentStrategy,
    VpnAttachmentStrategyResult,
    NoopVpnAttachmentStrategy
} from '../../context-strategy/vpn-attachment-context';
import { waitFor, WaitForConditionChecker, WaitForPromiseEmitter } from '../../helper-function';
import { FortiGateAutoscale } from '../fortigate-autoscale';
import { FortiGateBootstrapConfigStrategy } from '../fortigate-bootstrap-config-strategy';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsPlatformAdapter, TransitGatewayContext } from './aws-platform-adapter';
import { AwsNicAttachmentStrategy } from './aws-nic-attachment-strategy';
import { AwsTgwVpnAttachmentStrategy } from './aws-tgw-vpn-attachment-strategy';
import { AwsHybridScalingGroupStrategy } from './aws-hybrid-scaling-group-strategy';
import { AwsTaggingAutoscaleVmStrategy } from './aws-tagging-autoscale-vm-strategy';
import { AwsFortiGateBootstrapTgwStrategy } from './aws-fortigate-bootstrap-config-strategy';
import { ReusableLicensingStrategy } from '../../context-strategy/licensing-context';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import { AutoscaleServiceProvider } from '../../autoscale-core';
import { AwsCloudFormationCustomResourceEventProxy } from './aws-cloud-function-proxy';
import { AwsPlatformAdaptee } from './aws-platform-adaptee';

/**
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
        this.setScalingGroupStrategy(new AwsHybridScalingGroupStrategy());
        // use peferred group master election for Hybrid licensing model
        this.setMasterElectionStrategy(new PreferredGroupMasterElection());
        // use a constant interval heartbeat sync strategy
        this.setHeartbeatSyncStrategy(new ConstantIntervalHeartbeatSyncStrategy());
        // use AWS resource tagging strategy
        this.setTaggingAutoscaleVmStrategy(new AwsTaggingAutoscaleVmStrategy());
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(new FortiGateBootstrapConfigStrategy());
        // use the Resuable licensing strategy
        this.setLicensingStrategy(new ReusableLicensingStrategy());
        // use the secondary nic attachment strategy to create and attach an additional nic
        // during launching
        this.setNicAttachmentStrategy(new AwsNicAttachmentStrategy());
        // use Noop vpn attachment strategy
        this.setVpnAttachmentStrategy(new NoopVpnAttachmentStrategy());
    }
    setNicAttachmentStrategy(strategy: NicAttachmentStrategy): void {
        this.nicAttachmentStrategy = strategy;
    }
    setVpnAttachmentStrategy(strategy: VpnAttachmentStrategy): void {
        this.vpnAttachmentStrategy = strategy;
    }
    async handleNicAttachment(): Promise<NicAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling handleNicAttachment');
        this.nicAttachmentStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
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
        this.nicAttachmentStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
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
        await this.vpnAttachmentStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
        const result = await this.vpnAttachmentStrategy.attach();
        this.proxy.logAsInfo('called handleVpnAttachment');
        return result;
    }
    async handleVpnDetachment(): Promise<VpnAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling handleVpnDetachment');
        await this.vpnAttachmentStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
        const result = await this.vpnAttachmentStrategy.detach();
        this.proxy.logAsInfo('called handleVpnDetachment');
        return result;
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleLaunchingVm(): Promise<string> {
        await super.handleLaunchingVm();
        this.env.targetVm = await this.platform.getTargetVm();
        const settings = await this.platform.getSettings();
        // handle nic attachment
        if (settings.get(AwsFortiGateAutoscaleSetting.EnableNic2).truthValue) {
            const nicAttachmentResult = await this.handleNicAttachment();
            if (nicAttachmentResult === NicAttachmentStrategyResult.ShouldTerminateVm) {
                // should abandon this lifecycle
                // REVIEW: does abandonning the lifecycle hook trigger a terminating event fom the
                // auto scaling group? so that it can go into the terminatingvm() workflow afterwards
                const lifecycleItem = await this.platform.getLifecycleItem(this.env.targetVm.id);
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
                const lifecycleItem = await this.platform.getLifecycleItem(this.env.targetVm.id);
                await this.platform.completeLifecycleAction(lifecycleItem, false);
                return '';
            }
        }
        return '';
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleTerminatingVm(): Promise<string> {
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
        return '';
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
        this.setBootstrapConfigurationStrategy(new AwsFortiGateBootstrapTgwStrategy());
        // use AWS Transit Gateway VPN attachment strategy
        this.setVpnAttachmentStrategy(new AwsTgwVpnAttachmentStrategy());
    }
}

export type AwsFortiGateAutoscaleServiceEvent =
    | AwsFortiGateAutoscaleServiceEventStartAutoscale
    | AwsFortiGateAutoscaleServiceEventStopAutoscale
    | AwsFortiGateAutoscaleServiceEventSaveSettings
    | AwsFortiGateAutoscaleServiceEventUnknown;
export interface AwsFortiGateAutoscaleServiceEventBase {
    ServiceToken: string;
}

export interface AwsFortiGateAutoscaleServiceEventStartAutoscale
    extends AwsFortiGateAutoscaleServiceEventBase {
    ServiceType: 'startAutoscale' | 'initiateAutoscale';
    DesireCapacity?: number;
    MinSize?: number;
    MaxSize?: number;
}

export interface AwsFortiGateAutoscaleServiceEventStopAutoscale
    extends AwsFortiGateAutoscaleServiceEventBase {
    ServiceType: 'stopAutoscale';
}

export interface AwsFortiGateAutoscaleServiceEventSaveSettings
    extends AwsFortiGateAutoscaleServiceEventBase {
    ServiceType: 'saveSettings';
    [key: string]: string;
}

export interface AwsFortiGateAutoscaleServiceEventUnknown
    extends AwsFortiGateAutoscaleServiceEventBase {
    ServiceType: undefined;
    [key: string]: string;
}

export class AwsFortiGateAutoscaleServiceProvider
    implements AutoscaleServiceProvider<CloudFormationCustomResourceEvent, Context, void> {
    autoscale: AwsFortiGateAutoscale<CloudFormationCustomResourceEvent, Context, void>;
    get proxy(): AwsCloudFormationCustomResourceEventProxy {
        return this.autoscale.proxy as AwsCloudFormationCustomResourceEventProxy;
    }
    get platform(): AwsPlatformAdapter {
        return this.autoscale.platform;
    }
    async handleServiceRequest(proxy: AwsCloudFormationCustomResourceEventProxy): Promise<void> {
        this.proxy.logAsInfo('calling handleServiceRequest');
        try {
            const env = {} as AutoscaleEnvironment;
            const p = new AwsPlatformAdaptee();
            const pa = new AwsPlatformAdapter(p, proxy);
            this.autoscale = new AwsFortiGateAutoscale<
                CloudFormationCustomResourceEvent,
                Context,
                void
            >(pa, env, proxy);
            this.autoscale.init();
            const reqType: ReqType = await this.platform.getRequestType();
            const serviceEventType: string = this.proxy.getReqBody().RequestType;
            const serviceEvent: AwsFortiGateAutoscaleServiceEvent = {
                ServiceType: undefined,
                ServiceToken: undefined
            };
            Object.assign(serviceEvent, this.proxy.getReqBody().ResourceProperties || {});
            this.proxy.logAsInfo(
                `RequestType: ${this.proxy.request.RequestType}, serviceType: ${serviceEvent.ServiceType}`
            );
            if (reqType === ReqType.ServiceProviderRequest) {
                switch (serviceEventType) {
                    case 'Create':
                    case 'Update':
                        switch (serviceEvent.ServiceType) {
                            case 'initiateAutoscale':
                            case 'startAutoscale':
                                await this.startAutoscale();
                                break;
                            case 'saveSettings':
                                await this.SaveAutoscaleSettings();
                                break;
                            case 'stopAutoscale':
                                this.proxy.logAsWarning(
                                    `ServiceType: [${serviceEvent.ServiceType}] is skipped in ` +
                                        `the RequestType: [${serviceEventType}]`
                                );
                                break;
                            case undefined:
                            default:
                                throw new Error(
                                    `Unsupported service type: [${serviceEvent.ServiceType}]`
                                );
                        }
                        break;
                    case 'Delete':
                        switch (serviceEvent.ServiceType) {
                            case 'initiateAutoscale':
                            case 'startAutoscale':
                            case 'saveSettings':
                                this.proxy.logAsWarning(
                                    `ServiceType: [${serviceEvent.ServiceType}] is skipped in ` +
                                        `the RequestType: [${serviceEventType}]`
                                );
                                break;
                            case 'stopAutoscale':
                                await this.stopAutoscale();
                                break;
                            case undefined:
                            default:
                                throw new Error(
                                    `Unsupported service type: [${serviceEvent.ServiceType}]`
                                );
                        }
                        break;
                    default:
                        throw new Error(`Unsupported RequestType: [${serviceEventType}]`);
                }
            } else {
                this.proxy.logAsWarning('Not a service provider request.');
                this.proxy.logAsInfo('called handleServiceRequest');
                await this.proxy.sendResponse(false);
            }
        } catch (error) {
            this.proxy.logForError('Handle service request error.', error);
            this.proxy.logAsInfo('called handleServiceRequest');
            await this.proxy.sendResponse(false);
        }
    }
    async startAutoscale(): Promise<boolean> {
        const settings = await this.platform.getSettings();
        const byolGroupName = settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupName).value;
        const byolDesiredCapacity = Number(
            settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupDesiredCapacity).value
        );
        const byolMinSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupMinSize).value
        );
        const byolMaxSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupMaxSize).value
        );
        const paygGroupName = settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupName).value;
        const paygDesiredCapacity = Number(
            settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupDesiredCapacity).value
        );
        const paygMinSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupMinSize).value
        );
        const paygMaxSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupMaxSize).value
        );
        const startScalingGroup = async (
            groupName: string,
            desiredCapacity: number,
            minSize?: number,
            maxSize?: number
        ): Promise<boolean> => {
            await this.platform.updateScalingGroupSize(
                groupName,
                desiredCapacity,
                minSize,
                maxSize
            );
            return true;
        };
        const tasks: Promise<boolean>[] = [];
        if (byolGroupName) {
            tasks.push(
                startScalingGroup(
                    byolGroupName,
                    byolDesiredCapacity,
                    byolMinSize,
                    byolMaxSize
                ).catch(error => {
                    this.proxy.logForError('BYOL scaling group failed to start.', error);
                    return false;
                })
            );
        }
        if (paygGroupName) {
            tasks.push(
                startScalingGroup(
                    paygGroupName,
                    paygDesiredCapacity,
                    paygMinSize,
                    paygMaxSize
                ).catch(error => {
                    this.proxy.logForError('PAYG scaling group failed to start.', error);
                    return false;
                })
            );
        }
        const [s1, s2] = await Promise.all(tasks);
        return s1 && s2;
    }
    stopAutoscale(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    SaveAutoscaleSettings(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
}
