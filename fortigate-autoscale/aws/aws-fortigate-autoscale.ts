import { AutoscaleEnvironment } from '../../autoscale-environment';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import {
    ConstantIntervalHeartbeatSyncStrategy,
    PreferredGroupMasterElection
} from '../../context-strategy/autoscale-context';
import { ReusableLicensingStrategy } from '../../context-strategy/licensing-context';
import {
    NicAttachmentContext,
    NicAttachmentStrategy,
    NicAttachmentStrategyResult
} from '../../context-strategy/nic-attachment-context';
import {
    NoopVpnAttachmentStrategy,
    VpnAttachmentStrategy,
    VpnAttachmentStrategyResult
} from '../../context-strategy/vpn-attachment-context';
import { waitFor, WaitForConditionChecker, WaitForPromiseEmitter } from '../../helper-function';
import { VirtualMachineState } from '../../virtual-machine';
import { FortiGateAutoscale } from '../fortigate-autoscale';
import { FortiGateBootstrapConfigStrategy } from '../fortigate-bootstrap-config-strategy';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsFortiGateBootstrapTgwStrategy } from './aws-fortigate-bootstrap-config-strategy';
import { AwsHybridScalingGroupStrategy } from './aws-hybrid-scaling-group-strategy';
import { AwsNicAttachmentStrategy } from './aws-nic-attachment-strategy';
import {
    AwsPlatformAdapter,
    ScalingGroupState,
    TransitGatewayContext
} from './aws-platform-adapter';
import { AwsTaggingAutoscaleVmStrategy } from './aws-tagging-autoscale-vm-strategy';
import { AwsTgwVpnAttachmentStrategy } from './aws-tgw-vpn-attachment-strategy';

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
        if (!this.env.targetVm || this.env.targetVm.state === VirtualMachineState.Terminated) {
            return NicAttachmentStrategyResult.ShouldTerminateVm;
        }
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
            this.nicAttachmentStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
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

    async cleanupUnusedVpn(): Promise<VpnAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling cleanupUnusedVpn');
        await this.vpnAttachmentStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
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
