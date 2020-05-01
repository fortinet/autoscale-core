import { AutoscaleSetting } from '../autoscale-setting';
import {
    MasterElection,
    MasterRecordVoteState,
    MasterRecord,
    HeartbeatSyncTiming
} from '../master-election';
import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter, LogLevel } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';

/**
 * To provide Autoscale basic logics
 */
export interface AutoscaleContext {
    setMasterElectionStrategy(strategy: MasterElectionStrategy): void;
    handleMasterElection(): Promise<string>;
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void;
    handleHeartbeatSync(): Promise<string>;
    doTargetHealthCheck(): Promise<HeartbeatSyncTiming>;
    doMasterHealthCheck(): Promise<HeartbeatSyncTiming>;
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

export interface HeartbeatSyncStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void>;
    result(): Promise<MasterElection>;
    run(): Promise<MasterElectionStrategyResult>;
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
            ? `${this.env.candidate.scalingGroupName}:${
                  this.env.candidate.instanceId
              }:${Date.now()}`
            : '';
        const masterRecord: MasterRecord = {
            id: `${signature}`,
            ip: this.env.candidate.primaryPrivateIpAddress,
            instanceId: this.env.candidate.instanceId,
            scalingGroupName: this.env.candidate.scalingGroupName,
            virtualNetworkId: this.env.candidate.virtualNetworkId,
            subnetId: this.env.candidate.subnetId,
            voteEndTime: null,
            voteState: MasterRecordVoteState.Pending
        };

        // candidate not in the preferred scaling group? no election will be run
        if (this.env.candidate.scalingGroupName !== settingGroupName) {
            this.proxy.log(
                `The candidate (id: ${this.env.candidate.instanceId}) ` +
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
                    `Master election completed. New master is (id: ${this.env.candidate.instanceId})`,
                    LogLevel.Info
                );
                // the candidate becomes the new master because it wins the election
                this.env.newMaster = this.env.candidate;
                // update the new master record
                this.res.newMasterRecord = masterRecord;
                return MasterElectionStrategyResult.ShouldContinue;
            } catch (error) {
                this.proxy.logForError(
                    'Error in running PreferredGroupMasterElection strategy.',
                    error
                );
                return MasterElectionStrategyResult.ShouldStop;
            }
        }
    }
}
