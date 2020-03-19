import * as HttpStatusCodes from 'http-status-codes';
import {
    FunctionHandlerContext,
    AutoscaleEnvironment,
    HttpError,
    Autoscale,
    BootstrapContext,
    BootstrapConfigurationStrategy,
    LicensingStrategy,
    MasterElection,
    HeartbeatSyncTiming,
    MasterElectionStrategy,
    MasterElectionStrategyResult,
    HeartbeatSyncStrategy,
    CloudFunctionProxyAdapter,
    CloudFunctionProxy,
    PlatformAdapter,
    ReqType,
    NicAttachmentContext,
    NicAttachmentStrategy,
    VpnAttachmentStrategy,
    ScalingGroupStrategy
} from '../index';
import { TransitGatewayContext } from './aws/aws-platform';

export * from './aws/aws-platform';

export class FortiGateMasterElectionStrategy implements MasterElectionStrategy {
    prep: MasterElection;
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    prepare(
        prep: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void> {
        this.prep = prep;
        this.platform = platform;
        this.proxy = proxy;
        return Promise.resolve();
    }
    result(): Promise<MasterElection> {
        throw new Error('Method not implemented.');
    }
    apply(): Promise<MasterElectionStrategyResult> {
        throw new Error('Method not implemented.');
    }
}

export class FortiGateAutoscale<TReq, TContext, TRes> extends Autoscale
    implements
        FunctionHandlerContext<TReq, TContext, TRes>,
        BootstrapContext,
        NicAttachmentContext,
        TransitGatewayContext {
    vpnAttachmentStrategy: VpnAttachmentStrategy;
    nicAttachmentStrategy: NicAttachmentStrategy;
    masterElectionStrategy: FortiGateMasterElectionStrategy;
    heartbeatSyncStrategy: HeartbeatSyncStrategy;
    scalingGroupStrategy: ScalingGroupStrategy;
    licensingStrategy: LicensingStrategy;
    bootstrapConfigStrategy: BootstrapConfigurationStrategy;
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
    async handleRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes> {
        let responseBody: string;
        try {
            proxy.logAsInfo('calling handleRequest.');
            const requestType = platform.getRequestType();
            if (requestType === ReqType.LaunchingVm) {
                responseBody = await this.handleLaunchedVm();
            } else if (requestType === ReqType.BootstrapConfig) {
                responseBody = await this.handleBootstrap();
            } else if (requestType === ReqType.HeartbeatSync) {
                responseBody = await this.handleHeartbeatSync();
            } else if (requestType === ReqType.StatusMessage) {
                // NOTE: FortiGate sends status message on some internal conditions, could ignore
                // those status messages for now.
                proxy.logAsInfo('FortiGate status message is received but ignored.');
                responseBody = '';
            } else if (requestType === ReqType.TerminatingVm) {
                responseBody = await this.handleTerminatingVm();
            }
            proxy.logAsInfo('called handleRequest.');
            return proxy.formatResponse(HttpStatusCodes.OK, responseBody, {});
        } catch (error) {
            // NOTE: assert that error is always an instance of Error
            let httpError: HttpError;
            proxy.logForError('called handleRequest.', error);
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

        this.bootstrapConfigStrategy.prepare(this.platform, this.proxy, this.env);
        await this.bootstrapConfigStrategy.apply();
        const bootstrapConfig = this.bootstrapConfigStrategy.getConfiguration();
        // output configuration content in debug level so that we can turn it off on production
        this.proxy.logAsDebug(`configuration: ${bootstrapConfig}`);
        this.proxy.logAsInfo('called handleBootstrap.');
        return bootstrapConfig;
    }
    setMasterElectionStrategy(strategy: FortiGateMasterElectionStrategy): void {
        this.masterElectionStrategy = strategy;
    }
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void {
        this.heartbeatSyncStrategy = strategy;
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
