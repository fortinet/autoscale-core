import { describe } from 'mocha';
import Sinon, { SinonStub } from 'sinon';
import {
    Autoscale,
    AutoscaleEnvironment,
    AutoscaleSetting,
    Blob,
    CloudFunctionProxyAdapter,
    CloudFunctionResponseBody,
    ConstantIntervalHeartbeatSyncStrategy,
    DeviceSyncInfo,
    FazIntegrationStrategy,
    HealthCheckRecord,
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
    PlatformAdapter,
    PrimaryElectionStrategy,
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
    TaggingVmStrategy,
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
    sendTime: new Date().toISOString(),
    deviceSyncTime: new Date(Date.now() - 4 * 1000 * 3).toISOString(),
    deviceSyncFailTime: null,
    deviceSyncStatus: null,
    deviceIsPrimary: false,
    deviceChecksum: null
};

const TEST_HCR_LATE: HealthCheckRecord = {
    vmId: 'fake-test-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    ip: '2',
    primaryIp: '3',
    heartbeatInterval: 4,
    heartbeatLossCount: 1,
    nextHeartbeatTime: 6,
    syncState: HealthCheckSyncState.InSync,
    syncRecoveryCount: 0,
    seq: 7,
    healthy: false,
    upToDate: true,
    sendTime: new Date(Date.now() - 4 * 1000 * 2).toISOString(),
    deviceSyncTime: new Date(Date.now() - 4 * 1000 * 3).toISOString(),
    deviceSyncFailTime: null,
    deviceSyncStatus: null,
    deviceIsPrimary: false,
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
    sendTime: new Date(Date.now() - 4 * 1000).toISOString(),
    deviceSyncTime: new Date(Date.now() - 4 * 1000 * 3).toISOString(),
    deviceSyncFailTime: null,
    deviceSyncStatus: null,
    deviceIsPrimary: false,
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

const TEST_DEVICE_SYNC_INFO_ENHANCED: DeviceSyncInfo = {
    instance: 'fake-instance',
    interval: 30,
    sequence: 8,
    time: new Date().toISOString(),
    syncTime: new Date().toISOString(),
    syncFailTime: null,
    syncStatus: true,
    isPrimary: false,
    checksum: 'fake-checksum'
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
        throw new Error('Method not implemented.');
    }
    createTime: number = Date.now();
    getReqVmId(): Promise<string> {
        throw new Error('Method not implemented.');
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
        throw new Error('Method not implemented.');
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
        throw new Error('Method not implemented.');
    }
    listHealthCheckRecord(): Promise<HealthCheckRecord[]> {
        throw new Error('Method not implemented.');
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
        throw new Error('Method not implemented.');
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

// eslint-disable-next-line max-params
function createAutoscale(
    p: TestPlatformAdapter,
    e: AutoscaleEnvironment,
    x: TestCloudFunctionProxyAdapter,
    pes?: PrimaryElectionStrategy,
    hss?: HeartbeatSyncStrategy,
    sgs?: ScalingGroupStrategy,
    rets?: RoutingEgressTrafficStrategy,
    tavs?: TaggingVmStrategy,
    fis?: FazIntegrationStrategy
) {
    const autoscale = new TestAutoscale(p, e, x);
    const _pes = pes || new WeightedScorePreferredGroupPrimaryElection(p, x);
    const _hss = hss || new ConstantIntervalHeartbeatSyncStrategy(p, x);
    const _sgs = sgs || new NoopScalingGroupStrategy(p, x);
    const _rets = rets || new NoopRoutingEgressTrafficStrategy(p, x);
    const _tavs = tavs || new NoopTaggingVmStrategy(p, x);
    const _fis = fis || new NoopFazIntegrationStrategy(p, x);
    autoscale.setPrimaryElectionStrategy(_pes);
    autoscale.setHeartbeatSyncStrategy(_hss);
    autoscale.setScalingGroupStrategy(_sgs);
    autoscale.setRoutingEgressTrafficStrategy(_rets);
    autoscale.setTaggingAutoscaleVmStrategy(_tavs);
    autoscale.setFazIntegrationStrategy(_fis);
    return {
        autoscale: autoscale,
        pes: _pes,
        hss: _hss,
        sgs: _sgs,
        rets: _rets,
        tavs: _tavs,
        fis: _fis
    };
}

function createTestHCR(
    fromHCR: HealthCheckRecord,
    vmIdSuffix: string,
    isPrimary: boolean,
    inSync: boolean,
    checksum: string,
    latestSyncTime: boolean
): HealthCheckRecord {
    const hcr = Object.assign({}, fromHCR);
    hcr.vmId = `${hcr.vmId}${vmIdSuffix}`;
    hcr.deviceIsPrimary = isPrimary;
    hcr.deviceSyncStatus = isPrimary ? null : inSync;
    hcr.deviceChecksum = checksum;
    hcr.deviceSyncTime = latestSyncTime
        ? new Date().toISOString()
        : new Date(Date.now() - Math.round(Math.random() * 200000 + 100000)).toISOString(); // give it a randome date older than now
    if (latestSyncTime === null) {
        hcr.deviceSyncTime = null;
    }
    return hcr;
}

describe('Enhanced primary election.', () => {
    let p: TestPlatformAdapter;
    let e: AutoscaleEnvironment;
    let x: TestCloudFunctionProxyAdapter;
    let s: Settings;
    let pes: PrimaryElectionStrategy;
    let autoscale: Autoscale;
    const globalStubs: Map<string, SinonStub> = new Map();

    const restoreStub = (key: string): Promise<typeof globalStubs> => {
        if (globalStubs.has(key)) {
            globalStubs.get(key).restore();
        }
        return Promise.resolve(globalStubs);
    };

    const updateStub = (keyPrefix: string, stub: SinonStub): SinonStub => {
        const key = `${keyPrefix}${keyPrefix ? '.' : ''}${stub.name}`;
        globalStubs.set(key, stub);
        return globalStubs.get(key);
    };
    const getStub = (key: string): Promise<SinonStub> => {
        return Promise.resolve(globalStubs.get(key));
    };

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
        s.set(AutoscaleSetting.SyncRecoveryCount, new SettingItem('1', '3', '3', true, true));
        // global stubs

        updateStub(
            'p',
            Sinon.stub(p, 'getReqAsString').callsFake(() => {
                return Promise.resolve('fake-req-as-string');
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'getReqDeviceSyncInfo').callsFake(() => {
                return Promise.resolve(TEST_DEVICE_SYNC_INFO_ENHANCED);
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'getReqVmId').callsFake(() => {
                return Promise.resolve('fake-req-vm-id');
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'getSettings').callsFake(() => {
                return Promise.resolve(s);
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'vmEquals').callsFake((a, b) => {
                return a.id === b.id && a.scalingGroupName === b.scalingGroupName;
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'getTargetVm').callsFake(() => {
                return Promise.resolve(TEST_VM);
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                return Promise.resolve(TEST_PRIMARY_VM);
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'getHealthCheckRecord').callsFake(vmId => {
                if (vmId === TEST_VM.id) {
                    return Promise.resolve(Object.assign({}, TEST_HCR_ON_TIME));
                } else if (vmId === TEST_PRIMARY_VM.id) {
                    return Promise.resolve();
                } else {
                    return Promise.resolve(null);
                }
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                return Promise.resolve([
                    Object.assign({}, TEST_HCR_LATE),
                    Object.assign({}, TEST_HCR_ON_TIME),
                    Object.assign({}, TEST_HCR_OUT_OF_SYNC)
                ]);
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                return Promise.resolve(Object.assign({}, TEST_PRIMARY_RECORD));
            })
        );
        updateStub(
            'p',
            Sinon.stub(p, 'createHealthCheckRecord').callsFake(() => {
                return Promise.resolve();
            })
        );
    });
    afterEach(function() {
        globalStubs.forEach(stub => {
            stub.restore();
        });
        globalStubs.clear();
    });
    describe('When no existing primary election record.', () => {
        beforeEach(async function() {
            e = {
                targetVm: Object.assign({}, TEST_VM),
                primaryVm: null,
                primaryRecord: null
            };
            // to temporarily return a null primary record for this test suite
            await restoreStub('p.getPrimaryVm').then(() => {
                updateStub(
                    'p',
                    Sinon.stub(p, 'getPrimaryVm').callsFake(() => {
                        return Promise.resolve(null);
                    })
                );
            });

            await restoreStub('p.getPrimaryRecord').then(() => {
                updateStub(
                    'p',
                    Sinon.stub(p, 'getPrimaryRecord').callsFake(() => {
                        return Promise.resolve(null);
                    })
                );
            });
        });
        describe('When no healthcheck record found.', () => {
            it('No primary will be elected.', async function() {
                ({ autoscale: autoscale, pes: pes } = createAutoscale(p, e, x));
                // local stubs
                // do not return a healthcheck record
                await restoreStub('p.getHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
                            return Promise.resolve(null);
                        })
                    );
                });
                await restoreStub('p.listHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                            return Promise.resolve([]);
                        })
                    );
                });
                await restoreStub('p.updatePrimaryRecord').then(() => {
                    const originalMethod = p.updatePrimaryRecord.bind(p);
                    updateStub(
                        'p',
                        Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                            return originalMethod(rec);
                        })
                    );
                });

                await restoreStub('pes.result').then(() => {
                    const originalMethod = pes.result.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'result').callsFake(() => {
                            return originalMethod();
                        })
                    );
                });

                // run autoscale
                await autoscale.handleHeartbeatSync();

                // post task verification

                await getStub('pes.result').then(async stub => {
                    const returnValues = await stub.returnValues[0];
                    Sinon.assert.match(returnValues.newPrimary === null, true);
                    Sinon.assert.match(returnValues.newPrimaryRecord === null, true);
                });
                // should not update because vm is the elected primary
                await getStub('p.updatePrimaryRecord').then(stub => {
                    Sinon.assert.match(stub.called, false);
                });
            });
        });
        describe('When one and only one healthcheck record found in the DB.', () => {
            afterEach(function() {
                globalStubs.forEach(stub => {
                    stub.restore();
                });
                globalStubs.clear();
            });
            it('If the VM is healthy, it will be elected as the new primary.', async function() {
                ({ autoscale: autoscale, pes: pes } = createAutoscale(p, e, x));
                const TEMP_TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
                const TEMP_TEST_VM = Object.assign({}, TEST_VM);
                // local stubs
                // return only one health check record
                await restoreStub('p.getHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
                            return Promise.resolve(TEMP_TEST_HCR);
                        })
                    );
                });
                // there is only one healthcheck record in the DB
                await restoreStub('p.listHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                            return Promise.resolve([TEMP_TEST_HCR]);
                        })
                    );
                });
                // in this test case, the elected vm is the target vm so return it.
                await restoreStub('p.getVmById').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getVmById').callsFake(vmId => {
                            return Promise.resolve(TEMP_TEST_VM);
                        })
                    );
                });
                await restoreStub('p.updatePrimaryRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                            return Promise.resolve();
                        })
                    );
                });

                await restoreStub('pes.result').then(() => {
                    const originalMethod = pes.result.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'result').callsFake(() => {
                            return originalMethod();
                        })
                    );
                });

                // run autoscale
                await autoscale.handleHeartbeatSync();

                // post task verification
                // should not update because vm is the elected primary
                await getStub('p.updatePrimaryRecord').then(async stub => {
                    Sinon.assert.match(stub.called, true);
                    const record: PrimaryRecord = await stub.args[0][0];
                    Sinon.assert.match(record === null, false);
                    Sinon.assert.match(record.vmId, TEMP_TEST_VM.id);
                });
            });
            it('If the VM is unhealthy, it will not be elected as the new primary.', async function() {
                ({ autoscale: autoscale, pes: pes } = createAutoscale(p, e, x));
                let TEMP_TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
                const TEMP_TEST_VM = Object.assign({}, TEST_VM);
                // local stubs
                // return only one health check record
                await restoreStub('p.getHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
                            return Promise.resolve(TEMP_TEST_HCR);
                        })
                    );
                });
                // there is only one healthcheck record in the DB
                await restoreStub('p.listHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                            return Promise.resolve([TEMP_TEST_HCR]);
                        })
                    );
                });
                // in this test case, the elected vm is the target vm so return it.
                await restoreStub('p.getVmById').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getVmById').callsFake(vmId => {
                            return Promise.resolve(TEMP_TEST_VM);
                        })
                    );
                });
                await restoreStub('p.updatePrimaryRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                            return Promise.resolve();
                        })
                    );
                });

                // when the election runs, replace the healthcheck record with an unhealthy one
                // to test the election test case
                await restoreStub('pes.apply').then(() => {
                    const originalMethod = pes.apply.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'apply').callsFake(() => {
                            TEMP_TEST_HCR = Object.assign({}, TEST_HCR_OUT_OF_SYNC);
                            return originalMethod();
                        })
                    );
                });

                await restoreStub('pes.result').then(() => {
                    const originalMethod = pes.result.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'result').callsFake(() => {
                            return originalMethod();
                        })
                    );
                });

                // run autoscale
                await autoscale.handleHeartbeatSync();

                // post task verification
                // should not update because vm is the elected primary
                await getStub('p.updatePrimaryRecord').then(stub => {
                    Sinon.assert.match(stub.called, false);
                });
            });
        });
        describe('When two healthcheck records found in the DB.', () => {
            // eslint-disable-next-line mocha/no-hooks-for-single-case
            afterEach(function() {
                globalStubs.forEach(stub => {
                    stub.restore();
                });
                globalStubs.clear();
            });
            it('If only one VM is healthy, it will be elected as the new primary.', async function() {
                ({ autoscale: autoscale, pes: pes } = createAutoscale(p, e, x));
                const TEMP_TEST_HCR_1 = Object.assign({}, TEST_HCR_ON_TIME);
                // give it a new name
                TEMP_TEST_HCR_1.vmId = `${TEMP_TEST_HCR_1.vmId}-duplicate-1`;
                // mark it as secondary
                TEMP_TEST_HCR_1.deviceIsPrimary = false;
                TEMP_TEST_HCR_1.deviceSyncStatus = true;
                // duplicate the TEMP_TEST_HCR_1 into TEMP_TEST_HCR_2 with a different name
                const TEMP_TEST_HCR_2 = Object.assign({}, TEMP_TEST_HCR_1);
                TEMP_TEST_HCR_2.vmId = `${TEMP_TEST_HCR_2.vmId}-duplicate-2`;

                const TEMP_TEST_VM = Object.assign({}, TEST_VM);
                TEMP_TEST_VM.id = TEMP_TEST_HCR_1.vmId;
                // local stubs
                // return the first one health check record
                await restoreStub('p.getHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
                            return Promise.resolve(TEMP_TEST_HCR_1);
                        })
                    );
                });
                // there are two healthcheck records in the DB
                await restoreStub('p.listHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                            return Promise.resolve([TEMP_TEST_HCR_1, TEMP_TEST_HCR_2]);
                        })
                    );
                });
                // when the election runs, change its state to unhealthy so the other vm
                // would be elected as the new primary
                await restoreStub('pes.apply').then(() => {
                    const originalMethod = pes.apply.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'apply').callsFake(() => {
                            TEMP_TEST_HCR_1.healthy = false;
                            return originalMethod();
                        })
                    );
                });
                // in this test case, the elected vm is the target vm so return it.
                await restoreStub('p.getVmById').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getVmById').callsFake(vmId => {
                            return Promise.resolve(TEMP_TEST_VM);
                        })
                    );
                });
                await restoreStub('p.updatePrimaryRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                            return Promise.resolve();
                        })
                    );
                });

                await restoreStub('pes.result').then(() => {
                    const originalMethod = pes.result.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'result').callsFake(() => {
                            return originalMethod();
                        })
                    );
                });

                // run autoscale
                await autoscale.handleHeartbeatSync();

                // post task verification
                await getStub('p.updatePrimaryRecord').then(async stub => {
                    Sinon.assert.match(stub.called, true);
                    const record: PrimaryRecord = await stub.args[0][0];
                    Sinon.assert.match(record === null, false);
                    Sinon.assert.match(record.vmId, TEMP_TEST_HCR_2.vmId);
                });
            });
        });

        describe('When two healthcheck records found in the DB and the VM2 has the highest scores.', () => {
            let TEMP_TEST_HCR_1: HealthCheckRecord;
            let TEMP_TEST_HCR_2: HealthCheckRecord;
            let TEMP_TEST_VM: VirtualMachine;
            beforeEach(async function() {
                ({ autoscale: autoscale, pes: pes } = createAutoscale(p, e, x));
                TEMP_TEST_HCR_1 = Object.assign({}, TEST_HCR_ON_TIME);
                // give it a new name
                TEMP_TEST_HCR_1.vmId = `${TEMP_TEST_HCR_1.vmId}-duplicate-1`;
                // mark it as secondary
                TEMP_TEST_HCR_1.deviceIsPrimary = false;
                TEMP_TEST_HCR_1.deviceSyncStatus = true;
                // give it a checksum
                TEMP_TEST_HCR_1.deviceChecksum = 'fake-checksum';
                // give it an older sync time to lower its score
                TEMP_TEST_HCR_1.deviceSyncTime = new Date(Date.now() - 100000).toISOString();
                // duplicate the TEMP_TEST_HCR_1 into TEMP_TEST_HCR_2 with a different name
                TEMP_TEST_HCR_2 = Object.assign({}, TEMP_TEST_HCR_1);
                TEMP_TEST_HCR_2.vmId = `${TEMP_TEST_HCR_2.vmId}-duplicate-2`;
                // give it the latest sync time
                TEMP_TEST_HCR_2.deviceSyncTime = new Date(Date.now()).toISOString();

                TEMP_TEST_VM = Object.assign({}, TEST_VM);
                TEMP_TEST_VM.id = TEMP_TEST_HCR_1.vmId;
                // return the first one health check record
                await restoreStub('p.getHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getHealthCheckRecord').callsFake(() => {
                            return Promise.resolve(TEMP_TEST_HCR_1);
                        })
                    );
                });
                // there are two healthcheck records in the DB
                await restoreStub('p.listHealthCheckRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                            return Promise.resolve([TEMP_TEST_HCR_1, TEMP_TEST_HCR_2]);
                        })
                    );
                });
            });
            afterEach(function() {
                globalStubs.forEach(stub => {
                    stub.restore();
                });
                globalStubs.clear();
            });
            it('If VM2 come from the preferred scaling group. VM2 will be elected.', async function() {
                // by the test data of this test case VM2 will be weighted the highest score
                const TEMP_ELECTED_PRIMARY_VM = Object.assign({}, TEMP_TEST_VM);
                TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_2.vmId;

                await restoreStub('p.getVmById').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getVmById').callsFake(vmId => {
                            return Promise.resolve(TEMP_ELECTED_PRIMARY_VM);
                        })
                    );
                });
                await restoreStub('p.updatePrimaryRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                            return Promise.resolve();
                        })
                    );
                });

                await restoreStub('pes.result').then(() => {
                    const originalMethod = pes.result.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'result').callsFake(() => {
                            return originalMethod();
                        })
                    );
                });

                // run autoscale
                await autoscale.handleHeartbeatSync();

                // post task verification
                await getStub('p.updatePrimaryRecord').then(async stub => {
                    Sinon.assert.match(stub.called, true);
                    const record: PrimaryRecord = await stub.args[0][0];
                    Sinon.assert.match(record === null, false);
                    Sinon.assert.match(record.vmId, TEMP_TEST_HCR_2.vmId);
                });
            });
            it('If VM2 not come from the preferred scaling group. VM2 will not be elected.', async function() {
                // by the test data of this test case VM2 will be weighted the highest score
                const TEMP_ELECTED_PRIMARY_VM = Object.assign({}, TEMP_TEST_VM);

                // change the VM2 scaling group so it will be out of the preferred group
                TEMP_TEST_HCR_2.scalingGroupName = `;not-in-${TEMP_TEST_HCR_2.scalingGroupName}`;

                await restoreStub('p.getVmById').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'getVmById').callsFake(vmId => {
                            return Promise.resolve(TEMP_ELECTED_PRIMARY_VM);
                        })
                    );
                });
                await restoreStub('p.updatePrimaryRecord').then(() => {
                    updateStub(
                        'p',
                        Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                            return Promise.resolve();
                        })
                    );
                });

                await restoreStub('pes.result').then(() => {
                    const originalMethod = pes.result.bind(pes);
                    updateStub(
                        'pes',
                        Sinon.stub(pes, 'result').callsFake(() => {
                            return originalMethod();
                        })
                    );
                });

                // run autoscale
                await autoscale.handleHeartbeatSync();

                // post task verification
                await getStub('p.updatePrimaryRecord').then(async stub => {
                    Sinon.assert.match(stub.called, true);
                    const record: PrimaryRecord = await stub.args[0][0];
                    Sinon.assert.match(record === null, false);
                    Sinon.assert.match(record.vmId === TEMP_TEST_HCR_2.vmId, false);
                });
            });
        });

        describe(
            'When six healthcheck records found in the DB and those VMs are healthy, and in the ' +
                'preferred scaling group.',
            () => {
                let TEMP_TEST_HCR: HealthCheckRecord;
                let TEMP_TEST_HCR_1: HealthCheckRecord;
                let TEMP_TEST_HCR_2: HealthCheckRecord;
                let TEMP_TEST_HCR_3: HealthCheckRecord;
                let TEMP_TEST_HCR_4: HealthCheckRecord;
                let TEMP_TEST_HCR_5: HealthCheckRecord;
                let TEMP_TEST_HCR_6: HealthCheckRecord;
                let TEMP_ELECTED_PRIMARY_VM: VirtualMachine;
                beforeEach(async function() {
                    ({ autoscale: autoscale, pes: pes } = createAutoscale(p, e, x));
                    TEMP_TEST_HCR = Object.assign({}, TEST_HCR_ON_TIME);
                    // give it a new name
                    // TEMP_TEST_HCR_1.vmId = `${TEMP_TEST_HCR_1.vmId}-duplicate-1`;
                    // mark it as secondary
                    TEMP_TEST_HCR.deviceIsPrimary = false;
                    TEMP_TEST_HCR.deviceSyncStatus = true;
                    // clear the checksum
                    TEMP_TEST_HCR.deviceChecksum = null;
                    // give it an older sync time to lower its score
                    TEMP_TEST_HCR.deviceSyncTime = new Date(Date.now() - 100000).toISOString();

                    // create a VM object for getVmById() to retrieve
                    TEMP_ELECTED_PRIMARY_VM = Object.assign({}, TEST_VM);
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR.vmId;
                    await restoreStub('p.getVmById').then(() => {
                        updateStub(
                            'p',
                            Sinon.stub(p, 'getVmById').callsFake(vmId => {
                                return Promise.resolve(TEMP_ELECTED_PRIMARY_VM);
                            })
                        );
                    });
                    await restoreStub('pes.result').then(() => {
                        const originalMethod = pes.result.bind(pes);
                        updateStub(
                            'pes',
                            Sinon.stub(pes, 'result').callsFake(() => {
                                return originalMethod();
                            })
                        );
                    });

                    // return the 6 healthcheck records
                    await restoreStub('p.listHealthCheckRecord').then(() => {
                        updateStub(
                            'p',
                            Sinon.stub(p, 'listHealthCheckRecord').callsFake(() => {
                                return Promise.resolve([
                                    TEMP_TEST_HCR_1,
                                    TEMP_TEST_HCR_2,
                                    TEMP_TEST_HCR_3,
                                    TEMP_TEST_HCR_4,
                                    TEMP_TEST_HCR_5,
                                    TEMP_TEST_HCR_6
                                ]);
                            })
                        );
                    });
                    await restoreStub('p.updatePrimaryRecord').then(() => {
                        updateStub(
                            'p',
                            Sinon.stub(p, 'updatePrimaryRecord').callsFake(rec => {
                                return Promise.resolve();
                            })
                        );
                    });
                    // device sync info from the request will use the same info from the TEMP_TEST_HCR_1
                    await restoreStub('p.getReqDeviceSyncInfo').then(() => {
                        updateStub(
                            'p',
                            Sinon.stub(p, 'getReqDeviceSyncInfo').callsFake(() => {
                                const syncInfo: DeviceSyncInfo = {
                                    instance: TEMP_TEST_HCR_1.vmId,
                                    interval: TEMP_TEST_HCR_1.heartbeatInterval,
                                    sequence: TEMP_TEST_HCR_1.seq + 1,
                                    time: TEMP_TEST_HCR_1.sendTime, // send time
                                    syncTime: TEMP_TEST_HCR_1.deviceSyncTime,
                                    syncFailTime: TEMP_TEST_HCR_1.deviceSyncFailTime,
                                    syncStatus: TEMP_TEST_HCR_1.deviceSyncStatus,
                                    isPrimary: TEMP_TEST_HCR_1.deviceIsPrimary,
                                    checksum: TEMP_TEST_HCR_1.deviceChecksum
                                };
                                return Promise.resolve(syncInfo);
                            })
                        );
                    });
                    await restoreStub('pes.result').then(() => {
                        const originalMethod = pes.result.bind(pes);
                        updateStub(
                            'pes',
                            Sinon.stub(pes, 'result').callsFake(() => {
                                return originalMethod();
                            })
                        );
                    });
                });
                afterEach(function() {
                    globalStubs.forEach(stub => {
                        stub.restore();
                    });
                    globalStubs.clear();
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:true   | is-primary:false   | is-primary:false  | is-primary:false   | is-primary:false   | is-primary:false   |
                    | sync_status:null  | sync_status:true   | sync_status:true  | sync_status:false  | sync_status:false  | sync_status:false  |
                    | checksum:aaaa     | checksum:aaaa      | checksum:aaaa     | checksum:null      | checksum:null      | checksum:null      |
                    | sync_time:any     | sync_time:(latest) | sync_time:any     | sync_time:any      | sync_time:any      | sync_time:any      |
                */
                it('Case 1 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'aaaa',
                        true
                    ); // give it the latest sync time
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        false
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        false
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        false
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case VM1 will be weighted the highest score
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_1.vmId;

                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(async stub => {
                        Sinon.assert.match(stub.called, true);
                        const record: PrimaryRecord = await stub.args[0][0];
                        Sinon.assert.match(record === null, false);
                        Sinon.assert.match(record.vmId, TEMP_TEST_HCR_1.vmId);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:true   | is-primary:false   | is-primary:false  | is-primary:false   | is-primary:false   | is-primary:false   |
                    | sync_status:null  | sync_status:true   | sync_status:true  | sync_status:false  | sync_status:false  | sync_status:false  |
                    | checksum:aaaa     | checksum:aaaa      | checksum:aaaa     | checksum:bbbb      | checksum:bbbb      | checksum:cccc      |
                    | sync_time:any     | sync_time:(latest) | sync_time:any     | sync_time:any      | sync_time:any      | sync_time:any      |
                */
                it('Case 2 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'aaaa',
                        true
                    ); // give it the latest sync time
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        false
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        false
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        false
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case VM1 will be weighted the highest score
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_1.vmId;

                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(async stub => {
                        Sinon.assert.match(stub.called, true);
                        const record: PrimaryRecord = await stub.args[0][0];
                        Sinon.assert.match(record === null, false);
                        Sinon.assert.match(record.vmId, TEMP_TEST_HCR_1.vmId);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:true   | is-primary:false   | is-primary:false  | is-primary:true    | is-primary:false   | is-primary:false   |
                    | sync_status:null  | sync_status:true   | sync_status:true  | sync_status:null   | sync_status:true   | sync_status:false  |
                    | checksum:aaaa     | checksum:aaaa      | checksum:aaaa     | checksum:bbbb      | checksum:bbbb      | checksum:cccc      |
                    | sync_time:any     | sync_time:(latest) | sync_time:any     | sync_time:any      | sync_time:(latest) | sync_time:any      |
                */
                it('Case 3 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'aaaa',
                        true
                    ); // give it the latest sync time
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'bbbb',
                        false
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'bbbb',
                        true
                    ); // give it the latest sync time
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        false
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case VM1 will be weighted the highest score
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_1.vmId;

                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(async stub => {
                        Sinon.assert.match(stub.called, true);
                        const record: PrimaryRecord = await stub.args[0][0];
                        Sinon.assert.match(record === null, false);
                        Sinon.assert.match(record.vmId, TEMP_TEST_HCR_1.vmId);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:true   | is-primary:false   | is-primary:false  | is-primary:true    | is-primary:false   | is-primary:false   |
                    | sync_status:null  | sync_status:false  | sync_status:true  | sync_status:null   | sync_status:false  | sync_status:false  |
                    | checksum:aaaa     | checksum:aaaa      | checksum:aaaa     | checksum:bbbb      | checksum:bbbb      | checksum:bbbb      |
                    | sync_time:any     | sync_time:(latest) | sync_time:any     | sync_time:any      | sync_time:any      | sync_time:any      |
                */
                it('Case 4 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        true
                    ); // give it the latest sync time
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        true,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'bbbb',
                        false
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        false
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        false
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case VM1 will be weighted the highest score
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_1.vmId;

                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(async stub => {
                        Sinon.assert.match(stub.called, true);
                        const record: PrimaryRecord = await stub.args[0][0];
                        Sinon.assert.match(record === null, false);
                        Sinon.assert.match(record.vmId, TEMP_TEST_HCR_1.vmId);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:true   | is-primary:false   | is-primary:false  | is-primary:true    | is-primary:false   | is-primary:false   |
                    | sync_status:null  | sync_status:false  | sync_status:false | sync_status:null   | sync_status:false  | sync_status:false  |
                    | checksum:aaaa     | checksum:aaaa      | checksum:bbbb     | checksum:bbbb      | checksum:cccc      | checksum:cccc      |
                    | sync_time:any     | sync_time:any      | sync_time:(latest)| sync_time:any      | sync_time:any      | sync_time:any      |
                */
                it('Case 5 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        true
                    ); // give it the latest sync time
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        true,
                        false,
                        'bbbb',
                        false
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        false
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        false
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case VM4 will be weighted the highest score
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_4.vmId;

                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(stub => {
                        Sinon.assert.match(stub.called, true);
                        const record: PrimaryRecord = stub.args[0][0];
                        Sinon.assert.match(record === null, false);
                        Sinon.assert.match(record.vmId, TEMP_TEST_HCR_4.vmId);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:false  | is-primary:false   | is-primary:false  | is-primary:fals    | is-primary:false   | is-primary:false   |
                    | sync_status:false | sync_status:false  | sync_status:false | sync_status:false  | sync_status:false  | sync_status:false  |
                    | checksum:aaaa     | checksum:aaaa      | checksum:bbbb     | checksum:bbbb      | checksum:cccc      | checksum:cccc      |
                    | sync_time:any     | sync_time:any      | sync_time:(latest)| sync_time:any      | sync_time:any      | sync_time:any      |
                */
                it('Case 6 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        false
                    );
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        true
                    ); // give it the latest sync time
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        false
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        false
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        false
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case VM3 will be weighted the highest score
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_3.vmId;

                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(async stub => {
                        Sinon.assert.match(stub.called, true);
                        const record: PrimaryRecord = await stub.args[0][0];
                        Sinon.assert.match(record === null, false);
                        Sinon.assert.match(record.vmId, TEMP_TEST_HCR_3.vmId);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:false  | is-primary:false   | is-primary:false  | is-primary:fals    | is-primary:false   | is-primary:false   |
                    | sync_status:false | sync_status:false  | sync_status:false | sync_status:false  | sync_status:false  | sync_status:false  |
                    | checksum:null     | checksum:aaaa      | checksum:null     | checksum:null      | checksum:null      | checksum:null      |
                    | sync_time:null    | sync_time:null     | sync_time:null    | sync_time:null     | sync_time:null     | sync_time:null     |
                */
                it('Case 7 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        null
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        null
                    );
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        null
                    );
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        null
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        null
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        null,
                        null
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case VM2 will be weighted the highest score
                    TEMP_ELECTED_PRIMARY_VM.id = TEMP_TEST_HCR_2.vmId;

                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(async stub => {
                        Sinon.assert.match(stub.called, true);
                        const record: PrimaryRecord = await stub.args[0][0];
                        Sinon.assert.match(record === null, false);
                        Sinon.assert.match(record.vmId, TEMP_TEST_HCR_2.vmId);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:false  | is-primary:false   | is-primary:false  | is-primary:fals    | is-primary:false   | is-primary:false   |
                    | sync_status:false | sync_status:false  | sync_status:false | sync_status:false  | sync_status:false  | sync_status:false  |
                    | checksum:aaaa     | checksum:aaaa      | checksum:bbbb     | checksum:bbbb      | checksum:cccc      | checksum:cccc      |
                    | sync_time:null    | sync_time:null     | sync_time:null    | sync_time:null     | sync_time:null     | sync_time:null     |
                */
                it('Case 8 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        null
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        null
                    );
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        null
                    );
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        null
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        null
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        null
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case each VM has the same score so no primary can be determined
                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(stub => {
                        Sinon.assert.match(stub.called, false);
                    });
                    await getStub('pes.result').then(async stub => {
                        const returnValues = await stub.returnValues[0];
                        Sinon.assert.match(returnValues.newPrimary === null, true);
                        Sinon.assert.match(returnValues.newPrimaryRecord === null, true);
                    });
                });
                /**
                 *  | VM1               | VM2                | VM3               | VM4                | VM5                | VM6                |
                    |------------------ |--------------------|-------------------|--------------------|--------------------|--------------------|
                    | is-primary:false  | is-primary:false   | is-primary:false  | is-primary:fals    | is-primary:false   | is-primary:false   |
                    | sync_status:false | sync_status:false  | sync_status:false | sync_status:false  | sync_status:false  | sync_status:false  |
                    | checksum:aaaa     | checksum:bbbb      | checksum:cccc     | checksum:dddd      | checksum:eeee      | checksum:ffff      |
                    | sync_time:null    | sync_time:null     | sync_time:null    | sync_time:null     | sync_time:null     | sync_time:null     |
                */
                it('Case 9 (case detail see code comments)', async function() {
                    // prepare the 6 vm as the table above
                    let i = 0;
                    /* eslint-disable prettier/prettier */
                    TEMP_TEST_HCR_1 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'aaaa',
                        null
                    );
                    TEMP_TEST_HCR_2 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'bbbb',
                        null
                    );
                    TEMP_TEST_HCR_3 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'cccc',
                        null
                    );
                    TEMP_TEST_HCR_4 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'dddd',
                        null
                    );
                    TEMP_TEST_HCR_5 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'eeee',
                        null
                    );
                    TEMP_TEST_HCR_6 = createTestHCR(
                        TEMP_TEST_HCR,
                        `-duplicate-${++i}`,
                        false,
                        false,
                        'ffff',
                        null
                    );
                    /* eslint-enable prettier/prettier */

                    // by the test data of this test case each VM has the same score so no primary can be determined
                    // run autoscale
                    await autoscale.handleHeartbeatSync();

                    // post task verification
                    await getStub('p.updatePrimaryRecord').then(stub => {
                        Sinon.assert.match(stub.called, false);
                    });
                    await getStub('pes.result').then(async stub => {
                        const returnValues = await stub.returnValues[0];
                        Sinon.assert.match(returnValues.newPrimary === null, true);
                        Sinon.assert.match(returnValues.newPrimaryRecord === null, true);
                    });
                });
            }
        );
    });
});
