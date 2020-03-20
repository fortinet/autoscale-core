import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { FortiGateAutoscaleSetting as AutoscaleSetting } from '../fortigate-autoscale-settings';
import { AwsPlatformAdapter } from './aws-platform';
import { FortiGateBootstrapConfigStrategy, FortiGateAutoscale } from '../fortigate-autoscale';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { AutoscaleEnvironment } from '../../autoscale-core';
import { VirtualMachine } from '../../virtual-machine';
import { PlatformAdapter } from '../../platform-adapter';
import { PreferredGroupMasterElection } from '../../context-strategy/autoscale-context';

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
    protected async loadVpnAttachment(targetVm: VirtualMachine): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            const [config, vpnAttachmentRecord] = await Promise.all([
                await this.platform.loadConfigSet('setuptgwvpn').catch(() => {
                    throw new Error("configset doesn't exist in the assets storage.");
                }),
                await this.platform.getTgwVpnAttachmentRecord(targetVm.instanceId).catch(() => {
                    throw new Error(
                        `Vpn Attachment for instance (id: ${targetVm.instanceId})` + ' not found.'
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
     * @override for loading AWS Transit Gateway VPN config
     * @returns {Promise<string>} config sets in string type.
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
export class FortiGateAutoscaleAws extends FortiGateAutoscale<
    APIGatewayProxyEvent,
    Context,
    APIGatewayProxyResult
> {
    constructor(p: PlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        super(p, e, x);
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(new FortiGateBootstrapConfigStrategy());
        this.setMasterElectionStrategy(new PreferredGroupMasterElection());
    }
}
