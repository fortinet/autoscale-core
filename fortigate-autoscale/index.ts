import * as HttpStatusCodes from 'http-status-codes';
import {
    AutoscaleCore,
    MasterElectionStrategy,
    Strategy,
    HeartbeatSyncTiming,
    MasterElection,
    PlatformAdapter,
    CloudFunctionProxyAdapter,
    FunctionHandlerContext,
    CloudFunctionProxy,
    AutoscaleEnvironment,
    NicAttachmentContext,
    ReqType,
    HttpError
} from '../autoscale-core';
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
    apply(): Promise<string> {
        throw new Error('Method not implemented.');
    }
}

export class FortiGateAutoscale<TReq, TContext, TRes>
    implements
        AutoscaleCore,
        FunctionHandlerContext<TReq, TContext, TRes>,
        NicAttachmentContext,
        TransitGatewayContext {
    vnpAttachmentStrategy: Strategy;
    vnpDetachmentStrategy: Strategy;
    cleanupUnusedVpnStrategy: Strategy;
    nicAttachmentStrategy: Strategy;
    nicDetachmentStrategy: Strategy;
    cleanupUnusedNicStrategy: Strategy;
    masterElectionStrategy: FortiGateMasterElectionStrategy;
    heartbeatSyncStrategy: Strategy;
    launchingVmStrategy: Strategy;
    launchedVmStrategy: Strategy;
    terminatingVmStrategy: Strategy;
    terminatedVmStrategy: Strategy;
    licenseAssignmentStrategy: Strategy;
    handleVpnAttachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    handleVpnDetachment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    cleanupUnusedVpn(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setVpnAttachmentStrategy(strategy: Strategy): void {
        this.vnpAttachmentStrategy = strategy;
    }
    setVpnDetachmentStrategy(strategy: Strategy): void {
        this.vnpDetachmentStrategy = strategy;
    }
    setCleanupUnusedVpnStrategy(strategy: Strategy): void {
        this.cleanupUnusedVpnStrategy = strategy;
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
    setNicAttachmentStrategy(strategy: Strategy): void {
        this.nicAttachmentStrategy = strategy;
    }
    setNicDetachmentStrategy(strategy: Strategy): void {
        this.nicDetachmentStrategy = strategy;
    }
    setCleanupUnusedNicStrategy(strategy: Strategy): void {
        this.cleanupUnusedNicStrategy = strategy;
    }
    async handleRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        // TODO: remove the disabled rule when applicable
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    handleBootstrap(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setMasterElectionStrategy(strategy: FortiGateMasterElectionStrategy): void {
        this.masterElectionStrategy = strategy;
    }
    handleMasterElection(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setHeartbeatSyncStrategy(strategy: Strategy): void {
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
    setLaunchingVmStrategy(strategy: Strategy): void {
        this.launchingVmStrategy = strategy;
    }
    handleLaunchingVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setLaunchedVmStrategy(strategy: Strategy): void {
        this.launchedVmStrategy = strategy;
    }
    handleLaunchedVm(): Promise<string> {
        // NOTE: there's nothing much to do for FortiGate when the vm state changes to
        // 'launched' in the platform so leave this handling function empty
        return Promise.resolve('');
    }
    setTerminatingVmStrategy(strategy: Strategy): void {
        this.terminatingVmStrategy = strategy;
    }
    handleTerminatingVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setTerminatedVmStrategy(strategy: Strategy): void {
        this.terminatedVmStrategy = strategy;
    }
    handleTerminatedVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setLicenseAssignmentStrategy(strategy: Strategy): void {
        this.licenseAssignmentStrategy = strategy;
    }
    handleLicenseAssignment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
}
