import { Settings, AutoscaleSetting } from './autoscale-setting';
import { Table } from './db-definitions';
import {
    MasterElectionStrategy,
    AutoscaleContext,
    HeartbeatSyncStrategy
} from './context-strategy/autoscale-context';
import {
    ScalingGroupContext,
    ScalingGroupStrategy
} from './context-strategy/scaling-group-context';
import { PlatformAdapter, ReqMethod, ReqType } from './platform-adapter';
import {
    MasterElection,
    HealthCheckRecord,
    MasterRecord,
    HeartbeatSyncTiming,
    MasterRecordVoteState
} from './master-election';
import { VirtualMachine } from './virtual-machine';
import { CloudFunctionProxy, CloudFunctionProxyAdapter } from './cloud-function-proxy';

export class HttpError extends Error {
    public readonly name: string;
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'HttpError';
    }
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
    masterId?: string;
    masterVm?: VirtualMachine;
    masterScalingGroup?: string;
    masterHealthCheckRecord?: HealthCheckRecord;
    masterRecord: MasterRecord;
    masterRoleChanged?: boolean;
    targetId?: string;
    targetVm?: VirtualMachine;
    targetScalingGroup?: string;
    targetHealthCheckRecord?: HealthCheckRecord;
    [key: string]: {};
}

export interface PlatformAdaptee<TReq, TContext, TRes> {
    loadSettings(): Promise<Settings>;
    getReqType(proxy: CloudFunctionProxy<TReq, TContext, TRes>): ReqType;
    getReqMethod(proxy: CloudFunctionProxy<TReq, TContext, TRes>): ReqMethod;
    saveItemToDb(table: Table, item: {}, conditionExp: string): Promise<void>;
}

/**
 * To provide Cloud Function handling logics
 */
export interface CloudFunctionHandler<TReq, TContext, TRes> {
    handleCloudFunctionRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes>;
}

/**
 * To provide Licensing model related logics such as license assignment.
 */
export interface LicensingModelContext {
    handleLicenseAssignment(): Promise<string>;
}

export interface LicensingStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void>;
    apply(): Promise<string>;
}

export interface AutoscaleCore
    extends AutoscaleContext,
        ScalingGroupContext,
        LicensingModelContext {}

export interface HAActivePassiveBoostrapStrategy {
    prepare(
        election: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void>;
    result(): Promise<MasterElection>;
}

export interface TaggingVmStrategy {
    prepare(
        election: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void>;
    apply(): Promise<void>;
}

export class Autoscale implements AutoscaleCore {
    platform: PlatformAdapter;
    scalingGroupStrategy: ScalingGroupStrategy;
    heartbeatSyncStrategy: HeartbeatSyncStrategy;
    taggingVmStrategy: TaggingVmStrategy;
    env: AutoscaleEnvironment;
    proxy: CloudFunctionProxyAdapter;
    settings: Settings;
    masterElectionStrategy: MasterElectionStrategy;
    licensingStrategy: LicensingStrategy;
    constructor(p: PlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        this.platform = p;
        this.env = e;
        this.proxy = x;
    }

    async handleLaunchingVm(): Promise<string> {
        return await this.scalingGroupStrategy.onLaunchingVm();
    }
    async handleTerminatingVm(): Promise<string> {
        return await this.scalingGroupStrategy.onTerminatingVm();
    }
    async handleHeartbeatSync(): Promise<string> {
        this.proxy.logAsInfo('calling handleHeartbeatSync.');
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
        this.proxy.logAsInfo('called handleHeartbeatSync.');
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
        const settings = await this.platform.getSettings();
        const electionTimeout = Number(settings.get(AutoscaleSetting.MasterElectionTimeout).value);
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
        await this.scalingGroupStrategy.onLaunchedVm();
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
    setScalingGroupStrategy(strategy: ScalingGroupStrategy): void {
        this.scalingGroupStrategy = strategy;
    }
    setMasterElectionStrategy(strategy: MasterElectionStrategy): void {
        this.masterElectionStrategy = strategy;
    }
    handleLicenseAssignment(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setLicenseAssignmentStrategy(strategy: LicensingStrategy): void {
        this.licensingStrategy = strategy;
    }
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void {
        this.heartbeatSyncStrategy = strategy;
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
