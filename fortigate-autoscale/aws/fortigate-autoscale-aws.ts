import { FortiGateAutoscale } from '../index';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import {
    BootstrapConfigurationStrategy,
    BootstrapConfigStrategyResult,
    PlatformAdapter,
    CloudFunctionProxyAdapter,
    AutoscaleEnvironment,
    VirtualMachine
} from '../../index';
import {
    FortiGateAutoscaleSetting as AutoscaleSetting,
    Settings
} from '../fortigate-autoscale-settings';
import { AwsPlatformAdapter } from './aws-platform';

type FinderRef = { [key: string]: any } | [] | string | null;
export function configSetResourceFinder(resObject: FinderRef, nodePath: string): FinderRef {
    const [, mPath] = nodePath.match(/^{(.+)}$/i);
    if (!resObject || !nodePath) {
        return '';
    }
    const nodes = mPath.split('.');
    let ref = resObject;

    nodes.find(nodeName => {
        const matches = nodeName.match(/^([A-Za-z_@-]+)#([0-9])+$/i);
        if (matches && Array.isArray(ref[matches[1]]) && ref[matches[1]].length > matches[2]) {
            ref = ref[matches[1]][matches[2]];
        } else if (!ref[nodeName]) {
            ref = null;
            return null;
        } else {
            ref =
                Array.isArray(ref[nodeName]) && ref[nodeName].length > 0
                    ? ref[nodeName][0]
                    : ref[nodeName];
        }
    });
    return ref;
}

export class FortiGateBootstrapConfigStrategy implements BootstrapConfigurationStrategy {
    static SUCCESS = 'SUCCESS';
    static FAILED = 'FAILED';
    private config: string;
    protected settings: Settings;
    protected alreadyLoaded = [];
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    env: AutoscaleEnvironment;
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ): Promise<void> {
        this.platform = platform;
        this.proxy = proxy;
        this.env = env;
        return Promise.resolve();
    }
    getConfiguration(): string {
        return this.config;
    }
    async apply(): Promise<BootstrapConfigStrategyResult> {
        const config = await this.loadConfig();
        // target is the master? return config sets for active role
        if (this.platform.equalToVm(this.env.targetVm, this.env.masterVm)) {
            this.config = await this.getActiveRoleConfig(config, this.env.targetVm);
            this.proxy.logAsInfo('loaded configuration for active role.');
        }
        // else return config sets for passive device role
        else {
            this.config = await this.getPassiveRoleConfig(
                config,
                this.env.targetVm,
                this.env.masterVm
            );
            this.proxy.logAsInfo('loaded configuration for passive role.');
        }
        return BootstrapConfigStrategyResult.SUCCESS;
    }
    protected async loadBase(): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            const config = await this.platform.loadConfigSet('baseconfig');
            this.alreadyLoaded.push('baseconfig');
            return config;
        } catch (error) {
            this.proxy.logForError(
                "[baseconfig] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.',
                error
            );
            throw new Error('baseconfig is required but not found.');
        }
    }
    protected async loadNic2(): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            const config = await this.platform.loadConfigSet('port2config');
            this.alreadyLoaded.push('port2config');
            return config;
        } catch (error) {
            this.proxy.logForError(
                "[port2config] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.',
                error
            );
            return '';
        }
    }
    protected async loadInternalElbWeb(): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            const config = await this.platform.loadConfigSet('intelbwebserv');
            this.alreadyLoaded.push('intelbwebserv');
            // NOTE: add the following two in order to avoid loading them again
            this.alreadyLoaded.push('httpsroutingpolicy');
            this.alreadyLoaded.push('internalelbweb');
            return config;
        } catch (error) {
            this.proxy.logAsWarning(
                "[intelbwebserv] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.'
            );
            return '';
        }
    }
    protected async loadFazIntegration(): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            const config = await this.platform.loadConfigSet('fazintegration');
            this.alreadyLoaded.push('fazintegration');
            return config;
        } catch (error) {
            this.proxy.logAsWarning(
                "[fazintegration] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.'
            );
            return '';
        }
    }
    protected async loadRequired(requiredList: string): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        let config = '';
        for (const configset of requiredList.split(',')) {
            const [name, selected] = (configset.includes('-') &&
                configset
                    .trim()
                    .split('-')
                    .map(str => (str && str.toLowerCase()) || null)) || [null, null];
            // prevent from adding the same config set multiple times
            this.alreadyLoaded.push(name);
            if (selected === 'yes' && !this.alreadyLoaded.includes(name)) {
                let loadedConfigSet = '';
                try {
                    switch (name) {
                        // handle https routing policy
                        case 'httpsroutingpolicy':
                            loadedConfigSet = await this.platform.loadConfigSet('internalelbweb');
                            loadedConfigSet += await this.platform.loadConfigSet(name);
                            this.alreadyLoaded.push('internalelbweb');
                            break;
                        default:
                            loadedConfigSet += await this.platform.loadConfigSet(name);
                            break;
                    }
                    config += loadedConfigSet;
                    this.alreadyLoaded.push(name);
                } catch (error) {
                    this.proxy.logForError(
                        `[${name}] configset doesn't exist in the assets storage. ` +
                            'Configset Not loaded.',
                        error
                    );
                }
            }
        }
        return config;
    }
    protected async loadConfig(): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        let baseConfig = '';
        // check if second nic is enabled, config for the second nic must be prepended to
        // base config
        if (this.settings.get(AutoscaleSetting.EnableNic2).truthValue) {
            await this.loadNic2();
        }
        baseConfig += await this.loadBase(); // alwasy load base config
        // handle internal http and https routing policies depending on the internal elb
        // if internal elb is enabled, require the 'intelbwebserv' configset
        // NOTE: intelbwebserv stands for 'internal web service'.
        // it combines 'httpsroutingpolicy' & 'internalelbweb' which are previously used for
        // the same purpose. combining them hopefully makes a more business-logical sense
        if (this.settings.get(AutoscaleSetting.EnableInternalElb).truthValue) {
            baseConfig += await this.loadInternalElbWeb();
        }
        // if faz integration is enabled, require this 'fazintegration' configset
        if (this.settings.get(AutoscaleSetting.EnableFazIntegration).truthValue) {
            baseConfig += await this.loadFazIntegration();
        }
        // check if other configsets are required
        // NOTE: additional required configsets should be processed last
        const requiredConfigSet = this.settings.get(AutoscaleSetting.RequiredConfigSet).value;
        // load additional required configsets
        if (requiredConfigSet) {
            baseConfig += await this.loadRequired(requiredConfigSet);
        }
        return baseConfig;
    }
    /**
     * process a given config string. Should not be overriidden in any derivied class.
     *
     * @protected
     * @param {string} config the config sets in string type.
     * @param {{}} sourceData a given object containing sorcce data to be used.
     * @returns {Promise<string>} a processed config sets in string type.
     */
    protected async processConfig(config: string, sourceData?: {}): Promise<string> {
        if (sourceData) {
            return this.processConfigV2(config, sourceData);
        }
        this.settings = this.settings || (await this.platform.getSettings());
        const psksecret = this.settings.get(AutoscaleSetting.FortiGatePskSecret).value;
        const syncInterface =
            this.settings.get(AutoscaleSetting.FortiGateSyncInterface).value || 'port1';
        const trafficPort = this.settings.get(AutoscaleSetting.FortiGateTrafficPort).value || '443';
        const adminPort = this.settings.get(AutoscaleSetting.FortiGateAdminPort).value || '8443';
        const intElbDns = this.settings.get(AutoscaleSetting.FortiGateInternalElbDns).value;
        const hbInterval = this.settings.get(AutoscaleSetting.HeartbeatInterval).value;
        const hbCallbackUrl = this.settings.get(AutoscaleSetting.AutoscaleHandlerUrl).value || '';
        return config
            .replace(new RegExp('{SYNC_INTERFACE}', 'gm'), syncInterface)
            .replace(new RegExp('{EXTERNAL_INTERFACE}', 'gm'), 'port1')
            .replace(new RegExp('{INTERNAL_INTERFACE}', 'gm'), 'port2')
            .replace(new RegExp('{PSK_SECRET}', 'gm'), psksecret)
            .replace(new RegExp('{TRAFFIC_PORT}', 'gm'), trafficPort)
            .replace(new RegExp('{ADMIN_PORT}', 'gm'), adminPort)
            .replace(new RegExp('{INTERNAL_ELB_DNS}', 'gm'), intElbDns)
            .replace(new RegExp('{CALLBACK_URL}', 'gm'), hbCallbackUrl)
            .replace(new RegExp('{HEART_BEAT_INTERVAL}', 'gm'), hbInterval);
    }
    /**
     * Process config using a given source data
     *
     * @protected
     * @param {string} config the config sets in string type
     * @param {{}} sourceData a given object containing sorcce data to be used.
     * @returns {Promise<string>} a processed config sets in string type.
     */
    protected processConfigV2(config: string, sourceData: {}): Promise<string> {
        const resourceMap = {};
        Object.assign(resourceMap, sourceData);
        let nodePath;
        let conf = config;
        const matches = typeof config === 'string' ? config.match(/({\S+})/gm) : [];
        try {
            for (nodePath of matches) {
                let replaceBy = null;
                const resRoot =
                    typeof nodePath === 'string' ? nodePath.split('.')[0].substr(1) : '';
                if (resourceMap[resRoot]) {
                    replaceBy = configSetResourceFinder(resourceMap, nodePath);
                }
                if (replaceBy) {
                    conf = conf.replace(new RegExp(nodePath, 'g'), replaceBy);
                }
            }
        } catch (error) {
            console.log(error);
        }
        return Promise.resolve(conf);
    }
    protected getActiveRoleConfig(config: string, targetVm: VirtualMachine): string {
        throw new Error('Method not implemented.');
    }
    protected getPassiveRoleConfig(
        config: string,
        targetVm: VirtualMachine,
        masterVm: VirtualMachine
    ): string {
        throw new Error('Method not implemented.');
    }
}

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
export default class FortiGateAutoscaleAws extends FortiGateAutoscale<
    APIGatewayProxyEvent,
    Context,
    APIGatewayProxyResult
> {
    constructor(p: PlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        super(p, e, x);
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(new FortiGateBootstrapConfigStrategy());
    }
}
