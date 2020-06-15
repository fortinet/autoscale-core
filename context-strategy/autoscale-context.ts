import { AutoscaleSetting } from '../autoscale-setting';
import {
    MasterElection,
    MasterRecordVoteState,
    MasterRecord,
    HealthCheckResult,
    HealthCheckRecord,
    HealthCheckSyncState as HeartbeatSyncState
} from '../master-election';
import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter, LogLevel } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';
import { waitFor, WaitForPromiseEmitter, WaitForConditionChecker } from '../helper-function';

/**
 * To provide Autoscale basic logics
 */
export interface AutoscaleContext {
    setMasterElectionStrategy(strategy: MasterElectionStrategy): void;
    handleMasterElection(): Promise<MasterElection | null>;
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void;
    handleHeartbeatSync(): Promise<string>;
    setTaggingAutoscaleVmStrategy(strategy: TaggingVmStrategy): void;
    handleTaggingAutoscaleVm(taggings: VmTagging[]): Promise<void>;
}

export interface MasterElectionStrategy {
    prepare(
        election: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void>;
    result(): Promise<MasterElection>;
    apply(): Promise<MasterElectionStrategyResult>;
    readonly applied: boolean;
}

export enum MasterElectionStrategyResult {
    ShouldStop = 'ShouldStop',
    ShouldContinue = 'ShouldContinue'
}

export class PreferredGroupMasterElection implements MasterElectionStrategy {
    env: MasterElection;
    platform: PlatformAdapter;
    res: MasterElection;
    proxy: CloudFunctionProxyAdapter;
    private _applied: boolean;
    prepare(
        env: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void> {
        this.env = env;
        this.platform = platform;
        this.proxy = proxy;
        this.res = {
            oldMaster: this.env.oldMaster,
            oldMasterRecord: this.env.oldMasterRecord,
            newMaster: null, // no initial new master
            newMasterRecord: null, // no initial new master record
            candidate: this.env.candidate,
            candidateHealthCheck: this.env.candidateHealthCheck,
            preferredScalingGroup: this.env.preferredScalingGroup,
            electionDuration: this.env.electionDuration,
            signature: ''
        };
        this._applied = false;
        return Promise.resolve();
    }

    get applied(): boolean {
        return this._applied;
    }

    result(): Promise<MasterElection> {
        return Promise.resolve(this.res);
    }
    async apply(): Promise<MasterElectionStrategyResult> {
        this.proxy.log('applying PreferredGroupMasterElection strategy.', LogLevel.Log);
        this._applied = true;
        const result = await this.run();
        this.proxy.log('applied PreferredGroupMasterElection strategy.', LogLevel.Log);
        return result;
    }
    /**
     * Only vm in the specified byol scaling group can be elected as the new master
     */
    async run(): Promise<MasterElectionStrategyResult> {
        const settings = await this.platform.getSettings();
        // get the master scaling group
        const settingGroupName = settings.get(AutoscaleSetting.MasterScalingGroupName).value;
        const electionDuration = Number(settings.get(AutoscaleSetting.MasterElectionTimeout).value);
        const signature = this.env.candidate
            ? `${this.env.candidate.scalingGroupName}:${this.env.candidate.id}:${Date.now()}`
            : '';
        const masterRecord: MasterRecord = {
            id: `${signature}`,
            ip: this.env.candidate.primaryPrivateIpAddress,
            vmId: this.env.candidate.id,
            scalingGroupName: this.env.candidate.scalingGroupName,
            virtualNetworkId: this.env.candidate.virtualNetworkId,
            subnetId: this.env.candidate.subnetId,
            voteEndTime: null,
            voteState: MasterRecordVoteState.Pending
        };

        // candidate not in the preferred scaling group? no election will be run
        if (this.env.candidate.scalingGroupName !== settingGroupName) {
            this.proxy.log(
                `The candidate (id: ${this.env.candidate.id}) ` +
                    "isn't in the preferred scaling group. It cannot run a master election. " +
                    'Master election not started.',
                LogLevel.Warn
            );
            return MasterElectionStrategyResult.ShouldContinue;
        } else {
            // if has candidate healthcheck record, that means this candidate is already in-service
            // but is in a non-master role. If it qualifies for election and wins the election, the
            // master election can be deemed done immediately as master record created.
            if (this.env.candidateHealthCheck && this.env.candidateHealthCheck.healthy) {
                // KNOWN ISSUE: if a brand new device is the master candidate and it wins
                // the election to become the new master, ALL CONFIGURATION WILL BE LOST
                // TODO: need to find a more qualified candidate, or develop a technique to sync
                // the configuration.
                masterRecord.voteEndTime = Date.now(); // election ends immediately
                masterRecord.voteState = MasterRecordVoteState.Done;
            }
            // otherwise, the election should be pending
            else {
                // election will end in now + electionduration
                masterRecord.voteEndTime = Date.now() + electionDuration * 1000;
                masterRecord.voteState = MasterRecordVoteState.Pending;
            }
            try {
                // if old master record is provided, will purge it.
                // this strategy doesn't check the legitimacy of the old master record.
                // the strategy context checks the legitimacy instead.
                await this.platform.createMasterRecord(
                    masterRecord,
                    this.env.oldMasterRecord || null
                );
                this.proxy.log(
                    `Master election completed. New master is (id: ${this.env.candidate.id})`,
                    LogLevel.Info
                );
                // the candidate becomes the new master because it wins the election
                this.res.newMaster = this.env.candidate;
                // update the new master record
                this.res.newMasterRecord = masterRecord;
            } catch (error) {
                // if error occurred within creating the master record, check if a new master was
                // elected somewhere else at the same time.
                const newMaster = await this.platform.getMasterVm();
                // if another master was elected. use that elected master.
                if (newMaster) {
                    this.res.newMaster = newMaster;
                    // update the new master record
                    this.res.newMasterRecord = await this.platform.getMasterRecord();
                }
                // if no master elected, there must be an unexpected error, log and stop.
                else {
                    this.proxy.logForError(
                        'Error in running PreferredGroupMasterElection strategy.',
                        error
                    );
                    return MasterElectionStrategyResult.ShouldStop;
                }
            }
            // ASSERT: new master and master record are ready.
            return MasterElectionStrategyResult.ShouldContinue;
        }
    }
}

export interface HeartbeatSyncStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void>;
    apply(): Promise<HealthCheckResult>;
    /**
     * Force the target vm to go into 'out-of-sync' state. Autoscale will stop accepting its
     * heartbeat sync request.
     * @returns {Promise} void
     */
    forceOutOfSync(): Promise<boolean>;
    readonly targetHealthCheckRecord: HealthCheckRecord | null;
    readonly healthCheckResult: HealthCheckResult;
    readonly targetVmFirstHeartbeat: boolean;
}

/**
 * The constant interval heartbeat sync strategy will handle heartbeats being fired with a
 * constant interval and not being interrupted by other events.
 * In this strategy, those heartbeats the Autoscale taking too long (over one heartbeat interval)
 * to process will be dropped.
 */
export class ConstantIntervalHeartbeatSyncStrategy implements HeartbeatSyncStrategy {
    protected platform: PlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected targetVm: VirtualMachine;
    protected firstHeartbeat = false;
    protected result: HealthCheckResult;
    protected _targetHealthCheckRecord: HealthCheckRecord;
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        targetVm: VirtualMachine
    ): Promise<void> {
        this.platform = platform;
        this.proxy = proxy;
        this.targetVm = targetVm;
        return Promise.resolve();
    }

