'use strict';

export enum VoteState { pending = 'pending', done = 'done' }

export enum VoteMethod { new = 'new', replace = 'replace' }

export interface MasterRecord {
    ip:string;
    instanceId: string;
    scalingGroupName: string;
    subnetId: string;
    voteEndTime: number;
    voteState: VoteState;
    vpcId: string;
}
