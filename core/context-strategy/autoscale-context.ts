import { AutoscaleEnvironment } from '../autoscale-environment';
import { AutoscaleSetting } from '../autoscale-setting';
import { CloudFunctionProxyAdapter, LogLevel } from '../cloud-function-proxy';
import { waitFor, WaitForConditionChecker, WaitForPromiseEmitter } from '../helper-function';
import { PlatformAdapter } from '../platform-adapter';
import {
    HealthCheckRecord,
    HealthCheckResult,
    HealthCheckResultDetail,
    HealthCheckSyncState as HeartbeatSyncState,
    PrimaryElection,
    PrimaryRecord,
    PrimaryRecordVoteState
} from '../primary-election';
import { VirtualMachine } from '../virtual-machine';

/**
 * To provide Autoscale basic logics
 */
export interface AutoscaleContext {
    setPrimaryElectionStrategy(strategy: PrimaryElectionStrategy): void;
    handlePrimaryElection(): Promise<PrimaryElection | null>;
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void;
    handleHeartbeatSync(): Promise<string>;
    setTaggingAutoscaleVmStrategy(strategy: TaggingVmStrategy): void;
    handleTaggingAutoscaleVm(taggings: VmTagging[]): Promise<void>;
    setRoutingEgressTrafficStrategy(strategy: RoutingEgressTrafficStrategy): void;
    handleEgressTrafficRoute(): Promise<void>;
    onVmFullyConfigured(): Promise<void>;
}

export interface PrimaryElectionStrategy {
    prepare(election: PrimaryElection): Promise<void>;
    result(): Promise<PrimaryElection>;
    apply(): Promise<PrimaryElectionStrategyResult>;
    readonly applied: boolean;
}

export enum PrimaryElectionStrategyResult {
    ShouldStop = 'ShouldStop',
    ShouldContinue = 'ShouldContinue'
}

