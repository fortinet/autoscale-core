import {
    MasterElectionStrategy,
    MasterElection,
    MasterElectionStrategyResult,
    MasterRecordVoteState,
    MasterRecord,
    PlatformAdapter,
    CloudFunctionProxyAdapter,
    LogLevel
} from '../autoscale-core';
import { AutoscaleSetting } from '../autoscale-setting';
export class PreferredGroupMasterElection implements MasterElectionStrategy {
    env: MasterElection;
    platform: PlatformAdapter;
    res: MasterElection;
    proxy: CloudFunctionProxyAdapter;
    prepare(
        env: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void> {
        this.env = env;
        this.platform = platform;
        this.proxy = proxy;
        return Promise.resolve();
    }

    result(): Promise<MasterElection> {
        return Promise.resolve(this.res);
    }
    async apply(): Promise<string> {
        this.proxy.log('applying PreferredGroupMasterElection strategy.', LogLevel.Log);
        const result = await this.run();
        this.proxy.log('applied PreferredGroupMasterElection strategy.', LogLevel.Log);
        return result;
    }
    /**
     * Only vm in the specified byol scaling group can be elected as the new master
     */
    async run(): Promise<string> {
        const settings = this.platform.getSettings();
        // get the master scaling group
        const settingGroupName = settings.get(AutoscaleSetting.MasterScalingGroupName).value;
        const electionDuration = Number(settings.get(AutoscaleSetting.MasterElectionTimeout).value);
        const masterRecord: MasterRecord = {
            id: `${this.env.candidate.scalingGroupName}::${this.env.candidate.instanceId}`,
            ip: this.env.candidate.primaryPrivateIpAddress,
            instanceId: this.env.candidate.instanceId,
            scalingGroupName: this.env.candidate.scalingGroupName,
            virtualNetworkId: this.env.candidate.virtualNetworkId,
            subnetId: this.env.candidate.subnetId,
            voteEndTime: null,
            voteState: MasterRecordVoteState.Pending
        };
        // candidate in the preferred scaling group?
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
                masterRecord.voteEndTime = Date.now() + electionDuration * 1000;
                masterRecord.voteState = MasterRecordVoteState.Done;
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
