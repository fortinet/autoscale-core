import * as HttpStatusCodes from 'http-status-codes';
import { TransitGatewayContext } from './aws/aws-platform';
import { HeartbeatSyncTiming } from '../master-election';

import { FortiGateAutoscaleSetting } from './fortigate-autoscale-settings';
import { PlatformAdapter, ReqType } from '../platform-adapter';
import { CloudFunctionProxyAdapter, CloudFunctionProxy } from '../cloud-function-proxy';
import {
    BootstrapConfigurationStrategy,
    BootstrapConfigStrategyResult,
    BootstrapContext
} from '../context-strategy/bootstrap-context';
import {
    AutoscaleEnvironment,
    configSetResourceFinder,
    Autoscale,
    CloudFunctionHandler,
    LicensingStrategy,
    HttpError
} from '../autoscale-core';
import { Settings } from '../autoscale-setting';
import { VirtualMachine } from '../virtual-machine';
import {
    NicAttachmentContext,
    NicAttachmentStrategy
} from '../context-strategy/nic-attachment-context';
import { VpnAttachmentStrategy } from '../context-strategy/vpn-attachment-context';
import { ScalingGroupStrategy } from '../context-strategy/scaling-group-context';

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
    protected async loadConfig(): Promise<string> {
        let baseConfig = '';
        // check if second nic is enabled, config for the second nic must be prepended to
        // base config
        if (this.settings.get(FortiGateAutoscaleSetting.EnableNic2).truthValue) {
            baseConfig += await this.loadNic2();
        }
        baseConfig += await this.loadBase(); // alwasy load base config
        // if internal elb is integrated
        if (this.settings.get(FortiGateAutoscaleSetting.EnableInternalElb).truthValue) {
            baseConfig += await this.loadInternalElbWeb();
        }
        // if faz integration is enabled, require this 'fazintegration' configset
        if (this.settings.get(FortiGateAutoscaleSetting.EnableFazIntegration).truthValue) {
            baseConfig += await this.loadFazIntegration();
        }
        // check if other custom configsets are required
        // NOTE: additional required configsets should be processed last
        let customConfigSetName = this.settings.get(FortiGateAutoscaleSetting.CustomConfigSetName)
            .value;
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

        const psksecret = this.settings.get(FortiGateAutoscaleSetting.FortiGatePskSecret).value;
        const syncInterface =
            this.settings.get(FortiGateAutoscaleSetting.FortiGateSyncInterface).value || 'port1';
        const trafficPort =
            this.settings.get(FortiGateAutoscaleSetting.FortiGateTrafficPort).value || '443';
        const adminPort =
            this.settings.get(FortiGateAutoscaleSetting.FortiGateAdminPort).value || '8443';
        const intElbDns = this.settings.get(FortiGateAutoscaleSetting.FortiGateInternalElbDns)
            .value;
        const hbInterval = this.settings.get(FortiGateAutoscaleSetting.HeartbeatInterval).value;
        const hbCallbackUrl =
            this.settings.get(FortiGateAutoscaleSetting.AutoscaleHandlerUrl).value || '';
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
                const resRoot =
                    typeof nodePath === 'string' ? nodePath.split('.')[0].substr(1) : '';
                if (resourceMap[resRoot]) {
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
    protected getActiveRoleConfig(config: string, targetVm: VirtualMachine): Promise<string> {
        return Promise.resolve(this.processConfigV2(config, { '@device': targetVm }));
    }
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

export class FortiGateAutoscale<TReq, TContext, TRes> extends Autoscale
    implements
        CloudFunctionHandler<TReq, TContext, TRes>,
        BootstrapContext,
        NicAttachmentContext,
        TransitGatewayContext {
    bootstrapConfigStrategy: BootstrapConfigurationStrategy;
    vpnAttachmentStrategy: VpnAttachmentStrategy;
    nicAttachmentStrategy: NicAttachmentStrategy;
    handleVpnAttachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleVpnDetachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    cleanupUnusedVpn(): Promise<string> {
        throw new Error('Method not implemented.');
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
    setNicAttachmentStrategy(strategy: NicAttachmentStrategy): void {
        this.nicAttachmentStrategy = strategy;
    }
    async handleCloudFunctionRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes> {
        let responseBody: string;
        try {
            this.proxy = proxy;
            this.platform = platform;
            this.env = env;
            this.proxy.logAsInfo('calling handleRequest.');
            await this.platform.init();
            const requestType = this.platform.getRequestType();
            if (requestType === ReqType.LaunchingVm) {
                responseBody = await this.handleLaunchedVm();
            } else if (requestType === ReqType.BootstrapConfig) {
                responseBody = await this.handleBootstrap();
            } else if (requestType === ReqType.HeartbeatSync) {
                responseBody = await this.handleHeartbeatSync();
            } else if (requestType === ReqType.StatusMessage) {
                // NOTE: FortiGate sends status message on some internal conditions, could ignore
                // those status messages for now.
                this.proxy.logAsInfo('FortiGate status message is received but ignored.');
                responseBody = '';
            } else if (requestType === ReqType.TerminatingVm) {
                responseBody = await this.handleTerminatingVm();
            }
            this.proxy.logAsInfo('called handleRequest.');
            return proxy.formatResponse(HttpStatusCodes.OK, responseBody, {});
        } catch (error) {
            // NOTE: assert that error is always an instance of Error
            let httpError: HttpError;
            this.proxy.logForError('called handleRequest.', error);
            if (!(error instanceof HttpError)) {
                httpError = new HttpError(
                    HttpStatusCodes.INTERNAL_SERVER_ERROR,
                    (error as Error).message
                );
            } else {
                httpError = error;
            }
            return proxy.formatResponse(httpError.status, '', {});
        }
    }
    setBootstrapConfigurationStrategy(strategy: BootstrapConfigurationStrategy): void {
        this.bootstrapConfigStrategy = strategy;
    }
    async handleBootstrap(): Promise<string> {
        this.proxy.logAsInfo('calling handleBootstrap.');
        let error: Error;
        // load target vm
        if (!this.env.targetVm) {
            this.env.targetVm = await this.platform.getTargetVm();
        }
        // if target vm doesn't exist, unknown request
        if (!this.env.targetVm) {
            error = new Error(`Requested non-existing vm (id:${this.env.targetId}).`);
            this.proxy.logForError('', error);
            throw error;
        }
        // load target healthcheck record
        this.env.targetHealthCheckRecord =
            this.env.targetHealthCheckRecord ||
            (await this.platform.getHealthCheckRecord(this.env.targetVm));

        // if there exists a health check record for this vm, this request may probably be
        // a redundant request. ignore it.
        if (this.env.targetHealthCheckRecord) {
            this.proxy.logAsWarning(
                `Health check record for vm (id: ${this.env.targetId}) ` +
                    'already exists. It looks like this bootstrap configuration request' +
                    " isn't normal. ignore it by returning empty."
            );
            this.proxy.logAsInfo('called handleBootstrap.');
            return '';
        }
        // if master is elected?
        // get master vm
        if (!this.env.masterVm) {
            this.env.masterVm = await this.platform.getMasterVm();
        }
        // get master record
        this.env.masterRecord = this.env.masterRecord || (await this.platform.getMasterRecord());
        // handle master election. the expected result should be one of:
        // master election is triggered
        // master election is finalized
        // master election isn't needed
        await this.handleMasterElection();

        // assert master record should be available now
        // get master record again
        this.env.masterRecord = this.env.masterRecord || (await this.platform.getMasterRecord());

        await this.bootstrapConfigStrategy.prepare(this.platform, this.proxy, this.env);
        await this.bootstrapConfigStrategy.apply();
        const bootstrapConfig = this.bootstrapConfigStrategy.getConfiguration();
        // output configuration content in debug level so that we can turn it off on production
        this.proxy.logAsDebug(`configuration: ${bootstrapConfig}`);
        this.proxy.logAsInfo('called handleBootstrap.');
        return bootstrapConfig;
    }
    handleHeartbeatSync(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    doTargetHealthCheck(): Promise<HeartbeatSyncTiming> {
        throw new Error('Method not implemented.');
    }
    doMasterHealthCheck(): Promise<HeartbeatSyncTiming> {
        throw new Error('Method not implemented.');
    }
    setScalingGroupStrategy(strategy: ScalingGroupStrategy): void {
        this.scalingGroupStrategy = strategy;
    }
    handleLaunchingVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleLaunchedVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleTerminatingVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleTerminatedVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setLicensingStrategy(strategy: LicensingStrategy): void {
        this.licensingStrategy = strategy;
    }
    handleLicenseAssignment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
}
