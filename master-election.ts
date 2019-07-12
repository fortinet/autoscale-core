

export enum VoteState {
    pending = 'pending',
    done = 'done',
}

export enum VoteMethod {
    new = 'new',
    replace = 'replace',
}

type VoteStateType = VoteState.pending | VoteState.done;

export interface MasterRecordLike {
    ip: string;
    instanceId: string;
    scalingGroupName: string;
    subnetId: string;
    voteEndTime: number;
    voteState?: VoteStateType;
    vpcId: string;
}

export interface MasterRecord extends MasterRecordLike {
    voteState: VoteState;
}

export function ConstructMasterRecord(o: MasterRecordLike): MasterRecord {
    let m: MasterRecord;
    m.ip = o.ip;
    m.instanceId = o.instanceId;
    m.scalingGroupName = o.scalingGroupName;
    m.subnetId = o.subnetId;
    m.voteEndTime = o.voteEndTime;
    m.voteState = o.voteState;
    m.vpcId = o.vpcId;
    return m;
}
