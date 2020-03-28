import {
    FortiGateAutoscaleSetting as AutoscaleSetting,
    FortiGateAutoscaleSetting
} from '../fortigate-autoscale-settings';
import { AwsPlatformAdapter, TransitGatewayContext } from './aws-platform';
import { FortiGateBootstrapConfigStrategy, FortiGateAutoscale } from '../fortigate-autoscale';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { AutoscaleEnvironment } from '../../autoscale-core';
import { VirtualMachine } from '../../virtual-machine';
import { PreferredGroupMasterElection } from '../../context-strategy/autoscale-context';
import { VpnAttachmentStrategy } from '../../context-strategy/vpn-attachment-context';
import {
    NicAttachmentStrategy,
    NicAttachmentContext
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
                await this.platform.getTgwVpnAttachmentRecord(targetVm.id).catch(() => {
                    throw new Error(
                        `Vpn Attachment for instance (id: ${targetVm.id})` + ' not found.'
                    );
                })
            ]);
            this.alreadyLoaded.push('setuptgwvpn');
            return await this.processConfig(config, {
                '@device': targetVm,
                '@vpn_connection': vpnAttachmentRecord.customerGatewayConfiguration.vpn_connection
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
        if (this.settings.get(AutoscaleSetting.EnableTransitGatewayVpn).truthValue) {
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
    handleNicAttachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleNicDetachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    cleanupUnusedNic(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleVpnAttachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleVpnDetachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    cleanupUnusedVpn(): Promise<string> {
        throw new Error('Method not implemented.');
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleLaunchingVm(): Promise<string> {
        await super.handleLaunchingVm();
        const targetVm = await this.platform.getTargetVm();
        const settings = await this.platform.getSettings();
        // handle nic attachment
        if (settings.get(FortiGateAutoscaleSetting.EnableNic2).truthValue) {
            this.nicAttachmentStrategy.prepare(this.platform, this.proxy, targetVm);
            await this.nicAttachmentStrategy.attach();
        }
        // handle transit gateway vpn attachment
        if (settings.get(FortiGateAutoscaleSetting.EnableTransitGatewayVpn).truthValue) {
            this.vpnAttachmentStrategy.prepare(this.platform, this.proxy);
            await this.vpnAttachmentStrategy.attach();
        }
        return '';
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleTerminatingVm(): Promise<string> {
        await super.handleTerminatingVm();
        const targetVm = await this.platform.getTargetVm();
        const settings = await this.platform.getSettings();
        // handle nic detachment
        if (settings.get(FortiGateAutoscaleSetting.EnableNic2).truthValue) {
            this.nicAttachmentStrategy.prepare(this.platform, this.proxy, targetVm);
            await this.nicAttachmentStrategy.detach();
        }
        // handle transit gateway vpn attachment
        if (settings.get(FortiGateAutoscaleSetting.EnableTransitGatewayVpn).truthValue) {
            this.vpnAttachmentStrategy.prepare(this.platform, this.proxy);
            await this.vpnAttachmentStrategy.detach();
        }
        return '';
    }
}
