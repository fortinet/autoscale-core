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
import { Blob } from '../blob';

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
     * load a batch of configset content
     * @param {string[]} configSetNameList configset name(s) separated by comma
     * @param {boolean} customLocation configset is loaded from the custom asset location
     * @param {boolean} throwError whether throw (just one) error or not
     * @returns {Promise} configset content
     */
    protected async loadBatch(
        configSetNameList: string[],
        customLocation,
        throwError
    ): Promise<string> {
        let customConfigSetContentArray = [];
        let errorCount = 0;
        const loaderArray = configSetNameList
            .filter(n => !this.alreadyLoaded.includes(n))
            .map(name =>
                this.platform
                    .loadConfigSet(name, customLocation)
                    .then(content => {
                        this.alreadyLoaded.push(name);
                        return content;
                    })
                    .catch(() => {
                        errorCount++;
                        this.proxy.logAsWarning(
                            `[${name}] configset doesn't exist in the assets storage. ` +
                                'Configset Not loaded.'
                        );
                        return '';
                    })
            );
        if (loaderArray.length > 0) {
            customConfigSetContentArray = await Promise.all(loaderArray);
        }
        if (throwError && errorCount > 0) {
            throw new Error('Error occurred when loading some configsets. Please check the log.');
        }
        return customConfigSetContentArray.join('');
    }
    /**
     * load the custom configset content from user defined custom configset location
     * @returns {Promise} configset content
     */
    protected async loadUserCustom(): Promise<string> {
        try {
            const blobs: Blob[] = await this.platform.listConfigSet(null, true);
            let fileCount = 0;
            let loadedCount = 0;
            let errorCount = 0;
            const contents: string[] = await Promise.all(
                blobs
                    .filter(blob => {
                        // exclude those filename starting with a dot
                        return !blob.fileName.startsWith('.');
                    })
                    .map(blob => {
                        fileCount++;
                        return this.platform
                            .loadConfigSet(blob.fileName, true)
                            .then(content => {
                                loadedCount++;
                                return content;
                            })
                            .catch(error => {
                                errorCount++;
                                this.proxy.logAsWarning(error);
                                return '';
                            });
                    })
            );
            this.proxy.logAsInfo(
                `Total files: ${fileCount}. ${loadedCount} loaded. ${errorCount} error.`
            );
            return contents.join('\n');
        } catch (error) {
            this.proxy.logForError('Error in listing files in container.', error);
            return '';
        }
    }
    /**
     * load all required configset(s) content and combine them into one string
     * @returns {Promise} configset content
     */
    protected async loadConfig(): Promise<string> {
        let baseConfig = '';
        // check if second nic is enabled in the settings
        // configset for the second nic
        // must be loaded prior to the base config
        if (this.settings.get(AwsFortiGateAutoscaleSetting.EnableNic2).truthValue) {
            baseConfig += await this.loadPort2();
        }
        baseConfig += await this.loadBase(); // always load base config

        // check if internal elb integration is enabled in the settings
        // then load the corresponding config set
        if (this.settings.get(AwsFortiGateAutoscaleSetting.EnableInternalElb).truthValue) {
            baseConfig += await this.loadInternalElbWeb();
        }
        // check if faz integration is enabled in the settings
        // then load the corresponding config set
        if (this.settings.get(AwsFortiGateAutoscaleSetting.EnableFazIntegration).truthValue) {
            baseConfig += await this.loadFazIntegration();
        }
        // check if any other additional configsets is required
        // the name list is string of a comma-separated name list, and can be splitted into
        // a valid string array
        // NOTE: additional required configsets should be processed second last
        const additionalConfigSetNameList =
            this.settings.get(AwsFortiGateAutoscaleSetting.AdditionalConfigSetNameList).value || '';

        // splits the string into an array of string without whitespaces
        const additionalConfigSetArray =
            (additionalConfigSetNameList &&
                additionalConfigSetNameList
                    .split(/(?<=,|^)[ ]*([a-z1-9]+)[ ]*(?=,|$)/)
                    .filter(a => !!a && !a.includes(','))) ||
            [];

        // load additional required configsets
        if (additionalConfigSetArray.length > 0) {
            baseConfig += await this.loadBatch(additionalConfigSetArray, false, false);
        }

        // finally, try to include every configset stored in the user custom location
        // NOTE: user custom configsets should be processed last
        baseConfig += await this.loadUserCustom();

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
            config = this.processConfigV2(config, sourceData);
        }

        const psksecret = this.settings.get(AwsFortiGateAutoscaleSetting.FortiGatePskSecret).value;
        const syncInterface =
            this.settings.get(AwsFortiGateAutoscaleSetting.FortiGateSyncInterface).value || 'port1';
        const trafficPort =
            this.settings.get(AwsFortiGateAutoscaleSetting.FortiGateTrafficPort).value || '443';
        const trafficProtocol =
            this.settings.get(AwsFortiGateAutoscaleSetting.FortiGateTrafficProtocol).value || 'ALL';
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
            .replace(new RegExp('{TRAFFIC_PROTOCOL}', 'gm'), trafficProtocol.toUpperCase())
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
        let conf = config;
        const nodePaths = config.match(/{(@[a-zA-Z_-]+(#\d+)*)+(\.[a-zA-Z_-]+(#\d+)*)+}/gm) || [];
        try {
            for (const nodePath of nodePaths) {
                let replaceBy = null;
                // check if it is in v2 format: {@SourceType.property[#num][.subProperty[#num]...]}
                const [, resRoot] = /^{(@[a-zA-Z_-]+(#\d+)*)+(\.[a-zA-Z_-]+(#\d+)*)+}$/gm.exec(
                    nodePath
                );
                if (resRoot && resourceMap[resRoot]) {
                    replaceBy = configSetResourceFinder(resourceMap, nodePath);
                }
                if (replaceBy) {
                    conf = conf.replace(new RegExp(nodePath, 'g'), replaceBy);
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