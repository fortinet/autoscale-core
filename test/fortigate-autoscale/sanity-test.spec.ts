import { describe, it } from 'mocha';
import Sinon from 'sinon';
import {
    Autoscale,
    AutoscaleEnvironment,
    AutoscaleSetting,
    Blob,
    CloudFunctionProxyAdapter,
    CloudFunctionResponseBody,
    compare,
    ConstantIntervalHeartbeatSyncStrategy,
    FortiGateAutoscaleSetting,
    HealthCheckRecord,
    HealthCheckResult,
    HealthCheckSyncState,
    DeviceSyncInfo,
    HeartbeatSyncStrategy,
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord,
    LogLevel,
    NetworkInterface,
    NicAttachmentRecord,
    NoopFazIntegrationStrategy,
    NoopScalingGroupStrategy,
    NoopTaggingVmStrategy,
    PlatformAdapter,
    PreferredGroupPrimaryElection,
    PrimaryElection,
    PrimaryElectionStrategy,
    PrimaryElectionStrategyResult,
    PrimaryRecord,
    PrimaryRecordVoteState,
    ReqHeaders,
    ReqMethod,
    ReqType,
    ResourceFilter,
    ScalingGroupStrategy,
    SettingItem,
    Settings,
    VirtualMachine,
    VirtualMachineState
} from '../../fortigate-autoscale';

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
    upToDate: true
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
    upToDate: true
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
    upToDate: true
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

