import { Settings, AutoscaleSetting } from './autoscale-setting';
import {
    MasterElectionStrategy,
    AutoscaleContext,
    HeartbeatSyncStrategy,
    TaggingVmStrategy,
    VmTagging,
    VmTaggingType
} from './context-strategy/autoscale-context';
import {
    ScalingGroupContext,
    ScalingGroupStrategy
} from './context-strategy/scaling-group-context';
import { PlatformAdapter, ReqMethod, ReqType, ReqBody, ReqHeaders } from './platform-adapter';
import {
    MasterElection,
    HealthCheckRecord,
    MasterRecord,
    HealthCheckResult,
    MasterRecordVoteState,
    HealthCheckSyncState
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

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

export type WaitForPromiseEmitter<TResult> = () => Promise<TResult>;

export type WaitForConditionChecker<TInput> = (
    input: TInput,
    callCount: number,
    ...args
) => Promise<boolean>;

export async function waitFor<TResult>(
    promiseEmitter: WaitForPromiseEmitter<TResult>,
    conditionChecker: WaitForConditionChecker<TResult>,
    interval: number,
    proxy?: CloudFunctionProxyAdapter
): Promise<TResult> {
    let count = 0;
    const maxCount = 30;
    if (interval <= 0) {
        interval = 5000; // soft default to 5 seconds
    }
    try {
        const result = await promiseEmitter();

        let complete = false;
        do {
            if (proxy) {
                proxy.logAsInfo('Await condition check result.');
            }
            complete = await conditionChecker(result, ++count, proxy || undefined);
            if (!complete) {
                if (count >= maxCount) {
                    throw new Error(`It reached the maximum amount (${maxCount}) of attempts.`);
                }
                if (proxy) {
                    proxy.logAsInfo(
                        `Condition check not passed, count: ${count}. Retry in ${interval} ms.`
                    );
                }
                await sleep(interval);
            } else {
                if (proxy) {
                    proxy.logAsInfo('Condition check passed. End waiting and returns task result.');
                }
                break;
            }
        } while (!complete);
        return result;
    } catch (error) {
        if (proxy) {
            proxy.logForError('WaitFor() is interrupted.', error);
        }
        throw error;
    }
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

export interface PlatformAdaptee {
    loadSettings(): Promise<Settings>;
    getReqType(proxy: CloudFunctionProxyAdapter): Promise<ReqType>;
    getReqMethod(proxy: CloudFunctionProxyAdapter): ReqMethod;
    // checkReqIntegrity(proxy: CloudFunctionProxyAdapter): void;
    getReqBody(proxy: CloudFunctionProxyAdapter): ReqBody;
    getReqHeaders(proxy: CloudFunctionProxyAdapter): ReqHeaders;
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
        LicensingModelContext {
    init(): Promise<void>;
}

export interface HAActivePassiveBoostrapStrategy {
    prepare(
        election: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void>;
    result(): Promise<MasterElection>;
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
    setTaggingVmStrategy(strategy: TaggingVmStrategy): void {
        this.taggingVmStrategy = strategy;
    }
    async init(): Promise<void> {
        await this.platform.init();
    }

    async handleLaunchingVm(): Promise<string> {
        return await this.scalingGroupStrategy.onLaunchingVm();
    }
    async handleTerminatingVm(): Promise<string> {
        return await this.scalingGroupStrategy.onTerminatingVm();
    }
    async handleHeartbeatSync(): Promise<string> {
        this.proxy.logAsInfo('calling handleHeartbeatSync.');
        let response = '';
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
        // prepare to apply the heartbeatSyncStrategy to get vm health check records
        // ASSERT: this.env.targetVm is available
        this.heartbeatSyncStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
        // apply the heartbeat sync strategy to be able to get vm health check records
        await this.heartbeatSyncStrategy.apply();
        // ASSERT: the heartbeatSyncStrategy is done

        // load target health check record
        if (this.heartbeatSyncStrategy.targetHealthCheckRecord.upToDate) {
            this.env.targetHealthCheckRecord = this.heartbeatSyncStrategy.targetHealthCheckRecord;
        }
        // if it's not up to date, load it from db.
        else {
            this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.targetVm
            );
        }

        const isFirstHeartbeat = this.heartbeatSyncStrategy.targetVmFirstHeartbeat;

        // the 1st hb is also the indication of the the vm becoming in-service. The launching vm
        // phase (in some platforms) should be done at this point. apply the launced vm strategy
        if (isFirstHeartbeat) {
            await this.handleLaunchedVm();
        }

        const heartbeatTiming = await this.heartbeatSyncStrategy.result;
        // If the timing indicates that it should be dropped,
        // don't update. Respond immediately. return.
        if (heartbeatTiming === HealthCheckResult.Dropped) {
            return '';
        }

        // if master exists?
        // get master vm
        this.env.masterVm = this.env.masterVm || (await this.platform.getMasterVm());

        // get master healthcheck record
        if (this.env.masterVm) {
            this.env.masterHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.masterVm
            );
        } else {
            this.env.masterHealthCheckRecord = undefined;
        }
        // get master record
        this.env.masterRecord = this.env.masterRecord || (await this.platform.getMasterRecord());

        // about to handle to the master election

        // NOTE: master election relies on health check record of both target and master vm,
        // ensure the two values are up to date.

        // ASSERT: the following values are up-to-date before handling master election.
        // this.env.targetVm
        // this.env.masterVm
        // this.env.masterRecord

        const masterElection = await this.handleMasterElection();

        // if new master is elected, reload the masterVm, master record to this.env.
        if (masterElection.newMaster) {
            this.env.masterVm = masterElection.newMaster;
            this.env.masterRecord = masterElection.newMasterRecord;
            this.env.masterHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.masterVm
            );
        }

        // the health check record may need to update again.
        // if master vote state is done, and if the target vm is holding a different master ip or
        // holding no master ip, need to update its health check record with the new master,
        // then notify it the new master ip
        if (
            masterElection.newMaster &&
            masterElection.newMasterRecord.voteState === MasterRecordVoteState.Done &&
            this.env.targetHealthCheckRecord.masterIp !==
                masterElection.newMaster.primaryPrivateIpAddress
        ) {
            this.env.targetHealthCheckRecord.masterIp =
                masterElection.newMaster.primaryPrivateIpAddress;
            await this.platform.updateHealthCheckRecord(this.env.targetHealthCheckRecord);
            response = JSON.stringify({
                'master-ip': masterElection.newMaster.primaryPrivateIpAddress
            });
        }
        this.proxy.logAsInfo('called handleHeartbeatSync.');
        return response;
    }
    handleTerminatedVm(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    async handleTaggingVm(taggings: VmTagging[]): Promise<void> {
        this.taggingVmStrategy.prepare(this.platform, this.proxy, taggings);
        await this.taggingVmStrategy.apply();
    }

    async handleMasterElection(): Promise<MasterElection> {
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
                    this.env.targetHealthCheckRecord.syncState === HealthCheckSyncState.InSync
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
        // get the election result
        // then update the autoscale environment.
        const election = await this.masterElectionStrategy.result();
        // update the env
        this.env.masterRecord = election.newMasterRecord;
        this.env.masterVm = election.newMaster;

        // if master role has switched, need to tag the new master
        // add tags (or called labels in some platforms) to the target and master vm
        const vmTaggings: VmTagging[] = [];
        // if there's new master, update its tag
        if (election.newMaster) {
            vmTaggings.push({
                vm: election.newMaster,
                type: VmTaggingType.newMasterVm
            });
        }
        // if old master exists, need to deal with its tag too.
        if (election.oldMaster) {
            vmTaggings.push({
                vm: election.oldMaster,
                type: VmTaggingType.newMasterVm
            });
        }
        await this.handleTaggingVm(vmTaggings);

        this.proxy.logAsInfo('called handleMasterElection.');
        return election;
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
}

type FinderRef = { [key: string]: FinderRef } | [] | string | null;
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