    async apply(): Promise<HealthCheckResult> {
        this.proxy.logAsInfo('applying ConstantIntervalHeartbeatSyncStrategy strategy.');
        let oldLossCount = 0;
        let newLossCount = 0;
        let oldInterval = 0;
        const newInterval = this.platform.getReqHeartbeatInterval() * 1000;
        const heartbeatArriveTime: number = this.platform.createTime;
        let delay = 0;
        let oldSeq = 0;
        const settings = await this.platform.getSettings();
        // number in second the max amount of delay allowed to offset the network latency
        const delayAllowance =
            Number(settings.get(AutoscaleSetting.HeartbeatDelayAllowance).value) * 1000;
        // max amount of heartbeat loss count allowed before deeming a device unhealthy
        const maxLossCount = Number(settings.get(AutoscaleSetting.HeartbeatLossCount).value);
        // get health check record for target vm
        // ASSERT: this.targetVm is valid
        let targetHealthCheckRecord = await this.platform.getHealthCheckRecord(this.targetVm.id);
        // if there's no health check record for this vm,
        // can deem it the first time for health check
        if (!targetHealthCheckRecord) {
            this.firstHeartbeat = true;
            this.result = HealthCheckResult.OnTime;
            targetHealthCheckRecord = {
                vmId: this.targetVm.id,
                scalingGroupName: this.targetVm.scalingGroupName,
                ip: this.targetVm.primaryPrivateIpAddress,
                masterIp: '', // master ip is unknown to this strategy
                heartbeatInterval: newInterval,
                heartbeatLossCount: 0, // set to 0 because it is the first heartbeat
                nextHeartbeatTime: heartbeatArriveTime + newInterval,
                syncState: HeartbeatSyncState.InSync,
                seq: 1, // set to 1 because it is the first heartbeat
                healthy: true,
                upToDate: true
            };
            // create health check record
            try {
                await this.platform.createHealthCheckRecord(targetHealthCheckRecord);
            } catch (error) {
                this.proxy.logForError('createHealthCheckRecord() error.', error);
                // cannot create hb record, drop this health check
                targetHealthCheckRecord.upToDate = false;
                this.result = HealthCheckResult.Dropped;
            }
        }
        // processing regular heartbeat
        else {
            oldLossCount = targetHealthCheckRecord.heartbeatLossCount;
            oldInterval = targetHealthCheckRecord.heartbeatInterval;
            oldSeq = targetHealthCheckRecord.seq;
            delay =
                heartbeatArriveTime - targetHealthCheckRecord.nextHeartbeatTime - delayAllowance;
            // if vm health check shows that it's already out of sync, drop this
            if (targetHealthCheckRecord.syncState === HeartbeatSyncState.OutOfSync) {
                oldLossCount = targetHealthCheckRecord.heartbeatLossCount;
                oldInterval = targetHealthCheckRecord.heartbeatInterval;
                this.result = HealthCheckResult.Dropped;
            } else {
                // heartbeat is late
                if (delay >= 0) {
                    // increase the heartbeat loss count by 1 inf delay.
                    targetHealthCheckRecord.heartbeatLossCount += 1;
                    newLossCount = targetHealthCheckRecord.heartbeatLossCount;
                    // reaching the max amount of loss count?
                    if (targetHealthCheckRecord.heartbeatLossCount >= maxLossCount) {
                        targetHealthCheckRecord.syncState = HeartbeatSyncState.OutOfSync;
                        targetHealthCheckRecord.healthy = false;
                    } else {
                        targetHealthCheckRecord.syncState = HeartbeatSyncState.InSync;
                        targetHealthCheckRecord.healthy = true;
                    }
                    this.result = HealthCheckResult.Late;
                }
                // else, no delay; heartbeat is on time; clear the loss count.
                else {
                    targetHealthCheckRecord.heartbeatLossCount = 0;
                    newLossCount = targetHealthCheckRecord.heartbeatLossCount;
                    targetHealthCheckRecord.healthy = true;
                    this.result = HealthCheckResult.OnTime;
                }
            }
            // update health check record
            try {
                targetHealthCheckRecord.seq += 1;
                targetHealthCheckRecord.nextHeartbeatTime += newInterval;
                await this.platform.updateHealthCheckRecord(targetHealthCheckRecord);
            } catch (error) {
                this.proxy.logForError('updateHealthCheckRecord() error.', error);
                // cannot create hb record, drop this health check
                targetHealthCheckRecord.upToDate = false;
                this.result = HealthCheckResult.Dropped;
            }
        }
        this._targetHealthCheckRecord = targetHealthCheckRecord;
        this.proxy.logAsInfo(
            `Heartbeat sync result: ${this.result},` +
                ` heartbeat sequence: ${oldSeq}->${targetHealthCheckRecord.seq},` +
                ` heartbeat expected arrive time: ${targetHealthCheckRecord.nextHeartbeatTime} ms,` +
                ` heartbeat actual arrive time: ${heartbeatArriveTime} ms,` +
                ` heartbeat delay allowance: ${delayAllowance} ms,` +
                ` heartbeat calculated delay: ${delay} ms,` +
                ` heartbeat interval: ${oldInterval}->${newInterval} ms,` +
                ` heartbeat loss count: ${oldLossCount}->${newLossCount}.`
        );
        this.proxy.logAsInfo('appled ConstantIntervalHeartbeatSyncStrategy strategy.');
        return this.result;
    }
    get targetHealthCheckRecord(): HealthCheckRecord {
        return this._targetHealthCheckRecord;
    }
    masterHealthCheckRecord: HealthCheckRecord;
    get healthCheckResult(): HealthCheckResult {
        return this.result;
    }
    get targetVmFirstHeartbeat(): boolean {
        return this.firstHeartbeat;
    }
    async forceOutOfSync(): Promise<boolean> {
        this.proxy.logAsInfo('calling ConstantIntervalHeartbeatSyncStrategy.forceOutOfSync.');
        try {
            // ASSERT: this.targetVm is valid
            const healthcheckRecord: HealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.targetVm.id
            );
            // if its status is 'out-of-sync' already, don't need to update
            if (healthcheckRecord.syncState === HeartbeatSyncState.OutOfSync) {
                return true;
            }
            // update its state to be 'out-of-sync'
            const emitter: WaitForPromiseEmitter<HealthCheckRecord> = () => {
                return this.platform.getHealthCheckRecord(this.targetVm.id);
            };
            const checker: WaitForConditionChecker<HealthCheckRecord> = (record, callCount) => {
                if (callCount > 3) {
                    throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
                }
                if (record.syncState === HeartbeatSyncState.OutOfSync) {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            };
            // commit update
            await this.platform.updateHealthCheckRecord(healthcheckRecord);
            // wait for state change
            await waitFor(emitter, checker, 5000, this.proxy);
            this.proxy.logAsInfo('called ConstantIntervalHeartbeatSyncStrategy.forceOutOfSync.');
            return true;
        } catch (error) {
            this.proxy.logForError('error in forceOutOfSync()', error);
            this.proxy.logAsInfo('called ConstantIntervalHeartbeatSyncStrategy.forceOutOfSync.');
            return false;
        }
    }
}

export interface VmTagging {
    vmId: string;
    newVm?: boolean;
    newMasterRole?: boolean;
    clear?: boolean;
}

export interface TaggingVmStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        taggings: VmTagging[]
    ): Promise<void>;
    apply(): Promise<void>;
}

export class NoopTaggingVmStrategy implements TaggingVmStrategy {
    private proxy: CloudFunctionProxyAdapter;
    prepare(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        taggings: VmTagging[]
    ): Promise<void> {
        this.proxy = proxy;
        return Promise.resolve();
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling NoopTaggingVmStrategy.apply.');
        this.proxy.logAsInfo('called NoopTaggingVmStrategy.apply.');
        return Promise.resolve();
    }
}
