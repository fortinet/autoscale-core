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
    syncRecoveryCount: number;
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

export interface HealthCheckResultDetail {
    sequence: number;
    result: HealthCheckResult;
    expectedArriveTime: number;
    actualArriveTime: number;
    heartbeatInterval: number;
    oldHeartbeatInerval: number;
    delayAllowance: number;
    calculatedDelay: number;
    actualDelay: number;
    heartbeatLossCount: number;
    maxHeartbeatLossCount: number;
    syncRecoveryCount: number;
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
