import { configSetResourceFinder } from '../autoscale-core';
import { Settings } from '../autoscale-setting';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import {
    BootstrapConfigStrategyResult,
    BootstrapConfigurationStrategy
} from '../context-strategy/bootstrap-context';
import { PlatformAdapter } from '../platform-adapter';
import { VirtualMachine } from '../virtual-machine';
import { AwsFortiGateAutoscaleSetting } from './aws/aws-fortigate-autoscale-settings';
import { AutoscaleEnvironment } from '../autoscale-environment';

export class FortiGateBootstrapConfigStrategy implements BootstrapConfigurationStrategy {
    static SUCCESS = 'SUCCESS';
    static FAILED = 'FAILED';
    private config: string;
    protected settings: Settings;
    protected alreadyLoaded = [];
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    env: AutoscaleEnvironment;
    async prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ): Promise<void> {
        this.platform = platform;
        this.proxy = proxy;
        this.env = env;
        this.settings = await this.platform.getSettings();
        return Promise.resolve();
    }
    /**
     * get the bootstrap configuration for a certain role determined by the apply()
     * @returns {string} configuration
     */
    getConfiguration(): string {
        return this.config;
    }
    /**
     * apply the strategy with parameter provided via prepare()
     * @returns {Promise} BootstrapConfigStrategyResult
     */
    async apply(): Promise<BootstrapConfigStrategyResult> {
        const config = await this.loadConfig();
        // target is the master? return config sets for active role
        if (this.platform.vmEquals(this.env.targetVm, this.env.masterVm)) {
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
    /**
     * load the base configset content
     * @returns {Promise} configset content
     */
    protected async loadBase(): Promise<string> {
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
    /**
     * load the configset content for setting up the secondary nic
     * @returns {Promise} configset content
     */
    protected async loadPort2(): Promise<string> {
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
    /**
     * load the configset content for setting up an internal elb for web service cluster
     * @returns {Promise} configset content
     */
    protected async loadInternalElbWeb(): Promise<string> {
        try {
            const config = await this.platform.loadConfigSet('internalelbwebserv');
            this.alreadyLoaded.push('internalelbwebserv');
            return config;
        } catch (error) {
            this.proxy.logAsWarning(
                "[internalelbwebserv] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.'
            );
            return '';
        }
    }
    /**
     * load the configset content for setting up the FAZ logging
     * @returns {Promise} configset content
     */
    protected async loadFazIntegration(): Promise<string> {
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
    /**
     * load the configset content for user defined custom configset(s)
     * @param {string} customList configset name(s) separated by comma
     * @returns {Promise} configset content
     */
    protected async loadCustom(customList: string): Promise<string> {
        const nameArray = customList.split(',');
        let customConfigSetContentArray = [];
        const loaderArray = nameArray.map(customName =>
            this.platform.loadConfigSet(customName, true)
        );
        if (loaderArray.length > 0) {
            customConfigSetContentArray = await Promise.all(loaderArray);
        }
        return customConfigSetContentArray.join('');
    }
    /**
     * load all required configset(s) content and combine them into one string
     * @returns {Promise} configset content
     */
    protected async loadConfig(): Promise<string> {
        let baseConfig = '';
        // check if second nic is enabled, config for the second nic must be prepended to
        // base config
        if (this.settings.get(AwsFortiGateAutoscaleSetting.EnableNic2).truthValue) {
            baseConfig += await this.loadPort2();
        }
        baseConfig += await this.loadBase(); // alwasy load base config
        // if internal elb is integrated
        if (this.settings.get(AwsFortiGateAutoscaleSetting.EnableInternalElb).truthValue) {
            baseConfig += await this.loadInternalElbWeb();
        }
        // if faz integration is enabled, require this 'fazintegration' configset
        if (this.settings.get(AwsFortiGateAutoscaleSetting.EnableFazIntegration).truthValue) {
            baseConfig += await this.loadFazIntegration();
        }
        // check if other custom configsets are required
        // NOTE: additional required configsets should be processed last
        let customConfigSetName = this.settings.get(
            AwsFortiGateAutoscaleSetting.CustomConfigSetName
        ).value;
        // remove whitespaces
        customConfigSetName = customConfigSetName.replace(new RegExp('\\s', 'gm'), '');
        // load additional required configsets
        if (customConfigSetName) {
            baseConfig += await this.loadCustom(customConfigSetName);
        }
        return baseConfig;
    }
    /**
     * process a given config string. Should not be overriidden in any derivied class.
     *
     * @protected
     * @param {string} config the config sets in string type.
     * @param {{}} sourceData a given object containing sorcce data to be used.
     * @returns {string} a processed config sets in string type.
     */
    protected processConfig(config: string, sourceData?: {}): string {
        if (sourceData) {
            return this.processConfigV2(config, sourceData);
        }

        const psksecret = this.settings.get(AwsFortiGateAutoscaleSetting.FortiGatePskSecret).value;
        const syncInterface =
            this.settings.get(AwsFortiGateAutoscaleSetting.FortiGateSyncInterface).value || 'port1';
        const trafficPort =
            this.settings.get(AwsFortiGateAutoscaleSetting.FortiGateTrafficPort).value || '443';
        const adminPort =
            this.settings.get(AwsFortiGateAutoscaleSetting.FortiGateAdminPort).value || '8443';
        const intElbDns = this.settings.get(AwsFortiGateAutoscaleSetting.FortiGateInternalElbDns)
            .value;
        const hbInterval = this.settings.get(AwsFortiGateAutoscaleSetting.HeartbeatInterval).value;
        const hbCallbackUrl =
            this.settings.get(AwsFortiGateAutoscaleSetting.AutoscaleHandlerUrl).value || '';
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
     * @returns {string} a processed config sets in string type.
     */
    protected processConfigV2(config: string, sourceData: {}): string {
        const resourceMap = {};
        Object.assign(resourceMap, sourceData);
        let nodePath;
        let conf = config;
        const matches = typeof config === 'string' ? config.match(/({\S+})/gm) : [];
        try {
            for (nodePath of matches) {
                let replaceBy = null;
                // check if it is in v2 format: {@SourceType.property[#num][.subProperty[#num]...]}
                if (nodePath.indexOf('@') === 1) {
                    const resRoot =
                        typeof nodePath === 'string' ? nodePath.split('.')[0].substr(1) : '';
                    if (resourceMap[resRoot]) {
                        replaceBy = configSetResourceFinder(resourceMap, nodePath);
                    }
                    if (replaceBy) {
                        conf = conf.replace(new RegExp(nodePath, 'g'), replaceBy);
                    }
                }
            }
            return this.processConfig(conf); // process config V1
        } catch (error) {
            this.proxy.logForError('error in processing config, config not processed.', error);
            // if error occurs, return the original config
            return config;
        }
    }
    /**
     * get bootstrap configuration for a FGT vm which's role will be master (or HA active)
     * @param  {string} config configset content
     * @param  {VirtualMachine} targetVm the target vm which will consume this configuration
     * @returns {Promise} configset content
     */
    protected getActiveRoleConfig(config: string, targetVm: VirtualMachine): Promise<string> {
        return Promise.resolve(this.processConfigV2(config, { '@device': targetVm }));
    }
    /**
     * get bootstrap configuration for a FGT vm which's role will be slave (or HA passive)
     * @param  {string} config configset content
     * @param  {VirtualMachine} targetVm the target vm which will consume this configuration
     * @param  {VirtualMachine} masterVm (optional) the target vm which will be the master (active)
     * role in the HA cluster
     * @returns {Promise} configset content
     */
    protected getPassiveRoleConfig(
        config: string,
        targetVm: VirtualMachine,
        masterVm?: VirtualMachine
    ): Promise<string> {
        const setMasterIpSection =
            (masterVm && `\n    set master-ip ${masterVm.primaryPrivateIpAddress}`) || '';
        const conf = this.processConfig(config, { '@device': targetVm });
        return Promise.resolve(
            conf.replace(new RegExp('set role master', 'gm'), `set role slave${setMasterIpSection}`)
        );
    }
}
