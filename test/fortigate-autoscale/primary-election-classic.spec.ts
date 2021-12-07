import { describe, it } from 'mocha';
import Sinon from 'sinon';
import {
    Autoscale,
    AutoscaleEnvironment,
    AutoscaleSetting,
    Blob,
    CloudFunctionProxyAdapter,
    CloudFunctionResponseBody,
    ConstantIntervalHeartbeatSyncStrategy,
    DeviceSyncInfo,
    HealthCheckRecord,
    HealthCheckResult,
    HealthCheckSyncState,
    HeartbeatSyncStrategy,
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord,
    LogLevel,
    NetworkInterface,
    NicAttachmentRecord,
    NoopFazIntegrationStrategy,
    NoopRoutingEgressTrafficStrategy,
    NoopScalingGroupStrategy,
    NoopTaggingVmStrategy,
    PlatformAdaptee,
    PlatformAdapter,
    PrimaryElection,
    PrimaryElectionStrategy,
    PrimaryElectionStrategyResult,
    PrimaryRecord,
    PrimaryRecordVoteState,
    ReqHeaders,
    ReqMethod,
    ReqType,
    ResourceFilter,
    RoutingEgressTrafficStrategy,
    ScalingGroupStrategy,
    SettingItem,
    Settings,
    VirtualMachine,
    VirtualMachineState,
    WeightedScorePreferredGroupPrimaryElection
} from '../../fortigate-autoscale/dist';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
const TEST_HCR_ON_TIME: HealthCheckRecord = {
    vmId: 'fake-test-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    ip: '2',
    primaryIp: '3',
    heartbeatInterval: 4,
    heartbeatLossCount: 0,
    nextHeartbeatTime: 6,
    syncState: HealthCheckSyncState.InSync,
    syncRecoveryCount: 0,
    seq: 7,
    healthy: true,
    upToDate: true,
    sendTime: null,
    deviceSyncTime: null,
    deviceSyncFailTime: null,
    deviceSyncStatus: null,
    deviceIsPrimary: null,
    deviceChecksum: null
};

const TEST_HCR_LATE: HealthCheckRecord = {
    vmId: 'fake-test-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    ip: '2',
    primaryIp: '3',
    heartbeatInterval: 4,
    heartbeatLossCount: 5,
    nextHeartbeatTime: 6,
    syncState: HealthCheckSyncState.InSync,
    syncRecoveryCount: 0,
    seq: 7,
    healthy: false,
    upToDate: true,
    sendTime: null,
    deviceSyncTime: null,
    deviceSyncFailTime: null,
    deviceSyncStatus: null,
    deviceIsPrimary: null,
    deviceChecksum: null
};

const TEST_HCR_OUT_OF_SYNC: HealthCheckRecord = {
    vmId: 'fake-test-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    ip: '2',
    primaryIp: '3',
    heartbeatInterval: 4,
    heartbeatLossCount: 5,
    nextHeartbeatTime: 6,
    syncState: HealthCheckSyncState.OutOfSync,
    syncRecoveryCount: 3,
    seq: 7,
    healthy: false,
    upToDate: true,
    sendTime: null,
    deviceSyncTime: null,
    deviceSyncFailTime: null,
    deviceSyncStatus: null,
    deviceIsPrimary: null,
    deviceChecksum: null
};

const TEST_VM: VirtualMachine = {
    id: 'fake-test-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    primaryPrivateIpAddress: '3',
    primaryPublicIpAddress: '4',
    virtualNetworkId: '5',
    subnetId: '6',
    state: VirtualMachineState.Running
};

const TEST_PRIMARY_VM: VirtualMachine = {
    id: 'fake-test-primary-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    primaryPrivateIpAddress: '3',
    primaryPublicIpAddress: '4',
    virtualNetworkId: '5',
    subnetId: '6',
    state: VirtualMachineState.Running
};

const TEST_PRIMARY_RECORD: PrimaryRecord = {
    id: '1',
    vmId: 'fake-test-primary-vm-id',
    ip: '3',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    virtualNetworkId: '5',
    subnetId: '6',
    voteEndTime: 7,
    voteState: PrimaryRecordVoteState.Done
};

const TEST_PRIMARY_ELECTION: PrimaryElection = {
    newPrimary: TEST_VM,
    newPrimaryRecord: TEST_PRIMARY_RECORD,
    candidate: TEST_VM,
    signature: '12345'
};

const TEST_DEVICE_SYNC_INFO_CLASSIC: DeviceSyncInfo = {
    instance: 'fake-instance',
    interval: 30,
    sequence: 8,
    time: null,
    syncTime: null,
    syncFailTime: null,
    syncStatus: null,
    isPrimary: null,
    checksum: null
};

