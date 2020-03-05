export enum AutoscaleSetting {
    HeartbeatLossCount = 'heartbeat-loss-count',
    MasterScalingGroupName = 'master-scaling-group-name',
    MasterElectionTimeout = 'master-election-timeout',
    ResourceTagPrefix = 'resource-tag-prefix',
    SubnetPairs = 'subnet-pairs'
}

export interface SubnetPair {
    subnetId: string;
    pairId: string;
}

export interface SettingItem {
    key: string;
    value: string;
    description: string;
    editable: boolean;
    jsonEncoded: boolean;
    toJSON(): {};
}

export type Settings = Map<string, SettingItem>;
