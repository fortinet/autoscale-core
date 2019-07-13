'use strict'

export enum HealthCheckSyncState {
    inSync = 'in-sync',
    outOfSync = 'out-of-sync',
}

export interface HealthCheck {
    instanceId: string
    inSync: boolean
    healthy: boolean
    masterIp: string
    heartBeatLossCount: number
    heartBeatInterval: number
    nextHeartBeatTime: number
    syncState: HealthCheckSyncState
}