class TestPlatformAdapter implements PlatformAdapter {
    invokeAutoscaleFunction(
        payload: unknown,
        functionEndpoint: string,
        invocable: string,
        executionTime?: number
    ): Promise<number> {
        return Promise.resolve(0);
    }
    createAutoscaleFunctionInvocationKey(
        payload: unknown,
        functionEndpoint: string,
        invocable: string
    ): string {
        return '';
    }
    saveSettingItem(
        key: string,
        value: string,
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<string> {
        throw new Error('Method not implemented.');
    }
    listConfigSet(subDirectory?: string, custom?: boolean): Promise<Blob[]> {
        return Promise.resolve([]);
    }
    listAutoscaleVm(identifyScalingGroup?: boolean, listNic?: boolean): Promise<VirtualMachine[]> {
        throw new Error('Method not implemented.');
    }
    vmEquals(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        throw new Error('Method not implemented.');
    }
    deleteVmFromScalingGroup(vmId: string): Promise<void> {
        return Promise.resolve();
    }
    sendAutoscaleNotifications(
        vm: VirtualMachine,
        message?: string,
        subject?: string
    ): Promise<void> {
        return Promise.resolve();
    }
    listLicenseFiles(
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<LicenseFile[]> {
        throw new Error('Method not implemented.');
    }
    listLicenseStock(productName: string): Promise<LicenseStockRecord[]> {
        throw new Error('Method not implemented.');
    }
    listLicenseUsage(productName: string): Promise<LicenseUsageRecord[]> {
        throw new Error('Method not implemented.');
    }
    updateLicenseStock(records: LicenseStockRecord[]): Promise<void> {
        throw new Error('Method not implemented.');
    }
    updateLicenseUsage(
        records: { item: LicenseUsageRecord; reference: LicenseUsageRecord }[]
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }
    loadLicenseFileContent(storageContainerName: string, filePath: string): Promise<string> {
        throw new Error('Method not implemented.');
    }
    getReqAsString(): Promise<string> {
        return Promise.resolve('fake-req-as-string');
    }
    createTime: number = Date.now();
    getReqVmId(): Promise<string> {
        return Promise.resolve('fake-req-vm-id');
    }
    checkRequestIntegrity(): void {
        throw new Error('Method not implemented.');
    }
    listNicAttachmentRecord(): Promise<NicAttachmentRecord[]> {
        throw new Error('Method not implemented.');
    }
    updateNicAttachmentRecord(vmId: string, nicId: string, status: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    deleteNicAttachmentRecord(vmId: string, nicId: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    deleteNetworkInterface(nicId: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    attachNetworkInterface(vmId: string, nicId: string, index?: number): Promise<void> {
        throw new Error('Method not implemented.');
    }
    detachNetworkInterface(vmId: string, nicId: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    listNetworkInterfaces(filters: ResourceFilter[], status?: string): Promise<NetworkInterface[]> {
        throw new Error('Method not implemented.');
    }
    tagNetworkInterface(nicId: string, tags: ResourceFilter[]): Promise<void> {
        throw new Error('Method not implemented.');
    }
    createNetworkInterface(
        subnetId?: string,
        description?: string,
        securityGroups?: string[],
        privateIpAddress?: string
    ): Promise<NetworkInterface> {
        throw new Error('Method not implemented.');
    }
    validateSettings(): Promise<boolean> {
        return Promise.resolve(true);
    }
    loadConfigSet(name: string): Promise<string> {
        throw new Error('Method not implemented.');
    }
    adaptee: PlatformAdaptee;
    init(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    getRequestType(): Promise<ReqType> {
        throw new Error('Method not implemented.');
    }
    getReqDeviceSyncInfo(): Promise<DeviceSyncInfo> {
        return Promise.resolve(TEST_DEVICE_SYNC_INFO_CLASSIC);
    }
    getReqHeartbeatInterval(): Promise<number> {
        return Promise.resolve(30);
    }
    getSettings(): Promise<Settings> {
        throw new Error('Method not implemented.');
    }
    getTargetVm(): Promise<VirtualMachine> {
        return Promise.resolve(TEST_VM);
    }
    getPrimaryVm(): Promise<VirtualMachine> {
        return Promise.resolve(TEST_PRIMARY_VM);
    }
    getVmById(vmId: string, scalingGroupName?: string): Promise<VirtualMachine> {
        return Promise.resolve(TEST_VM);
    }
    getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord> {
        return Promise.resolve(TEST_HCR_ON_TIME);
    }
    listHealthCheckRecord(): Promise<HealthCheckRecord[]> {
        return Promise.resolve([TEST_HCR_LATE, TEST_HCR_ON_TIME, TEST_HCR_OUT_OF_SYNC]);
    }
    getPrimaryRecord(): Promise<PrimaryRecord> {
        return Promise.resolve(TEST_PRIMARY_RECORD);
    }
    equalToVm(vmA: VirtualMachine, vmB: VirtualMachine): boolean {
        throw new Error('Method not implemented.');
    }
    deleteVm(vm: VirtualMachine): Promise<void> {
        throw new Error('Method not implemented.');
    }
    createHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
    updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        return Promise.resolve();
    }
    deleteHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        return Promise.resolve();
    }
    createPrimaryRecord(rec: PrimaryRecord, oldRec: PrimaryRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
    updatePrimaryRecord(rec: PrimaryRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
    deletePrimaryRecord(rec: PrimaryRecord, fullMatch?: boolean): Promise<void> {
        throw new Error('Method not implemented.');
    }
    registerFortiAnalyzer(
        vmId: string,
        privateIp: string,
        primary: boolean,
        vip: string
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }
}

class TestAutoscale extends Autoscale {
    constructor(
        readonly platform: TestPlatformAdapter,
        readonly env: AutoscaleEnvironment,
        readonly proxy: CloudFunctionProxyAdapter
    ) {
        super();
    }
}

class TestCloudFunctionProxyAdapter implements CloudFunctionProxyAdapter {
    private executionStartTime: number;
    constructor() {
        this.executionStartTime = Date.now();
    }
    getReqBody(): Promise<unknown> {
        return Promise.resolve('fake-body-as-string');
    }
    getRemainingExecutionTime(): Promise<number> {
        // set it to 60 seconds
        return Promise.resolve(this.executionStartTime + 60000 - Date.now());
    }
    getRequestAsString(): Promise<string> {
        return Promise.resolve('fake-req-as-string');
    }
    formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers: unknown
    ): unknown {
        throw new Error('Method not implemented.');
    }
    log(message: string, level: LogLevel): void {
        console.log(message);
    }
    logAsDebug(message: string): void {
        console.log(message);
    }
    logAsInfo(message: string): void {
        console.log(message);
    }
    logAsWarning(message: string): void {
        console.log(message);
    }
    logAsError(message: string): void {
        console.log(message);
    }
    logForError(messagePrefix: string, error: Error): void {
        console.log(error);
    }
    getReqHeaders(): Promise<ReqHeaders> {
        return Promise.resolve({});
    }
    getReqMethod(): Promise<ReqMethod> {
        return Promise.resolve(null);
    }
}

describe('classic primary election.', () => {
    let p: TestPlatformAdapter;
    let e: AutoscaleEnvironment;
    let x: TestCloudFunctionProxyAdapter;
    let s: Settings;
    let ms: PrimaryElectionStrategy;
    let hs: HeartbeatSyncStrategy;
    let ss: ScalingGroupStrategy;
    let rets: RoutingEgressTrafficStrategy;
    let autoscale: Autoscale;
    beforeEach(function() {
        p = new TestPlatformAdapter();
        e = {
            targetVm: TEST_VM,
            primaryVm: TEST_PRIMARY_VM,
            primaryRecord: TEST_PRIMARY_RECORD
        };
        x = new TestCloudFunctionProxyAdapter();
        s = new Map<string, SettingItem>();
        s.set(AutoscaleSetting.PrimaryElectionTimeout, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatDelayAllowance, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatLossCount, new SettingItem('1', '0', '3', true, true));
        // Set termination of unhealthy vm to 'true'
        s.set(AutoscaleSetting.TerminateUnhealthyVm, new SettingItem('1', 'true', '3', true, true));
        s.set(
            AutoscaleSetting.PrimaryScalingGroupName,
            new SettingItem('1', TEST_VM.scalingGroupName, '3', true, true)
        );
        ms = {
            prepare() {
                return Promise.resolve();
            },
            apply() {
                return Promise.resolve(PrimaryElectionStrategyResult.CompleteAndContinue);
            },
            result() {
                return Promise.resolve(TEST_PRIMARY_ELECTION);
            },
            applied: false
        };
        hs = {
            prepare() {
                return Promise.resolve();
            },
            apply() {
                return Promise.resolve(HealthCheckResult.OnTime);
            },
            targetHealthCheckRecord: TEST_HCR_ON_TIME, // use the late health check record
            healthCheckResult: HealthCheckResult.OnTime,
            healthCheckResultDetail: {
                sequence: 1,
                result: HealthCheckResult.OnTime,
                expectedArriveTime: 6,
                actualArriveTime: 6,
                heartbeatInterval: 30000,
                oldHeartbeatInerval: 50000,
                delayAllowance: 10000,
                calculatedDelay: -10000,
                actualDelay: 0,
                heartbeatLossCount: 0,
                maxHeartbeatLossCount: 999,
                syncRecoveryCount: 0,
                maxSyncRecoveryCount: 3
            },
            targetVmFirstHeartbeat: true,
            forceOutOfSync() {
                return Promise.resolve(true);
            }
        };
        ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
        hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
        ss = new NoopScalingGroupStrategy(p, x);
        rets = new NoopRoutingEgressTrafficStrategy(p, x);
        autoscale = new TestAutoscale(p, e, x);
        autoscale.setPrimaryElectionStrategy(ms);
        autoscale.setHeartbeatSyncStrategy(hs);
        autoscale.setScalingGroupStrategy(ss);
        autoscale.setRoutingEgressTrafficStrategy(rets);
        autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
        autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
    });
    it(
        'No existing primary. Target VM is in the preferred scaling group.' +
            ' This VM should be the elected primary.',
        async () => {
            // prepare the autoscale instance for this iteration only
            const TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
            e = {
                targetVm: TEST_VM,
                primaryVm: null,
                primaryRecord: null
            };
            hs = {
                prepare() {
                    return Promise.resolve();
                },
                apply() {
                    return Promise.resolve(HealthCheckResult.OnTime);
                },
                targetHealthCheckRecord: TEST_HCR,
                healthCheckResult: HealthCheckResult.OnTime,
                healthCheckResultDetail: {
                    sequence: 1,
                    result: HealthCheckResult.OnTime,
                    expectedArriveTime: 6,
                    actualArriveTime: 6,
                    heartbeatInterval: 30000,
                    oldHeartbeatInerval: 50000,
                    delayAllowance: 10000,
                    calculatedDelay: -10000,
                    actualDelay: 0,
                    heartbeatLossCount: 0,
                    maxHeartbeatLossCount: 999,
                    syncRecoveryCount: 0,
                    maxSyncRecoveryCount: 3
                },
                targetVmFirstHeartbeat: true,
                forceOutOfSync() {
                    return Promise.resolve(true);
                }
            };
            ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
            hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
            ss = new NoopScalingGroupStrategy(p, x);
            rets = new NoopRoutingEgressTrafficStrategy(p, x);
            autoscale = new TestAutoscale(p, e, x);
            autoscale.setPrimaryElectionStrategy(ms);
            autoscale.setHeartbeatSyncStrategy(hs);
            autoscale.setScalingGroupStrategy(ss);
            autoscale.setRoutingEgressTrafficStrategy(rets);
            autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
            autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
            // test iteration starts
            const syncRecoveryCount = 3;
            s.set(
                AutoscaleSetting.SyncRecoveryCount,
                new SettingItem('1', String(syncRecoveryCount), '3', true, true)
            );

            const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            });
            const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
                return true;
            });
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(mvId => {
                return Promise.resolve(null);
            });
            const stub4 = Sinon.stub(p, 'createHealthCheckRecord').callsFake(input => {
                Sinon.assert.match(input === null, false);
                return Promise.resolve();
            });
            const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(null);
            });
            const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(null);
            });
            let stub7Original = ms.prepare.bind(ms);
            const stub7 = Sinon.stub(ms, 'prepare').callsFake(election => {
                election.candidateHealthCheck = null;
                return stub7Original(election);
            });
            const stub8 = Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                // is the only vm in the cluster
                return Promise.resolve([]);
            });
            const stub9 = Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                // should not be null the new election primary
                Sinon.assert.match(rec === null, false);
                Sinon.assert.match(rec.vmId, TEST_VM.id);
                return Promise.resolve();
            });

            await autoscale.handleHeartbeatSync();

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
            stub7Original = null;
            stub7.restore();
            stub8.restore();
            stub9.restore();
        }
    );
    it(
        'No existing primary. Target VM is not in the preferred scaling group.' +
            ' This VM should not be the elected primary.',
        async () => {
            // prepare the autoscale instance for this iteration only
            const TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
            const TEST_VM_NOT_PREFERRED_GROUP = Object.assign({}, TEST_VM);
            TEST_VM_NOT_PREFERRED_GROUP.scalingGroupName = `not_${TEST_VM_NOT_PREFERRED_GROUP.scalingGroupName}`;
            e = {
                targetVm: TEST_VM_NOT_PREFERRED_GROUP,
                primaryVm: null,
                primaryRecord: null
            };
            hs = {
                prepare() {
                    return Promise.resolve();
                },
                apply() {
                    return Promise.resolve(HealthCheckResult.OnTime);
                },
                targetHealthCheckRecord: TEST_HCR,
                healthCheckResult: HealthCheckResult.OnTime,
                healthCheckResultDetail: {
                    sequence: 1,
                    result: HealthCheckResult.OnTime,
                    expectedArriveTime: 6,
                    actualArriveTime: 6,
                    heartbeatInterval: 30000,
                    oldHeartbeatInerval: 50000,
                    delayAllowance: 10000,
                    calculatedDelay: -10000,
                    actualDelay: 0,
                    heartbeatLossCount: 0,
                    maxHeartbeatLossCount: 999,
                    syncRecoveryCount: 0,
                    maxSyncRecoveryCount: 3
                },
                targetVmFirstHeartbeat: true,
                forceOutOfSync() {
                    return Promise.resolve(true);
                }
            };
            ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
            hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
            ss = new NoopScalingGroupStrategy(p, x);
            rets = new NoopRoutingEgressTrafficStrategy(p, x);
            autoscale = new TestAutoscale(p, e, x);
            autoscale.setPrimaryElectionStrategy(ms);
            autoscale.setHeartbeatSyncStrategy(hs);
            autoscale.setScalingGroupStrategy(ss);
            autoscale.setRoutingEgressTrafficStrategy(rets);
            autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
            autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
            // test iteration starts
            const syncRecoveryCount = 3;
            s.set(
                AutoscaleSetting.SyncRecoveryCount,
                new SettingItem('1', String(syncRecoveryCount), '3', true, true)
            );

            const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            });
            const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
                return true;
            });
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(mvId => {
                return Promise.resolve(null);
            });
            const stub4 = Sinon.stub(p, 'createHealthCheckRecord').callsFake(input => {
                Sinon.assert.match(input === null, false);
                return Promise.resolve();
            });
            const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(null);
            });
            const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(null);
            });
            let stub7Original = ms.prepare.bind(ms);
            const stub7 = Sinon.stub(ms, 'prepare').callsFake(election => {
                election.candidateHealthCheck = null;
                return stub7Original(election);
            });
            const stub8 = Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                // is the only vm in the cluster
                return Promise.resolve([]);
            });
            const stub9 = Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                // should not the new election primary
                Sinon.assert.match(rec, null);
                return Promise.resolve();
            });

            await autoscale.handleHeartbeatSync();

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
            stub7Original = null;
            stub7.restore();
            stub8.restore();
            stub9.restore();
        }
    );
    it(
        'No existing primary. Target VM is monitored. VM is unhealthy.' +
            ' This VM should not be the elected primary.',
        async () => {
            // prepare the autoscale instance for this iteration only
            const TEST_HCR = Object.assign({}, TEST_HCR_OUT_OF_SYNC);
            e = {
                targetVm: TEST_VM,
                primaryVm: null,
                primaryRecord: null
            };
            hs = {
                prepare() {
                    return Promise.resolve();
                },
                apply() {
                    return Promise.resolve(HealthCheckResult.OnTime);
                },
                targetHealthCheckRecord: TEST_HCR,
                healthCheckResult: HealthCheckResult.OnTime,
                healthCheckResultDetail: {
                    sequence: 1,
                    result: HealthCheckResult.OnTime,
                    expectedArriveTime: 6,
                    actualArriveTime: 6,
                    heartbeatInterval: 30000,
                    oldHeartbeatInerval: 50000,
                    delayAllowance: 10000,
                    calculatedDelay: -10000,
                    actualDelay: 0,
                    heartbeatLossCount: 0,
                    maxHeartbeatLossCount: 999,
                    syncRecoveryCount: 0,
                    maxSyncRecoveryCount: 3
                },
                targetVmFirstHeartbeat: true,
                forceOutOfSync() {
                    return Promise.resolve(true);
                }
            };
            ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
            hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
            ss = new NoopScalingGroupStrategy(p, x);
            rets = new NoopRoutingEgressTrafficStrategy(p, x);
            autoscale = new TestAutoscale(p, e, x);
            autoscale.setPrimaryElectionStrategy(ms);
            autoscale.setHeartbeatSyncStrategy(hs);
            autoscale.setScalingGroupStrategy(ss);
            autoscale.setRoutingEgressTrafficStrategy(rets);
            autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
            autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
            // test iteration starts
            const syncRecoveryCount = 3;
            s.set(
                AutoscaleSetting.SyncRecoveryCount,
                new SettingItem('1', String(syncRecoveryCount), '3', true, true)
            );

            const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            });
            const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
                return true;
            });
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(mvId => {
                // make it monitored
                return Promise.resolve(TEST_HCR);
            });
            const stub4 = Sinon.stub(p, 'createHealthCheckRecord').callsFake(input => {
                Sinon.assert.match(input === null, false);
                return Promise.resolve();
            });
            const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(null);
            });
            const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(null);
            });
            let stub7Original = ms.prepare.bind(ms);
            const stub7 = Sinon.stub(ms, 'prepare').callsFake(election => {
                election.candidateHealthCheck = null;
                return stub7Original(election);
            });
            const stub8 = Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                // is the only vm in the cluster
                return Promise.resolve([]);
            });
            const stub9 = Sinon.stub(autoscale, 'handlePrimaryElection');

            await autoscale.handleHeartbeatSync();

            // if vm is unhealthy, no primary election should be triggered.
            Sinon.assert.match(stub9.notCalled, true);

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
            stub7Original = null;
            stub7.restore();
            stub8.restore();
            stub9.restore();
        }
    );
    it(
        'No existing primary. Target VM is not monitored. Is the only VM in the cluster.' +
            ' Should be the new elected primary.',
        async () => {
            // prepare the autoscale instance for this iteration only
            const TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
            e = {
                targetVm: TEST_VM,
                primaryVm: null,
                primaryRecord: null
            };
            hs = {
                prepare() {
                    return Promise.resolve();
                },
                apply() {
                    return Promise.resolve(HealthCheckResult.OnTime);
                },
                targetHealthCheckRecord: TEST_HCR,
                healthCheckResult: HealthCheckResult.OnTime,
                healthCheckResultDetail: {
                    sequence: 1,
                    result: HealthCheckResult.OnTime,
                    expectedArriveTime: 6,
                    actualArriveTime: 6,
                    heartbeatInterval: 30000,
                    oldHeartbeatInerval: 50000,
                    delayAllowance: 10000,
                    calculatedDelay: -10000,
                    actualDelay: 0,
                    heartbeatLossCount: 0,
                    maxHeartbeatLossCount: 999,
                    syncRecoveryCount: 0,
                    maxSyncRecoveryCount: 3
                },
                targetVmFirstHeartbeat: true,
                forceOutOfSync() {
                    return Promise.resolve(true);
                }
            };
            ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
            hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
            ss = new NoopScalingGroupStrategy(p, x);
            rets = new NoopRoutingEgressTrafficStrategy(p, x);
            autoscale = new TestAutoscale(p, e, x);
            autoscale.setPrimaryElectionStrategy(ms);
            autoscale.setHeartbeatSyncStrategy(hs);
            autoscale.setScalingGroupStrategy(ss);
            autoscale.setRoutingEgressTrafficStrategy(rets);
            autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
            autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
            // test iteration starts
            const syncRecoveryCount = 3;
            s.set(
                AutoscaleSetting.SyncRecoveryCount,
                new SettingItem('1', String(syncRecoveryCount), '3', true, true)
            );
            const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            });
            const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
                return true;
            });
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(mvId => {
                return Promise.resolve(null);
            });
            const stub4 = Sinon.stub(p, 'createHealthCheckRecord').callsFake(input => {
                Sinon.assert.match(input === null, false);
                return Promise.resolve();
            });
            const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(null);
            });
            const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(null);
            });
            let stub7Original = ms.prepare.bind(ms);
            const stub7 = Sinon.stub(ms, 'prepare').callsFake(election => {
                election.candidateHealthCheck = null;
                return stub7Original(election);
            });
            const stub8 = Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                // is the only vm in the cluster
                return Promise.resolve([]);
            });
            const stub9 = Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                // should be the new election primary
                Sinon.assert.match(rec.vmId, TEST_VM.id);
                return Promise.resolve();
            });

            await autoscale.handleHeartbeatSync();

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
            stub7Original = null;
            stub7.restore();
            stub8.restore();
            stub9.restore();
        }
    );
    it(
        'No existing primary. Target VM is not monitored. Two monitored VM in the cluster' +
            ' but those VM do not send heartbeat for over 2 hb interval period.' +
            ' This VM should be the new elected primary.',
        async () => {
            // prepare the autoscale instance for this iteration only
            const TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
            const TEST_HCR_SECONDARY_VM_IRRESPONSIVE = Object.assign({}, TEST_HCR_LATE);
            TEST_HCR_SECONDARY_VM_IRRESPONSIVE.vmId = 'fake-test-vm-secondary-irresponsive';
            TEST_HCR_SECONDARY_VM_IRRESPONSIVE.nextHeartbeatTime =
                Date.now() - TEST_HCR_SECONDARY_VM_IRRESPONSIVE.heartbeatInterval * 2 * 1000;
            e = {
                targetVm: TEST_VM,
                primaryVm: null,
                primaryRecord: null
            };
            hs = {
                prepare() {
                    return Promise.resolve();
                },
                apply() {
                    return Promise.resolve(HealthCheckResult.OnTime);
                },
                targetHealthCheckRecord: TEST_HCR,
                healthCheckResult: HealthCheckResult.OnTime,
                healthCheckResultDetail: {
                    sequence: 1,
                    result: HealthCheckResult.OnTime,
                    expectedArriveTime: 6,
                    actualArriveTime: 6,
                    heartbeatInterval: 30000,
                    oldHeartbeatInerval: 50000,
                    delayAllowance: 10000,
                    calculatedDelay: -10000,
                    actualDelay: 0,
                    heartbeatLossCount: 0,
                    maxHeartbeatLossCount: 999,
                    syncRecoveryCount: 0,
                    maxSyncRecoveryCount: 3
                },
                targetVmFirstHeartbeat: true,
                forceOutOfSync() {
                    return Promise.resolve(true);
                }
            };
            ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
            hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
            ss = new NoopScalingGroupStrategy(p, x);
            rets = new NoopRoutingEgressTrafficStrategy(p, x);
            autoscale = new TestAutoscale(p, e, x);
            autoscale.setPrimaryElectionStrategy(ms);
            autoscale.setHeartbeatSyncStrategy(hs);
            autoscale.setScalingGroupStrategy(ss);
            autoscale.setRoutingEgressTrafficStrategy(rets);
            autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
            autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
            // test iteration starts
            const syncRecoveryCount = 3;
            s.set(
                AutoscaleSetting.SyncRecoveryCount,
                new SettingItem('1', String(syncRecoveryCount), '3', true, true)
            );

            const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            });
            const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
                return true;
            });
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(mvId => {
                return Promise.resolve(null);
            });
            const stub4 = Sinon.stub(p, 'createHealthCheckRecord').callsFake(input => {
                Sinon.assert.match(input === null, false);
                return Promise.resolve();
            });
            const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(null);
            });
            const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(null);
            });
            let stub7Original = ms.prepare.bind(ms);
            const stub7 = Sinon.stub(ms, 'prepare').callsFake(election => {
                election.candidateHealthCheck = null;
                return stub7Original(election);
            });
            const stub8 = Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                // is the only vm in the cluster
                return Promise.resolve([
                    Object.assign({}, TEST_HCR_SECONDARY_VM_IRRESPONSIVE),
                    Object.assign({}, TEST_HCR_SECONDARY_VM_IRRESPONSIVE)
                ]);
            });
            const stub9 = Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                // should be the new election primary
                Sinon.assert.match(rec.vmId, TEST_VM.id);
                return Promise.resolve();
            });

            await autoscale.handleHeartbeatSync();

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
            stub7Original = null;
            stub7.restore();
            stub8.restore();
            stub9.restore();
        }
    );
    it(
        'No existing primary. Target VM is not monitored. Two monitored VM in the cluster.' +
            ' One does not send heartbeat for over 2 hb interval period but the other does.' +
            ' This VM should not the new elected primary.',
        async () => {
            // prepare the autoscale instance for this iteration only
            const TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
            const TEST_HCR_SECONDARY_VM_IRRESPONSIVE = Object.assign({}, TEST_HCR);
            TEST_HCR_SECONDARY_VM_IRRESPONSIVE.vmId = 'fake-test-vm-secondary-irresponsive';
            TEST_HCR_SECONDARY_VM_IRRESPONSIVE.nextHeartbeatTime =
                Date.now() - TEST_HCR_SECONDARY_VM_IRRESPONSIVE.heartbeatInterval * 2 * 1000;

            const TEST_HCR_SECONDARY_VM_RESPONSIVE = Object.assign({}, TEST_HCR);
            TEST_HCR_SECONDARY_VM_RESPONSIVE.vmId = 'fake-test-vm-secondary-responsive';
            TEST_HCR_SECONDARY_VM_RESPONSIVE.nextHeartbeatTime =
                Date.now() - TEST_HCR_SECONDARY_VM_RESPONSIVE.heartbeatInterval * 1000;
            e = {
                targetVm: TEST_VM,
                primaryVm: null,
                primaryRecord: null
            };
            hs = {
                prepare() {
                    return Promise.resolve();
                },
                apply() {
                    return Promise.resolve(HealthCheckResult.OnTime);
                },
                targetHealthCheckRecord: TEST_HCR,
                healthCheckResult: HealthCheckResult.OnTime,
                healthCheckResultDetail: {
                    sequence: 1,
                    result: HealthCheckResult.OnTime,
                    expectedArriveTime: 6,
                    actualArriveTime: 6,
                    heartbeatInterval: 30000,
                    oldHeartbeatInerval: 50000,
                    delayAllowance: 10000,
                    calculatedDelay: -10000,
                    actualDelay: 0,
                    heartbeatLossCount: 0,
                    maxHeartbeatLossCount: 999,
                    syncRecoveryCount: 0,
                    maxSyncRecoveryCount: 3
                },
                targetVmFirstHeartbeat: true,
                forceOutOfSync() {
                    return Promise.resolve(true);
                }
            };
            ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
            hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
            ss = new NoopScalingGroupStrategy(p, x);
            rets = new NoopRoutingEgressTrafficStrategy(p, x);
            autoscale = new TestAutoscale(p, e, x);
            autoscale.setPrimaryElectionStrategy(ms);
            autoscale.setHeartbeatSyncStrategy(hs);
            autoscale.setScalingGroupStrategy(ss);
            autoscale.setRoutingEgressTrafficStrategy(rets);
            autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
            autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
            // test iteration starts
            const syncRecoveryCount = 3;
            s.set(
                AutoscaleSetting.SyncRecoveryCount,
                new SettingItem('1', String(syncRecoveryCount), '3', true, true)
            );

            const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            });
            const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
                return true;
            });
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(mvId => {
                return Promise.resolve(null);
            });
            const stub4 = Sinon.stub(p, 'createHealthCheckRecord').callsFake(input => {
                Sinon.assert.match(input === null, false);
                return Promise.resolve();
            });
            const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(null);
            });
            const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(null);
            });
            let stub7Original = ms.prepare.bind(ms);
            const stub7 = Sinon.stub(ms, 'prepare').callsFake(election => {
                election.candidateHealthCheck = null;
                return stub7Original(election);
            });
            const stub8 = Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                // is the only vm in the cluster
                return Promise.resolve([
                    Object.assign({}, TEST_HCR_SECONDARY_VM_IRRESPONSIVE),
                    Object.assign({}, TEST_HCR_SECONDARY_VM_RESPONSIVE)
                ]);
            });
            const stub9 = Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                // should not the new election primary
                Sinon.assert.match(rec, null);
                return Promise.resolve();
            });

            await autoscale.handleHeartbeatSync();

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
            stub7Original = null;
            stub7.restore();
            stub8.restore();
            stub9.restore();
        }
    );
    it(
        'No existing primary. Target VM is not monitored. Two monitored VM in the cluster.' +
            ' One does not send heartbeat for over 2 hb interval period but the other does.' +
            ' This VM should not the new elected primary.',
        async () => {
            // prepare the autoscale instance for this iteration only
            const TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
            const TEST_HCR_SECONDARY_VM_IRRESPONSIVE = Object.assign({}, TEST_HCR);
            TEST_HCR_SECONDARY_VM_IRRESPONSIVE.vmId = 'fake-test-vm-secondary-irresponsive';
            TEST_HCR_SECONDARY_VM_IRRESPONSIVE.nextHeartbeatTime =
                Date.now() - TEST_HCR_SECONDARY_VM_IRRESPONSIVE.heartbeatInterval * 2 * 1000;

            const TEST_HCR_SECONDARY_VM_RESPONSIVE = Object.assign({}, TEST_HCR);
            TEST_HCR_SECONDARY_VM_RESPONSIVE.vmId = 'fake-test-vm-secondary-responsive';
            TEST_HCR_SECONDARY_VM_RESPONSIVE.nextHeartbeatTime =
                Date.now() - TEST_HCR_SECONDARY_VM_RESPONSIVE.heartbeatInterval * 1000;
            e = {
                targetVm: TEST_VM,
                primaryVm: null,
                primaryRecord: null
            };
            hs = {
                prepare() {
                    return Promise.resolve();
                },
                apply() {
                    return Promise.resolve(HealthCheckResult.OnTime);
                },
                targetHealthCheckRecord: TEST_HCR,
                healthCheckResult: HealthCheckResult.OnTime,
                healthCheckResultDetail: {
                    sequence: 1,
                    result: HealthCheckResult.OnTime,
                    expectedArriveTime: 6,
                    actualArriveTime: 6,
                    heartbeatInterval: 30000,
                    oldHeartbeatInerval: 50000,
                    delayAllowance: 10000,
                    calculatedDelay: -10000,
                    actualDelay: 0,
                    heartbeatLossCount: 0,
                    maxHeartbeatLossCount: 999,
                    syncRecoveryCount: 0,
                    maxSyncRecoveryCount: 3
                },
                targetVmFirstHeartbeat: true,
                forceOutOfSync() {
                    return Promise.resolve(true);
                }
            };
            ms = new WeightedScorePreferredGroupPrimaryElection(p, x);
            hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
            ss = new NoopScalingGroupStrategy(p, x);
            rets = new NoopRoutingEgressTrafficStrategy(p, x);
            autoscale = new TestAutoscale(p, e, x);
            autoscale.setPrimaryElectionStrategy(ms);
            autoscale.setHeartbeatSyncStrategy(hs);
            autoscale.setScalingGroupStrategy(ss);
            autoscale.setRoutingEgressTrafficStrategy(rets);
            autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
            autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
            // test iteration starts
            const syncRecoveryCount = 3;
            s.set(
                AutoscaleSetting.SyncRecoveryCount,
                new SettingItem('1', String(syncRecoveryCount), '3', true, true)
            );

            const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            });
            const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
                return true;
            });
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(mvId => {
                return Promise.resolve(null);
            });
            const stub4 = Sinon.stub(p, 'createHealthCheckRecord').callsFake(input => {
                Sinon.assert.match(input === null, false);
                return Promise.resolve();
            });
            const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(null);
            });
            const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(null);
            });
            let stub7Original = ms.prepare.bind(ms);
            const stub7 = Sinon.stub(ms, 'prepare').callsFake(election => {
                election.candidateHealthCheck = null;
                return stub7Original(election);
            });
            const stub8 = Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                // is the only vm in the cluster
                return Promise.resolve([
                    Object.assign({}, TEST_HCR_SECONDARY_VM_IRRESPONSIVE),
                    Object.assign({}, TEST_HCR_SECONDARY_VM_RESPONSIVE)
                ]);
            });
            const stub9 = Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                // should not the new election primary
                Sinon.assert.match(rec, null);
                return Promise.resolve();
            });

            await autoscale.handleHeartbeatSync();

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
            stub7Original = null;
            stub7.restore();
            stub8.restore();
            stub9.restore();
        }
    );
});
