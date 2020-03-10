import { Settings, AutoscaleSetting } from './autoscale-setting';
import { Table } from './db-definitions';

export enum LogLevel {
    Log = 'Log',
    Info = 'Info',
    Warn = 'Warn',
    Error = 'Error',
    Debug = 'Debug'
}

export class HttpError extends Error {
    public readonly name: string;
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'HttpError';
    }
}

export enum ReqType {
    LaunchingVm = 'LaunchingVm',
    TerminatingVm = 'TerminatingVm',
    BootstrapConfig = 'BootstrapConfig',
    HeartbeatSync = 'HeartbeatSync',
    StatusMessage = 'StatusMessage'
}

export enum ReqMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
    TRACE,
    OPTIONS,
    CONNECT
}

export type StrategyResult = string;
export enum GeneralStrategyResult {
    Success = 'Success',
    Failure = 'Failure'
}

const reqMethod: Map<string, ReqMethod> = new Map([
    ['GET', ReqMethod.GET],
    ['POST', ReqMethod.POST],
    ['PUT', ReqMethod.PUT],
    ['DELETE', ReqMethod.DELETE],
    ['PATCH', ReqMethod.PATCH],
    ['HEAD', ReqMethod.HEAD],
    ['TRACE', ReqMethod.TRACE],
    ['OPTIONS', ReqMethod.OPTIONS],
    ['CONNECT', ReqMethod.CONNECT]
]);

export function mapHttpMethod(s: string): ReqMethod {
    return s && reqMethod.get(s.toUpperCase());
}

export interface AutoscaleEnvironment {
    masterId: string;
    masterVm: VirtualMachine;
    masterScalingGroup: string;
    masterHealthCheckRecord: HealthCheckRecord;
    masterRecord: MasterRecord;
    masterRoleChanged: boolean;
    targetId: string;
    targetVm: VirtualMachine;
    targetScalingGroup: string;
    targetHealthCheckRecord: HealthCheckRecord;
}

export interface VirtualMachine {
    instanceId: string;
    scalingGroupName: string;
    primaryPrivateIpAddress: string;
    primaryPublicIpAddress: string;
    virtualNetworkId: string;
    subnetId: string;
    securityGroups?: {}[];
    networkInterfaces?: {}[];
    sourceData?: {};
}

export type CloudFunctionResponseBody = string | {};

export interface CloudFunctionProxyAdapter {
    formatResponse(httpStatusCode: number, body: CloudFunctionResponseBody, headers: {}): {};
    log(message: string, level: LogLevel): void;
    logAsDebug(message: string): void;
    logAsInfo(message: string): void;
    logAsWarning(message: string): void;
    logAsError(message: string): void;
    logForError(messagePrefix: string, error: Error): void;
}

export abstract class CloudFunctionProxy<TReq, TContext, TRes>
    implements CloudFunctionProxyAdapter {
    request: TReq;
    context: TContext;
    constructor(req: TReq, context: TContext) {
        this.request = req;
        this.context = context;
    }
    abstract log(message: string, level: LogLevel): void;
    logAsDebug(message: string): void {
        this.log(message, LogLevel.Debug);
    }
    logAsError(message: string): void {
        this.log(message, LogLevel.Error);
    }
    logAsInfo(message: string): void {
        this.log(message, LogLevel.Info);
    }
    logAsWarning(message: string): void {
        this.log(message, LogLevel.Warn);
    }
    logForError(messagePrefix: string, error: Error): void {
        const errMessage = error.message || '(no error message available)';
        const errStack = (error.stack && ` Error stack:${error.stack}`) || '';

        this.log(`${messagePrefix}. Error: ${errMessage}${errStack}`, LogLevel.Error);
    }
    abstract formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers: {}
    ): TRes;
}

export interface VmDescriptor {
    id: string;
}

export interface PlatformAdaptee<TReq, TContext, TRes> {
    getReqType(proxy: CloudFunctionProxy<TReq, TContext, TRes>): ReqType;
    getReqMethod(proxy: CloudFunctionProxy<TReq, TContext, TRes>): ReqMethod;
    saveItemToDb(table: Table, item: {}, conditionExp: string): Promise<void>;
}