const TEST_PRIMARY_RECORD: PrimaryRecord = {
    id: '1',
    vmId: '2',
    ip: '3',
    scalingGroupName: '4',
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

class TestAutoscale extends Autoscale {
    constructor(
        readonly platform: TestPlatformAdapter,
        readonly env: AutoscaleEnvironment,
        readonly proxy: CloudFunctionProxyAdapter
    ) {
        super();
    }
}

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
    adaptee: {};
    init(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    getRequestType(): Promise<ReqType> {
        throw new Error('Method not implemented.');
    }
    getReqDeviceSyncInfo(): Promise<DeviceSyncInfo> {
        // TODO: implementation required.
        return Promise.resolve(null);
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
        throw new Error('Method not implemented.');
    }
    getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord> {
        return Promise.resolve(TEST_HCR_ON_TIME);
    }
    getPrimaryRecord(): Promise<PrimaryRecord> {
        throw new Error('Method not implemented.');
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
    createPrimaryRecord(rec: PrimaryRecord, oldRec: PrimaryRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
    updatePrimaryRecord(rec: PrimaryRecord): Promise<void> {
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
    formatResponse(httpStatusCode: number, body: CloudFunctionResponseBody, headers: {}): {} {
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

describe('sanity test', () => {
    let p: TestPlatformAdapter;
    let e: AutoscaleEnvironment;
    let x: TestCloudFunctionProxyAdapter;
    let s: Settings;
    let ms: PrimaryElectionStrategy;
    let hs: HeartbeatSyncStrategy;
    let me: PrimaryElection;
    let ss: ScalingGroupStrategy;
    let autoscale: Autoscale;
    before(function() {
        p = new TestPlatformAdapter();
        e = {
            targetVm: TEST_VM,
            primaryVm: TEST_VM,
            primaryRecord: TEST_PRIMARY_RECORD
        };
        x = new TestCloudFunctionProxyAdapter();
        s = new Map<string, SettingItem>();
        s.set(AutoscaleSetting.PrimaryElectionTimeout, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatDelayAllowance, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatLossCount, new SettingItem('1', '0', '3', true, true));
        s.set(AutoscaleSetting.TerminateUnhealthyVm, new SettingItem('1', 'true', '3', true, true));
        ms = {
            prepare() {
                return Promise.resolve();
            },
            apply() {
                return Promise.resolve(PrimaryElectionStrategyResult.ShouldContinue);
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
            targetHealthCheckRecord: TEST_HCR_ON_TIME,
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
                syncRecoveryCount: 0
            },
            targetVmFirstHeartbeat: true,
            forceOutOfSync() {
                return Promise.resolve(true);
            }
        };
        me = {
            newPrimary: TEST_VM,
            newPrimaryRecord: TEST_PRIMARY_RECORD,
            candidate: TEST_VM,
            signature: 'test-signature'
        };
        ms = new PreferredGroupPrimaryElection(p, x);
        hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
        ss = new NoopScalingGroupStrategy(p, x);
        autoscale = new TestAutoscale(p, e, x);
        autoscale.setPrimaryElectionStrategy(ms);
        autoscale.setHeartbeatSyncStrategy(hs);
        autoscale.setScalingGroupStrategy(ss);
        autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
        autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
    });
    it('No conflicted settings in AutoscaleSettings', () => {
        const conflictCheck = (
            o: { [key: string]: string },
            against: { [key: string]: string }
        ) => {
            const entriesA = Object.entries(against);
            const mapB = new Map(Object.entries(o));
            const conflict = entriesA.filter(([key, value]) => {
                // filter if the same key exists in B and the values are different
                return mapB.has(key) && mapB.get(key) !== value;
            });
            Sinon.assert.match(conflict.length, 0); // expect no conflict
        };
        conflictCheck(FortiGateAutoscaleSetting, AutoscaleSetting);
        conflictCheck(FortiGateAutoscaleSetting, FortiGateAutoscaleSetting);
    });
    it('handlePrimaryElection', async () => {
        const stub1 = Sinon.stub(x, 'logAsInfo');
        const stub2 = Sinon.stub(p, 'getSettings').callsFake(() => {
            return Promise.resolve(s);
        });
        const stub4 = Sinon.stub(ms, 'apply');
        const stub5 = Sinon.stub(ms, 'result').callsFake(() => {
            return Promise.resolve(TEST_PRIMARY_ELECTION);
        });
        const stub6 = Sinon.stub(p, 'equalToVm').callsFake((a, b) => {
            Sinon.assert.match(a, TEST_VM);
            Sinon.assert.match(b, TEST_VM);
            return true;
        });
        try {
            const result = await autoscale.handlePrimaryElection();
            Sinon.assert.match(stub1.called, true);
            Sinon.assert.match(await stub2.returnValues[0], s);
            Sinon.assert.match(stub4.notCalled, true);
            Sinon.assert.match(stub5.called, false);
            Sinon.assert.match(stub6.called, false);
            Sinon.assert.match(!result.newPrimary, true);
        } catch (error) {
            console.log(error);
            Sinon.assert.fail('should not throw errors.');
        } finally {
            stub1.restore();
            stub2.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
        }
    });
    it('handleHeartbeatSync', async () => {
        const stub1 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(input => {
            Sinon.assert.match(Object.is(input, TEST_VM.id), true);
            return Promise.resolve(TEST_HCR_ON_TIME);
        });
        const stub2 = Sinon.stub(p, 'getTargetVm');
        const stub3 = Sinon.stub(autoscale, 'handleLaunchingVm').callsFake(() => {
            return Promise.resolve('Sinon.stub.callsFake');
        });

        const stub4 = Sinon.stub(autoscale, 'handleLaunchedVm').callsFake(() => {
            return Promise.resolve('Sinon.stub.callsFake');
        });

        const stub5 = Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
            return Promise.resolve(TEST_VM);
        });
        const stub6 = Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
            return Promise.resolve(TEST_PRIMARY_RECORD);
        });
        const stub7 = Sinon.stub(autoscale, 'handlePrimaryElection').callsFake(() => {
            return Promise.resolve(me);
        });
        const stub8 = Sinon.stub(autoscale, 'handleTaggingAutoscaleVm');
        const stub9 = Sinon.stub(p, 'equalToVm').callsFake((a, b) => {
            Sinon.assert.match(a, TEST_VM);
            Sinon.assert.match(b, TEST_VM);
            return true;
        });
        const stub10 = Sinon.stub(p, 'updateHealthCheckRecord').callsFake(hcr => {
            Sinon.assert.match(compare(hcr).isEqualTo(TEST_HCR_ON_TIME), true);
            Sinon.assert.match(hcr.vmId, TEST_HCR_ON_TIME.vmId);
            Sinon.assert.match(hcr.scalingGroupName, TEST_HCR_ON_TIME.scalingGroupName);
            return Promise.resolve();
        });
        const stub11 = Sinon.stub(p, 'getSettings').callsFake(() => {
            return Promise.resolve(s);
        });
        const stub12 = Sinon.stub(p, 'deleteVmFromScalingGroup').callsFake(() => {
            return Promise.resolve();
        });
        const stub13 = Sinon.stub(autoscale, 'sendAutoscaleNotifications').callsFake(() => {
            return Promise.resolve();
        });

        try {
            const result = await autoscale.handleHeartbeatSync();
            Sinon.assert.match(
                compare(await stub1.returnValues[0]).isEqualTo(TEST_HCR_ON_TIME),
                true
            );
            Sinon.assert.match(stub2.called, false);
            Sinon.assert.match(stub3.called, false);
            Sinon.assert.match(stub4.called, false);

            Sinon.assert.match(stub5.called, false);
            Sinon.assert.match(await stub6.called, false);
            Sinon.assert.match(compare(await stub7.returnValues[0]).isEqualTo(me), true);
            Sinon.assert.match(stub8.called, false);
            Sinon.assert.match(stub9.called, false);
            Sinon.assert.match(stub10.called, true);
            Sinon.assert.match(stub11.called, true);
            Sinon.assert.match(stub12.called, true);
            Sinon.assert.match(stub13.called, true);
            Sinon.assert.match(result, '');
        } catch (error) {
            console.log(error);
            Sinon.assert.fail('should not throw errors.');
        } finally {
            stub1.restore();
            stub2.restore();
            stub3.restore();

            stub5.restore();
            stub6.restore();
            stub7.restore();
            stub8.restore();
            stub9.restore();
            stub10.restore();
            stub11.restore();
            stub12.restore();
            stub13.restore();
        }
    });
});

describe('handle unhealthy vm.', () => {
    let p: TestPlatformAdapter;
    let e: AutoscaleEnvironment;
    let x: TestCloudFunctionProxyAdapter;
    let s: Settings;
    let ms: PrimaryElectionStrategy;
    let hs: HeartbeatSyncStrategy;
    let ss: ScalingGroupStrategy;
    let autoscale: Autoscale;
    before(function() {
        p = new TestPlatformAdapter();
        e = {
            targetVm: TEST_VM,
            primaryVm: TEST_VM,
            primaryRecord: TEST_PRIMARY_RECORD
        };
        x = new TestCloudFunctionProxyAdapter();
        s = new Map<string, SettingItem>();
        s.set(AutoscaleSetting.PrimaryElectionTimeout, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatDelayAllowance, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatLossCount, new SettingItem('1', '0', '3', true, true));
        // Set termination of unhealthy vm to 'true'
        s.set(AutoscaleSetting.TerminateUnhealthyVm, new SettingItem('1', 'true', '3', true, true));
        ms = {
            prepare() {
                return Promise.resolve();
            },
            apply() {
                return Promise.resolve(PrimaryElectionStrategyResult.ShouldContinue);
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
            targetHealthCheckRecord: TEST_HCR_LATE, // use the late health check record
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
                syncRecoveryCount: 0
            },
            targetVmFirstHeartbeat: true,
            forceOutOfSync() {
                return Promise.resolve(true);
            }
        };
        ms = new PreferredGroupPrimaryElection(p, x);
        hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
        ss = new NoopScalingGroupStrategy(p, x);
        autoscale = new TestAutoscale(p, e, x);
        autoscale.setPrimaryElectionStrategy(ms);
        autoscale.setHeartbeatSyncStrategy(hs);
        autoscale.setScalingGroupStrategy(ss);
        autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
        autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
    });
    it('When termination is enabled termination of unhealthy vm is triggered.', async () => {
        // turn on the termination toggle
        // Set termination of unhealthy vm to 'true'
        s.set(AutoscaleSetting.TerminateUnhealthyVm, new SettingItem('1', 'true', '3', true, true));
        const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
            return Promise.resolve(s);
        });
        const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
            return true;
        });
        const stub3 = Sinon.stub(p, 'deleteVmFromScalingGroup').callsFake(() => {
            return Promise.resolve();
        });
        const stub4 = Sinon.stub(autoscale, 'sendAutoscaleNotifications').callsFake(() => {
            return Promise.resolve();
        });
        const stub5 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
            const hcr = Object.assign({}, TEST_HCR_LATE);
            return Promise.resolve(hcr);
        });
        await autoscale.handleHeartbeatSync();

        // assertions
        // deleteVmFromScalingGroup should be called
        Sinon.assert.match(stub3.called, true);
        // sent notification should be called
        Sinon.assert.match(stub4.called, true);

        stub1.restore();
        stub2.restore();
        stub3.restore();
        stub4.restore();
        stub5.restore();
    });
    it('When termination is disabled, termination of unhealthy vm  is not triggered.', async () => {
        // turn on the termination toggle
        // Set termination of unhealthy vm to 'false'
        s.set(
            AutoscaleSetting.TerminateUnhealthyVm,
            new SettingItem('1', 'false', '3', true, true)
        );
        const stub1 = Sinon.stub(p, 'getSettings').callsFake(() => {
            return Promise.resolve(s);
        });
        const stub2 = Sinon.stub(p, 'vmEquals').callsFake(() => {
            return true;
        });
        const stub3 = Sinon.stub(p, 'deleteVmFromScalingGroup').callsFake(() => {
            return Promise.resolve();
        });
        const stub4 = Sinon.stub(autoscale, 'sendAutoscaleNotifications').callsFake(() => {
            return Promise.resolve();
        });
        const stub5 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
            const hcr = Object.assign({}, TEST_HCR_LATE);
            return Promise.resolve(hcr);
        });
        await autoscale.handleHeartbeatSync();

        // assertions
        // deleteVmFromScalingGroup should not be called
        Sinon.assert.match(stub3.called, false);
        // sent notification should be called
        Sinon.assert.match(stub4.called, true);

        stub1.restore();
        stub2.restore();
        stub3.restore();
        stub4.restore();
        stub5.restore();
    });
});

