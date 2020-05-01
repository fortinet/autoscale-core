import { FortiGateBootstrapConfigStrategy } from '../fortigate-bootstrap-config-strategy';
import { AwsPlatformAdapter } from './aws-platform-adapter';
import { AutoscaleEnvironment } from '../../autoscale-environment';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { VirtualMachine } from '../../virtual-machine';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
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