export interface PlatformAdapter {
    adaptee: {};
    getRequestType(): ReqType;
    getReqHeartbeatInterval(): number;
    getSettings(): Settings;
    getTargetVm(): Promise<VirtualMachine>;
    getMasterVm(): Promise<VirtualMachine>;
    getHealthCheckRecord(vm: VirtualMachine): Promise<HealthCheckRecord>;
    getMasterRecord(): Promise<MasterRecord>;
    equalToVm(vmA: VirtualMachine, vmB: VirtualMachine): boolean;
    describeVm(desc: VmDescriptor): Promise<VirtualMachine>;
    deleteVm(vm: VirtualMachine): Promise<void>;
    createHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    /**
     * create the master record in the db system.
     * @param rec the new master record
     * @param oldRec the old master record, if provided, will try to replace this record by
     * matching the key properties.
     */
    createMasterRecord(rec: MasterRecord, oldRec: MasterRecord | null): Promise<void>;
    /**
     * update the master record using the given rec. update only when the record key match
     * the record in the db.
     * @param rec master record to be updated.
     */
    updateMasterRecord(rec: MasterRecord): Promise<void>;
}

/**
 * To provide Cloud Function handling logics
 */
export interface FunctionHandlerContext<TReq, TContext, TRes> {
    handleRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes>;
}

/**
 * To provide Autoscale basic logics
 */
export interface AutoscaleContext {
    setMasterElectionStrategy(strategy: MasterElectionStrategy): void;
    handleMasterElection(): Promise<string>;
    setHeartbeatSyncStrategy(strategy: Strategy): void;
    handleBootstrap(): Promise<string>;
    handleHeartbeatSync(): Promise<string>;
    doTargetHealthCheck(): Promise<HeartbeatSyncTiming>;
    doMasterHealthCheck(): Promise<HeartbeatSyncTiming>;
}

/**
 * To provide Licensing model related logics such as license assignment.
 */
export interface LicensingModelContext {
    setLicenseAssignmentStrategy(strategy: Strategy): void;
    handleLicenseAssignment(): Promise<string>;
}

/**
 * To provide auto scaling group related logics such as scaling out, scaling in.
 */
export interface ScalingGroupContext {
    setLaunchingVmStrategy(strategy: Strategy): void;
    handleLaunchingVm(): Promise<string>;
    setLaunchedVmStrategy(strategy: Strategy): void;
    handleLaunchedVm(): Promise<string>;
    setTerminatingVmStrategy(strategy: Strategy): void;
    handleTerminatingVm(): Promise<string>;
    setTerminatedVmStrategy(strategy: Strategy): void;
    handleTerminatedVm(): Promise<string>;
}

/**
 * To provide secondary network interface attachment related logics
 */
export interface NicAttachmentContext {
    handleNicAttachment(): Promise<string>;
    handleNicDetachment(): Promise<string>;
    cleanupUnusedNic(): Promise<string>;
    setNicAttachmentStrategy(strategy: Strategy): void;
}

export enum NicAttachmentStatus {
    Attaching = 'Attaching',
    Attached = 'Attached',
    Detaching = 'Detaching',
    Detached = 'Detached'
}

export interface NicAttachmentStrategy extends Strategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void>;
}

export interface NicAttachmentRecord {
    instanceId: string;
    nicId: string;
    attachmentState: string;
}

/**
 * To provide VPN connection attachment related logics
 */
export interface VpnAttachmentContext {
    handleVpnAttachment(): Promise<string>;
    handleVpnDetachment(): Promise<string>;
    cleanupUnusedVpn(): Promise<string>;
    setVpnAttachmentStrategy(strategy: Strategy): void;
}

export interface AutoscaleCore
    extends AutoscaleContext,
        ScalingGroupContext,
        LicensingModelContext {}

export interface Strategy {
    apply(): Promise<string>;
}

export enum HealthCheckSyncState {
    InSync = 'in-sync',
    OutOfSync = 'out-of-sync'
}
export interface HealthCheckRecord {
    instanceId: string;
    ip: string;
    masterIp: string;
    heartbeatInterval: number;
    heartbeatLossCount: number;
    nextHeartbeatCheckTime: number;
    syncState: HealthCheckSyncState;
    healthy: boolean;
    inSync: boolean;
}

export enum HeartbeatSyncTiming {
    OnTime = 'OnTime',
    Late = 'Late',
    TooLate = 'TooLate',
    Dropped = 'Dropped'
}

export enum MasterRecordVoteState {
    Pending = 'pending',
    Done = 'done',
    Timeout = 'Timeout'
}

export enum MasterElectionStrategyResult {
    ShouldStop = 'ShouldStop',
    ShouldContinue = 'ShouldContinue'
}

export interface MasterRecord {
    id: string;
    instanceId: string;
    ip: string;
    scalingGroupName: string;
    virtualNetworkId: string;
    subnetId: string;
    voteEndTime: number;
    voteState: MasterRecordVoteState;
}

