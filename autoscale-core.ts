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
import { PlatformAdapter, ReqMethod } from './platform-adapter';
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
import { LicensingModelContext, LicensingStrategy } from './context-strategy/licensing-context';

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
    // getReqType(proxy: CloudFunctionProxyAdapter): Promise<ReqType>;
    // getReqMethod(proxy: CloudFunctionProxyAdapter): ReqMethod;
    // checkReqIntegrity(proxy: CloudFunctionProxyAdapter): void;
    // getReqBody(proxy: CloudFunctionProxyAdapter): ReqBody;
    // getReqHeaders(proxy: CloudFunctionProxyAdapter): ReqHeaders;
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
    proxy: CloudFunctionProxyAdapter;
    env: AutoscaleEnvironment;
    settings: Settings;
    taggingVmStrategy: TaggingVmStrategy;
    scalingGroupStrategy: ScalingGroupStrategy;
    heartbeatSyncStrategy: HeartbeatSyncStrategy;
    masterElectionStrategy: MasterElectionStrategy;
    licensingStrategy: LicensingStrategy;
    constructor(p: PlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        this.platform = p;
        this.env = e;
        this.proxy = x;
    }
    setScalingGroupStrategy(strategy: ScalingGroupStrategy): void {
        this.scalingGroupStrategy = strategy;
    }
    setMasterElectionStrategy(strategy: MasterElectionStrategy): void {
        this.masterElectionStrategy = strategy;
    }
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void {
        this.heartbeatSyncStrategy = strategy;
    }
    setTaggingVmStrategy(strategy: TaggingVmStrategy): void {
        this.taggingVmStrategy = strategy;
    }
    setLicensingStrategy(strategy: LicensingStrategy): void {
        this.licensingStrategy = strategy;
    }
    async init(): Promise<void> {
        await this.platform.init();
    }

    async handleLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchingVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        const result = await this.scalingGroupStrategy.onLaunchingVm();
        this.proxy.logAsInfo('called handleLaunchingVm.');
        return result;
    }
    async handleLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchedVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        const result = await this.scalingGroupStrategy.onLaunchedVm();
        this.proxy.logAsInfo('called handleLaunchedVm.');
        return result;
    }
    async handleTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleTerminatingVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        await this.scalingGroupStrategy.onTerminatingVm();
        // ASSERT: this.scalingGroupStrategy.onTerminatingVm() creates a terminating lifecycle item
        // in terminating vm, should do:
        // 1. mark it as heartbeat out-of-sync to prevent it from syncing again.
        // load target vm
        const targetVm = this.env.targetVm || (await this.platform.getTargetVm());
        this.heartbeatSyncStrategy.prepare(this.platform, this.proxy, targetVm);
        const success = await this.heartbeatSyncStrategy.forceOutOfSync();
        if (success) {
            this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.targetVm
            );
        }
        // 2. if it is a master vm, remove its master tag
        if (this.platform.vmEqualTo(targetVm, this.env.masterVm)) {
            const vmTaggings: VmTagging[] = [
                {
                    vm: targetVm,
                    type: VmTaggingType.oldMasterVm
                }
            ];
            await this.handleTaggingVm(vmTaggings);
        }
        this.proxy.logAsInfo('called handleTerminatingVm.');
        return '';
    }
    async handleTerminatedVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleTerminatedVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        const result = await this.scalingGroupStrategy.onTerminatedVm();
        this.proxy.logAsInfo('called handleTerminatedVm.');
        return result;
    }
    async handleHeartbeatSync(): Promise<string> {
        this.proxy.logAsInfo('calling handleHeartbeatSync.');
        let response = '';
        let error: Error;
        const unhealthyVms: VirtualMachine[] = [];

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
            this.scalingGroupStrategy.prepare(this.platform, this.proxy);
            await this.scalingGroupStrategy.onLaunchedVm();
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

        // handle unhealthy vm

        // target not healthy?

        // if new master is elected, reload the masterVm, master record to this.env.
        if (masterElection.newMaster) {
            this.env.masterVm = masterElection.newMaster;
            this.env.masterRecord = masterElection.newMasterRecord;
            this.env.masterHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.masterVm
            );

            // what to do with the old master?

            // old master unhealthy?
            const oldMasterHealthCheck =
                masterElection.oldMaster &&
                (await this.platform.getHealthCheckRecord(masterElection.oldMaster));
            if (oldMasterHealthCheck && !oldMasterHealthCheck.healthy) {
                if (
                    unhealthyVms.filter(vm => {
                        return this.platform.vmEqualTo(vm, masterElection.oldMaster);
                    }).length === 0
                ) {
                    unhealthyVms.push(masterElection.oldMaster);
                }
            }
        }

        // ASSERT: target healthcheck record is up to date
        if (!this.env.targetHealthCheckRecord.healthy) {
            if (
                unhealthyVms.filter(vm => {
                    return this.platform.vmEqualTo(vm, this.env.targetVm);
                }).length === 0
            ) {
                unhealthyVms.push(this.env.targetVm);
            }
        }

        await this.handleUnhealthyVm(unhealthyVms);

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
            if (this.platform.vmEqualTo(this.env.targetVm, this.env.masterVm)) {
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
    async handleUnhealthyVm(vms: VirtualMachine[]): Promise<void> {
        this.proxy.logAsInfo('calling handleUnhealthyVm.');
        // call the platform scaling group to terminate the vm in the list
        await Promise.all(
            vms.map(vm => {
                this.proxy.logAsInfo(`handling unhealthy vm(id: ${vm.id})...`);
                return this.platform
                    .deleteVmFromScalingGroup(vm)
                    .then(() => {
                        this.proxy.logAsInfo(`handling vm (id: ${vm.id}) completed.`);
                    })
                    .catch(err => {
                        this.proxy.logForError('handling unhealthy vm failed.', err);
                    });
            })
        );
        this.proxy.logAsInfo('called handleUnhealthyVm.');
    }
    async handleLicenseAssignment(): Promise<string> {
        this.proxy.logAsInfo('calling handleLicenseAssignment.');
        this.licensingStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
        const result = await this.licensingStrategy.apply();
        // print the license information
        const licenseContent = await this.licensingStrategy.apply();
        this.proxy.logAsInfo('called handleLicenseAssignment.');
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
