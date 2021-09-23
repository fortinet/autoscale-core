import * as DBDef from '@fortinet/autoscale-core/db-definitions';
import EC2 from 'aws-sdk/clients/ec2';
import path from 'path';
import {
    AwsApiGatewayEventProxy,
    AwsCloudFormationCustomResourceEventProxy,
    AwsFortiGateAutoscaleSetting,
    AwsLambdaInvocationProxy,
    AwsPlatformAdaptee,
    AwsScheduledEventProxy,
    AwsVpnAttachmentState,
    AwsVpnConnection,
    LifecycleItemDbItem
} from '.';
import {
    Blob,
    CloudFunctionInvocationPayload,
    CloudFunctionProxyAdapter,
    constructInvocationPayload,
    DeviceSyncInfo,
    FortiGateAutoscaleServiceRequestSource,
    genChecksum,
    HealthCheckRecord,
    HealthCheckSyncState,
    JSONable,
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord,
    NetworkInterface,
    NicAttachmentRecord,
    PlatformAdapter,
    PrimaryRecord,
    PrimaryRecordVoteState,
    ReqMethod,
    ReqType,
    ResourceFilter,
    Settings,
    TgwVpnAttachmentRecord,
    VirtualMachine,
    VirtualMachineState,
    waitFor,
    WaitForConditionChecker,
    WaitForPromiseEmitter
} from '..';
import * as AwsDBDef from './index';

export const TAG_KEY_RESOURCE_GROUP = 'ResourceGroup';
export const TAG_KEY_AUTOSCALE_ROLE = 'AutoscaleRole';

export interface AwsDdbOperations {
    Expression: string;
    ExpressionAttributeValues?: { [key: string]: string | number | boolean };
    type?: DBDef.SaveCondition;
}

export enum LifecycleActionResult {
    Continue = 'CONTINUE',
    Abandon = 'ABANDON'
}

export enum LifecycleState {
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
    state: LifecycleState;
    timestamp: number;
}

export enum ScalingGroupState {
    InService,
    InTransition,
    Stopped
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