export interface MasterElection {
    oldMaster: VirtualMachine;
    oldMasterRecord: MasterRecord;
    newMaster: VirtualMachine;
    newMasterRecord: MasterRecord;
    candidate: VirtualMachine;
    candidateHealthCheck: HealthCheckRecord;
    preferredScalingGroup: string;
    electionDuration: number;
    signature: string;
}

export interface MasterElectionStrategy extends Strategy {
    prepare(
        election: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void>;
    result(): Promise<MasterElection>;
}

export class Autoscale implements AutoscaleCore {
    platform: PlatformAdapter;
    launchingVmStrategy: Strategy;
    launchedVmStrategy: Strategy;
    terminatingVmStrategy: Strategy;
    heartbeatSyncTimingStrategy: Strategy;
    taggingVmStrategy: Strategy;
    env: AutoscaleEnvironment;
    proxy: CloudFunctionProxyAdapter;
    settings: Settings;
    masterElectionStrategy: MasterElectionStrategy;
    licenseAssignmentStrategy: Strategy;
    terminatedVmStrategy: Strategy;
    constructor(
        p: PlatformAdapter,
        e: AutoscaleEnvironment,
        x: CloudFunctionProxyAdapter,
        s: Settings
    ) {
        this.platform = p;
        this.env = e;
        this.proxy = x;
        this.settings = s;
    }

