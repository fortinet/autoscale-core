import { describe, it } from 'mocha';
import * as Sinon from 'sinon';

import { Autoscale } from '../autoscale-core';
import { AutoscaleEnvironment } from '../autoscale-environment';
import { AutoscaleSetting, SettingItem, Settings } from '../autoscale-setting';
import {
    CloudFunctionProxyAdapter,
    CloudFunctionResponseBody,
    LogLevel,
    ReqType
} from '../cloud-function-proxy';
import {
    ConstantIntervalHeartbeatSyncStrategy,
    HeartbeatSyncStrategy,
    MasterElectionStrategy,
    MasterElectionStrategyResult,
    NoopTaggingVmStrategy,
    PreferredGroupMasterElection
} from '../context-strategy/autoscale-context';
import {
    NoopScalingGroupStrategy,
    ScalingGroupStrategy
} from '../context-strategy/scaling-group-context';
import { FortiGateAutoscaleSetting } from '../fortigate-autoscale/fortigate-autoscale-settings';
import {
    HealthCheckRecord,
    HealthCheckResult,
    HealthCheckSyncState,
    MasterElection,
    MasterRecord,
    MasterRecordVoteState
} from '../master-election';
import {
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord,
    PlatformAdapter,
    ResourceTag
} from '../platform-adapter';
import { NetworkInterface, VirtualMachine } from '../virtual-machine';
import { compare } from '../helper-function';
import { AwsFortiGateAutoscaleSetting } from '../fortigate-autoscale/aws/aws-fortigate-autoscale-settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
const TEST_HCR: HealthCheckRecord = {
    vmId: 'fake-test-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    ip: '2',
    masterIp: '3',
    heartbeatInterval: 4,
    heartbeatLossCount: 5,
    nextHeartbeatTime: 6,
    syncState: HealthCheckSyncState.InSync,
    seq: 7,
    healthy: true,
    upToDate: true
};

const TEST_VM: VirtualMachine = {
    id: 'fake-test-vm-id',
    scalingGroupName: 'fake-test-vm-scaling-group-name',
    primaryPrivateIpAddress: '3',
    primaryPublicIpAddress: '4',
    virtualNetworkId: '5',
    subnetId: '6'
};

const TEST_MASTER_RECORD: MasterRecord = {
    id: '1',
    vmId: '2',
    ip: '3',
    scalingGroupName: '4',
    virtualNetworkId: '5',
    subnetId: '6',
    voteEndTime: 7,
    voteState: MasterRecordVoteState.Done
};

const TEST_MASTER_ELECTION: MasterElection = {
    newMaster: TEST_VM,
    newMasterRecord: TEST_MASTER_RECORD,
    candidate: TEST_VM,
    signature: '12345'
};

