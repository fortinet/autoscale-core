import { ExpressionAttributeValueMap } from 'aws-sdk/clients/dynamodb';
import EC2 from 'aws-sdk/clients/ec2';
import path from 'path';
import process from 'process';

import { Settings } from '../../autoscale-setting';
import { Blob } from '../../blob';
import {
    CloudFunctionProxyAdapter,
    LogLevel,
    ReqMethod,
    ReqType
} from '../../cloud-function-proxy';
import { NicAttachmentRecord } from '../../context-strategy/nic-attachment-context';
import { VpnAttachmentContext } from '../../context-strategy/vpn-attachment-context';
import {
    AutoscaleDbItem,
    CreateOrUpdate,
    KeyValue,
    LicenseStockDbItem,
    LicenseUsageDbItem,
    MasterElectionDbItem,
    NicAttachmentDbItem,
    VpnAttachmentDbItem
} from '../../db-definitions';
import {
    genChecksum,
    waitFor,
    WaitForConditionChecker,
    WaitForPromiseEmitter
} from '../../helper-function';
import {
    HealthCheckRecord,
    HealthCheckSyncState,
    MasterRecord,
    MasterRecordVoteState
} from '../../master-election';
import {
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord,
    PlatformAdapter,
    ResourceTag,
    TgwVpnAttachmentRecord
} from '../../platform-adapter';
import { NetworkInterface, VirtualMachine } from '../../virtual-machine';
import { AwsApiGatewayEventProxy, AwsScheduledEventProxy } from './aws-cloud-function-proxy';
import { LifecycleItemDbItem } from './aws-db-definitions';
import * as AwsDBDef from './aws-db-definitions';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsPlatformAdaptee } from './aws-platform-adaptee';
import { JSONable } from 'jsonable';

export const TAG_KEY_RESOURCE_GROUP = 'tag:ResourceGroup';
export const TAG_KEY_AUTOSCALE_ROLE = 'AutoscaleRole';
/**
 * created based on aws ec2 TransitGatewayPropagationState
 */
export enum AwsTgwVpnPropagationState {
    Enabled = 'enabled',
    Enabling = 'enabling',
    Disabled = 'disabled',
    Disabling = 'disabling'
}

export enum AwsVpnAttachmentState {
    Available = 'available',
    Deleting = 'deleting',
    Failed = 'failed',
    Failing = 'failing',
    Initiating = 'initiating',
    Modifying = 'modifying',
    PendingAcceptance = 'pendingAcceptance',
    RollingBack = 'rollingBack',
    Pending = 'pending',
    Rejected = 'rejected',
    Rejecting = 'rejecting'
}

/**
 * To provide AWS Transit Gateway integration related logics
 */
export type TransitGatewayContext = VpnAttachmentContext;
export interface AwsCustomerGateway {
    id: string;
    type: string;
}

export interface AwsVpnConnection {
    vmId: string;
    ip: string;
    vpnConnectionId: string;
    customerGatewayId: string;
    transitGatewayId?: string;
    transitGatewayAttachmentId?: string;
}

export interface AwsDdbOperations {
    Expression: string;
    ExpressionAttributeValues?: ExpressionAttributeValueMap;
    type?: CreateOrUpdate;
}

export enum LifecycleActionResult {
    Continue = 'CONTINUE',
    Abandon = 'ABANDON'
}

export enum LifecyleState {
    Launching = 'launching',
    Launched = 'launched',
    Terminating = 'terminating',
    Terminated = 'terminated'
}

export interface LifecycleItem {
    vmId: string;
    scalingGroupName: string;
    actionResult: LifecycleActionResult;
    actionToken: string;
    hookName: string;
    state: LifecyleState;
    timestamp: number;
}

export class AwsPlatformAdapter implements PlatformAdapter {
    adaptee: AwsPlatformAdaptee;
    proxy: CloudFunctionProxyAdapter;
    settings: Settings;
    readonly createTime: number;
    constructor(p: AwsPlatformAdaptee, proxy: CloudFunctionProxyAdapter, createTime?: number) {
        this.adaptee = p;
        this.proxy = proxy;
        this.createTime = createTime ? createTime : Date.now();
    }
    vmEquals(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        if (!vmA || !vmB) {
            return false;
        } else {
            const equals = (objA: object, objB: object): boolean => {
                const t = Object.keys(objA).filter(prop => {
                    if (objA[prop] instanceof Object && objB[prop] instanceof Object) {
                        return !equals(objA[prop], objB[prop]);
                    } else {
                        return objA[prop] !== objB[prop];
                    }
                });
                return t.length === 0;
            };
            return equals(vmA, vmB);
        }
    }
    async deleteVmFromScalingGroup(vmId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteVmFromScalingGroup');
        try {
            await this.adaptee.terminateInstanceInAutoScalingGroup(vmId);
        } catch (error) {
            this.proxy.logForError('Failed to delele vm from scaling group.', error);
        }
        this.proxy.logAsInfo('called deleteVmFromScalingGroup');
    }

