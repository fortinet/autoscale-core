import { VirtualMachine } from './virtual-machine';

export enum HealthCheckSyncState {
    InSync = 'in-sync',
    OutOfSync = 'out-of-sync'
}
export interface HealthCheckRecord {
    vmId: string;
    scalingGroupName: string;
    ip: string;
    primaryIp: string;
    heartbeatInterval: number;
    heartbeatLossCount: number;
    nextHeartbeatTime: number;
    syncState: HealthCheckSyncState;
    seq: number;
    healthy: boolean;
    upToDate: boolean;
}

export enum HealthCheckResult {
    OnTime = 'on-time',
    Late = 'late',
    TooLate = 'too-late',
    Dropped = 'dropped'
}

export enum PrimaryRecordVoteState {
    Pending = 'pending',
    Done = 'done',
    Timeout = 'timeout'
}

export interface PrimaryRecord {
    id: string;
    vmId: string;
    ip: string;
    scalingGroupName: string;
    virtualNetworkId: string;
    subnetId: string;
    voteEndTime: number;
    voteState: PrimaryRecordVoteState;
}

export interface PrimaryElection {
    oldPrimary?: VirtualMachine;
    oldPrimaryRecord?: PrimaryRecord;
    newPrimary: VirtualMachine;
    newPrimaryRecord: PrimaryRecord;
    candidate: VirtualMachine;
    candidateHealthCheck?: HealthCheckRecord;
    preferredScalingGroup?: string;
    electionDuration?: number;
    signature: string; // to identify a primary election
}