describe('sync recovery of unhealthy vm.', () => {
    let p: TestPlatformAdapter;
    let e: AutoscaleEnvironment;
    let x: TestCloudFunctionProxyAdapter;
    let s: Settings;
    let ms: PrimaryElectionStrategy;
    let hs: HeartbeatSyncStrategy;
    let ss: ScalingGroupStrategy;
    let autoscale: Autoscale;
    before(function() {
        p = new TestPlatformAdapter();
        e = {
            targetVm: TEST_VM,
            primaryVm: TEST_VM,
            primaryRecord: TEST_PRIMARY_RECORD
        };
        x = new TestCloudFunctionProxyAdapter();
        s = new Map<string, SettingItem>();
        s.set(AutoscaleSetting.PrimaryElectionTimeout, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatDelayAllowance, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatLossCount, new SettingItem('1', '0', '3', true, true));
        // Set termination of unhealthy vm to 'true'
        s.set(AutoscaleSetting.TerminateUnhealthyVm, new SettingItem('1', 'true', '3', true, true));
        s.set(AutoscaleSetting.SyncRecoveryCount, new SettingItem('1', '3', '3', true, true));
        ms = {
            prepare() {
                return Promise.resolve();
            },
            apply() {
                return Promise.resolve(PrimaryElectionStrategyResult.ShouldContinue);
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
            targetHealthCheckRecord: TEST_HCR_LATE, // use the late health check record
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
                syncRecoveryCount: 0
            },
            targetVmFirstHeartbeat: true,
            forceOutOfSync() {
                return Promise.resolve(true);
            }
        };
        ms = new PreferredGroupPrimaryElection(p, x);
        hs = new ConstantIntervalHeartbeatSyncStrategy(p, x);
        ss = new NoopScalingGroupStrategy(p, x);
        autoscale = new TestAutoscale(p, e, x);
        autoscale.setPrimaryElectionStrategy(ms);
        autoscale.setHeartbeatSyncStrategy(hs);
        autoscale.setScalingGroupStrategy(ss);
        autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy(p, x));
        autoscale.setFazIntegrationStrategy(new NoopFazIntegrationStrategy(p, x));
    });
    it('Sync recovery count should be set.', async () => {
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
        const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
            const hcr = Object.assign({}, TEST_HCR_LATE);
            return Promise.resolve(hcr);
        });
        const stub4 = Sinon.stub(p, 'updateHealthCheckRecord').callsFake(rec => {
            Sinon.assert.match(rec.syncRecoveryCount, syncRecoveryCount);
            return Promise.resolve();
        });

        await autoscale.handleHeartbeatSync();

        stub1.restore();
        stub2.restore();
        stub3.restore();
        stub4.restore();
    });
    it('When termination of unhealthy vm is enabled, sync recovery count should not change.', async () => {
        // turn on the termination toggle
        // Set termination of unhealthy vm to 'true'
        s.set(AutoscaleSetting.TerminateUnhealthyVm, new SettingItem('1', 'true', '3', true, true));
        // set the sync recovery count to 3
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
        const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
            const hcr = Object.assign({}, TEST_HCR_OUT_OF_SYNC);
            return Promise.resolve(hcr);
        });
        const stub4 = Sinon.stub(p, 'updateHealthCheckRecord').callsFake(rec => {
            Sinon.assert.match(rec.syncRecoveryCount, syncRecoveryCount);
            return Promise.resolve();
        });

        await autoscale.handleHeartbeatSync();

        stub1.restore();
        stub2.restore();
        stub3.restore();
        stub4.restore();
    });
    it('When termination of unhealthy vm is disabled and heartbeat arrives on-time, sync recovery count should decrease by 1.', async () => {
        // turn off the termination toggle
        // Set termination of unhealthy vm to 'false'
        s.set(
            AutoscaleSetting.TerminateUnhealthyVm,
            new SettingItem('1', 'false', '3', true, true)
        );
        // set the sync recovery count to 3
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
        const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
            const hcr = Object.assign({}, TEST_HCR_OUT_OF_SYNC);
            // set the hb on-time
            hcr.nextHeartbeatTime = Date.now() + 9999999;
            return Promise.resolve(hcr);
        });
        const stub4 = Sinon.stub(p, 'updateHealthCheckRecord').callsFake(rec => {
            // sync recovery count decreased by 1
            Sinon.assert.match(rec.syncRecoveryCount, syncRecoveryCount - 1);
            // health check sync state is still out-of-sync
            Sinon.assert.match(rec.syncState, HealthCheckSyncState.OutOfSync);
            // healthy is false
            Sinon.assert.match(rec.healthy, false);
            return Promise.resolve();
        });

        await autoscale.handleHeartbeatSync();

        stub1.restore();
        stub2.restore();
        stub3.restore();
        stub4.restore();
    });
    it('When termination of unhealthy vm is disabled and heartbeat arrives late, sync recovery count should reset.', async () => {
        // turn off the termination toggle
        // Set termination of unhealthy vm to 'false'
        s.set(
            AutoscaleSetting.TerminateUnhealthyVm,
            new SettingItem('1', 'false', '3', true, true)
        );
        // set the sync recovery count to 3
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
        const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
            const hcr = Object.assign({}, TEST_HCR_OUT_OF_SYNC);
            // set the sync recovery count to 1
            hcr.syncRecoveryCount = 1;
            return Promise.resolve(hcr);
        });
        const stub4 = Sinon.stub(p, 'updateHealthCheckRecord').callsFake(rec => {
            // sync recovery count reset
            Sinon.assert.match(rec.syncRecoveryCount, syncRecoveryCount);
            // health check sync state is still out-of-sync
            Sinon.assert.match(rec.syncState, HealthCheckSyncState.OutOfSync);
            // healthy is false
            Sinon.assert.match(rec.healthy, false);
            return Promise.resolve();
        });

        await autoscale.handleHeartbeatSync();

        stub1.restore();
        stub2.restore();
        stub3.restore();
        stub4.restore();
    });
    it(
        'When termination of unhealthy vm is disabled and heartbeat arrives on-time and ' +
            'the number reaches the recovery threshold, sync recovery should be completed.',
        async () => {
            // turn off the termination toggle
            // Set termination of unhealthy vm to 'false'
            s.set(
                AutoscaleSetting.TerminateUnhealthyVm,
                new SettingItem('1', 'false', '3', true, true)
            );
            // set the sync recovery count to 3
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
            const stub3 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
                const hcr = Object.assign({}, TEST_HCR_OUT_OF_SYNC);
                // set the sync recovery count to 1
                hcr.syncRecoveryCount = 1;
                // set the hb on-time
                hcr.nextHeartbeatTime = Date.now() + 9999999;
                return Promise.resolve(hcr);
            });
            const stub4 = Sinon.stub(p, 'updateHealthCheckRecord').callsFake(rec => {
                // sync recovery count should be 0
                Sinon.assert.match(rec.syncRecoveryCount !== syncRecoveryCount, true);
                Sinon.assert.match(rec.syncRecoveryCount, 0);
                // health check sync state is in-sync
                Sinon.assert.match(rec.syncState, HealthCheckSyncState.InSync);
                // heartbeat loss count should be reset to 0
                Sinon.assert.match(rec.heartbeatLossCount, 0);
                // healthy is true
                Sinon.assert.match(rec.healthy, true);
                return Promise.resolve();
            });

            await autoscale.handleHeartbeatSync();

            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
        }
    );
});