export class PreferredGroupPrimaryElection implements PrimaryElectionStrategy {
    env: PrimaryElection;
    platform: PlatformAdapter;
    res: PrimaryElection;
    proxy: CloudFunctionProxyAdapter;
    private _applied: boolean;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(env: PrimaryElection): Promise<void> {
        this.env = env;
        this.res = {
            oldPrimary: this.env.oldPrimary,
            oldPrimaryRecord: this.env.oldPrimaryRecord,
            newPrimary: null, // no initial new primary
            newPrimaryRecord: null, // no initial new primary record
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

    result(): Promise<PrimaryElection> {
        return Promise.resolve(this.res);
    }
    async apply(): Promise<PrimaryElectionStrategyResult> {
        this.proxy.log('applying PreferredGroupPrimaryElection strategy.', LogLevel.Log);
        this._applied = true;
        const result = await this.run();
        this.proxy.log('applied PreferredGroupPrimaryElection strategy.', LogLevel.Log);
        return result;
    }
    /**
     * Only vm in the specified byol scaling group can be elected as the new primary
     */
    async run(): Promise<PrimaryElectionStrategyResult> {
        const settings = await this.platform.getSettings();
        // get the primary scaling group
        const settingGroupName = settings.get(AutoscaleSetting.PrimaryScalingGroupName).value;
        const electionDuration = Number(
            settings.get(AutoscaleSetting.PrimaryElectionTimeout).value
        );
        const signature = this.env.candidate
            ? `${this.env.candidate.scalingGroupName}:${this.env.candidate.id}`
            : '';
        const primaryRecord: PrimaryRecord = {
            id: `${signature}`,
            ip: this.env.candidate.primaryPrivateIpAddress,
            vmId: this.env.candidate.id,
            scalingGroupName: this.env.candidate.scalingGroupName,
            virtualNetworkId: this.env.candidate.virtualNetworkId,
            subnetId: this.env.candidate.subnetId,
            voteEndTime: null,
            voteState: PrimaryRecordVoteState.Pending
        };

        // candidate not in the preferred scaling group? no election will be run
        if (this.env.candidate.scalingGroupName !== settingGroupName) {
            this.proxy.log(
                `The candidate (id: ${this.env.candidate.id}) ` +
                    "isn't in the preferred scaling group. It cannot run a primary election. " +
                    'Primary election not started.',
                LogLevel.Warn
            );
            return PrimaryElectionStrategyResult.ShouldContinue;
        } else {
            // if has candidate healthcheck record, that means this candidate is already in-service
            // but is in a non-primary role (e.g. secondary role or not yet assigned a role).
            // KNOWN ISSUE: if a brand new device is the primary candidate and it wins
            // the election to become the new primary, ALL CONFIGURATION WILL BE LOST
            // TODO: need to find a more qualified candidate, or develop a technique to sync
            // the configuration.
            // solution:
            // for the classic case:
            // check if this device is a new device (not yet monitored) there is another existing device in the cluster, let them trigger
            // primary election.
            // if there isn't any other existing device in the cluster,
            // If it qualifies for election and wins the election, the
            // primary election can be deemed done immediately as primary record created.
            if (this.env.candidateHealthCheck && this.env.candidateHealthCheck.healthy) {
                // NOTE: if device has provided sync info, a more accurate election candidate
                // qualification will perform.
                // NOTE: improved candidate qualification
                // need to check the syncStatus and isPrimary properties. see the prop descriptions
                // additional infomation about all running vm will be needed
                // if this target vm is in good health, and
                // is in-sync with the primary (info provided by the device),
                // then if this device is a secondary, it qualifies for a primary candidate,
                // if this device is a primary, it qualifies as well.
                // if this device isn't in-sync with the primary (info provided by the device),
                // it does not qualify. Will skip it, and end this round of primary election.
                //
                primaryRecord.voteEndTime = Date.now(); // election ends immediately
                primaryRecord.voteState = PrimaryRecordVoteState.Done;
            }
            // otherwise, the election should be pending
            else {
                // election will end in now + electionduration
                primaryRecord.voteEndTime = Date.now() + electionDuration * 1000;
                primaryRecord.voteState = PrimaryRecordVoteState.Pending;
            }
            try {
                // if old primary record is provided, will purge it.
                // this strategy doesn't check the legitimacy of the old primary record.
                // the strategy context checks the legitimacy instead.
                await this.platform.createPrimaryRecord(
                    primaryRecord,
                    this.env.oldPrimaryRecord || null
                );
                this.proxy.log(
                    `Primary election completed. New primary is (id: ${this.env.candidate.id})`,
                    LogLevel.Info
                );
                // the candidate becomes the new primary because it wins the election
                this.res.newPrimary = this.env.candidate;
                // update the new primary record
                this.res.newPrimaryRecord = primaryRecord;
            } catch (error) {
                // if error occurred within creating the primary record, check if a new primary was
                // elected somewhere else at the same time.
                const newPrimary = await this.platform.getPrimaryVm();
                // if another primary was elected. use that elected primary.
                if (newPrimary) {
                    this.res.newPrimary = newPrimary;
                    // update the new primary record
                    this.res.newPrimaryRecord = await this.platform.getPrimaryRecord();
                }
                // if no primary elected, there must be an unexpected error, log and stop.
                else {
                    this.proxy.logForError(
                        'Error in running PreferredGroupPrimaryElection strategy.',
                        error
                    );
                    return PrimaryElectionStrategyResult.ShouldStop;
                }
            }
            // ASSERT: new primary and primary record are ready.
            return PrimaryElectionStrategyResult.ShouldContinue;
        }
    }
}

export interface HeartbeatSyncStrategy {
    prepare(vm: VirtualMachine): Promise<void>;
    apply(): Promise<HealthCheckResult>;
    /**
     * Force the target vm to go into 'out-of-sync' state. Autoscale will stop accepting its
     * heartbeat sync request.
     * @returns {Promise} void
     */
    forceOutOfSync(): Promise<boolean>;
    readonly targetHealthCheckRecord: HealthCheckRecord | null;
    readonly healthCheckResult: HealthCheckResult;
    readonly healthCheckResultDetail: HealthCheckResultDetail;
    readonly targetVmFirstHeartbeat: boolean;
}

/**
 * The constant interval heartbeat sync strategy will handle heartbeats being fired with a
 * constant interval and not being interrupted by other events.
 * In this strategy, those heartbeats the Autoscale takes much longer time
 * to process will be dropped. It will be done by comparing the heartbeat seq before processing
 * and the seq of the healthcheck record saved in the DB at the time of record updating. If the
 * seq in both objects don't match, that means another hb has updated the record while this hb
 * is still processing. The current hb will be discarded.
 */
export class ConstantIntervalHeartbeatSyncStrategy implements HeartbeatSyncStrategy {
    protected platform: PlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected targetVm: VirtualMachine;
    protected firstHeartbeat = false;
    protected result: HealthCheckResult;
    protected resultDetail: HealthCheckResultDetail;
    protected _targetHealthCheckRecord: HealthCheckRecord;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(targetVm: VirtualMachine): Promise<void> {
        this.targetVm = targetVm;
        return Promise.resolve();
    }

    async apply(): Promise<HealthCheckResult> {
        this.proxy.logAsInfo('applying ConstantIntervalHeartbeatSyncStrategy strategy.');
        let oldLossCount = 0;
        let newLossCount = 0;
        let oldInterval = 0;
        let oldNextHeartbeatTime: number;
        const deviceSyncInfo = await this.platform.getReqDeviceSyncInfo();
        const newInterval = deviceSyncInfo.interval * 1000;
        const heartbeatArriveTime: number = this.platform.createTime;
        // the calculated delay of the current heartbeat comparing to the previous one sent from
        // the same device
        let delay = 0;
        let oldSeq: number; // to be displayed in the log as: old seq -> new seq
        let useDeviceSyncInfo: boolean;
        let delayCalculationMethod = 'by arrive time';
        let delayAtSendTime = NaN;
        let delayAtArriveTime = NaN;
        let outdatedHearbeatRequest = false;
        const settings = await this.platform.getSettings();
        // number in second the max amount of delay allowed to offset the network latency
        const delayAllowance =
            Number(settings.get(AutoscaleSetting.HeartbeatDelayAllowance).value) * 1000;
        // max amount of heartbeat loss count allowed before deeming a device unhealthy
        const maxLossCount = Number(settings.get(AutoscaleSetting.HeartbeatLossCount).value);
        // get health check record for target vm
        // ASSERT: this.targetVm is valid
        let targetHealthCheckRecord = await this.platform.getHealthCheckRecord(this.targetVm.id);
        // the next heartbeat arrive time from the Autoscale handler perspective.
        const nextHeartbeatTime = heartbeatArriveTime + newInterval;
        // if there's no health check record for this vm,
        // can deem it the first time for health check
        if (!targetHealthCheckRecord) {
            this.firstHeartbeat = true;
            this.result = HealthCheckResult.OnTime;
            // no old next heartbeat time for the first heartbeat, use the current arrival time.
            oldNextHeartbeatTime = heartbeatArriveTime;
            // no old record for reference, use the seq provided by the device. If the seq is
            // NaN, it means no sequence provided by the device, then use 0.
            oldSeq = (isNaN(deviceSyncInfo.sequence) && 0) || deviceSyncInfo.sequence;
            targetHealthCheckRecord = {
                vmId: this.targetVm.id,
                scalingGroupName: this.targetVm.scalingGroupName,
                ip: this.targetVm.primaryPrivateIpAddress,
                primaryIp: '', // primary ip is unknown to this strategy
                heartbeatInterval: newInterval,
                heartbeatLossCount: 0, // set to 0 because it is the first heartbeat
                nextHeartbeatTime: nextHeartbeatTime,
                syncState: HeartbeatSyncState.InSync,
                syncRecoveryCount: 0, // sync recovery count = 0 means no recovery needed
                // use the device sequence if it exists or 1 as the initial sequence
                seq: (!isNaN(deviceSyncInfo.sequence) && deviceSyncInfo.sequence) || 1,
                healthy: true,
                upToDate: true,
                // additional device sync info whenever provided
                sendTime: deviceSyncInfo.time,
                deviceSyncTime: deviceSyncInfo.syncTime,
                deviceSyncFailTime: deviceSyncInfo.syncFailTime,
                deviceSyncStatus: deviceSyncInfo.syncStatus,
                deviceIsPrimary: deviceSyncInfo.isPrimary,
                deviceChecksum: deviceSyncInfo.checksum
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
            // store a copy of the set of record data before updating the record
            oldLossCount = targetHealthCheckRecord.heartbeatLossCount;
            oldInterval = targetHealthCheckRecord.heartbeatInterval;
            oldSeq = targetHealthCheckRecord.seq;
            oldNextHeartbeatTime = targetHealthCheckRecord.nextHeartbeatTime;
            delayAtArriveTime = heartbeatArriveTime - oldNextHeartbeatTime;
            // if the device provide more information about the heartbeat, do a more accurate
            // heartbeat calculation.
            // check if the 'time' property exists. It can indicate the availability of the device
            // info
            const deviceSendTime: Date =
                deviceSyncInfo.time !== null && new Date(deviceSyncInfo.time);
            useDeviceSyncInfo = !!deviceSendTime;
            if (useDeviceSyncInfo) {
                delayCalculationMethod = 'by device send time';
                // check if the sequence is in an incremental order compared to the data in the db
                // if not, the heartbea should be marked as outdated and to be dropped
                if (deviceSyncInfo.sequence < targetHealthCheckRecord.seq) {
                    outdatedHearbeatRequest = true;
                } else {
                    // if the device seq is immediately after the recorded value
                    // check if the send time match the heartbeat interval
                    if (deviceSyncInfo.sequence === targetHealthCheckRecord.seq + 1) {
                        const recordedSendTime: Date = new Date(targetHealthCheckRecord.sendTime);
                        // compare using the device provided interval because if the interval
                        // has changedthe new heartbeat will be sent in the new interval
                        // this is the delay from the device's perspective
                        delay =
                            deviceSendTime.getTime() -
                            recordedSendTime.getTime() -
                            deviceSyncInfo.interval;
                    }
                    // NOTE:
                    // in this situation, there are race conditions happening between some
                    // heartbeat requests. The reason is one autoscale handler is taking much
                    // longer to process another heartbeat and unable to complete before this
                    // heartbeat arrives at the handler (by a parallel cloud function thread).
                    // The outcome of this situation is:
                    // for the hb which is immediate after the recorded one (new seq = old seq + 1)
                    // it will be handled in the above if-else case.
                    // for the other hb (new seq > old seq + 1), the delay cannot be calculated
                    // thus discarding the delay calculation, and trust it is an on-time hb
                    else {
                        delay = -1; // on-time hb must have a negative delay
                    }
                    delayAtSendTime = delay;
                }
            }
            // calculate delay using the arrive time (classic method)
            else {
                // NOTE:
                // heartbeatArriveTime: the starting time of the function execution, considerred as
                // the heartbeat arrived at the function
                // oldNextHeartbeatTime: the expected arrival time for the current heartbeat, recorded
                // in the db, updated in the previous heartbeat calculation
                // delayAllowance: the time used in the calcualtion to offest any foreseeable latency
                // outside of the function execution.
                delay = heartbeatArriveTime - oldNextHeartbeatTime - delayAllowance;
            }
            const syncRecoveryCountSettingItem = settings.get(AutoscaleSetting.SyncRecoveryCount);
            const syncRecoveryCount =
                syncRecoveryCountSettingItem && Number(syncRecoveryCountSettingItem.value);
            // if vm health check shows that it's already out of sync, should drop it
            if (targetHealthCheckRecord.syncState === HeartbeatSyncState.OutOfSync) {
                oldLossCount = targetHealthCheckRecord.heartbeatLossCount;
                oldInterval = targetHealthCheckRecord.heartbeatInterval;
                this.result = HealthCheckResult.Dropped;
                // if the termination of unhealthy device is set to false, out-of-sync vm should
                // be in the sync recovery stage.
                // late heartbeat will reset the sync-recovery-count while on-time heartbeat will
                // decrease the sync-recovery-count by 1 until it reaches 0 or negative integer;
                // sync recovery will change the sync-state back to in-sync
                const terminateUnhealthyVmSettingItem = settings.get(
                    AutoscaleSetting.TerminateUnhealthyVm
                );
                const terminateUnhealthyVm =
                    terminateUnhealthyVmSettingItem && terminateUnhealthyVmSettingItem.truthValue;
                if (!terminateUnhealthyVm) {
                    // late heartbeat will reset the sync-recovery-count
                    if (delay >= 0) {
                        targetHealthCheckRecord.syncRecoveryCount = syncRecoveryCount;
                    }
                    // on-time heartbeat will decrease sync-recovery-count by 1 from until
                    // it reaches 0 or negative integer
                    else {
                        targetHealthCheckRecord.syncRecoveryCount -= 1;
                        // a complete recovery (0) will change the sync-state back to in-sync
                        if (targetHealthCheckRecord.syncRecoveryCount <= 0) {
                            targetHealthCheckRecord.syncRecoveryCount = 0;
                            targetHealthCheckRecord.heartbeatLossCount = 0;
                            newLossCount = 0;
                            targetHealthCheckRecord.syncState = HeartbeatSyncState.InSync;
                            targetHealthCheckRecord.healthy = true;
                            this.result = HealthCheckResult.OnTime;
                        }
                    }
                }
            } else {
                // heartbeat is late
                if (delay >= 0) {
                    // increase the heartbeat loss count by 1 if delay.
                    targetHealthCheckRecord.heartbeatLossCount += 1;
                    newLossCount = targetHealthCheckRecord.heartbeatLossCount;
                    // reaching the max amount of loss count?
                    if (targetHealthCheckRecord.heartbeatLossCount >= maxLossCount) {
                        targetHealthCheckRecord.syncState = HeartbeatSyncState.OutOfSync;
                        targetHealthCheckRecord.healthy = false;
                        // when entering out-of-sync state from in-sync state, update
                        // the sync-recovery-count in order for the device to enter the sync state
                        // recovery stage
                        targetHealthCheckRecord.syncRecoveryCount = syncRecoveryCount;
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
            // NOTE: use the sequence provided by the device
            if (useDeviceSyncInfo && !isNaN(deviceSyncInfo.sequence)) {
                targetHealthCheckRecord.seq = deviceSyncInfo.sequence;
            } else {
                targetHealthCheckRecord.seq += 1;
            }
            targetHealthCheckRecord.heartbeatInterval = newInterval;
            targetHealthCheckRecord.nextHeartbeatTime = heartbeatArriveTime + newInterval;
            // additional device sync info whenever provided
            targetHealthCheckRecord.sendTime = deviceSyncInfo.time;
            targetHealthCheckRecord.deviceSyncTime = deviceSyncInfo.syncTime;
            targetHealthCheckRecord.deviceSyncFailTime = deviceSyncInfo.syncFailTime;
            targetHealthCheckRecord.deviceSyncStatus = deviceSyncInfo.syncStatus;
            targetHealthCheckRecord.deviceIsPrimary = deviceSyncInfo.isPrimary;
            targetHealthCheckRecord.deviceChecksum = deviceSyncInfo.checksum;
            // update health check record if not marked as outdated
            if (!outdatedHearbeatRequest) {
                try {
                    await this.platform.updateHealthCheckRecord(targetHealthCheckRecord);
                } catch (error) {
                    this.proxy.logForError('updateHealthCheckRecord() error.', error);
                    // cannot create hb record, drop this health check
                    targetHealthCheckRecord.upToDate = false;
                    this.result = HealthCheckResult.Dropped;
                }
            } else {
                this.proxy.logAsWarning('Dropped an outdated heartbeat request.');
                targetHealthCheckRecord.upToDate = false;
                this.result = HealthCheckResult.Dropped;
            }
        }
        this._targetHealthCheckRecord = targetHealthCheckRecord;
        this.resultDetail = {
            sequence: targetHealthCheckRecord.seq,
            result: this.result,
            expectedArriveTime: oldNextHeartbeatTime,
            actualArriveTime: heartbeatArriveTime,
            heartbeatInterval: newInterval,
            oldHeartbeatInerval: oldInterval,
            delayAllowance: delayAllowance,
            calculatedDelay: delay,
            actualDelay: delay + delayAllowance,
            heartbeatLossCount: newLossCount,
            maxHeartbeatLossCount: maxLossCount,
            syncRecoveryCount: targetHealthCheckRecord.syncRecoveryCount
        };
        this.proxy.logAsInfo(
            `Heartbeat sync result: ${this.result},` +
                ` heartbeat sequence: ${oldSeq}->${targetHealthCheckRecord.seq},` +
                ` heartbeat interval: ${oldInterval}->${newInterval} ms,` +
                ` device time for recorded heartbeat: ${targetHealthCheckRecord.sendTime},` +
                ` device time for received heartbeat: ${deviceSyncInfo.time},` +
                ` delay at send time: ${(isNaN(delayAtSendTime) && 'n/a') || delayAtSendTime} ms,` +
                ' heartbeat expected arrive time:' +
                ` ${new Date(oldNextHeartbeatTime).toISOString()},` +
                ` heartbeat actual arrive time: ${new Date(heartbeatArriveTime).toISOString()},` +
                ` heartbeat delay at arrive time: ${delayAtArriveTime} ms,` +
                ` heartbeat delay allowance for arrival: ${delayAllowance} ms,` +
                ` heartbeat calculated delay: ${delay} ms ${delayCalculationMethod},` +
                ` heartbeat loss count: ${oldLossCount}->${newLossCount},` +
                ` max loss count allowed: ${maxLossCount}.`
        );
        this.proxy.logAsInfo('applied ConstantIntervalHeartbeatSyncStrategy strategy.');
        return this.result;
    }
    get targetHealthCheckRecord(): HealthCheckRecord {
        return this._targetHealthCheckRecord;
    }
    primaryHealthCheckRecord: HealthCheckRecord;
    get healthCheckResult(): HealthCheckResult {
        return this.result;
    }
    get healthCheckResultDetail(): HealthCheckResultDetail {
        return this.resultDetail;
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
            // change status to outofsync
            healthcheckRecord.syncState = HeartbeatSyncState.OutOfSync;
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
    newPrimaryRole?: boolean;
    clear?: boolean;
}

export interface TaggingVmStrategy {
    prepare(taggings: VmTagging[]): Promise<void>;
    apply(): Promise<void>;
}

export interface RoutingEgressTrafficStrategy {
    apply(): Promise<void>;
}

export class NoopTaggingVmStrategy implements TaggingVmStrategy {
    private proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.proxy = proxy;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    prepare(taggings: VmTagging[]): Promise<void> {
        return Promise.resolve();
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling NoopTaggingVmStrategy.apply.');
        this.proxy.logAsInfo('called NoopTaggingVmStrategy.apply.');
        return Promise.resolve();
    }
}

export class NoopRoutingEgressTrafficStrategy implements RoutingEgressTrafficStrategy {
    private proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.proxy = proxy;
    }
    prepare(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        env: AutoscaleEnvironment
    ): Promise<void> {
        return Promise.resolve();
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling NoopRoutingEgressTrafficStrategy.apply.');
        this.proxy.logAsInfo('called NoopRoutingEgressTrafficStrategy.apply.');
        return Promise.resolve();
    }
}
