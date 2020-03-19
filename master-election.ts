import { VirtualMachine } from './virtual-machine';

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
    oldMaster?: VirtualMachine;
    oldMasterRecord?: MasterRecord;
    newMaster: VirtualMachine;
    newMasterRecord: MasterRecord;
    candidate: VirtualMachine;
    candidateHealthCheck?: HealthCheckRecord;
    preferredScalingGroup?: string;
    electionDuration?: number;
    signature: string;
}
