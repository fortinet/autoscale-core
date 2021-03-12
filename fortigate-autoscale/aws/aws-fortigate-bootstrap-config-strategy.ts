import {
    AutoscaleEnvironment,
    CloudFunctionProxyAdapter,
    FortiGateBootstrapConfigStrategy,
    JSONable,
    VirtualMachine
} from '..';
import { parseStringPromise as xml2jsParserPromise } from 'xml2js';
import { AwsFortiGateAutoscaleSetting, AwsPlatformAdapter } from '.';

export class AwsFortiGateBootstrapStrategy extends FortiGateBootstrapConfigStrategy {
    constructor(
        readonly platform: AwsPlatformAdapter,
        readonly proxy: CloudFunctionProxyAdapter,
        readonly env: AutoscaleEnvironment
    ) {
        super();
    }
}

export class AwsFortiGateBootstrapTgwStrategy extends AwsFortiGateBootstrapStrategy {
    /**
     * load the configset content for setting up the VPN attachment
     * @param  {VirtualMachine} targetVm the target vm which the VPN(s) are attached to
     * @returns {Promise} configset content
     */
    protected async loadVpn(targetVm: VirtualMachine): Promise<string> {
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
            // convert the xml format CustomerGatewayConfiguration to JSON format
            const customerGatewayConfiguration: JSONable =
                (vpnAttachmentRecord.vpnConnection.CustomerGatewayConfiguration &&
                    (await xml2jsParserPromise(
                        vpnAttachmentRecord.vpnConnection.CustomerGatewayConfiguration,
                        {
                            trim: true
                        }
                    ))) ||
                {};
            if (customerGatewayConfiguration.vpn_connection) {
                // eslint-disable-next-line dot-notation
                for (const ownPropKey in customerGatewayConfiguration.vpn_connection['$']) {
                    if (!customerGatewayConfiguration.vpn_connection[ownPropKey]) {
                        customerGatewayConfiguration.vpn_connection[ownPropKey] =
                            // eslint-disable-next-line dot-notation
                            customerGatewayConfiguration.vpn_connection['$'][ownPropKey];
                    }
                }
            }
            return await this.processConfig(config, {
                '@device': targetVm,
                '@vpn_connection': customerGatewayConfiguration.vpn_connection
            });
        } catch (error) {
            this.proxy.logForError('Configset Not loaded.', error);
            return '';
        }
    }
    /**
     *
     * load the configset content for tgw specific setting
     * @returns {Promise<string>} configset content
     */
    async loadTgwSpecificConfig(): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            return await this.platform.loadConfigSet('tgwspecific');
        } catch (error) {
            this.proxy.logAsWarning("tgwspecific configset doesn't exist in the assets storage.");
            // NOTE: even though not loading the tgw specific configset, return empty string instead
            // of throwing errors
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
            baseConfig += await this.loadVpn(this.env.targetVm);
            baseConfig += await this.loadTgwSpecificConfig();
        }
        return baseConfig;
    }
}