    async handleLaunchingVm(): Promise<string> {
        return await this.launchingVmStrategy.apply();
    }
    async handleTerminatingVm(): Promise<string> {
        return await this.terminatingVmStrategy.apply();
    }
    handleBootstrap(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    async handleHeartbeatSync(): Promise<string> {
        let error: Error;
        // load healthcheck
        if (!this.env.targetHealthCheckRecord) {
            this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.targetVm
            );
        }

        // load target vm
        if (!this.env.targetVm) {
            this.env.targetVm = await this.platform.getTargetVm();
        }
        // if target vm doesn't exist, unknown request
        if (!this.env.targetVm) {
            error = new Error(`Requested non-exist vm (id:${this.env.targetId}).`);
            this.proxy.logForError('', error);
            throw error;
        }
        // load target healthcheck record
        this.env.targetHealthCheckRecord =
            this.env.targetHealthCheckRecord ||
            (await this.platform.getHealthCheckRecord(this.env.targetVm));

        // if no health check record, this request is considered as the first hb sync request.
        // if there's a health check record, this request is considered as a regular hb sync request.
        const isFirstHeartbeat = this.env.targetHealthCheckRecord === null;

        // the 1st hb is also the indication of the the vm becoming in-service. The launching vm
        // phase (in some platforms) should be done at this point. apply the launced vm strategy
        if (isFirstHeartbeat) {
            await this.handleLaunchedVm();
        }

        // does this hb sync arrive on time?
        // 1st hb does not need to verify the timing since no past healthcheck can compare with.
        // for a regular hb, it will need to verify this the timing.
        // here this function should delegate the health checking to the health check
        // strategy. then see the result health check record.
        const heartbeatTiming = await this.doTargetHealthCheck();
        // If the timing indicates that it should be dropped,
        // don't update. Respond immediately. return.
        if (heartbeatTiming === HeartbeatSyncTiming.Dropped) {
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

        // tag the vm (including target and master)
        await this.handleTaggingVm();

        // target is the master?
        if (this.platform.equalToVm(this.env.targetVm, this.env.masterVm)) {
            this.env.targetHealthCheckRecord.masterIp = this.env.targetVm.primaryPrivateIpAddress;
        } else {
            // master exist? use master ip
            if (this.env.masterVm) {
                this.env.targetHealthCheckRecord.masterIp = this.env.masterVm.primaryPrivateIpAddress;
            } else {
                this.env.targetHealthCheckRecord.masterIp = null;
            }
        }

        if (isFirstHeartbeat) {
            await this.platform.createHealthCheckRecord(this.env.targetHealthCheckRecord);
        } else {
            await this.platform.updateHealthCheckRecord(this.env.targetHealthCheckRecord);
        }
        return '';
    }
    handleTerminatedVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    async handleTaggingVm(): Promise<void> {
        await this.taggingVmStrategy.apply();
    }

    async handleMasterElection(): Promise<string> {
        this.proxy.logAsInfo('calling handleMasterElection.');
        const electionTimeout = Number(
            this.platform.getSettings().get(AutoscaleSetting.MasterElectionTimeout).value
        );
        await this.masterElectionStrategy.prepare(
            {
                oldMaster: this.env.masterVm,
                oldMasterRecord: this.env.masterRecord,
                newMaster: null,
                newMasterRecord: null,
                candidate: this.env.targetVm,
                electionDuration: electionTimeout
            } as MasterElection,
            this.platform,
            this.proxy
        );

        // master election required? condition 1: no master vm or record
        if (this.env.masterRecord === null || this.env.masterVm === null) {
            // handleMasterElection() will update the master vm info, if cannot determine the
            // master vm, master vm info will be set to null
            // expect that the pending master vm info can be available
            await this.masterElectionStrategy.apply();
        }
        // master election required? condition 2: has master record, but it's pending
        else if (this.env.masterRecord.voteState === MasterRecordVoteState.Pending) {
            // if master election is pending, only need to know the current result. do not need
            // to redo the election.
            // but if the target is also the pending master, the master election need to complete
            if (this.platform.equalToVm(this.env.targetVm, this.env.masterVm)) {
                // only complete the election when the pending master is healthy and still in-sync
                if (
                    this.env.targetHealthCheckRecord &&
                    this.env.targetHealthCheckRecord.healthy &&
                    this.env.targetHealthCheckRecord.inSync
                ) {
                    this.env.masterRecord.voteState = MasterRecordVoteState.Done;
                    await this.platform.updateMasterRecord(this.env.masterRecord);
                }
                // otherwise, do nothing
            }
            // otherwise, do nothing
        }
        // master election required? condition 3: has master record, but it's timeout
        else if (this.env.masterRecord.voteState === MasterRecordVoteState.Timeout) {
            // if master election already timeout, clear the current master vm and record
            // handleMasterElection() will update the master vm info, if cannot determine the
            // master vm, master vm info will be set to null
            // expect that a different master will be elected and its vm info can be available
            this.env.masterRecord = null;
            this.env.masterVm = null;
            await this.masterElectionStrategy.apply();
        }
        // master election required? condition 4: has master record, it's done
        else if (this.env.masterRecord.voteState === MasterRecordVoteState.Done) {
            // how is the master health check in this case?
            // get master vm healthcheck record
            if (!this.env.masterHealthCheckRecord) {
                this.env.masterHealthCheckRecord = await this.platform.getHealthCheckRecord(
                    this.env.masterVm
                );
            }
            // master is unhealthy, master election required.
            if (!this.env.masterHealthCheckRecord.healthy) {
                // handleMasterElection() will update the master vm info, if cannot determine the
                // master vm, master vm info will be set to null
                // expect that a different master will be elected and its vm info can be available
                await this.masterElectionStrategy.apply();
            }
        }
        // after master election complete (election may not be necessary in some cases)
        // get the election result then update the autoscale environment.
        const election: MasterElection = await this.masterElectionStrategy.result();
        this.env.masterRecord = election.newMasterRecord;
        this.env.masterVm = election.newMaster;
        this.proxy.logAsInfo('called handleMasterElection.');
        return '';
    }
    async handleLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchedVm.');
        await this.launchedVmStrategy.apply();
        this.proxy.logAsInfo('called handleLaunchedVm.');
        return '';
    }
    removeTargetVmFromAutoscale(): Promise<void> {
        throw new Error('Method not implemented.');
        // TODO:
        // await this.terminatingVmStrategy.apply();
    }
    removeMasterVmFromAutoscale(): Promise<void> {
        throw new Error('Method not implemented.');
        // TODO:
        // await this.terminatingVmStrategy.apply();
    }
    setLaunchingVmStrategy(strategy: Strategy): void {
        this.launchingVmStrategy = strategy;
    }
    setLaunchedVmStrategy(strategy: Strategy): void {
        this.launchedVmStrategy = strategy;
    }
    setTerminatingVmStrategy(strategy: Strategy): void {
        this.terminatingVmStrategy = strategy;
    }
    setMasterElectionStrategy(strategy: MasterElectionStrategy): void {
        this.masterElectionStrategy = strategy;
    }
    setTerminatedVmStrategy(strategy: Strategy): void {
        this.terminatedVmStrategy = strategy;
    }
    handleLicenseAssignment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setLicenseAssignmentStrategy(strategy: Strategy): void {
        this.licenseAssignmentStrategy = strategy;
    }
    setHeartbeatSyncStrategy(strategy: Strategy): void {
        this.heartbeatSyncTimingStrategy = strategy;
    }
    doTargetHealthCheck(): Promise<HeartbeatSyncTiming> {
        // TODO: implementation required
        // await this.heartbeatSyncTimingStrategy.apply();
        throw new Error('Method not implemented.');
    }
    doMasterHealthCheck(): Promise<HeartbeatSyncTiming> {
        // TODO: implementation required
        // await this.heartbeatSyncTimingStrategy.apply();
        throw new Error('Method not implemented.');
    }
}