    async getRequestType(): Promise<ReqType> {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const reqMethod = await this.proxy.getReqMethod();
            if (reqMethod === ReqMethod.GET) {
                const headers = await this.proxy.getReqHeaders();
                if (headers['fos-instance-id'] === null) {
                    throw new Error(
                        'Invalid request. fos-instance-id is missing in [GET] request header.'
                    );
                } else {
                    const reqPath =
                        this.proxy.request.path && this.proxy.request.path.toLowerCase();
                    switch (reqPath) {
                        case '/fgt-as-handler':
                            return Promise.resolve(ReqType.BootstrapConfig);
                        case '/byol-license':
                            return Promise.resolve(ReqType.ByolLicense);
                        default:
                            throw new Error(`Unsupported request method: ${reqMethod}`);
                    }
                }
            } else if (reqMethod === ReqMethod.POST) {
                const body = await this.proxy.getReqBody();
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
            const body = await this.proxy.getReqBody();
            if (body.source === 'aws.autoscaling') {
                if (String(body['detail-type']) === 'EC2 Instance-launch Lifecycle Action') {
                    return Promise.resolve(ReqType.LaunchingVm);
                } else if (String(body['detail-type']) === 'EC2 Instance Launch Successful') {
                    return Promise.resolve(ReqType.LaunchedVm);
                } else if (String(body['detail-type']) === 'EC2 Instance Launch Unsuccessful') {
                    return Promise.resolve(ReqType.VmNotLaunched);
                } else if (
                    String(body['detail-type']) === 'EC2 Instance-terminate Lifecycle Action'
                ) {
                    return Promise.resolve(ReqType.TerminatingVm);
                } else if (String(body['detail-type']) === 'EC2 Instance Terminate Successful') {
                    return Promise.resolve(ReqType.TerminatedVm);
                } else {
                    throw new Error(
                        'Invalid request. ' +
                            `Unsupported request detail-type: [${body['detail-type']}]`
                    );
                }
            } else if (body.source === FortiGateAutoscaleServiceRequestSource.FortiGateAutoscale) {
                if (String(body['detail-type']) === 'FortiAnalyzer Authorization Request') {
                    return Promise.resolve(ReqType.ServiceProviderRequest);
                }
            }
            throw new Error(`Unknown supported source: [${body.source}]`);
        } else if (this.proxy instanceof AwsCloudFormationCustomResourceEventProxy) {
            const body = await this.proxy.getReqBody();
            const arn = this.proxy.context.invokedFunctionArn;
            // NOTE: only accept requests to the specific service handler Lambda function.
            // validate requests by comparing the service token against the lambda function arn.
            if (
                body.ResourceType === 'AWS::CloudFormation::CustomResource' &&
                body.ServiceToken === arn
            ) {
                return Promise.resolve(ReqType.ServiceProviderRequest);
            } else {
                throw new Error(
                    `Invalid request. ResourceType: [${body.ResourceType}], ` +
                        `ServiceToken: [${body.ServiceToken}]`
                );
            }
        } else if (this.proxy instanceof AwsLambdaInvocationProxy) {
            return Promise.resolve(ReqType.CloudFunctionPeerInvocation);
        } else {
            throw new Error('Unsupported CloudFunctionProxy.');
        }
    }
    async init(): Promise<void> {
        this.settings = await this.adaptee.loadSettings();
        await this.validateSettings();
    }
    async saveSettingItem(
        key: string,
        value: string,
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<string> {
        const table = new AwsDBDef.AwsSettings(process.env.RESOURCE_TAG_PREFIX || '');
        const item: DBDef.SettingsDbItem = {
            settingKey: key,
            settingValue: value,
            description: description,
            jsonEncoded: jsonEncoded,
            editable: editable
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: DBDef.SaveCondition.Upsert
        };
        await this.adaptee.saveItemToDb<DBDef.SettingsDbItem>(table, item, conditionExp);
        return item.settingKey;
    }

    async getReqVmId(): Promise<string> {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const reqMethod = await this.proxy.getReqMethod();
            if (reqMethod === ReqMethod.GET) {
                const headers = await this.proxy.getReqHeaders();
                return Promise.resolve(headers['fos-instance-id'] as string);
            } else if (reqMethod === ReqMethod.POST) {
                const body = await this.proxy.getReqBody();
                return Promise.resolve(body.instance as string);
            } else {
                throw new Error(`Cannot get vm id in unsupported request method: ${reqMethod}`);
            }
        } else if (this.proxy instanceof AwsScheduledEventProxy) {
            const body = await this.proxy.getReqBody();
            if (body.source === 'aws.autoscaling') {
                return Promise.resolve(body.detail.EC2InstanceId);
            } else {
                throw new Error(`Cannot get vm id in unsupported request: ${JSON.stringify(body)}`);
            }
        } else {
            throw new Error('Cannot get vm id in unsupported request.');
        }
    }
    async getReqDeviceSyncInfo(): Promise<DeviceSyncInfo> {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const body = await this.proxy.getReqBody();
            const deviceSyncInfo: DeviceSyncInfo = {
                // always available
                instance: (body.instance && String(body.instance)) || null,
                interval: (body.interval && Number(body.interval)) || NaN,
                // partially available in some request types
                status: (body.status && String(body.status)) || undefined,
                // NOTE: partially available in some device versions
                sequence: (body.sequence && Number(body.sequence)) || NaN,
                time: (body.time && String(body.time)) || null,
                syncTime: (body.sync_time && String(body.sync_time)) || null,
                syncFailTime: (body.sync_fail_time && String(body.sync_fail_time)) || null,
                syncStatus: (body.sync_status !== null && Boolean(body.sync_status)) || null,
                isPrimary: (body.is_primary !== null && Boolean(body.is_primary)) || null,
                checksum: (body.checksum !== null && String(body.checksum)) || null
            };
            return deviceSyncInfo;
        } else {
            return null;
        }
    }
    async getReqHeartbeatInterval(): Promise<number> {
        const deviceSyncInfo = await this.getReqDeviceSyncInfo();
        return (deviceSyncInfo && deviceSyncInfo.interval) || NaN;
    }
    getReqAsString(): Promise<string> {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            return Promise.resolve(JSON.stringify(this.proxy.request));
        } else if (this.proxy instanceof AwsScheduledEventProxy) {
            return Promise.resolve(JSON.stringify(this.proxy.request));
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
        const state: VirtualMachineState =
            (instance.State.Name === 'running' && VirtualMachineState.Running) ||
            (instance.State.Name === 'stopped' && VirtualMachineState.Stopped) ||
            (instance.State.Name === 'terminated' && VirtualMachineState.Terminated) ||
            VirtualMachineState.Pending;
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
            sourceData: {},
            state: state
        };
        Object.assign(vm.sourceData, instance);
        return vm;
    }

    protected eniToNic(eni: EC2.NetworkInterface): NetworkInterface {
        const nic: NetworkInterface = {
            id: eni.NetworkInterfaceId,
            privateIpAddress: eni.PrivateIpAddress,
            index:
                eni.Attachment && !isNaN(eni.Attachment.DeviceIndex)
                    ? eni.Attachment.DeviceIndex
                    : undefined,
            subnetId: eni.SubnetId,
            virtualNetworkId: eni.VpcId,
            attachmentId: (eni.Attachment && eni.Attachment.AttachmentId) || undefined,
            description: eni.Description
        };
        return nic;
    }

    async getTargetVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getTargetVm');
        const instance = await this.adaptee.describeInstance(await this.getReqVmId());
        let vm: VirtualMachine;
        if (instance) {
            const byolGroupName = this.settings.get(
                AwsFortiGateAutoscaleSetting.ByolScalingGroupName
            ).value;
            const paygGroupName = this.settings.get(
                AwsFortiGateAutoscaleSetting.PaygScalingGroupName
            ).value;
            const scalingGroups = await this.adaptee.describeAutoScalingGroups([
                byolGroupName,
                paygGroupName
            ]);

            // get scaling group name
            // ASSERT: the instance can only locate in 1 scaling group
            const [scalingGroupName] = scalingGroups
                .filter(group => {
                    return (
                        group.Instances.filter(ins => ins.InstanceId === instance.InstanceId)
                            .length > 0
                    );
                })
                .map(group => group.AutoScalingGroupName);
            vm = this.instanceToVm(instance, scalingGroupName, instance.NetworkInterfaces);
        }

        this.proxy.logAsInfo('called getTargetVm');
        return vm;
    }
    async getPrimaryVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getPrimaryVm');
        const primaryRecord = await this.getPrimaryRecord();
        if (!primaryRecord) {
            return null;
        }
        const instance = await this.adaptee.describeInstance(primaryRecord.vmId);
        let vm: VirtualMachine;
        if (instance) {
            vm = this.instanceToVm(
                instance,
                primaryRecord.scalingGroupName,
                instance.NetworkInterfaces
            );
            // NOTE: vm in terminated state can be still described. We should consider such vm as unavailable
            if (vm.state === VirtualMachineState.Terminated) {
                vm = null;
            }
        }
        this.proxy.logAsInfo('called getPrimaryVm');
        return vm;
    }

    async listAutoscaleVm(
        identifyScalingGroup?: boolean,
        listNic?: boolean
    ): Promise<VirtualMachine[]> {
        this.proxy.logAsInfo('calling listAutoscaleVm');
        const filter: ResourceFilter = {
            key: TAG_KEY_RESOURCE_GROUP,
            value: this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value,
            isTag: true
        };
        const instances = await this.adaptee.listInstances([filter]);
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

    async listPrimaryRoleVmId(): Promise<string[]> {
        const filters: ResourceFilter[] = [];
        // list vm with resource group tag
        filters.push({
            key: TAG_KEY_RESOURCE_GROUP,
            value: this.settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value,
            isTag: true
        });
        // list vm with autoscale role tag
        filters.push({
            key: TAG_KEY_AUTOSCALE_ROLE,
            value: 'primary',
            isTag: true
        });
        try {
            const instances = await this.adaptee.listInstances(filters);
            return instances.map(instance => instance.InstanceId);
        } catch (error) {
            if (error.code && error.code === 'InvalidParameterValue') {
                return [];
            } else {
                throw error;
            }
        }
    }

    async getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord> {
        this.proxy.logAsInfo('calling getHealthCheckRecord');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsAutoscale(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const dbItem = await this.adaptee.getItemFromDb<DBDef.AutoscaleDbItem>(table, [
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
                primaryIp: dbItem.primaryIp,
                heartbeatInterval: dbItem.heartBeatInterval,
                heartbeatLossCount: dbItem.heartBeatLossCount,
                nextHeartbeatTime: dbItem.nextHeartBeatTime,
                syncState: syncState,
                // if the prop doesn't exist in item set it to 0 by default
                syncRecoveryCount: dbItem.syncRecoveryCount || 0,
                seq: dbItem.seq,
                healthy: isHealthy,
                upToDate: true,
                // the following properities are only available in some device versions
                // convert string 'null' to null
                sendTime: (dbItem.sendTime === 'null' && null) || dbItem.sendTime,
                deviceSyncTime: (dbItem.deviceSyncTime === 'null' && null) || dbItem.deviceSyncTime,
                deviceSyncFailTime:
                    (dbItem.deviceSyncFailTime === 'null' && null) || dbItem.deviceSyncFailTime,
                deviceSyncStatus:
                    (dbItem.deviceSyncStatus === 'null' && null) ||
                    dbItem.deviceSyncStatus === 'true',
                deviceIsPrimary:
                    (dbItem.deviceIsPrimary === 'null' && null) ||
                    dbItem.deviceIsPrimary === 'true',
                deviceChecksum: (dbItem.deviceChecksum === 'null' && null) || dbItem.deviceChecksum
            };
        }
        this.proxy.logAsInfo('called getHealthCheckRecord');
        return record;
    }
    async getPrimaryRecord(filters?: DBDef.KeyValue[]): Promise<PrimaryRecord> {
        this.proxy.logAsInfo('calling getPrimaryRecord');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsPrimaryElection(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const filterExp: AwsDdbOperations = {
            Expression: ''
        };
        if (filters) {
            filterExp.Expression = filters.map(kv => `${kv.key} = :${kv.value}`).join(' AND ');
        }
        // ASSERT: there's only 1 matching primary record or no matching record.
        const [record] = await this.adaptee.listItemFromDb<DBDef.PrimaryElectionDbItem>(
            table,
            filterExp
        );
        let primaryRecord: PrimaryRecord;
        if (record) {
            const [voteState] = Object.entries(PrimaryRecordVoteState)
                .filter(([, value]) => {
                    return record.voteState === value;
                })
                .map(([, v]) => v);
            const voteTimedOut =
                voteState !== PrimaryRecordVoteState.Done &&
                Number(record.voteEndTime) < Date.now();
            primaryRecord = {
                id: record.id,
                vmId: record.vmId,
                ip: record.ip,
                scalingGroupName: record.scalingGroupName,
                virtualNetworkId: record.virtualNetworkId,
                subnetId: record.subnetId,
                voteEndTime: Number(record.voteEndTime),
                voteState: (voteTimedOut && PrimaryRecordVoteState.Timeout) || voteState
            };
        }

        this.proxy.logAsInfo('called getPrimaryRecord');
        return primaryRecord;
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
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsAutoscale(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item: DBDef.AutoscaleDbItem = {
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            primaryIp: rec.primaryIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            syncRecoveryCount: rec.syncRecoveryCount,
            seq: rec.seq,
            sendTime: rec.sendTime,
            deviceSyncTime: rec.deviceSyncTime,
            deviceSyncFailTime: rec.deviceSyncFailTime,
            // store boolean | null
            deviceSyncStatus:
                (rec.deviceSyncStatus === null && 'null') ||
                (rec.deviceSyncStatus && 'true') ||
                'false',
            // store boolean | null
            deviceIsPrimary:
                (rec.deviceIsPrimary === null && 'null') ||
                (rec.deviceIsPrimary && 'true') ||
                'false',
            deviceChecksum: rec.deviceChecksum
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: DBDef.SaveCondition.Upsert
        };
        await this.adaptee.saveItemToDb<DBDef.AutoscaleDbItem>(table, item, conditionExp);
        this.proxy.logAsInfo('called createHealthCheckRecord');
    }
    async updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        this.proxy.logAsInfo('calling updateHealthCheckRecord');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsAutoscale(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item: DBDef.AutoscaleDbItem = {
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            primaryIp: rec.primaryIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            syncRecoveryCount: rec.syncRecoveryCount,
            seq: rec.seq,
            sendTime: rec.sendTime,
            deviceSyncTime: rec.deviceSyncTime,
            deviceSyncFailTime: rec.deviceSyncFailTime,
            // store boolean | null
            deviceSyncStatus:
                (rec.deviceSyncStatus === null && 'null') ||
                (rec.deviceSyncStatus && 'true') ||
                'false',
            // store boolean | null
            deviceIsPrimary:
                (rec.deviceIsPrimary === null && 'null') ||
                (rec.deviceIsPrimary && 'true') ||
                'false',
            deviceChecksum: rec.deviceChecksum
        };
        // NOTE: strictly update the record when the sequence to update is greater
        // than the seq in the db ton ensure data not to fall back to old value in race conditions
        const conditionExp: AwsDdbOperations = {
            Expression: 'seq < :seq',
            ExpressionAttributeValues: {
                ':seq': rec.seq
            },
            type: DBDef.SaveCondition.UpdateOnly
        };
        await this.adaptee.saveItemToDb<DBDef.AutoscaleDbItem>(table, item, conditionExp);
        this.proxy.logAsInfo('called updateHealthCheckRecord');
    }
    async createPrimaryRecord(rec: PrimaryRecord, oldRec: PrimaryRecord | null): Promise<void> {
        this.proxy.logAsInfo('calling createPrimaryRecord.');
        try {
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsPrimaryElection(
                settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
            );
            const item: DBDef.PrimaryElectionDbItem = {
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
                type: DBDef.SaveCondition.InsertOnly
            };
            // if specified an old rec to purge, use a strict conditional expression to replace.
            if (oldRec) {
                this.proxy.logAsInfo(`purging existing record (id: ${oldRec.id})`);
                conditionExp.Expression = 'attribute_exists(scalingGroupName) AND id = :id';
                conditionExp.ExpressionAttributeValues = {
                    ':id': oldRec.id
                };
            }

            await this.adaptee.saveItemToDb<DBDef.PrimaryElectionDbItem>(table, item, conditionExp);
            this.proxy.logAsInfo('called createPrimaryRecord.');
        } catch (error) {
            if (error.code && error.code === 'ConditionalCheckFailedException') {
                this.proxy.logAsInfo('Primary record exists');
            }
            this.proxy.logForError('called createPrimaryRecord.', error);
            throw error;
        }
    }
    async updatePrimaryRecord(rec: PrimaryRecord): Promise<void> {
        this.proxy.logAsInfo('calling updatePrimaryRecord.');
        try {
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsPrimaryElection(
                settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: DBDef.PrimaryElectionDbItem = {
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
                    'voteState = :voteState AND ' +
                    'voteEndTime > :nowTime',
                ExpressionAttributeValues: {
                    ':voteState': PrimaryRecordVoteState.Pending,
                    ':nowTime': Date.now()
                }
            };
            await this.adaptee.saveItemToDb<DBDef.PrimaryElectionDbItem>(table, item, conditionExp);
            this.proxy.logAsInfo('called updatePrimaryRecord.');
        } catch (error) {
            this.proxy.logForError('called updatePrimaryRecord.', error);
            throw error;
        }
    }
    /**
     * Load a configset file from blob storage
     * The blob container will use the AssetStorageContainer or CustomAssetContainer,
     * and the location prefix will use AssetStorageDirectory or CustomAssetDirectory.
     * The full file path will be: \<container\>/\<location prefix\>/configset/\<file-name\>
     * @param  {string} name the configset name
     * @param  {boolean} custom (optional) whether load it from a custom location or not
     * @returns {Promise} the configset content as a string
     */
    async loadConfigSet(name: string, custom?: boolean): Promise<string> {
        this.proxy.logAsInfo(`loading${custom ? ' (custom)' : ''} configset: ${name}`);
        const bucket = custom
            ? this.settings.get(AwsFortiGateAutoscaleSetting.CustomAssetContainer)
            : this.settings.get(AwsFortiGateAutoscaleSetting.AssetStorageContainer);
        const keyPrefix = custom
            ? this.settings.get(AwsFortiGateAutoscaleSetting.CustomAssetDirectory)
            : this.settings.get(AwsFortiGateAutoscaleSetting.AssetStorageDirectory);
        if (!(bucket && bucket.value)) {
            throw new Error('Missing setting item: S3 bucket for configset.');
        }

        const filePath = path.posix.join(...[keyPrefix.value, 'configset', name].filter(k => !!k));
        this.proxy.logAsDebug(`Load blob in: S3 bucket [${bucket.value}], path:` + `[${filePath}]`);
        const content = await this.adaptee.getS3ObjectContent(bucket.value, filePath);
        this.proxy.logAsInfo('configset loaded.');
        return content;
    }
    /**
     * List all configset files in a specified blob container location
     * The blob container will use the AssetStorageContainer or CustomAssetContainer,
     * and the location prefix will use AssetStorageDirectory or CustomAssetDirectory.
     * There will be an optional subDirectory provided as parameter.
     * The full file path will be: \<container\>/\<location prefix\>[/\<subDirectory\>]/configset
     * @param  {string} subDirectory additional subdirectory
     * @param  {boolean} custom (optional) whether load it from a custom location or not
     * @returns {Promise} the configset content as a string
     */
    async listConfigSet(subDirectory?: string, custom?: boolean): Promise<Blob[]> {
        this.proxy.logAsInfo('calling listConfigSet');
        // it will load configsets from the location:
        // in custom mode: CustomAssetContainer/CustomAssetDirectory[/subDirectory]/configset/<configset-name>
        // in normal mode: AssetStorageContainer/AssetStorageDirectory[/subDirectory]/configset/<configset-name>
        const bucket = custom
            ? this.settings.get(AwsFortiGateAutoscaleSetting.CustomAssetContainer)
            : this.settings.get(AwsFortiGateAutoscaleSetting.AssetStorageContainer);

        const keyPrefix = custom
            ? this.settings.get(AwsFortiGateAutoscaleSetting.CustomAssetDirectory)
            : this.settings.get(AwsFortiGateAutoscaleSetting.AssetStorageDirectory);
        let blobs: Blob[] = [];
        if (!bucket.value) {
            this.proxy.logAsInfo('No S3 bucket is specified. No configset loaded.');
            return [];
        }

        const location = path.posix.join(
            ...[keyPrefix.value, subDirectory || null, 'configset'].filter(r => !!r)
        );

        try {
            this.proxy.logAsInfo(
                `List configet in S3 bucket: ${bucket.value}, directory: ${location}`
            );
            blobs = await this.adaptee.listS3Object(bucket.value, location);
        } catch (error) {
            this.proxy.logAsWarning(error);
        }
        this.proxy.logAsInfo('called listConfigSet');
        return blobs;
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
                const filePath = path.posix.join(licenseDirectoryName, blob.fileName);
                const content = await this.adaptee.getS3ObjectContent(
                    storageContainerName,
                    filePath
                );
                const algorithm = 'sha256';
                const licenseFile: LicenseFile = {
                    fileName: blob.fileName,
                    checksum: genChecksum(content, algorithm),
                    algorithm: algorithm,
                    content: content
                };
                return licenseFile;
            })
        );
    }

    async listLicenseStock(productName: string): Promise<LicenseStockRecord[]> {
        this.proxy.logAsInfo('calling listLicenseStock');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLicenseStock(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const dbItems = await this.adaptee.listItemFromDb<DBDef.LicenseStockDbItem>(table);
        const mapItems = dbItems
            .filter(item => item.productName === productName)
            .map(item => {
                return {
                    fileName: item.fileName,
                    checksum: item.checksum,
                    algorithm: item.algorithm,
                    productName: item.productName
                } as LicenseStockRecord;
            });
        this.proxy.logAsInfo('called listLicenseStock');
        return mapItems;
    }
    async listLicenseUsage(productName: string): Promise<LicenseUsageRecord[]> {
        this.proxy.logAsInfo('calling listLicenseUsage');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLicenseUsage(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const dbItems = await this.adaptee.listItemFromDb<DBDef.LicenseUsageDbItem>(table);
        const mapItems = dbItems
            .filter(item => item.productName === productName)
            .map(item => {
                return {
                    fileName: item.fileName,
                    checksum: item.checksum,
                    algorithm: item.algorithm,
                    productName: item.productName,
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
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLicenseStock(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        // load all license stock records in the db
        const items = new Map<string, DBDef.LicenseStockDbItem>(
            (await this.adaptee.listItemFromDb<DBDef.LicenseStockDbItem>(table)).map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        const stockRecordChecksums = Array.from(items.keys());
        await Promise.all(
            records.map(record => {
                const item: DBDef.LicenseStockDbItem = {
                    checksum: record.checksum,
                    algorithm: record.algorithm,
                    fileName: record.fileName,
                    productName: record.productName
                };
                const conditionExp: AwsDdbOperations = {
                    Expression: ''
                };
                let typeText: string;
                // recrod exists, update it
                if (items.has(record.checksum)) {
                    stockRecordChecksums.splice(stockRecordChecksums.indexOf(record.checksum), 1);
                    conditionExp.type = DBDef.SaveCondition.UpdateOnly;
                    typeText =
                        `update existing item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                } else {
                    conditionExp.type = DBDef.SaveCondition.Upsert;
                    typeText =
                        `create new item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                }
                return this.adaptee
                    .saveItemToDb<DBDef.LicenseStockDbItem>(table, item, conditionExp)
                    .catch(err => {
                        this.proxy.logForError(`Failed to ${typeText}.`, err);
                        errorCount++;
                    });
            })
        );
        // remove those records which don't have a corresponding license file.
        await Promise.all(
            stockRecordChecksums.map(checksum => {
                const item = items.get(checksum);
                return this.adaptee
                    .deleteItemFromDb<DBDef.LicenseStockDbItem>(table, item)
                    .catch(err => {
                        this.proxy.logForError(
                            `Failed to delete item (filename: ${item.fileName}) from db.`,
                            err
                        );
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
    async updateLicenseUsage(
        records: { item: LicenseUsageRecord; reference: LicenseUsageRecord }[]
    ): Promise<void> {
        this.proxy.logAsInfo('calling updateLicenseUsage');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLicenseUsage(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        // get all records from the db as a snapshot
        const items = new Map<string, DBDef.LicenseUsageDbItem>(
            (await this.adaptee.listItemFromDb<DBDef.LicenseUsageDbItem>(table)).map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        await Promise.all(
            records.map(rec => {
                const item: DBDef.LicenseUsageDbItem = {
                    checksum: rec.item.checksum,
                    algorithm: rec.item.algorithm,
                    fileName: rec.item.fileName,
                    productName: rec.item.productName,
                    vmId: rec.item.vmId,
                    scalingGroupName: rec.item.scalingGroupName,
                    assignedTime: rec.item.assignedTime,
                    vmInSync: rec.item.vmInSync
                };
                const conditionExp: AwsDdbOperations = {
                    Expression: ''
                };
                let typeText: string;
                // update if record exists
                // NOTE: for updating an existing record, it requires a reference of the existing
                // record as a snapshot of db data. Only when the record data at the time of updating
                // matches exactly the same as the snapshot, the update succeeds. Otherwise, the
                // record is considerred changed, and inconsistent anymore, thus not allowing updating.
                if (items.has(rec.item.checksum)) {
                    // ASSERT: it must have a referenced record to replace. otherwise, if should fail
                    if (!rec.reference) {
                        typeText = `update existing item (checksum: ${rec.item.checksum}). `;
                        this.proxy.logAsError(
                            `Failed to ${typeText}. No referenced record specified.`
                        );
                        errorCount++;
                        return Promise.resolve();
                    }
                    conditionExp.type = DBDef.SaveCondition.UpdateOnly;
                    // the conditional expression ensures the consistency of the DB system (ACID)
                    conditionExp.Expression =
                        'attribute_exists(checksum) AND vmId = :vmId' +
                        ' scalingGroupName = :scalingGroupName' +
                        ' AND productName = :productName' +
                        ' AND algorithm = :algorithm' +
                        ' AND assignedTime = :assignedTime';
                    conditionExp.ExpressionAttributeValues = {
                        ':vmId': rec.reference.vmId,
                        ':scalingGroupName': rec.reference.scalingGroupName,
                        ':productName': rec.reference.productName,
                        ':algorithm': rec.reference.algorithm,
                        ':assignedTime': rec.reference.assignedTime ? rec.reference.assignedTime : 0
                    };
                    typeText =
                        `update existing item (checksum: ${rec.reference.checksum}). ` +
                        `Old values (filename: ${rec.reference.fileName}, ` +
                        `vmId: ${rec.reference.vmId}, ` +
                        `scalingGroupName: ${rec.reference.scalingGroupName}, ` +
                        `productName: ${rec.reference.productName}, ` +
                        `algorithm: ${rec.reference.algorithm}, ` +
                        `assignedTime: ${rec.reference.assignedTime}).` +
                        `New values (filename: ${item.fileName}, vmId: ${item.vmId}, ` +
                        `scalingGroupName: ${item.scalingGroupName}, ` +
                        `productName: ${item.productName}, algorithm: ${item.algorithm})`;
                    return this.adaptee
                        .saveItemToDb<DBDef.LicenseUsageDbItem>(table, item, conditionExp)
                        .then(() => {
                            this.proxy.logAsInfo(typeText);
                        })
                        .catch(err => {
                            this.proxy.logForError(`Failed to ${typeText}.`, err);
                            errorCount++;
                        });
                }
                // create if record not exists
                else {
                    conditionExp.type = DBDef.SaveCondition.Upsert;
                    // the conditional expression ensures the consistency of the DB system (ACID)
                    conditionExp.Expression = 'attribute_not_exists(checksum)';
                    typeText =
                        `create new item (checksum: ${item.checksum})` +
                        `New values (filename: ${item.fileName}, vmId: ${item.vmId}, ` +
                        `scalingGroupName: ${item.scalingGroupName}, ` +
                        `productName: ${item.productName}, algorithm: ${item.algorithm})`;
                    return this.adaptee
                        .saveItemToDb<DBDef.LicenseUsageDbItem>(table, item, conditionExp)
                        .then(() => {
                            this.proxy.logAsInfo(typeText);
                        })
                        .catch(err => {
                            this.proxy.logForError(`Failed to ${typeText}.`, err);
                            errorCount++;
                        });
                }
            })
        );
        if (errorCount > 0) {
            this.proxy.logAsInfo('called updateLicenseUsage');
            throw new Error(
                `${errorCount} license usage record error occured. Please find the detailed logs above.`
            );
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
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsNicAttachment(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const records = await this.adaptee.listItemFromDb<DBDef.NicAttachmentDbItem>(table);
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
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsNicAttachment(
                settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
            );
            const item: DBDef.NicAttachmentDbItem = {
                vmId: vmId,
                nicId: nicId,
                attachmentState: status
            };
            const conditionExp: AwsDdbOperations = {
                Expression: '',
                type: DBDef.SaveCondition.Upsert
            };
            await this.adaptee.saveItemToDb<DBDef.NicAttachmentDbItem>(table, item, conditionExp);
        } catch (error) {
            this.proxy.logAsError('cannot update nic attachment record');
            throw error;
        }
        this.proxy.logAsInfo('called updateNicAttachmentRecord');
    }

    async deleteNicAttachmentRecord(vmId: string, nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteNicAttachmentRecord');
        try {
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsNicAttachment(
                settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
            );
            const item: DBDef.NicAttachmentDbItem = {
                vmId: vmId,
                nicId: nicId,
                attachmentState: undefined // non key attribute can set to undefined
            };
            await this.adaptee.deleteItemFromDb<DBDef.NicAttachmentDbItem>(table, item);
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
            index: (nic.Attachment && nic.Attachment.DeviceIndex) || undefined,
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
        // eni is able to attach ?
        if (['available', 'attaching', 'pending'].includes(eni.Status)) {
            // not attaching yet? attach it.
            if (eni.Status === 'available' && !eni.Attachment) {
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
                if (nic.Attachment.Status === 'attached') {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            };
            await waitFor<EC2.NetworkInterface>(emitter, checker, 5000, this.proxy);
        } else {
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
    async listNetworkInterfaces(
        filters: ResourceFilter[],
        status?: string
    ): Promise<NetworkInterface[]> {
        this.proxy.logAsInfo('calling listNetworkInterfaces');
        const enis = await this.adaptee.listNetworkInterfaces(filters);
        const nics: NetworkInterface[] = enis
            .filter(e => status === undefined || e.Status === status)
            .map(eni => {
                const nic: NetworkInterface = {
                    id: eni.NetworkInterfaceId,
                    privateIpAddress: eni.PrivateIpAddress,
                    index: (eni.Attachment && eni.Attachment.DeviceIndex) || undefined,
                    subnetId: eni.SubnetId,
                    virtualNetworkId: eni.VpcId,
                    attachmentId: (eni.Attachment && eni.Attachment.AttachmentId) || undefined,
                    description: eni.Description
                };
                return nic;
            });
        this.proxy.logAsInfo('called listNetworkInterfaces');
        return nics;
    }

    async tagNetworkInterface(nicId: string, tags: ResourceFilter[]): Promise<void> {
        this.proxy.logAsInfo('calling tagNetworkInterface');
        await this.adaptee.tagResource([nicId], tags);
        this.proxy.logAsInfo('called tagNetworkInterface');
    }

    async updateVmSourceDestinationChecking(vmId: string, enable?: boolean): Promise<void> {
        this.proxy.logAsInfo('calling updateVmSourceDestinationChecking');
        const instance = await this.adaptee.describeInstance(vmId);
        let results: boolean[] = [];
        if (instance) {
            results = await Promise.all(
                instance.NetworkInterfaces.map(eni => {
                    return this.adaptee
                        .updateNetworkInterfaceSrcDestChecking(eni.NetworkInterfaceId, enable)
                        .then(() => true)
                        .catch(error => {
                            this.proxy.logForError(
                                'Failed to update source dest check on network ' +
                                    `interface (id:${eni.NetworkInterfaceId}).`,
                                error
                            );
                            return false;
                        });
                })
            );
        }
        this.proxy.logAsInfo('called updateVmSourceDestinationChecking');
        if (results.filter(r => !r).length > 0) {
            throw new Error('Failed to update source dest check. Please see the error log above.');
        }
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

    async getLifecycleItem(vmId: string): Promise<LifecycleItem> {
        this.proxy.logAsInfo('calling getLifecycleItem');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLifecycleItem(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const dbItem = await this.adaptee.getItemFromDb<LifecycleItemDbItem>(table, [
            {
                key: table.primaryKey.name,
                value: vmId
            }
        ]);
        if (!dbItem) {
            return null;
        }
        const [actionResult] = Object.entries(LifecycleActionResult)
            .filter(([, value]) => {
                return dbItem.actionResult === value;
            })
            .map(([, v]) => v);
        const [state] = Object.entries(LifecycleState)
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
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLifecycleItem(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
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
            type: DBDef.SaveCondition.Upsert
        };
        await this.adaptee.saveItemToDb<LifecycleItemDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called createLifecycleItem');
    }
    async updateLifecycleItem(item: LifecycleItem): Promise<void> {
        this.proxy.logAsInfo('calling updateLifecycleItem');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLifecycleItem(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
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
            type: DBDef.SaveCondition.UpdateOnly
        };
        await this.adaptee.saveItemToDb<LifecycleItemDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called updateLifecycleItem');
    }

    async deleteLifecycleItem(vmId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteLifecycleItem');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsLifecycleItem(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
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

    async listAwsCustomerGatewayIds(filters: ResourceFilter[]): Promise<string[]> {
        this.proxy.logAsInfo('calling listAwsCustomerGatewayIds.');
        const cgwList = await this.adaptee.listCustomerGateways(filters);
        this.proxy.logAsInfo('called listAwsCustomerGatewayIds.');
        return cgwList.map(cgw => cgw.CustomerGatewayId).filter(id => !!id);
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

    async listAwsVpnConnectionIds(filters: ResourceFilter[]): Promise<string[]> {
        this.proxy.logAsInfo('calling listAwsVpnConnectionIds.');
        const vpnList = await this.adaptee.listVpnConnections(filters);
        this.proxy.logAsInfo('called listAwsVpnConnectionIds.');
        return vpnList.map(vpn => vpn.VpnConnectionId).filter(id => !!id);
    }

    async listTgwVpnAttachmentRecord(
        filters: { vmId: string; ip: string }[] = []
    ): Promise<TgwVpnAttachmentRecord[]> {
        this.proxy.logAsInfo('calling listTgwVpnAttachmentRecord');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsVpnAttachment(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        let dbItems = await await await this.adaptee.listItemFromDb<DBDef.VpnAttachmentDbItem>(
            table
        );
        if (filters.length > 0) {
            const m = filters.map(filter => `${filter.vmId}-${filter.ip}`);
            dbItems = dbItems.filter(item => m.includes(`${item.vmId}-${item.ip}`));
        }
        const records = await Promise.all(
            dbItems.map(async item => {
                // get the vpnconnection detail
                const vpnConnection = await this.adaptee.describeVpnConnection(
                    item.vpnConnectionId
                );
                // get the transit gateway attachment detail
                const tgwAttachment = await this.adaptee.describeTransitGatewayAttachment(
                    vpnConnection.TransitGatewayId as string,
                    vpnConnection.VpnConnectionId
                );
                const vpnConnectionJSON: JSONable = {};
                Object.assign(vpnConnectionJSON, vpnConnection);
                return {
                    vmId: item.vmId,
                    ip: item.ip,
                    vpnConnectionId: vpnConnection.VpnConnectionId as string,
                    transitGatewayId: vpnConnection.TransitGatewayId as string,
                    transitGatewayAttachmentId: tgwAttachment.TransitGatewayAttachmentId,
                    customerGatewayId: vpnConnection.CustomerGatewayId as string,
                    vpnConnection: vpnConnectionJSON
                } as TgwVpnAttachmentRecord;
            })
        );
        this.proxy.logAsInfo('called listTgwVpnAttachmentRecord');
        return records;
    }

    async getTgwVpnAttachmentRecord(vmId: string, ip: string): Promise<TgwVpnAttachmentRecord> {
        const [record] = await this.listTgwVpnAttachmentRecord([{ vmId: vmId, ip: ip }]);
        return record;
    }

    async saveTgwVpnAttachmentRecord(
        vmId: string,
        ip: string,
        vpnConnectionId: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling saveTgwVpnAttachmentRecord');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsVpnAttachment(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        // ASSERT: item is vliad
        const dbItem: DBDef.VpnAttachmentDbItem = {
            vmId: vmId,
            ip: ip,
            vpnConnectionId: vpnConnectionId
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: DBDef.SaveCondition.Upsert
        };
        await this.adaptee.saveItemToDb<DBDef.VpnAttachmentDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called saveTgwVpnAttachmentRecord');
    }

    async deleteTgwVpnAttachmentRecord(vmId: string, ip: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteTgwVpnAttachmentRecord');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsVpnAttachment(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const item: DBDef.VpnAttachmentDbItem = {
            vmId: vmId,
            ip: ip,
            vpnConnectionId: undefined // non key attribute can set to undefined
        };
        await this.adaptee.deleteItemFromDb<DBDef.VpnAttachmentDbItem>(table, item);

        this.proxy.logAsInfo('called deleteTgwVpnAttachmentRecord');
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
        } else if (
            !Object.values(AwsVpnAttachmentState)
                .map(s => s as string)
                .includes(attachment.State)
        ) {
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

    async tagResource(resourceIds: string[], tags: ResourceFilter[]): Promise<void> {
        this.proxy.logAsInfo('calling tagResource.');
        await this.adaptee.tagResource(resourceIds, tags);
        this.proxy.logAsInfo('called tagResource.');
    }

    async removePrimaryRoleTag(vmIds: string[]): Promise<void> {
        this.proxy.logAsInfo('calling removePrimaryRoleTag.');
        const tag: ResourceFilter = {
            key: TAG_KEY_AUTOSCALE_ROLE,
            value: 'primary'
        };
        await this.adaptee.untagResource(vmIds, [tag]);
        this.proxy.logAsInfo('called removePrimaryRoleTag.');
    }

    createAutoscaleFunctionInvocationKey(
        payload: unknown,
        functionEndpoint: string,
        invocable: string
    ): string {
        const psk = this.settings.get(AwsFortiGateAutoscaleSetting.FortiGatePskSecret).value;
        return genChecksum(
            `${functionEndpoint}:${invocable}:${psk}:${JSON.stringify(payload)}`,
            'sha256'
        );
    }

    async invokeAutoscaleFunction(
        payload: unknown,
        functionEndpoint: string,
        invocable: string,
        executionTime?: number
    ): Promise<number> {
        this.proxy.logAsInfo('calling invokeAutoscaleFunction');
        const secretKey = this.createAutoscaleFunctionInvocationKey(
            payload,
            functionEndpoint,
            invocable
        );
        const p: CloudFunctionInvocationPayload = constructInvocationPayload(
            payload,
            invocable,
            secretKey,
            executionTime
        );
        const response = await this.adaptee.invokeLambda(
            functionEndpoint,
            'Event',
            JSON.stringify(p)
        );
        this.proxy.logAsInfo(`invocation response status code: ${response.StatusCode}`);
        this.proxy.logAsInfo('called invokeAutoscaleFunction');
        return response.StatusCode;
    }

    async updateScalingGroupSize(
        groupName: string,
        desiredCapacity: number,
        minSize?: number,
        maxSize?: number
    ): Promise<void> {
        this.proxy.logAsInfo('calling updateScalingGroupSize');
        if (desiredCapacity < 0) {
            throw new Error(
                `Scaling group desired capacity (value: ${desiredCapacity})` +
                    ' cannot be smaller than zero.'
            );
        }
        if (minSize !== undefined && minSize > desiredCapacity) {
            throw new Error(
                `Scaling group min size (value: ${minSize}) ` +
                    `cannot be greater than desired capacity (value: ${desiredCapacity}).`
            );
        }
        if (maxSize !== undefined && maxSize < desiredCapacity) {
            throw new Error(
                `Scaling group desired capacity (value: ${desiredCapacity}) ` +
                    `cannot be greater than max size (value: ${maxSize}).`
            );
        }
        await this.adaptee.updateScalingGroupSize(groupName, desiredCapacity, minSize, maxSize);
        this.proxy.logAsInfo('called updateScalingGroupSize');
    }

    async checkScalingGroupState(
        scalingGroupNames: string[]
    ): Promise<Map<string, ScalingGroupState>> {
        try {
            this.proxy.logAsInfo('calling checkScalingGroupState');
            const scalingGroups = await this.adaptee.describeAutoScalingGroups(scalingGroupNames);

            const stateMap = new Map<string, ScalingGroupState>();
            scalingGroups.forEach(scalingGroup => {
                let state = ScalingGroupState.InService;
                let noScale = false;
                let instanceInService = true;
                let instanceTerminated = false;
                let instanceStateInTransition = false;
                let noInstance = false;
                // check if capacity set to (desired:0, minSize: 0, maxSize: any number)
                if (scalingGroup.DesiredCapacity === 0 && scalingGroup.MinSize === 0) {
                    noScale = true;
                }

                if (scalingGroup.Instances && scalingGroup.Instances.length === 0) {
                    instanceInService = false;
                    noInstance = true;
                }
                scalingGroup.Instances.forEach(instance => {
                    if (instance.LifecycleState !== 'InService') {
                        instanceInService = false;
                    }
                    if (
                        instance.LifecycleState === 'Pending' ||
                        instance.LifecycleState === 'Pending:Wait' ||
                        instance.LifecycleState === 'Pending:Proceed' ||
                        instance.LifecycleState === 'Terminating' ||
                        instance.LifecycleState === 'Terminating:Wait' ||
                        instance.LifecycleState === 'Terminating:Proceed' ||
                        instance.LifecycleState === 'Detaching' ||
                        instance.LifecycleState === 'EnteringStandby'
                    ) {
                        instanceStateInTransition = true;
                    }
                    if (instance.LifecycleState === 'Terminated') {
                        instanceTerminated = true;
                    }
                });

                // if any instance is in service, the group is in-service
                if (instanceInService) {
                    state = ScalingGroupState.InService;
                }
                // if any instance is in transition, the group is in-transition
                if (instanceStateInTransition) {
                    state = ScalingGroupState.InTransition;
                }
                // if the group is not-scaled and all instances are terminated, the group is stopped
                if (noScale && instanceTerminated) {
                    state = ScalingGroupState.Stopped;
                }
                // this is the fully stopped case
                if (noScale && !instanceInService && noInstance) {
                    state = ScalingGroupState.Stopped;
                }
                this.proxy.logAsInfo(
                    `scaling group: ${scalingGroup.AutoScalingGroupName}` + `, state: ${state} `
                );
                stateMap.set(scalingGroup.AutoScalingGroupName, state);
            });

            return stateMap;
        } catch (error) {
            this.proxy.logForError('Error in checking scaling group state', error);
            throw error;
        }
    }

    async updateVpcRouteTableRoute(
        routeTableId: string,
        destination: string,
        nicId: string
    ): Promise<boolean> {
        // try create-route first
        try {
            await this.adaptee.createVpcRouteTableRoute(routeTableId, destination, nicId);
            return true;
        } catch (error) {
            // if failed bacause of existing route
            // TODO: check the error details for whether it is because of exsting route or not
            // in order to run replace-route or throw error
        }

        try {
            this.proxy.logAsWarning(
                `Existing route detected. routeTableId: ${routeTableId}` +
                    `, destination: ${destination}. Trying to replace this route.`
            );
            await this.adaptee.replaceVpcRouteTableRoute(routeTableId, destination, nicId);
            return true;
        } catch (error) {
            this.proxy.logForError(
                `Cannot replace route in route table. routeTableId: ${routeTableId}` +
                    `, destination: ${destination}.`,
                error
            );
            return false;
        }
    }

    async getDecryptedEnvironmentVariable(name: string): Promise<string> {
        const encrypted = process.env[name];
        try {
            const decrypted = await this.adaptee.kmsDecrypt(encrypted);
            this.proxy.logAsInfo('Environment variable is decrypted. Use the decrpted value.');
            return decrypted;
        } catch (error) {
            // if the string cannot be decrypted, use the original one
            if (error.code && error.code === 'InvalidCiphertextException') {
                this.proxy.logAsWarning(
                    'Unseccessfully decrypt the given varable, probably because ' +
                        'the input is a non-encrypted value. Use its original value instead.'
                );
            } else {
                throw error;
            }
        }
        return encrypted;
    }

    async getEnvironmentVariabes(functionName: string): Promise<{ [key: string]: string }> {
        return await this.adaptee.getFunctionEnvironmentVariables(functionName);
    }

    async registerFortiAnalyzer(
        vmId: string,
        privateIp: string,
        primary: boolean,
        vip: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling registerFortiAnalyzer');
        const settings = await this.getSettings();
        const table = new AwsDBDef.AwsFortiAnalyzer(
            settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value || ''
        );
        const item: DBDef.FortiAnalyzerDbItem = {
            vmId: vmId,
            ip: privateIp,
            primary: primary,
            vip: vip
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: DBDef.SaveCondition.Upsert
        };
        await this.adaptee.saveItemToDb<DBDef.FortiAnalyzerDbItem>(table, item, conditionExp);
        this.proxy.logAsInfo('called registerFortiAnalyzer');
    }

    async sendNotification(message: string, subject?: string): Promise<void> {
        const snsTopicArn = this.settings.get(AwsFortiGateAutoscaleSetting.AwsSNSTopicArn);
        if (!snsTopicArn && snsTopicArn.value) {
            throw new Error('SNS Topic ARN not specified.');
        }
        await this.adaptee.publishSNSMessage(snsTopicArn.value, message, subject);
    }
}
