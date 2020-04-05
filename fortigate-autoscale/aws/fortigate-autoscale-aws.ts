import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsPlatformAdapter, TransitGatewayContext } from './aws-platform';
import { FortiGateBootstrapConfigStrategy, FortiGateAutoscale } from '../fortigate-autoscale';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import {
    AutoscaleEnvironment,
    WaitForPromiseEmitter,
    WaitForConditionChecker,
    waitFor
} from '../../autoscale-core';
import { VirtualMachine } from '../../virtual-machine';
import { PreferredGroupMasterElection } from '../../context-strategy/autoscale-context';
import {
    VpnAttachmentStrategy,
    VpnAttachmentStrategyResult
} from '../../context-strategy/vpn-attachment-context';
import {
    NicAttachmentStrategy,
    NicAttachmentContext,
    NicAttachmentStrategyResult
} from '../../context-strategy/nic-attachment-context';

export class AwsFortiGateBootstrapTgwStrategy extends FortiGateBootstrapConfigStrategy {
    prepare(
        platform: AwsPlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ): Promise<void> {
        return super.prepare(platform, proxy, env);
    }
    get platform(): AwsPlatformAdapter {
        return this.platform as AwsPlatformAdapter;
    }

    /**
     * load the configset content for setting up the VPN attachment
     * @param  {VirtualMachine} targetVm the target vm which the VPN(s) are attached to
     * @returns {Promise} configset content
     */
    protected async loadVpnAttachment(targetVm: VirtualMachine): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            const [config, vpnAttachmentRecord] = await Promise.all([
                await this.platform.loadConfigSet('setuptgwvpn').catch(() => {
                    throw new Error("configset doesn't exist in the assets storage.");
                }),
                await this.platform
                    .getTgwVpnAttachmentRecord(targetVm.id, targetVm.primaryPublicIpAddress)
                    .catch(() => {
                        throw new Error(
                            `Vpn Attachment for instance (id: ${targetVm.id})` + ' not found.'
                        );
                    })
            ]);
            this.alreadyLoaded.push('setuptgwvpn');
            const vpnConfiguration =
                (vpnAttachmentRecord.vpnConnection &&
                    vpnAttachmentRecord.vpnConnection.customerGatewayConfiguration) ||
                {};
            return await this.processConfig(config, {
                '@device': targetVm,
                '@vpn_connection': vpnConfiguration
            });
        } catch (error) {
            this.proxy.logForError('Configset Not loaded.', error);
            return '';
        }
    }
    /**
     *
     * @override for loading bootstrap config with additional AWS Transit Gateway VPN connections
     * @returns {Promise<string>} configset content
     */
    async loadConfig(): Promise<string> {
        let baseConfig = await super.loadConfig();
        // if transit gateway vpn attachment is enabled.
        if (this.settings.get(AwsFortiGateAutoscaleSetting.AwsEnableTransitGatewayVpn).truthValue) {
            baseConfig += await this.loadVpnAttachment(this.env.targetVm);
        }
        return baseConfig;
    }
}
/**
 * FortiGate Autoscale - AWS class, with capabilities:
 * inherited capabilities and
 * AWS Transit Gateway VPN attachment
 *
 */
export class FortiGateAutoscaleAws<TReq, Tcontext, TRes>
    extends FortiGateAutoscale<TReq, Tcontext, TRes>
    implements NicAttachmentContext, TransitGatewayContext {
    nicAttachmentStrategy: NicAttachmentStrategy;
    vpnAttachmentStrategy: VpnAttachmentStrategy;
    get platform(): AwsPlatformAdapter {
        return super.platform as AwsPlatformAdapter;
    }
    constructor(p: AwsPlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        super(p, e, x);
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(new FortiGateBootstrapConfigStrategy());
        this.setMasterElectionStrategy(new PreferredGroupMasterElection());
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
            await this.handleNicAttachment();
        }
        // handle transit gateway vpn attachment
        if (settings.get(AwsFortiGateAutoscaleSetting.AwsEnableTransitGatewayVpn).truthValue) {
            await this.handleVpnAttachment();
        }
        return '';
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleTerminatingVm(): Promise<string> {
        await super.handleTerminatingVm();
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
        return '';
    }
}