    getRequestType(): Promise<ReqType> {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const reqMethod = this.proxy.getReqMethod();
            if (reqMethod === ReqMethod.GET) {
                const headers = this.proxy.getReqHeaders();
                if (headers['Fos-instance-id'] === null) {
                    throw new Error(
                        'Invalid request. Fos-instance-id is missing in [GET] request header.'
                    );
                } else {
                    return Promise.resolve(ReqType.BootstrapConfig);
                }
            } else if (reqMethod === ReqMethod.POST) {
                const body = this.proxy.getReqBody();
                if (body.status) {
                    return Promise.resolve(ReqType.StatusMessage);
                } else if (body.instance) {
                    return Promise.resolve(ReqType.HeartbeatSync);
                } else {
                    throw new Error(
                        `Invalid request body: [instance: ${body.instance}],` +
                            ` [status: ${body.status}]`
                    );
                }
            } else {
                throw new Error(`Unsupported request method: ${reqMethod}`);
            }
        } else if (this.proxy instanceof AwsScheduledEventProxy) {
            const boby = this.proxy.getReqBody();
            if (boby.source === 'aws.autoscaling') {
                if (boby['detail-type'] === 'EC2 Instance-launch Lifecycle Action') {
                    return Promise.resolve(ReqType.LaunchingVm);
                } else if (boby['detail-type'] === 'EC2 Instance Launch Successful') {
                    return Promise.resolve(ReqType.LaunchedVm);
                } else if (boby['detail-type'] === 'EC2 Instance-terminate Lifecycle Action') {
                    return Promise.resolve(ReqType.TerminatingVm);
                } else if (boby['detail-type'] === 'EC2 Instance Terminate Successful') {
                    return Promise.resolve(ReqType.TerminatedVm);
                } else {
                    throw new Error(
                        'Invalid request. ' +
                            `Unsupported request detail-type: [${boby['detail-type']}]`
                    );
                }
            }
            throw new Error(`Unknown supported source: [${boby.source}]`);
        } else {
            throw new Error('Unsupported CloudFunctionProxy.');
        }
    }
    async init(): Promise<void> {
        this.settings = await this.adaptee.loadSettings();
        await this.validateSettings();
    }
    getReqVmId(): string {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const reqMethod = this.proxy.getReqMethod();
            if (reqMethod === ReqMethod.GET) {
                const headers = this.proxy.getReqHeaders();
                return headers['Fos-instance-id'] as string;
            } else if (reqMethod === ReqMethod.POST) {
                const body = this.proxy.getReqBody();
                return body.instance as string;
            } else {
                throw new Error(`Cannot get vm id in unknown request method: ${reqMethod}`);
            }
        } else if (this.proxy instanceof AwsScheduledEventProxy) {
            const body = this.proxy.getReqBody();
            if (body.source === 'aws.autoscaling') {
                return body.detail.EC2InstanceId;
            } else {
                throw new Error(`Cannot get vm id in unknown request: ${JSON.stringify(body)}`);
            }
        } else {
            throw new Error('Cannot get vm id in unknown request.');
        }
    }
    getReqHeartbeatInterval(): number {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const body = this.proxy.getReqBody();
            return (body.interval && Number(body.interval)) || NaN;
        } else {
            return NaN;
        }
    }
    getReqAsString(): string {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            return JSON.stringify(this.proxy.request);
        } else if (this.proxy instanceof AwsScheduledEventProxy) {
            return JSON.stringify(this.proxy.request);
        } else {
            throw new Error('Unknown request.');
        }
    }
    getSettings(): Promise<Settings> {
        return Promise.resolve(this.settings);
    }

    validateSettings(): Promise<boolean> {
        const required = [
            AwsFortiGateAutoscaleSetting.AutoscaleHandlerUrl,
            AwsFortiGateAutoscaleSetting.FortiGatePskSecret,
            AwsFortiGateAutoscaleSetting.FortiGateSyncInterface,
            AwsFortiGateAutoscaleSetting.FortiGateTrafficPort,
            AwsFortiGateAutoscaleSetting.FortiGateAdminPort,
            AwsFortiGateAutoscaleSetting.FortiGateInternalElbDns,
            AwsFortiGateAutoscaleSetting.HeartbeatInterval,
            AwsFortiGateAutoscaleSetting.ByolScalingGroupName,
            AwsFortiGateAutoscaleSetting.PaygScalingGroupName
        ];
        const missingKeys = required.filter(key => !this.settings.has(key)).join(', ');
        if (missingKeys) {
            throw new Error(`The following required setting item not found: ${missingKeys}`);
        }
        return Promise.resolve(true);
    }

    protected instanceToVm(
        instance: EC2.Instance,
        scalingGroupName: string,
        enis?: EC2.NetworkInterface[]
    ): VirtualMachine {
        const vm: VirtualMachine = {
            id: instance.InstanceId,
            scalingGroupName: scalingGroupName,
            primaryPrivateIpAddress: instance.PrivateIpAddress,
            primaryPublicIpAddress: instance.PublicIpAddress || undefined,
            virtualNetworkId: instance.VpcId,
            subnetId: instance.SubnetId,
            securityGroups: instance.SecurityGroups.map(group => {
                return {
                    id: group.GroupId,
                    name: group.GroupName
                };
            }),
            networkInterfaces: (enis && enis.map(this.eniToNic)) || undefined,
            networkInterfaceIds: instance.NetworkInterfaces.map(eni => eni.NetworkInterfaceId),
            sourceData: {}
        };
        Object.assign(vm.sourceData, instance);
        return vm;
    }

    protected eniToNic(eni: EC2.NetworkInterface): NetworkInterface {
        const nic: NetworkInterface = {
            id: eni.NetworkInterfaceId,
            privateIpAddress: eni.PrivateIpAddress,
            subnetId: eni.SubnetId,
            virtualNetworkId: eni.VpcId,
            attachmentId: (eni.Attachment && eni.Attachment.AttachmentId) || undefined,
            description: eni.Description
        };
        return nic;
    }

    async getTargetVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getTargetVm');
        const instance = await this.adaptee.describeInstance(this.getReqVmId());
        const byolGroupName = this.settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupName)
            .value;
        const paygGroupName = this.settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupName)
            .value;
        const scalingGroups = await this.adaptee.describeAutoScalingGroups([
            byolGroupName,
            paygGroupName
        ]);
        // get scaling group name
        // ASSERT: the instance can only locate in 1 scaling group
        const [scalingGroupName] = scalingGroups
            .filter(group => {
                return (
                    group.Instances.filter(ins => ins.InstanceId === instance.InstanceId).length > 0
                );
            })
            .map(group => group.AutoScalingGroupName);
        const vm = this.instanceToVm(instance, scalingGroupName, instance.NetworkInterfaces);
        this.proxy.logAsInfo('called getTargetVm');
        return vm;
    }
    async getMasterVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getMasterVm');
        const masterRecord = await this.getMasterRecord();
        if (!masterRecord) {
            return null;
        }
        const instance = await this.adaptee.describeInstance(masterRecord.vmId);
        const vm = this.instanceToVm(
            instance,
            masterRecord.scalingGroupName,
            instance.NetworkInterfaces
        );
        this.proxy.logAsInfo('called getMasterVm');
        return vm;
    }

    async listAutoscaleVm(
        identifyScalingGroup?: boolean,
        listNic?: boolean
    ): Promise<VirtualMachine[]> {
        this.proxy.logAsInfo('calling listAutoscaleVm');
        const tag: ResourceTag = {
            key: TAG_KEY_RESOURCE_GROUP,
            value: this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
        };
        const instances = await this.adaptee.listInstancesByTags([tag]);
        let scalingGroupMap = new Map<string, string>();
        if (identifyScalingGroup) {
            scalingGroupMap = await this.adaptee.identifyInstanceScalingGroup(
                instances.map(instance => instance.InstanceId)
            );
        }
        const nicMap = new Map<string, EC2.NetworkInterface[]>();
        if (listNic) {
            await Promise.all(
                instances.map(async instance => {
                    const nics = await this.adaptee.listNetworkInterfacesByInstanceId(
                        instance.InstanceId
                    );
                    nicMap.set(instance.InstanceId, nics);
                })
            );
        }
        this.proxy.logAsInfo('called listAutoscaleVm');
        const vms: VirtualMachine[] = instances.map(instance => {
            return this.instanceToVm(
                instance,
                scalingGroupMap.get(instance.InstanceId),
                nicMap.get(instance.InstanceId)
            );
        });
        return vms;
    }

    async listMasterRoleVmId(): Promise<string[]> {
        const tags: ResourceTag[] = [];
        // list vm with resource group tag
        tags.push({
            key: TAG_KEY_RESOURCE_GROUP,
            value: this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
        });
        // list vm with autoscale role tag
        tags.push({
            key: TAG_KEY_AUTOSCALE_ROLE,
            value: 'master'
        });
        const instances = await this.adaptee.listInstancesByTags(tags);
        return instances.map(instance => instance.InstanceId);
    }

    async getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord> {
        this.proxy.logAsInfo('calling getHealthCheckRecord');
        const table = new AwsDBDef.AwsAutoscale(process.env.RESOURCE_TAG_PREFIX || '');
        const dbItem = await this.adaptee.getItemFromDb<AutoscaleDbItem>(table, [
            {
                key: table.primaryKey.name,
                value: vmId
            }
        ]);

        let record: HealthCheckRecord;

        if (dbItem) {
            // if heartbeatDelay is <= 0, it means hb arrives early or ontime
            const heartbeatDelay =
                this.createTime -
                dbItem.nextHeartBeatTime -
                Number(
                    this.settings.get(AwsFortiGateAutoscaleSetting.HeartbeatDelayAllowance).value
                );

            const maxHeartbeatLossCount = Number(
                this.settings.get(AwsFortiGateAutoscaleSetting.HeartbeatLossCount).value
            );

            const [syncState] = Object.entries(HealthCheckSyncState)
                .filter(([, value]) => {
                    return dbItem.syncState === value;
                })
                .map(([, v]) => v);

            const nextHeartbeatLossCount =
                dbItem.heartBeatLossCount + ((heartbeatDelay > 0 && 1) || 0);

            // healthy reason: next heartbeat loss count is smaller than max allowed value.
            const isHealthy = nextHeartbeatLossCount < maxHeartbeatLossCount;

            record = {
                vmId: vmId,
                scalingGroupName: dbItem.scalingGroupName,
                ip: dbItem.ip,
                masterIp: dbItem.masterIp,
                heartbeatInterval: dbItem.heartBeatInterval,
                heartbeatLossCount: dbItem.heartBeatLossCount,
                nextHeartbeatTime: dbItem.nextHeartBeatTime,
                syncState: syncState,
                seq: dbItem.seq,
                healthy: isHealthy,
                upToDate: true
            };
        }
        this.proxy.logAsInfo('called getHealthCheckRecord');
        return record;
    }
    async getMasterRecord(filters?: KeyValue[]): Promise<MasterRecord> {
        this.proxy.logAsInfo('calling getMasterRecord');
        const table = new AwsDBDef.AwsMasterElection(process.env.RESOURCE_TAG_PREFIX || '');
        const filterExp: AwsDdbOperations = {
            Expression: ''
        };
        if (filters) {
            filterExp.Expression = filters.map(kv => `${kv.key} = :${kv.value}`).join(' AND ');
        }
        // ASSERT: there's only 1 matching master record or no matching record.
        const [record] = await this.adaptee.listItemFromDb<MasterElectionDbItem>(table, filterExp);
        let masterRecord: MasterRecord;
        if (record) {
            const [voteState] = Object.entries(MasterRecordVoteState)
                .filter(([, value]) => {
                    return record.voteState === value;
                })
                .map(([, v]) => v);
            const voteTimedOut =
                voteState !== MasterRecordVoteState.Done && Number(record.voteEndTime) < Date.now();
            masterRecord = {
                id: record.id,
                vmId: record.vmId,
                ip: record.ip,
                scalingGroupName: record.scalingGroupName,
                virtualNetworkId: record.virtualNetworkId,
                subnetId: record.subnetId,
                voteEndTime: Number(record.voteEndTime),
                voteState: (voteTimedOut && MasterRecordVoteState.Timeout) || voteState
            };
        }

        this.proxy.logAsInfo('called getMasterRecord');
        return masterRecord;
    }
    equalToVm(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        if (!(vmA && vmB) || JSON.stringify(vmA) !== JSON.stringify(vmB)) {
            return false;
        } else {
            return true;
        }
    }
    async createHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        this.proxy.logAsInfo('calling createHealthCheckRecord');
        const table = new AwsDBDef.AwsAutoscale(process.env.RESOURCE_TAG_PREFIX || '');
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item: AutoscaleDbItem = {
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            masterIp: rec.masterIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            seq: rec.seq
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.CreateOrReplace
        };
        await this.adaptee.saveItemToDb<AutoscaleDbItem>(table, item, conditionExp);
        this.proxy.logAsInfo('called createHealthCheckRecord');
    }
    async updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        this.proxy.logAsInfo('calling updateHealthCheckRecord');
        const table = new AwsDBDef.AwsAutoscale(process.env.RESOURCE_TAG_PREFIX || '');
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item: AutoscaleDbItem = {
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            masterIp: rec.masterIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            seq: rec.seq
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.UpdateExisting
        };
        await this.adaptee.saveItemToDb<AutoscaleDbItem>(table, item, conditionExp);
        this.proxy.logAsInfo('called updateHealthCheckRecord');
    }
    async createMasterRecord(rec: MasterRecord, oldRec: MasterRecord | null): Promise<void> {
        this.proxy.log('calling createMasterRecord.', LogLevel.Log);
        try {
            const table = new AwsDBDef.AwsMasterElection(process.env.RESOURCE_TAG_PREFIX || '');
            const item: MasterElectionDbItem = {
                id: rec.id,
                scalingGroupName: rec.scalingGroupName,
                ip: rec.ip,
                vmId: rec.vmId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: rec.voteEndTime,
                voteState: rec.voteState
            };
            // save record only if record for a certain scaling group name not exists, or
            // if it exists but timeout
            const conditionExp: AwsDdbOperations = {
                Expression: 'attribute_not_exists(scalingGroupName)',
                type: CreateOrUpdate.CreateOrReplace
            };
            if (oldRec) {
                conditionExp.Expression =
                    `${conditionExp.Expression} OR ` +
                    `attribute_exists(scalingGroupName) AND id = '${oldRec.id}'`;
            }

            await this.adaptee.saveItemToDb<MasterElectionDbItem>(table, item, conditionExp);
            this.proxy.log('called createMasterRecord.', LogLevel.Log);
        } catch (error) {
            this.proxy.logForError('called createMasterRecord.', error);
            throw error;
        }
    }
    async updateMasterRecord(rec: MasterRecord): Promise<void> {
        this.proxy.log('calling updateMasterRecord.', LogLevel.Log);
        try {
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsMasterElection(
                settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: MasterElectionDbItem = {
                id: rec.id,
                scalingGroupName: rec.scalingGroupName,
                ip: rec.ip,
                vmId: rec.vmId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: rec.voteEndTime,
                voteState: rec.voteState
            };
            // save record only if the keys in rec match the keys in db
            const conditionExp: AwsDdbOperations = {
                Expression:
                    'attribute_not_exists(scalingGroupName) OR ' +
                    'attribute_exists(scalingGroupName) AND ' +
                    `voteState = '${MasterRecordVoteState.Pending}' AND ` +
                    `voteEndTime < ${item.voteEndTime}`
            };
            await this.adaptee.saveItemToDb<MasterElectionDbItem>(table, item, conditionExp);
            this.proxy.log('called updateMasterRecord.', LogLevel.Log);
        } catch (error) {
            this.proxy.logForError('called updateMasterRecord.', error);
            throw error;
        }
    }
    async loadConfigSet(name: string, custom?: boolean): Promise<string> {
        this.proxy.logAsInfo(`loading${custom ? ' (custom)' : ''} configset: ${name}`);
        const bucket = custom
            ? this.settings.get(AwsFortiGateAutoscaleSetting.CustomAssetContainer).value
            : this.settings.get(AwsFortiGateAutoscaleSetting.AssetStorageContainer).value;
        const keyPrefix = [
            custom
                ? this.settings.get(AwsFortiGateAutoscaleSetting.CustomAssetDirectory).value
                : this.settings.get(AwsFortiGateAutoscaleSetting.AssetStorageDirectory).value,
            'configset'
        ];
        keyPrefix.push(name);
        const content = await this.adaptee.getS3ObjectContent(bucket, path.join(...keyPrefix));
        this.proxy.logAsInfo('configset loaded.');
        return content;
    }
    async listLicenseFiles(
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<LicenseFile[]> {
        const blobs: Blob[] = await this.adaptee.listS3Object(
            storageContainerName,
            licenseDirectoryName
        );
        return await Promise.all(
            blobs.map(async blob => {
                const filePath = path.join(licenseDirectoryName, blob.fileName);
                const content = await this.adaptee.getS3ObjectContent(
                    storageContainerName,
                    filePath
                );
                const algorithm = 'sha256';
                const licenseFile: LicenseFile = {
                    fileName: blob.fileName,
                    checksum: genChecksum(blob.content, algorithm),
                    algorithm: algorithm,
                    content: content
                };
                return licenseFile;
            })
        );
    }

    async listLicenseStock(productName: string): Promise<LicenseStockRecord[]> {
        this.proxy.logAsInfo('calling listLicenseStock');
        const table = new AwsDBDef.AwsLicenseStock(
            this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const dbItems = await this.adaptee.listItemFromDb<LicenseStockDbItem>(table);
        const mapItems = dbItems
            .filter(item => item.productName === productName)
            .map(item => {
                return {
                    fileName: item.fileName,
                    checksum: item.checksum,
                    algorithm: item.algorithm
                } as LicenseStockRecord;
            });
        this.proxy.logAsInfo('called listLicenseStock');
        return mapItems;
    }
    async listLicenseUsage(productName: string): Promise<LicenseUsageRecord[]> {
        this.proxy.logAsInfo('calling listLicenseUsage');
        const table = new AwsDBDef.AwsLicenseUsage(
            this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const dbItems = await this.adaptee.listItemFromDb<LicenseUsageDbItem>(table);
        const mapItems = dbItems
            .filter(item => item.productName === productName)
            .map(item => {
                return {
                    fileName: item.fileName,
                    checksum: item.checksum,
                    algorithm: item.algorithm,
                    vmId: item.vmId,
                    scalingGroupName: item.scalingGroupName,
                    assignedTime: item.assignedTime,
                    vmInSync: item.vmInSync
                } as LicenseUsageRecord;
            });
        this.proxy.logAsInfo('called listLicenseUsage');
        return mapItems;
    }
    async updateLicenseStock(records: LicenseStockRecord[]): Promise<void> {
        this.proxy.logAsInfo('calling updateLicenseStock');
        const table = new AwsDBDef.AwsLicenseStock(
            this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const items = new Map<string, LicenseStockDbItem>(
            (await this.adaptee.listItemFromDb<LicenseStockDbItem>(table)).map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        await Promise.all(
            records.map(record => {
                const item: LicenseStockDbItem = {
                    checksum: record.checksum,
                    algorithm: record.algorithm,
                    fileName: record.fileName,
                    productName: record.productName
                };
                const conditionExp: AwsDdbOperations = {
                    Expression: ''
                };
                let typeText: string;
                // recrod exisit, update it
                if (items.has(record.checksum)) {
                    conditionExp.type = CreateOrUpdate.UpdateExisting;
                    typeText =
                        `update existing item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                } else {
                    conditionExp.type = CreateOrUpdate.CreateOrReplace;
                    typeText =
                        `create new item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                }
                return this.adaptee
                    .saveItemToDb<LicenseStockDbItem>(table, item, conditionExp)
                    .catch(err => {
                        this.proxy.logForError(`Failed to ${typeText}.`, err);
                        errorCount++;
                    });
            })
        );
        if (errorCount > 0) {
            this.proxy.logAsInfo('called updateLicenseStock');

            throw new Error('updateLicenseStock unsuccessfully.');
        }
        this.proxy.logAsInfo('called updateLicenseStock');
    }
    async updateLicenseUsage(records: LicenseUsageRecord[]): Promise<void> {
        this.proxy.logAsInfo('calling updateLicenseUsage');
        const table = new AwsDBDef.AwsLicenseUsage(
            this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const items = new Map<string, LicenseUsageDbItem>(
            (await this.adaptee.listItemFromDb<LicenseUsageDbItem>(table)).map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        await Promise.all(
            records.map(record => {
                const item: LicenseUsageDbItem = {
                    checksum: record.checksum,
                    algorithm: record.algorithm,
                    fileName: record.fileName,
                    productName: record.productName,
                    vmId: record.vmId,
                    scalingGroupName: record.scalingGroupName,
                    assignedTime: record.assignedTime,
                    vmInSync: record.vmInSync
                };
                const conditionExp: AwsDdbOperations = {
                    Expression: ''
                };
                let typeText: string;
                // recrod exisit, update it
                if (items.has(record.checksum)) {
                    conditionExp.type = CreateOrUpdate.UpdateExisting;
                    typeText =
                        `update existing item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                } else {
                    conditionExp.type = CreateOrUpdate.CreateOrReplace;
                    typeText =
                        `create new item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                }
                return this.adaptee
                    .saveItemToDb<LicenseUsageDbItem>(table, item, conditionExp)
                    .catch(err => {
                        this.proxy.logForError(`Failed to ${typeText}.`, err);
                        errorCount++;
                    });
            })
        );
        if (errorCount > 0) {
            this.proxy.logAsInfo('called updateLicenseUsage');

            throw new Error('updateLicenseUsage unsuccessfully.');
        }
        this.proxy.logAsInfo('called updateLicenseUsage');
    }
    async loadLicenseFileContent(storageContainerName: string, filePath: string): Promise<string> {
        this.proxy.logAsInfo('calling loadLicenseFileContent');
        const content = await this.adaptee.getS3ObjectContent(storageContainerName, filePath);
        this.proxy.logAsInfo('called loadLicenseFileContent');
        return content;
    }

    async listNicAttachmentRecord(): Promise<NicAttachmentRecord[]> {
        this.proxy.logAsInfo('calling listNicAttachmentRecord');
        const table = new AwsDBDef.AwsNicAttachment(
            this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const records = await this.adaptee.listItemFromDb<NicAttachmentDbItem>(table);
        const nicRecords: NicAttachmentRecord[] =
            records.map(record => {
                return {
                    vmId: record.vmId,
                    nicId: record.nicId,
                    attachmentState: record.attachmentState
                } as NicAttachmentRecord;
            }) || [];
        this.proxy.logAsInfo(`listed ${nicRecords.length} records.`);
        this.proxy.logAsInfo('called listNicAttachmentRecord');
        return nicRecords;
    }
    async updateNicAttachmentRecord(vmId: string, nicId: string, status: string): Promise<void> {
        this.proxy.logAsInfo('calling updateNicAttachmentRecord');
        try {
            const table = new AwsDBDef.AwsNicAttachment(
                this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: NicAttachmentDbItem = {
                vmId: vmId,
                nicId: nicId,
                attachmentState: status
            };
            const conditionExp: AwsDdbOperations = {
                Expression: '',
                type: CreateOrUpdate.UpdateExisting
            };
            await this.adaptee.saveItemToDb<NicAttachmentDbItem>(table, item, conditionExp);
        } catch (error) {
            this.proxy.logAsError('cannot update nic attachment record');
            throw error;
        }
        this.proxy.logAsInfo('called updateNicAttachmentRecord');
    }

    async deleteNicAttachmentRecord(vmId: string, nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteNicAttachmentRecord');
        try {
            const table = new AwsDBDef.AwsNicAttachment(
                this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: NicAttachmentDbItem = {
                vmId: vmId,
                nicId: nicId,
                attachmentState: undefined // non key attribute can set to undefined
            };
            await this.adaptee.deleteItemFromDb<NicAttachmentDbItem>(table, item);
        } catch (error) {
            this.proxy.logAsError('cannot delete nic attachment record');
            throw error;
        }
        this.proxy.logAsInfo('called deleteNicAttachmentRecord');
    }
    async createNetworkInterface(
        subnetId?: string,
        description?: string,
        securityGroups?: string[],
        privateIpAddress?: string
    ): Promise<NetworkInterface | null> {
        this.proxy.logAsInfo('calling createNetworkInterface');

        const nic = await this.adaptee.createNetworkInterface(
            subnetId,
            description,
            securityGroups,
            privateIpAddress
        );
        this.proxy.logAsInfo('called createNetworkInterface');
        return {
            id: nic.NetworkInterfaceId,
            privateIpAddress: nic.PrivateIpAddress,
            subnetId: nic.SubnetId,
            virtualNetworkId: nic.VpcId,
            attachmentId: (nic.Attachment && nic.Attachment.AttachmentId) || undefined,
            description: nic.Description
        };
    }
    async deleteNetworkInterface(nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteNetworkInterface');
        const nic = await this.adaptee.describeNetworkInterface(nicId);
        if (nic) {
            if (nic.Status !== 'available') {
                this.proxy.logAsError(
                    `nic (id: ${nicId}) is in ${nic.Status} state.` +
                        "It can be deleted only when in 'available' state."
                );
                throw new Error("cannot delete nic not in 'available' state.");
            }
        }
        await this.adaptee.deleteNetworkInterface(nicId);
        this.proxy.logAsInfo('called deleteNetworkInterface');
    }

    async attachNetworkInterface(vmId: string, nicId: string, index?: number): Promise<void> {
        this.proxy.logAsInfo('calling attachNetworkInterface');
        if (!vmId) {
            throw new Error('Invalid vmId.');
        }
        if (!nicId) {
            throw new Error('Invalid nicId.');
        }
        // attach nic
        const eni = await this.adaptee.describeNetworkInterface(nicId);
        // eni is able to attach
        if (['available', 'attaching', 'pending'].includes(eni.Status)) {
            // not attaching yet? attach it.
            if (eni.Status === 'available') {
                await this.adaptee.attachNetworkInterface(
                    vmId,
                    nicId,
                    index && index > 0 ? index : 0
                );
            }
            // wait for its state to become attached
            const emitter: WaitForPromiseEmitter<EC2.NetworkInterface> = () => {
                return this.adaptee.describeNetworkInterface(nicId);
            };
            const checker: WaitForConditionChecker<EC2.NetworkInterface> = (nic, callCount) => {
                if (callCount > 12) {
                    throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
                }
                if (nic.Status === 'attached') {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            };
            await waitFor<EC2.NetworkInterface>(emitter, checker, 5000, this.proxy);
        } else if (eni.Status !== 'attached') {
            throw new Error(
                `nic (id: ${nicId}) is in state '${eni.Status}'` + ' which cannot perform attaching'
            );
        }
        this.proxy.logAsInfo('called attachNetworkInterface');
    }
    async detachNetworkInterface(vmId: string, nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling detachNetworkInterface');
        if (!vmId) {
            throw new Error('Invalid vmId.');
        }
        if (!nicId) {
            throw new Error('Invalid nicId.');
        }
        // detach nic
        const eni = await this.adaptee.describeNetworkInterface(nicId);
        // eni is able to detach
        if (eni.Status === 'in-use' || eni.Status === 'detaching') {
            // not detaching yet? detach it.
            if (eni.Status === 'in-use') {
                await this.adaptee.detachNetworkInterface(vmId, nicId);
            }
            // wait for its state to become detached
            const emitter: WaitForPromiseEmitter<EC2.NetworkInterface> = () => {
                return this.adaptee.describeNetworkInterface(nicId);
            };
            const checker: WaitForConditionChecker<EC2.NetworkInterface> = (nic, callCount) => {
                if (callCount > 12) {
                    throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
                }
                if (nic.Status === 'available') {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            };
            await waitFor<EC2.NetworkInterface>(emitter, checker, 5000, this.proxy);
        } else if (eni.Status !== 'available') {
            throw new Error(
                `nic (id: ${nicId}) is in state '${eni.Status}'` + ' which cannot perform detaching'
            );
        }
        this.proxy.logAsInfo('called detachNetworkInterface');
    }
    async listNetworkInterface(tags: ResourceTag[], status?: string): Promise<NetworkInterface[]> {
        this.proxy.logAsInfo('calling listNetworkInterface');
        const enis = await this.adaptee.listNetworkInterfacesByTags(tags);
        const nics: NetworkInterface[] = enis
            .filter(e => status === undefined || e.Status === status)
            .map(eni => {
                const nic: NetworkInterface = {
                    id: eni.NetworkInterfaceId,
                    privateIpAddress: eni.PrivateIpAddress,
                    subnetId: eni.SubnetId,
                    virtualNetworkId: eni.VpcId,
                    attachmentId: (eni.Attachment && eni.Attachment.AttachmentId) || undefined,
                    description: eni.Description
                };
                return nic;
            });
        this.proxy.logAsInfo('called listNetworkInterface');
        return nics;
    }

    async tagNetworkInterface(nicId: string, tags: ResourceTag[]): Promise<void> {
        this.proxy.logAsInfo('calling tagNetworkInterface');
        await this.adaptee.tagResource([nicId], tags);
        this.proxy.logAsInfo('called tagNetworkInterface');
    }

    async updateVmSourceDestinationChecking(vmId: string, enable?: boolean): Promise<void> {
        this.proxy.logAsInfo('calling updateVmSourceDestinationChecking');
        await this.adaptee.updateInstanceSrcDestChecking(vmId, enable);
        this.proxy.logAsInfo('called updateVmSourceDestinationChecking');
    }
    async loadBalancerAttachVm(elbId: string, vmIds: string[]): Promise<void> {
        this.proxy.logAsInfo('calling loadBalancerAttachVm');
        await this.adaptee.elbRegisterTargets(elbId, vmIds);
        this.proxy.logAsInfo('called loadBalancerAttachVm');
    }

    async loadBalancerDetachVm(elbId: string, vmIds: string[]): Promise<void> {
        this.proxy.logAsInfo('calling loadBalancerDetachVm');
        await this.adaptee.elbDeregisterTargets(elbId, vmIds);
        this.proxy.logAsInfo('called loadBalancerDetachVm');
    }

    extractLifecycleItemFromRequest(object: { [key: string]: unknown }): LifecycleItem {
        const actionResultString: string =
            (object.LifecycleActionResult && (object.LifecycleActionResult as string)) || undefined;
        const [actionResult] = Object.entries(LifecycleActionResult)
            .filter(([, value]) => {
                return actionResultString === value;
            })
            .map(([, v]) => v);
        const lifecycleItem: LifecycleItem = {
            vmId: '',
            scalingGroupName:
                (object.AutoScalingGroupName && (object.AutoScalingGroupName as string)) ||
                undefined,
            actionResult: actionResult,
            actionToken:
                (object.LifecycleActionToken && (object.LifecycleActionToken as string)) ||
                undefined,
            hookName:
                (object.LifecycleHookName && (object.LifecycleHookName as string)) || undefined,
            state: undefined,
            timestamp: Date.now()
        };
        return lifecycleItem;
    }

    async getLifecycleItem(vmId: string): Promise<LifecycleItem | null> {
        this.proxy.logAsInfo('calling getLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        const dbItem = await this.adaptee.getItemFromDb<LifecycleItemDbItem>(table, [
            {
                key: table.primaryKey.name,
                value: vmId
            }
        ]);
        const [actionResult] = Object.entries(LifecycleActionResult)
            .filter(([, value]) => {
                return dbItem.actionResult === value;
            })
            .map(([, v]) => v);
        const [state] = Object.entries(LifecyleState)
            .filter(([, value]) => {
                return dbItem.state === value;
            })
            .map(([, v]) => v);
        const lifecycleItem: LifecycleItem = {
            vmId: dbItem.vmId,
            scalingGroupName: dbItem.scalingGroupName,
            actionResult: actionResult,
            actionToken: dbItem.actionToken,
            hookName: dbItem.hookName,
            state: state,
            timestamp: dbItem.timestamp
        };
        this.proxy.logAsInfo('called getLifecycleItem');
        return lifecycleItem;
    }
    async createLifecycleItem(item: LifecycleItem): Promise<void> {
        this.proxy.logAsInfo('calling createLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        // ASSERT: item is vliad
        const dbItem: LifecycleItemDbItem = {
            vmId: item.vmId,
            scalingGroupName: item.scalingGroupName,
            actionResult: item.actionResult,
            actionToken: item.actionToken,
            hookName: item.hookName,
            state: item.state,
            timestamp: item.timestamp
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.CreateOrReplace
        };
        await this.adaptee.saveItemToDb<LifecycleItemDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called createLifecycleItem');
    }
    async updateLifecycleItem(item: LifecycleItem): Promise<void> {
        this.proxy.logAsInfo('calling updateLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        // ASSERT: item is vliad
        const dbItem: LifecycleItemDbItem = {
            vmId: item.vmId,
            scalingGroupName: item.scalingGroupName,
            actionResult: item.actionResult,
            actionToken: item.actionToken,
            hookName: item.hookName,
            state: item.state,
            timestamp: item.timestamp
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.UpdateExisting
        };
        await this.adaptee.saveItemToDb<LifecycleItemDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called updateLifecycleItem');
    }
    async deleteLifecycleItem(vmId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        const item: LifecycleItemDbItem = {
            vmId: vmId,
            // the value of the properties below aren't used.
            scalingGroupName: '',
            actionResult: '',
            actionToken: '',
            hookName: '',
            state: '',
            timestamp: 0
        };
        await this.adaptee.deleteItemFromDb(table, item);
        this.proxy.logAsInfo('called deleteLifecycleItem');
    }
    async completeLifecycleAction(item: LifecycleItem, success?: boolean): Promise<void> {
        this.proxy.logAsInfo('calling completeLifecycleAction');
        // ASSERT: item is correctly constructed.
        if (success) {
            item.actionResult = LifecycleActionResult.Continue;
        } else {
            item.actionResult = LifecycleActionResult.Abandon;
        }
        await this.adaptee.completeLifecycleAction(
            item.scalingGroupName,
            item.actionResult,
            item.actionToken,
            item.hookName
        );
        this.proxy.logAsInfo('called completeLifecycleAction');
    }

    /**
     * create an AWS Customer Gateway with BGP support.
     *
     * @param {number} bgpAsn the BGP ASN (range: [1-65534])
     * @param {string} publicIpv4 the public IP (v4) address to be used
     * @param {string} deviceName the customer gateway name
     * @returns {Promise<string>} the resource id of created customer gatewy.
     */
    async createAwsCustomerGateway(
        bgpAsn: number,
        publicIpv4: string,
        deviceName: string
    ): Promise<string> {
        this.proxy.logAsInfo('calling createAwsCustomerGateway');
        const customerGateway = await this.adaptee.createCustomerGateway(
            'ipsec.1',
            bgpAsn,
            publicIpv4,
            deviceName
        );
        this.proxy.logAsInfo('called createAwsCustomerGateway');
        return customerGateway.CustomerGatewayId;
    }

    async deleteAwsCustomerGateway(customerGatewayId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteAwsCustomerGateway');
        await this.adaptee.deleteCustomerGateway(customerGatewayId);
        this.proxy.logAsInfo('called deleteAwsCustomerGateway');
    }

    async createAwsTgwVpnConnection(
        bgpAsn: number,
        publicIpv4: string,
        customerGatewayId: string,
        transitGatewayId: string
    ): Promise<AwsVpnConnection> {
        this.proxy.logAsInfo('calling createAwsTgwVpnConnection');
        const vpnConnection = await this.adaptee.createVpnConnection(
            'ipsec.1',
            bgpAsn,
            customerGatewayId,
            false,
            null,
            transitGatewayId
        );
        // describe the tgw attachment and wait for it to become available
        const emitter: WaitForPromiseEmitter<EC2.TransitGatewayAttachment | null> = () => {
            return this.adaptee.describeTransitGatewayAttachment(
                transitGatewayId,
                vpnConnection.VpnConnectionId
            );
        };
        const checker: WaitForConditionChecker<EC2.TransitGatewayAttachment | null> = (
            attachment,
            callCount
        ) => {
            if (callCount > 12) {
                throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
            }
            if (!attachment) {
                return Promise.resolve(false);
            } else {
                return Promise.resolve(true);
            }
        };
        const tgwAttachment = await waitFor<EC2.TransitGatewayAttachment | null>(
            emitter,
            checker,
            5000,
            this.proxy
        );
        this.proxy.logAsInfo('called createAwsTgwVpnConnection');
        return {
            vmId: '', // cannot be known in this method
            ip: publicIpv4,
            vpnConnectionId: vpnConnection.VpnConnectionId,
            customerGatewayId: vpnConnection.CustomerGatewayId,
            transitGatewayId: tgwAttachment.TransitGatewayId,
            transitGatewayAttachmentId: tgwAttachment.TransitGatewayAttachmentId
        } as AwsVpnConnection;
    }

    async deleteAwsVpnConnection(vpnConnectionId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteAwsVpnConnection.');
        await this.adaptee.deleteVpnConnection(vpnConnectionId);
        this.proxy.logAsInfo('called deleteAwsVpnConnection.');
    }

    async getTgwVpnAttachmentRecord(vmId: string, ip: string): Promise<TgwVpnAttachmentRecord> {
        this.proxy.logAsInfo('calling getTgwVpnAttachmentRecord');
        const table = new AwsDBDef.AwsVpnAttachment(process.env.RESOURCE_TAG_PREFIX || '');
        const [record] = await (
            await this.adaptee.listItemFromDb<VpnAttachmentDbItem>(table)
        ).filter(item => {
            return item.vmId === vmId && item.ip === ip;
        });
        if (!record) {
            throw new Error(`No vpn attachment found for vm (id: ${vmId}, ip: ${ip})`);
        }
        this.proxy.logAsInfo('called getTgwVpnAttachmentRecord');
        // get the vpnconnection detail
        const vpnConnection = await this.adaptee.describeVpnConnection(record.vpnConnectionId);
        // get the transit gateway attachment detail
        const tgwAttachment = await this.adaptee.describeTransitGatewayAttachment(
            vpnConnection.TransitGatewayId as string,
            vpnConnection.VpnConnectionId
        );
        const vpnConnectionJSON: JSONable = {};
        Object.assign(vpnConnectionJSON, vpnConnection);
        return {
            vmId: record.vmId,
            ip: record.ip,
            vpnConnectionId: vpnConnection.VpnConnectionId as string,
            transitGatewayId: vpnConnection.TransitGatewayId as string,
            transitGatewayAttachmentId: tgwAttachment.TransitGatewayAttachmentId,
            customerGatewayId: vpnConnection.CustomerGatewayId as string,
            vpnConnection: vpnConnectionJSON
        } as TgwVpnAttachmentRecord;
    }

    async saveAwsTgwVpnAttachmentRecord(
        vmId: string,
        ip: string,
        vpnConnectionId: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling saveTgwVpnAttachmentRecord');
        const table = new AwsDBDef.AwsVpnAttachment(process.env.RESOURCE_TAG_PREFIX || '');
        // ASSERT: item is vliad
        const dbItem: VpnAttachmentDbItem = {
            vmId: vmId,
            ip: ip,
            vpnConnectionId: vpnConnectionId
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.CreateOrReplace
        };
        await this.adaptee.saveItemToDb<VpnAttachmentDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called saveTgwVpnAttachmentRecord');
    }

    async deleteAwsTgwVpnAttachmentRecord(vmId: string, ip: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteAwsTgwVpnAttachmentRecord');
        const table = new AwsDBDef.AwsVpnAttachment(process.env.RESOURCE_TAG_PREFIX || '');
        const item: VpnAttachmentDbItem = {
            vmId: vmId,
            ip: ip,
            vpnConnectionId: undefined // non key attribute can set to undefined
        };
        await this.adaptee.deleteItemFromDb<VpnAttachmentDbItem>(table, item);

        this.proxy.logAsInfo('called deleteAwsTgwVpnAttachmentRecord');
    }

    async updateTgwVpnAttachmentRouting(
        attachmentId: string,
        propagateFromRouteTable: string,
        associatedRouteTable: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling updateTgwVpnAttachmentRouting');
        try {
            await Promise.all([
                this.adaptee
                    .updateTgwRouteTablePropagation(attachmentId, propagateFromRouteTable)
                    .catch(err => {
                        this.proxy.logForError(
                            'Failed to update tgw route table propagation' +
                                ` (attchment id: ${attachmentId}) propagated from` +
                                ` route table (id: ${propagateFromRouteTable}).`,
                            err
                        );
                    }),
                this.adaptee
                    .updateTgwRouteTableAssociation(attachmentId, associatedRouteTable)
                    .catch(err => {
                        this.proxy.logForError(
                            'Failed to update tgw route table association' +
                                ` (attchment id: ${attachmentId}) associating` +
                                ` route table (id: ${associatedRouteTable}).`,
                            err
                        );
                    })
            ]);
            this.proxy.logAsInfo('called updateTgwVpnAttachmentRouting');
        } catch (error) {
            this.proxy.logForError('Failed to complete updateTgwVpnAttachmentRouting.', error);
            this.proxy.logAsInfo('called updateTgwVpnAttachmentRouting');
            throw error;
        }
    }

    async getAwsTgwVpnAttachmentState(attachmentId: string): Promise<AwsVpnAttachmentState> {
        this.proxy.logAsInfo('calling getAwsTgwVpnAttachmentStatus');
        const attachment = await this.adaptee.describeTgwAttachment(attachmentId);
        if (!attachment) {
            throw new Error(`Transit gateway vpn attachmnt (id: ${attachmentId}) not found.`);
        } else if (!(attachment.State in AwsVpnAttachmentState)) {
            throw new Error(
                'Unexpected transit gateway vpn attachment state: ' +
                    `${attachment.State} of attachment (id: ${attachmentId}).`
            );
        }
        this.proxy.logAsInfo('called getAwsTgwVpnAttachmentStatus');
        const [state] = Object.entries(AwsVpnAttachmentState)
            .filter(([, value]) => {
                return attachment.State === value;
            })
            .map(([, v]) => v);
        return state;
    }

    async tagResource(resourceIds: string[], tags: ResourceTag[]): Promise<void> {
        this.proxy.logAsInfo('calling tagResource.');
        await this.adaptee.tagResource(resourceIds, tags);
        this.proxy.logAsInfo('called tagResource.');
    }

    async removeMasterRoleTag(vmIds: string[]): Promise<void> {
        this.proxy.logAsInfo('calling removeMasterRoleTag.');
        const tag: ResourceTag = {
            key: TAG_KEY_AUTOSCALE_ROLE,
            value: 'master'
        };
        await this.adaptee.untagResource(vmIds, [tag]);
        this.proxy.logAsInfo('called removeMasterRoleTag.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invokeAutoscaleFunction(invokableFunction: string, parameters: { [key: string]: any }): void {
        this.proxy.logAsInfo('calling invokeAwsLambda');
        const handlerName = this.settings.get(
            AwsFortiGateAutoscaleSetting.AwsTransitGatewayVpnHandlerName
        ).value;
        const invocationSecretAccessKey = this.settings.get(
            AwsFortiGateAutoscaleSetting.FortiGatePskSecret
        ).value;
        const payload = {
            invokeMethod: invokableFunction,
            invocationSecretKey: invocationSecretAccessKey
        };
        Object.assign(payload, parameters);
        this.adaptee.invokeLambda(handlerName, JSON.stringify(payload)).then(() => {
            this.proxy.logAsInfo('called invokeAwsLambda');
        });
    }
}