class TestPlatformAdapter implements PlatformAdapter {
    saveSettingItem(
        key: string,
        value: string,
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<string> {
        throw new Error('Method not implemented.');
    }
    listConfigSet(subDirectory?: string, custom?: boolean): Promise<import('../blob').Blob[]> {
        return Promise.resolve([]);
    }
    listAutoscaleVm(identifyScalingGroup?: boolean, listNic?: boolean): Promise<VirtualMachine[]> {
        throw new Error('Method not implemented.');
    }
    vmEquals(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        throw new Error('Method not implemented.');
    }
    deleteVmFromScalingGroup(vmId: string): Promise<void> {
        throw new Error('Method not implemented.');
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
    updateLicenseUsage(records: LicenseUsageRecord[]): Promise<void> {
        throw new Error('Method not implemented.');
    }
    loadLicenseFileContent(storageContainerName: string, filePath: string): Promise<string> {
        throw new Error('Method not implemented.');
    }
    getReqAsString(): string {
        return 'fake-req-as-string';
    }
    createTime: number = Date.now();
    getReqVmId(): string {
        return 'fake-req-vm-id';
    }
    checkRequestIntegrity(): void {
        throw new Error('Method not implemented.');
    }
    listNicAttachmentRecord(): Promise<import('..').NicAttachmentRecord[]> {
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
    listNetworkInterface(tags: ResourceTag[], status?: string): Promise<NetworkInterface[]> {
        throw new Error('Method not implemented.');
    }
    tagNetworkInterface(nicId: string, tags: ResourceTag[]): Promise<void> {
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
    getReqHeartbeatInterval(): number {
        return 30;
    }
    getSettings(): Promise<Settings> {
        throw new Error('Method not implemented.');
    }
    getTargetVm(): Promise<VirtualMachine> {
        return Promise.resolve(TEST_VM);
    }
    getMasterVm(): Promise<VirtualMachine> {
        throw new Error('Method not implemented.');
    }
    getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord> {
        return Promise.resolve(TEST_HCR);
    }
    getMasterRecord(): Promise<MasterRecord> {
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
        throw new Error('Method not implemented.');
    }
    createMasterRecord(rec: MasterRecord, oldRec: MasterRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
    updateMasterRecord(rec: MasterRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
}

class TestCloudFunctionProxyAdapter implements CloudFunctionProxyAdapter {
    getRequestAsString(): string {
        return 'fake-req-as-string';
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
}

describe('sanity test', () => {
    let p: TestPlatformAdapter;
    let e: AutoscaleEnvironment;
    let x: TestCloudFunctionProxyAdapter;
    let s: Settings;
    let ms: MasterElectionStrategy;
    let hs: HeartbeatSyncStrategy;
    let me: MasterElection;
    let ss: ScalingGroupStrategy;
    let autoscale: Autoscale;
    before(function() {
        p = new TestPlatformAdapter();
        e = {
            targetVm: TEST_VM,
            masterVm: TEST_VM,
            masterRecord: TEST_MASTER_RECORD
        };
        x = new TestCloudFunctionProxyAdapter();
        s = new Map<string, SettingItem>();
        s.set(AutoscaleSetting.MasterElectionTimeout, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatDelayAllowance, new SettingItem('1', '2', '3', true, true));
        s.set(AutoscaleSetting.HeartbeatLossCount, new SettingItem('1', '0', '3', true, true));
        ms = {
            prepare() {
                return Promise.resolve();
            },
            apply() {
                return Promise.resolve(MasterElectionStrategyResult.ShouldContinue);
            },
            result() {
                return Promise.resolve(TEST_MASTER_ELECTION);
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
            targetHealthCheckRecord: TEST_HCR,
            healthCheckResult: HealthCheckResult.OnTime,
            targetVmFirstHeartbeat: true,
            forceOutOfSync() {
                return Promise.resolve(true);
            }
        };
        me = {
            newMaster: TEST_VM,
            newMasterRecord: TEST_MASTER_RECORD,
            candidate: TEST_VM,
            signature: 'test-signature'
        };
        ms = new PreferredGroupMasterElection();
        hs = new ConstantIntervalHeartbeatSyncStrategy();
        ss = new NoopScalingGroupStrategy();
        autoscale = new Autoscale(p, e, x);
        autoscale.setMasterElectionStrategy(ms);
        autoscale.setHeartbeatSyncStrategy(hs);
        autoscale.setScalingGroupStrategy(ss);
        autoscale.setTaggingAutoscaleVmStrategy(new NoopTaggingVmStrategy());
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
        conflictCheck(AwsFortiGateAutoscaleSetting, FortiGateAutoscaleSetting);
    });
    it('handleMasterElection', async () => {
        const stub1 = Sinon.stub(x, 'logAsInfo');
        const stub2 = Sinon.stub(p, 'getSettings').callsFake(() => {
            return Promise.resolve(s);
        });
        const stub3 = Sinon.stub(ms, 'prepare').callsFake((ms1, p1, x1) => {
            Sinon.assert.match(ms1.candidate, TEST_VM);
            Sinon.assert.match(Object.is(p1, p), true);
            Sinon.assert.match(Object.is(x1, x), true);
            return Promise.resolve();
        });
        const stub4 = Sinon.stub(ms, 'apply');
        const stub5 = Sinon.stub(ms, 'result').callsFake(() => {
            return Promise.resolve(TEST_MASTER_ELECTION);
        });
        const stub6 = Sinon.stub(p, 'equalToVm').callsFake((a, b) => {
            Sinon.assert.match(a, TEST_VM);
            Sinon.assert.match(b, TEST_VM);
            return true;
        });
        try {
            const result = await autoscale.handleMasterElection();
            Sinon.assert.match(stub1.called, true);
            Sinon.assert.match(await stub2.returnValues[0], s);
            Sinon.assert.match(stub3.called, true);
            Sinon.assert.match(stub4.notCalled, true);
            Sinon.assert.match(stub5.called, false);
            Sinon.assert.match(stub6.called, false);
            Sinon.assert.match(!result.newMaster, true);
        } catch (error) {
            console.log(error);
            Sinon.assert.fail('should not throw errors.');
        } finally {
            stub1.restore();
            stub2.restore();
            stub3.restore();
            stub4.restore();
            stub5.restore();
            stub6.restore();
        }
    });
    it('handleHeartbeatSync', async () => {
        const stub1 = Sinon.stub(p, 'getHealthCheckRecord').callsFake(input => {
            Sinon.assert.match(Object.is(input, TEST_VM.id), true);
            return Promise.resolve(TEST_HCR);
        });
        const stub2 = Sinon.stub(p, 'getTargetVm');
        const stub3 = Sinon.stub(autoscale, 'handleLaunchingVm').callsFake(() => {
            return Promise.resolve('Sinon.stub.callsFake');
        });

        const stub4 = Sinon.stub(autoscale, 'handleLaunchedVm').callsFake(() => {
            return Promise.resolve('Sinon.stub.callsFake');
        });

        const stub5 = Sinon.stub(p, 'getMasterVm').callsFake(() => {
            return Promise.resolve(TEST_VM);
        });
        const stub6 = Sinon.stub(p, 'getMasterRecord').callsFake(() => {
            return Promise.resolve(TEST_MASTER_RECORD);
        });
        const stub7 = Sinon.stub(autoscale, 'handleMasterElection').callsFake(() => {
            return Promise.resolve(me);
        });
        const stub8 = Sinon.stub(autoscale, 'handleTaggingAutoscaleVm');
        const stub9 = Sinon.stub(p, 'equalToVm').callsFake((a, b) => {
            Sinon.assert.match(a, TEST_VM);
            Sinon.assert.match(b, TEST_VM);
            return true;
        });
        const stub10 = Sinon.stub(p, 'updateHealthCheckRecord').callsFake(hcr => {
            Sinon.assert.match(compare(hcr).isEqualTo(TEST_HCR), true);
            Sinon.assert.match(hcr.vmId, TEST_HCR.vmId);
            Sinon.assert.match(hcr.scalingGroupName, TEST_HCR.scalingGroupName);
            return Promise.resolve();
        });
        const stub11 = Sinon.stub(p, 'getSettings').callsFake(() => {
            return Promise.resolve(s);
        });
        const stub12 = Sinon.stub(p, 'deleteVmFromScalingGroup').callsFake(() => {
            return Promise.resolve();
        });

        try {
            const result = await autoscale.handleHeartbeatSync();
            Sinon.assert.match(compare(await stub1.returnValues[0]).isEqualTo(TEST_HCR), true);
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
        }
    });
});
