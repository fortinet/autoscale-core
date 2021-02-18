import * as AzureComputeModels from '@azure/arm-compute/esm/models';
import * as AzureNetworkModels from '@azure/arm-network/esm/models';
import path from 'path';
import { URL } from 'url';
import { SettingItemDefinition, Settings } from '../../autoscale-setting';
import { Blob } from '../../blob';
import {
    CloudFunctionInvocationPayload,
    constructInvocationPayload
} from '../../cloud-function-peer-invocation';
import { ReqMethod, ReqType } from '../../cloud-function-proxy';
import { NicAttachmentRecord } from '../../context-strategy/nic-attachment-context';
import {
    DbDeleteError,
    DbErrorCode,
    DbSaveError,
    KeyValue,
    SaveCondition
} from '../../db-definitions';
import { genChecksum } from '../../helper-function';
import {
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord,
    PlatformAdapter,
    ResourceFilter
} from '../../platform-adapter';
import {
    HealthCheckRecord,
    HealthCheckSyncState,
    PrimaryRecord,
    PrimaryRecordVoteState
} from '../../primary-election';
import { NetworkInterface, VirtualMachine, VirtualMachineState } from '../../virtual-machine';
import { AzureFunctionInvocationProxy, LogItem } from './azure-cloud-function-proxy';
import {
    AzureAutoscale,
    AzureAutoscaleDbItem,
    AzureCustomLog,
    AzureFortiAnalyzer,
    AzureLicenseStock,
    AzureLicenseStockDbItem,
    AzureLicenseUsage,
    AzureLicenseUsageDbItem,
    AzurePrimaryElection,
    AzurePrimaryElectionDbItem,
    AzureSettings,
    CosmosDBQueryWhereClause
} from './azure-db-definitions';
import {
    AzureFortiGateAutoscaleSetting,
    AzureFortiGateAutoscaleSettingItemDictionary
} from './azure-fortigate-autoscale-settings';
import { ApiCache, ApiCacheOption, AzurePlatformAdaptee } from './azure-platform-adaptee';

export type ConsistenyCheckType<T> = { [key in keyof T]?: string | number | boolean | null };
export class AzurePlatformAdapter implements PlatformAdapter {
    adaptee: AzurePlatformAdaptee;
    proxy: AzureFunctionInvocationProxy;
    createTime: number;
    settings: Settings;
    constructor(p: AzurePlatformAdaptee, proxy: AzureFunctionInvocationProxy, createTime?: number) {
        this.adaptee = p;
        this.proxy = proxy;
        this.createTime = (!isNaN(createTime) && createTime) || Date.now();
    }
    /**
     * initiate the class object
     * @returns {Promise} void
     */
    async init(): Promise<void> {
        // CAUTION: adaptee.init() is required.
        await this.adaptee.init();
        this.settings = await this.adaptee.loadSettings();
        // has settings been migrated from Function environment variables to db yet?
        const settingsSaved = this.settings.get(
            AzureFortiGateAutoscaleSetting.AzureFortiGateAutoscaleSettingSaved
        );
        // do the settings migration if not yet saved.
        if (!(settingsSaved && settingsSaved.truthValue)) {
            await this.saveSettings();
            // reload the settings
            this.settings = await this.adaptee.loadSettings();
        }
        await this.validateSettings();
    }

    /**
     * save settings from node environment variables to db
     * @returns {Promise} void
     */
    async saveSettings(): Promise<void> {
        // NOTE: this mapping matches each required setting item key with an existing
        // node environment variable.
        // key: settingKey, which is a defined setting key.
        // value: envKey, which is the env var name used in the Function App node environment.

        // invalidate the cache first
        await this.adaptee.reloadSettings(true);
        const settingItemMapping: Map<string, string> = new Map();
        Object.entries(AzureFortiGateAutoscaleSetting).forEach(([k, v]) => {
            settingItemMapping.set(k, v);
        });
        await Promise.all(
            Array.from(settingItemMapping.entries()).map(([, envKey]) => {
                const settingItem: SettingItemDefinition =
                    AzureFortiGateAutoscaleSettingItemDictionary[envKey];
                // if the setting key not exists in either the setting dictionary or the process.env
                // return null to be able to filter it out
                if (!settingItem) {
                    return null;
                }
                return this.saveSettingItem(
                    settingItem.keyName,
                    (process.env[envKey] === undefined && 'n/a') || process.env[envKey],
                    settingItem.description,
                    settingItem.jsonEncoded,
                    settingItem.editable
                );
            })
        );
        // ASSERT: each saveSettingItem completed.
        // save the flag to the db.
        const flagItem: SettingItemDefinition =
            AzureFortiGateAutoscaleSettingItemDictionary[
                AzureFortiGateAutoscaleSetting.AzureFortiGateAutoscaleSettingSaved
            ];
        await this.saveSettingItem(
            flagItem.keyName,
            'true',
            flagItem.description,
            flagItem.jsonEncoded,
            flagItem.editable
        );
    }
    /**
     * Save a setting to db
     * @param  {string} key the setting key
     * @param  {string} value the setting value
     * @param  {string} description? the setting description
     * @param  {boolean} jsonEncoded? is this setting in json encoded format or not
     * @param  {boolean} editable? is this setting editable
     * @returns {Promise} the key name of the saved setting
     */
    async saveSettingItem(
        key: string,
        value: string,
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<string> {
        const table = new AzureSettings();
        const item = table.downcast({
            settingKey: key,
            settingValue: value,
            description: description,
            jsonEncoded: jsonEncoded,
            editable: editable
        });
        const savedItem = await this.adaptee.saveItemToDb<typeof item>(
            table,
            item,
            SaveCondition.Upsert
        );
        return savedItem.settingKey;
    }
    /**
     * Get the request type defined in enum ReqType
     * @returns {Promise} the enum value of ReqType
     */
    async getRequestType(): Promise<ReqType> {
        const reqMethod = await this.proxy.getReqMethod();
        const headers = await this.proxy.getReqHeaders();
        const url = new URL(String(headers['x-original-url']), String(headers.host));
        if (url.pathname === '/api/byol-license') {
            if (reqMethod === ReqMethod.GET) {
                if (headers['fos-instance-id'] === null) {
                    throw new Error(
                        'Invalid request. fos-instance-id is missing in [GET] request header.'
                    );
                } else {
                    return Promise.resolve(ReqType.ByolLicense);
                }
            } else {
                throw new Error(`Invalid request. Method [${reqMethod}] not allowd`);
            }
        } else if (url.pathname === '/api/fgt-as-handler') {
            if (reqMethod === ReqMethod.GET) {
                if (headers['fos-instance-id'] === null) {
                    throw new Error(
                        'Invalid request. fos-instance-id is missing in [GET] request header.'
                    );
                } else {
                    return Promise.resolve(ReqType.BootstrapConfig);
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
        } else if (url.pathname === '/api/custom-log') {
            return Promise.resolve(ReqType.CustomLog);
        } else {
            throw new Error(
                `Unsupported CloudFunctionProxy. Request: ${JSON.stringify(this.proxy.request)}`
            );
        }
    }
    /**
     * Get the heartbeat interval passing by the request called by a FortiGate
     * @returns {Promise} heartbeat interval
     */
    async getReqHeartbeatInterval(): Promise<number> {
        const reqType: ReqType = await this.getRequestType();
        if (reqType === ReqType.HeartbeatSync) {
            const body = await this.proxy.getReqBody();
            return (body.interval && Number(body.interval)) || NaN;
        } else {
            return NaN;
        }
    }
    /**
     * Get the vm id passing by the request called by a FortiGate.
     * The vm id is the 'vmId' property of a virtual machine.
     * @returns {Promise} vmId
     */
    async getReqVmId(): Promise<string> {
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
    }
    /**
     * Return the JSON stringified request.
     * @returns {Promise} request as a string
     */
    getReqAsString(): Promise<string> {
        return Promise.resolve(JSON.stringify(this.proxy.request));
    }
    /**
     * Get the full list of Autoscale Setting items from db
     * @returns {Promise} Settings (a map)
     */
    getSettings(): Promise<Settings> {
        return Promise.resolve(this.settings);
    }
    /**
     * Validate the loaded settings to ensure setting item integrity.
     * @returns {Promise} validation passed is true or false
     */
    validateSettings(): Promise<boolean> {
        const required = [
            AzureFortiGateAutoscaleSetting.AutoscaleHandlerUrl,
            AzureFortiGateAutoscaleSetting.FortiGatePskSecret,
            AzureFortiGateAutoscaleSetting.FortiGateSyncInterface,
            AzureFortiGateAutoscaleSetting.FortiGateTrafficPort,
            AzureFortiGateAutoscaleSetting.FortiGateAdminPort,
            AzureFortiGateAutoscaleSetting.HeartbeatInterval,
            AzureFortiGateAutoscaleSetting.ByolScalingGroupName,
            AzureFortiGateAutoscaleSetting.PaygScalingGroupName
        ];
        const missingKeys = required.filter(key => !this.settings.has(key)).join(', ');
        if (missingKeys) {
            throw new Error(`The following required setting item not found: ${missingKeys}`);
        }
        return Promise.resolve(true);
    }
    /**
     * map an Azure vm object into the Autoscale VirtualMachine class object.
     * @param  {AzureComputeModels.VirtualMachineScaleSetVM} instance vm instance to map
     * @param  {string} scalingGroupName the scaling group containing the vm instance
     * @param  {AzureNetworkModels.NetworkInterface[]} nics network interfaces associated with this
     * vm instance.
     * @returns {VirtualMachine} an Autoscale VirtualMachine class object
     */
    protected mapVm(
        instance: AzureComputeModels.VirtualMachineScaleSetVM,
        scalingGroupName: string,
        nics: AzureNetworkModels.NetworkInterface[]
    ): VirtualMachine {
        let state: VirtualMachineState;
        let provisioningState: string;
        let powerState: string;
        if (instance.instanceView && instance.instanceView.statuses) {
            instance.instanceView.statuses.forEach(s => {
                if (s.code.includes('ProvisioningState')) {
                    provisioningState = s.code.split('/')[1];
                } else if (s.code.includes('PowerState')) {
                    powerState = s.code.split('/')[1];
                }
            });
        }
        // NOTE: see: https://docs.microsoft.com/en-us/azure/virtual-machines/states-lifecycle
        // there's no terminated state for a vm in Azure because terminated vm will not be visible.
        if (powerState === 'running') {
            state = VirtualMachineState.Running;
        } else if (powerState === 'stopped') {
            state = VirtualMachineState.Stopped;
        } else if (powerState === 'deallocated') {
            state = VirtualMachineState.Deallocated;
        } else if (powerState === 'starting') {
            state = VirtualMachineState.Starting;
        } else if (powerState === 'stopping') {
            state = VirtualMachineState.Stopping;
        } else if (provisioningState === 'updating') {
            state = VirtualMachineState.Updating;
        } else if (provisioningState === 'creating') {
            state = VirtualMachineState.Creating;
        } else if (provisioningState === 'deleting') {
            state = VirtualMachineState.Terminating;
        } else {
            state = VirtualMachineState.Unknown;
        }
        // network interface
        const networkInterfaces = nics.map((nic, index) => {
            return this.mapNic(nic, index);
        });
        const primaryNic = networkInterfaces.length > 0 && networkInterfaces[0];
        const vm: VirtualMachine = {
            id: instance.vmId,
            scalingGroupName: scalingGroupName,
            primaryPrivateIpAddress: primaryNic && primaryNic.privateIpAddress,
            // TODO: vm in virtual machine scale set is associated with a load balancer and use
            // port forwarding to route incoming traffic. So implementation to retrieve the public
            // ip address of the load balancer would be needed when there's a need to use that
            // public ip address in a feature. Since retrieving information about the load balancer
            // also counts toward the arm request limit (see: https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/request-limits-and-throttling)
            // but there's no feature requires the public ip so far, we don't retrieve the public
            // ip address unless further requirements.
            primaryPublicIpAddress: null,
            virtualNetworkId: primaryNic && primaryNic.virtualNetworkId,
            subnetId: primaryNic && primaryNic.subnetId,
            securityGroups: [],
            networkInterfaces: networkInterfaces,
            networkInterfaceIds: networkInterfaces.map(nic => nic.id),
            sourceData: {},
            state: state
        };
        Object.assign(vm.sourceData, instance);
        return vm;
    }
    /**
     * map an Azure network interface object to an Autoscale NetworkInterface class object
     * @param  {AzureNetworkModels.NetworkInterface} eni the Azure network interface object to map
     * @param  {number} index the index of the logical position of the eni in the device
     * @returns {NetworkInterface} the Autoscale NetworkInterface class object
     */
    protected mapNic(eni: AzureNetworkModels.NetworkInterface, index: number): NetworkInterface {
        const [primaryIpConfiguration] =
            (eni && eni.ipConfigurations.filter(ipConfig => ipConfig.primary)) || [];
        const matchVNet = primaryIpConfiguration.subnet.id.match(
            new RegExp('(?<=virtualNetworks/).*(?=/subnets)')
        );
        const matchSubnet = primaryIpConfiguration.subnet.id.match(new RegExp('(?<=subnets/).*'));
        const nic: NetworkInterface = {
            id: eni.id,
            privateIpAddress: primaryIpConfiguration && primaryIpConfiguration.privateIPAddress,
            index: index,
            subnetId: Array.isArray(matchSubnet) && matchSubnet[0],
            virtualNetworkId: Array.isArray(matchVNet) && matchVNet[0],
            attachmentId: undefined, // NOTE: no attachment defined for nic in the Azure platform
            description: undefined // NOTE: no description defined for nic in the Azure platform
        };
        return nic;
    }

    // describeScalingGroup(scalingGroupName: string):
    /**
     * Get the virtual machine (representing a FortiGate) that made the request to the Autoscale
     * function.
     * @returns {Promise} the requesting vm
     */
    async getTargetVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getTargetVm');
        const byolGroupName = this.settings.get(AzureFortiGateAutoscaleSetting.ByolScalingGroupName)
            .value;
        const paygGroupName = this.settings.get(AzureFortiGateAutoscaleSetting.PaygScalingGroupName)
            .value;
        // try to find vm in the byol scaling group
        let describeInstanceResult: ApiCache<AzureComputeModels.VirtualMachineScaleSetVM>;
        let instance: AzureComputeModels.VirtualMachineScaleSetVM;
        let scalingGroupName: string;
        const vmId: string = await this.getReqVmId();
        try {
            scalingGroupName = byolGroupName;
            describeInstanceResult = await this.adaptee.describeInstance(scalingGroupName, vmId);
            // try to find vm in the payg scaling group if not found in byol group
            if (!describeInstanceResult.result) {
                scalingGroupName = paygGroupName;
                describeInstanceResult = await this.adaptee.describeInstance(
                    scalingGroupName,
                    vmId
                );
            }
            // ASSERT: the vm exists in either the byol or the payg scaling group.
            instance = describeInstanceResult.result;
            if (!instance) {
                throw new Error(`vm (vmId: ${vmId}) not found in any scaling group.`);
            }
        } catch (error) {
            this.proxy.logForError('cannot get target vm', error);
            throw error;
        }
        // ASSERT: the vm is found.
        // get network interfaces
        const listNetworkInterfacesResult = await this.adaptee.listNetworkInterfaces(
            scalingGroupName,
            Number(instance.instanceId),
            ApiCacheOption.ReadCacheFirst,
            describeInstanceResult.ttl
        );
        const nics = listNetworkInterfacesResult.result;
        const vm: VirtualMachine = this.mapVm(instance, scalingGroupName, nics);
        this.proxy.logAsInfo('called getTargetVm');
        return vm;
    }
    /**
     * Get the primary virtual machine (representing a FortiGate) that was elected in the
     * Autoscale cluster
     * @returns {Promise} the primary vm in the Autoscale cluster
     */
    async getPrimaryVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getPrimaryVm');
        const primaryRecord = await this.getPrimaryRecord();
        if (!primaryRecord) {
            return null;
        }
        const describeInstanceResult = await this.adaptee.describeInstance(
            primaryRecord.scalingGroupName,
            primaryRecord.vmId
        );
        let vm: VirtualMachine;
        if (describeInstanceResult.result) {
            // get network interfaces
            const listNetworkInterfacesResult = await this.adaptee.listNetworkInterfaces(
                primaryRecord.scalingGroupName,
                Number(describeInstanceResult.result.instanceId),
                ApiCacheOption.ReadCacheFirst,
                describeInstanceResult.ttl
            );
            const nics = listNetworkInterfacesResult.result;
            vm = this.mapVm(describeInstanceResult.result, primaryRecord.scalingGroupName, nics);
        }
        this.proxy.logAsInfo('called getPrimaryVm');
        return vm;
    }
    /**
     * List all vm instances of a certain scaling group
     * @param  {string} scalingGroupName the scaling group name to list
     * @param  {boolean} withNics whether retrieve the nic of each vm or not
     * @returns {Promise} an array of {scalingGroupName, vm instance, its nics(if requested)}
     */
    private async listScalingGroupInstances(
        scalingGroupName: string,
        withNics = false
    ): Promise<
        {
            scalingGroupName: string;
            instance: AzureComputeModels.VirtualMachineScaleSetVM;
            nics: AzureNetworkModels.NetworkInterface[];
        }[]
    > {
        const listInstancesResults = await this.adaptee.listInstances(scalingGroupName);
        return await Promise.all(
            listInstancesResults.result.map(async instance => {
                const res: {
                    scalingGroupName: string;
                    instance: AzureComputeModels.VirtualMachineScaleSetVM;
                    nics: AzureNetworkModels.NetworkInterface[];
                } = {
                    scalingGroupName: scalingGroupName,
                    instance: instance,
                    nics: []
                };
                if (withNics) {
                    const listNetworkInterfacesResult = await this.adaptee.listNetworkInterfaces(
                        scalingGroupName,
                        Number(instance.instanceId)
                    );
                    res.nics = listNetworkInterfacesResult.result || [];
                }
                return res;
            })
        );
    }
    /**
     * List all vm instances in each scaling group of the Autoscale cluster
     * @param  {boolean} identifyScalingGroup (unused parameter)
     * @param  {boolean} listNic whether retrieve the nic of each vm or not
     * @returns {Promise} a list of all vm instances in the Autoscale cluster
     */
    async listAutoscaleVm(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        identifyScalingGroup?: boolean, // this variable required by the implementation but isn't used
        listNic?: boolean
    ): Promise<VirtualMachine[]> {
        this.proxy.logAsInfo('calling listAutoscaleVm');
        // NOTE: need to list vm in both byol and payg groups
        const byolGroupName = this.settings.get(AzureFortiGateAutoscaleSetting.ByolScalingGroupName)
            .value;
        const paygGroupName = this.settings.get(AzureFortiGateAutoscaleSetting.PaygScalingGroupName)
            .value;
        const instances = [
            ...(await this.listScalingGroupInstances(byolGroupName, listNic)),
            ...(await this.listScalingGroupInstances(paygGroupName, listNic))
        ];
        const vms = instances.map(item =>
            this.mapVm(item.instance, item.scalingGroupName, item.nics)
        );
        this.proxy.logAsInfo('called listAutoscaleVm');
        return vms;
    }
    /**
     * Get the Autoscale health check record of a vm with the given vmId
     * @param  {string} vmId the vmId property of the vm.
     * @returns {Promise} the health check record
     */
    async getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord> {
        this.proxy.logAsInfo('calling getHealthCheckRecord');
        const table = new AzureAutoscale();
        const dbItem = await this.adaptee.getItemFromDb<AzureAutoscaleDbItem>(table, [
            {
                key: table.primaryKey.name,
                value: vmId
            }
        ]);

        let record: HealthCheckRecord;
        const heartbeatDelayAllowanceSettingItem = this.settings.get(
            AzureFortiGateAutoscaleSetting.HeartbeatDelayAllowance
        );
        const maxHeartbeatLossCountSettingItem = this.settings.get(
            AzureFortiGateAutoscaleSetting.HeartbeatLossCount
        );

        const delayAllowance: number =
            (heartbeatDelayAllowanceSettingItem &&
                Number(heartbeatDelayAllowanceSettingItem.value)) ||
            0;

        const maxHeartbeatLossCount: number =
            (maxHeartbeatLossCountSettingItem && Number(maxHeartbeatLossCountSettingItem.value)) ||
            0;

        if (dbItem) {
            // if heartbeatDelay is <= 0, it means hb arrives early or ontime
            const heartbeatDelay = this.createTime - dbItem.nextHeartBeatTime - delayAllowance;

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
                seq: dbItem.seq,
                healthy: isHealthy,
                upToDate: true
            };
        }
        this.proxy.logAsInfo('called getHealthCheckRecord');
        return record;
    }
    /**
     * Get the Autoscale health check record of the elected primary vm
     * @param  {KeyValue[]} filters optional filter to match the record or null if not match
     * @returns {Promise} the health check record
     */
    async getPrimaryRecord(filters?: KeyValue[]): Promise<PrimaryRecord> {
        this.proxy.logAsInfo('calling getPrimaryRecord');
        const table = new AzurePrimaryElection();
        const listClause: CosmosDBQueryWhereClause[] =
            filters &&
            filters.map(f => {
                return { name: f.key, value: f.value };
            });
        // ASSERT: there's only 1 matching primary record or no matching record.
        const queryResult = await this.adaptee.listItemFromDb<AzurePrimaryElectionDbItem>(
            table,
            listClause,
            1
        );
        const [record] = queryResult.result || [];
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
    /**
     * The implementation for a comparison method for VirtualMachine class objects
     * @param  {VirtualMachine} vmA vm A to compare with
     * @param  {VirtualMachine} vmB vm B to compare with
     * @returns {boolean} true if only they are deemed 'the same'.
     */
    vmEquals(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        if (!(vmA && vmB)) {
            return false;
        }
        const keyDiff = [
            'id',
            'scalingGroupName',
            'primaryPrivateIpAddress',
            'virtualNetworkId',
            'subnetId'
        ].filter(k => vmA[k] !== vmB[k]);

        return keyDiff.length === 0;
    }
    /**
     * upsert an Autoscale health check record
     * @param  {HealthCheckRecord} rec the health check record to save
     * @returns {Promise} void
     */
    async createHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        this.proxy.logAsInfo('calling createHealthCheckRecord');
        const table = new AzureAutoscale();
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item = table.downcast({
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            primaryIp: rec.primaryIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            seq: rec.seq
        });
        // NOTE: when create a db record, do not need to check data consistency.
        await this.adaptee.saveItemToDb<typeof item>(table, item, SaveCondition.InsertOnly, false);
        this.proxy.logAsInfo('called createHealthCheckRecord');
    }
    /**
     * update an existing Autoscale health check record.
     * @param  {HealthCheckRecord} rec record to update
     * @returns {Promise} void
     */
    async updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        this.proxy.logAsInfo('calling updateHealthCheckRecord');
        const table = new AzureAutoscale();
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item = table.downcast({
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            primaryIp: rec.primaryIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            seq: rec.seq
        });
        const check: ConsistenyCheckType<typeof item> = {
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip
        };
        await this.adaptee.saveItemToDb<typeof item>(table, item, SaveCondition.UpdateOnly, check);
        this.proxy.logAsInfo('called updateHealthCheckRecord');
    }
    /**
     * insert a primary record, not overwrite one with the same primary key.
     * can also optionally replace an existing one with a given primary key value
     * @param  {PrimaryRecord} rec primary record to insert
     * @param  {PrimaryRecord} oldRec existing primary record to replace
     * @returns {Promise} void
     */
    async createPrimaryRecord(rec: PrimaryRecord, oldRec: PrimaryRecord): Promise<void> {
        this.proxy.logAsInfo('calling createPrimaryRecord.');
        const table = new AzurePrimaryElection();
        const item = table.downcast({
            id: rec.id,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            vmId: rec.vmId,
            virtualNetworkId: rec.virtualNetworkId,
            subnetId: rec.subnetId,
            voteEndTime: rec.voteEndTime,
            voteState: rec.voteState
        });
        // save record only if record for a certain scaling group name not exists, or
        // if it exists but timeout.
        // if specified an old rec to purge, use a strict conditional expression to replace.
        try {
            if (oldRec) {
                this.proxy.logAsInfo(
                    `purging existing record (id: ${oldRec.id}, ` +
                        `scalingGroup: ${oldRec.scalingGroupName}, vmId: ${oldRec.vmId})`
                );
                const itemToDelete = table.downcast({ ...oldRec });
                // NOTE: if the new and old records are for the same primary vm, and the
                // old record indicates that it has timed out, do not need
                // to check data consistency.
                const consistencyCheckRequired = !(
                    rec.id === oldRec.id && oldRec.voteState === PrimaryRecordVoteState.Timeout
                );
                await this.adaptee.deleteItemFromDb<typeof item>(
                    table,
                    itemToDelete,
                    consistencyCheckRequired
                );
            }
        } catch (error) {
            this.proxy.logForError('DB error.', error);
            if (error instanceof DbDeleteError) {
                this.proxy.logAsError(`Cannot purge old primary record (id: ${oldRec.id})`);
            }
            throw error;
        }
        try {
            // save the new record
            await this.adaptee.saveItemToDb<typeof item>(
                table,
                item,
                SaveCondition.InsertOnly // ASSERT: if record exists, will throw error
            );
            this.proxy.logAsInfo('called createPrimaryRecord.');
        } catch (error) {
            this.proxy.logForError('DB error.', error);
            if (error instanceof DbSaveError && error.code === DbErrorCode.KeyConflict) {
                this.proxy.logAsError(`Primary record already exists (id: ${item.id})`);
            }
            this.proxy.logAsInfo('called createPrimaryRecord.');
            throw error;
        }
        this.proxy.logAsInfo('called createPrimaryRecord.');
    }
    /**
     * Insert a new primary record or update it only when the primary key is the same.
     * @param  {PrimaryRecord} rec primary record to update
     * @returns {Promise} void
     */
    async updatePrimaryRecord(rec: PrimaryRecord): Promise<void> {
        this.proxy.logAsInfo('calling updatePrimaryRecord.');
        const table = new AzurePrimaryElection();
        const item = table.downcast({
            id: rec.id,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            vmId: rec.vmId,
            virtualNetworkId: rec.virtualNetworkId,
            subnetId: rec.subnetId,
            voteEndTime: rec.voteEndTime,
            voteState: rec.voteState
        });
        // save record only if the keys in rec match the keys in db
        // save record only when the elected primary match the record
        // and vote state is still pending and the voting not end yet
        let existingRec: typeof item;
        try {
            existingRec = await this.adaptee.getItemFromDb<typeof item>(table, [
                {
                    key: table.primaryKey.name,
                    value: String(rec[table.primaryKey.name])
                }
            ]);
        } catch (error) {
            this.proxy.logForError(`Primary record (id: ${rec.id}) not found.`, error);
        }
        if (existingRec) {
            if (rec.scalingGroupName !== existingRec.scalingGroupName) {
                throw new Error(
                    'Primary record value not match on attribute: scalingGroupName.' +
                        ` Exptected: ${rec.scalingGroupName}, found: ${existingRec.scalingGroupName}`
                );
            } else if (existingRec.voteState !== PrimaryRecordVoteState.Pending) {
                throw new Error(
                    'Primary record vote state not match.' +
                        ` Expected: ${PrimaryRecordVoteState.Pending}, found: ${existingRec.voteState}`
                );
            } else if (
                existingRec.voteState === PrimaryRecordVoteState.Pending &&
                existingRec.voteEndTime <= Date.now()
            ) {
                throw new Error(
                    `Primary record vote ended (at ${existingRec.voteEndTime}) already.` +
                        ` It's ${Date.now()} now.`
                );
            }
        }

        const check: ConsistenyCheckType<typeof item> = {
            id: item.id,
            scalingGroupName: item.scalingGroupName
        };

        // upsert
        await this.adaptee.saveItemToDb<typeof item>(table, item, SaveCondition.Upsert, check);
        this.proxy.logAsInfo('called updatePrimaryRecord.');
    }
    /**
     * Load a configset file from blob storage
     * @param  {string} name the configset name
     * @param  {boolean} custom (optional) whether load it from a custom location or not
     * @returns {Promise} the configset content as a string
     */
    async loadConfigSet(name: string, custom?: boolean): Promise<string> {
        this.proxy.logAsInfo(`loading${custom ? ' (custom)' : ''} configset: ${name}`);
        const containerName = custom
            ? this.settings.get(AzureFortiGateAutoscaleSetting.CustomAssetContainer)
            : this.settings.get(AzureFortiGateAutoscaleSetting.AssetStorageContainer);
        const keyPrefixSetting = custom
            ? this.settings.get(AzureFortiGateAutoscaleSetting.CustomAssetDirectory)
            : this.settings.get(AzureFortiGateAutoscaleSetting.AssetStorageDirectory);
        if (!keyPrefixSetting) {
            throw new Error('Missing storage container or directory setting.');
        }

        const keyPrefix = [keyPrefixSetting.value, 'configset'];
        keyPrefix.push(name);
        const content = await this.adaptee.getBlobContent(
            containerName.value,
            path.normalize(path.resolve('/', ...keyPrefix.filter(k => !!k)).substr(1))
        );
        this.proxy.logAsInfo('configset loaded.');
        return content;
    }
    async listConfigSet(subDirectory?: string, custom?: boolean): Promise<Blob[]> {
        this.proxy.logAsInfo('calling listConfigSet');
        const keyPrefixSetting = custom
            ? this.settings.get(AzureFortiGateAutoscaleSetting.CustomAssetDirectory)
            : this.settings.get(AzureFortiGateAutoscaleSetting.AssetStorageDirectory);
        let blobs: Blob[] = [];
        if (custom && !keyPrefixSetting.value) {
            this.proxy.logAsInfo('Custom config set location not specified. No configset loaded.');
            return [];
        }

        const container = 'configset';

        const location = path.join(
            ...[keyPrefixSetting.value, subDirectory || null].filter(r => !!r)
        );

        try {
            this.proxy.logAsInfo(
                `container: ${container}, list configset in directory: ${location}`
            );
            blobs = await this.adaptee.listBlob(container, location);
        } catch (error) {
            this.proxy.logAsWarning(error);
        }
        this.proxy.logAsInfo('called listConfigSet');
        return blobs;
    }
    async deleteVmFromScalingGroup(vmId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteVmFromScalingGroup');
        try {
            const vms = await this.listAutoscaleVm();
            const [vm] = vms.filter(v => v.id === vmId) || [];
            if (!vm) {
                this.proxy.logAsWarning(`vm (id: ${vmId}) not found. skip deleting it.`);
            } else {
                const scalingGroupName = vm.scalingGroupName;
                const success = await this.adaptee.deleteInstanceFromVmss(
                    scalingGroupName,
                    Number(vm.sourceData.instanceId)
                );
                if (success) {
                    this.proxy.logAsInfo(`delete completed. vm (id: ${vmId}) is deleted.`);
                } else {
                    this.proxy.logAsWarning(`delete completed. vm (id: ${vmId}) not found.)`);
                }
            }
        } catch (error) {
            this.proxy.logForError('Failed to delele vm from scaling group.', error);
        }
        this.proxy.logAsInfo('called deleteVmFromScalingGroup');
    }
    async listLicenseFiles(
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<LicenseFile[]> {
        const blobs: Blob[] = await this.adaptee.listBlob(
            storageContainerName,
            licenseDirectoryName
        );
        return await Promise.all(
            blobs.map(async blob => {
                const filePath = path.join(licenseDirectoryName, blob.fileName);
                const content = await this.adaptee.getBlobContent(storageContainerName, filePath);
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
        const table = new AzureLicenseStock();
        const queryResult = await this.adaptee.listItemFromDb<AzureLicenseStockDbItem>(table);
        const dbItems = queryResult.result || [];
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
        const table = new AzureLicenseUsage();
        const queryResult = await this.adaptee.listItemFromDb<AzureLicenseUsageDbItem>(table);
        const dbItems = queryResult.result || [];
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
        const table = new AzureLicenseStock();
        const queryResult = await this.adaptee.listItemFromDb<AzureLicenseStockDbItem>(table);
        const dbItems = queryResult.result || [];
        // load all license stock records in the db
        const items = new Map(
            dbItems.map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        const stockRecordChecksums = Array.from(items.keys());
        await Promise.all(
            // read the content of each license file
            records.map(record => {
                const item = table.downcast({
                    checksum: record.checksum,
                    algorithm: record.algorithm,
                    fileName: record.fileName,
                    productName: record.productName
                });
                let typeText: string;
                let saveCondition: SaveCondition;
                // recrod exists, update it
                if (items.has(record.checksum)) {
                    stockRecordChecksums.splice(stockRecordChecksums.indexOf(record.checksum), 1);
                    saveCondition = SaveCondition.UpdateOnly;
                    typeText =
                        `update existing item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                } else {
                    saveCondition = SaveCondition.Upsert;
                    typeText =
                        `create new item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                }
                return this.adaptee
                    .saveItemToDb<typeof item>(table, item, saveCondition, false)
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
                    .deleteItemFromDb<AzureLicenseStockDbItem>(table, item)
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
        const table = new AzureLicenseUsage();
        // get all records from the db as a snapshot
        const queryResult = await this.adaptee.listItemFromDb<AzureLicenseUsageDbItem>(table);
        const dbItems = queryResult.result || [];
        const items = new Map<string, AzureLicenseUsageDbItem>(
            dbItems.map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        await Promise.all(
            records.map(rec => {
                const item = table.downcast({
                    checksum: rec.item.checksum,
                    algorithm: rec.item.algorithm,
                    fileName: rec.item.fileName,
                    productName: rec.item.productName,
                    vmId: rec.item.vmId,
                    scalingGroupName: rec.item.scalingGroupName,
                    assignedTime: rec.item.assignedTime,
                    vmInSync: rec.item.vmInSync
                });
                let typeText: string;
                let saveCondition: SaveCondition;
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
                    saveCondition = SaveCondition.UpdateOnly;

                    const check: ConsistenyCheckType<typeof item> = {
                        vmId: rec.reference.vmId,
                        scalingGroupName: rec.reference.scalingGroupName,
                        productName: rec.reference.productName,
                        algorithm: rec.reference.algorithm
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
                    // NOTE: must ensure the consistency because the updating of the usage record
                    // is expected to happen with a race condition.
                    return this.adaptee
                        .saveItemToDb<AzureLicenseUsageDbItem>(table, item, saveCondition, check)
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
                    saveCondition = SaveCondition.InsertOnly;
                    typeText =
                        `create new item (checksum: ${item.checksum})` +
                        `New values (filename: ${item.fileName}, vmId: ${item.vmId}, ` +
                        `scalingGroupName: ${item.scalingGroupName}, ` +
                        `productName: ${item.productName}, algorithm: ${item.algorithm})`;
                    return this.adaptee
                        .saveItemToDb<AzureLicenseUsageDbItem>(table, item, saveCondition, false)
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
        const content = await this.adaptee.getBlobContent(storageContainerName, filePath);
        this.proxy.logAsInfo('called loadLicenseFileContent');
        return content;
    }
    // TODO: unused function as of this time
    listNicAttachmentRecord(): Promise<NicAttachmentRecord[]> {
        this.proxy.logAsInfo('calling listNicAttachmentRecord');
        this.proxy.logAsInfo('this method is unused thus always returning an empty array.');
        this.proxy.logAsInfo('called listNicAttachmentRecord');
        return Promise.resolve([]);
    }
    // TODO: unused function as of this time
    updateNicAttachmentRecord(vmId: string, nicId: string, status: string): Promise<void> {
        this.proxy.logAsInfo('calling updateNicAttachmentRecord');
        this.proxy.logAsInfo(
            'this method is unused. parameter values passed here are:' +
                ` vmId:${vmId}, nicId: ${nicId}, status: ${status}`
        );
        this.proxy.logAsInfo('called updateNicAttachmentRecord');
        return Promise.resolve();
    }
    // TODO: unused function as of this time
    deleteNicAttachmentRecord(vmId: string, nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteNicAttachmentRecord');
        this.proxy.logAsInfo(
            'this method is unused. parameter values passed here are:' +
                ` vmId:${vmId}, nicId: ${nicId}`
        );
        this.proxy.logAsInfo('called deleteNicAttachmentRecord');
        return Promise.resolve();
    }
    // TODO: unused function as of this time
    createNetworkInterface(
        subnetId?: string,
        description?: string,
        securityGroups?: string[],
        privateIpAddress?: string
    ): Promise<NetworkInterface> {
        this.proxy.logAsInfo('calling createNetworkInterface');
        this.proxy.logAsInfo(
            'this method is unused thus always returning null. parameter values passed here are:' +
                ` subnetId?:${subnetId}, description?: ${description}` +
                `, securityGroups?: ${securityGroups}, privateIpAddress?: ${privateIpAddress}`
        );
        this.proxy.logAsInfo('called createNetworkInterface');
        return Promise.resolve(null);
    }
    // TODO: unused function as of this time
    deleteNetworkInterface(nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteNetworkInterface');
        this.proxy.logAsInfo(
            'this method is unused. parameter values passed here are:' + ` nicId: ${nicId}`
        );
        this.proxy.logAsInfo('called deleteNetworkInterface');
        return Promise.resolve();
    }
    // TODO: unused function as of this time
    attachNetworkInterface(vmId: string, nicId: string, index?: number): Promise<void> {
        this.proxy.logAsInfo('calling attachNetworkInterface');
        this.proxy.logAsInfo(
            'this method is unused. parameter values passed here are:' +
                ` vmId:${vmId}, nicId: ${nicId}, index: ${index}`
        );
        this.proxy.logAsInfo('called attachNetworkInterface');
        return Promise.resolve();
    }
    // TODO: unused function as of this time
    detachNetworkInterface(vmId: string, nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling detachNetworkInterface');
        this.proxy.logAsInfo(
            'this method is unused. parameter values passed here are:' +
                ` vmId:${vmId}, nicId: ${nicId}`
        );
        this.proxy.logAsInfo('called detachNetworkInterface');
        return Promise.resolve();
    }
    // TODO: unused function as of this time
    listNetworkInterfaces(tags: ResourceFilter[], status?: string): Promise<NetworkInterface[]> {
        this.proxy.logAsInfo('calling listNetworkInterfaces');
        this.proxy.logAsInfo(
            'this method is unused thus always returning an empty array. ' +
                'parameter values passed here are:' +
                ` tags:${JSON.stringify(tags)}, status?: ${status}`
        );
        this.proxy.logAsInfo('called listNetworkInterfaces');
        return Promise.resolve([]);
    }
    // TODO: unused function as of this time
    tagNetworkInterface(nicId: string, tags: ResourceFilter[]): Promise<void> {
        this.proxy.logAsInfo('calling tagNetworkInterface');
        this.proxy.logAsInfo(
            'this method is unused. parameter values passed here are:' +
                ` nicId: ${nicId}, tags:${JSON.stringify(tags)}`
        );
        this.proxy.logAsInfo('called tagNetworkInterface');
        return Promise.resolve();
    }
    async registerFortiAnalyzer(
        vmId: string,
        privateIp: string,
        primary: boolean,
        vip: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling registerFortiAnalyzer');
        const table = new AzureFortiAnalyzer();
        const item = table.downcast({
            vmId: vmId,
            ip: privateIp,
            primary: primary,
            vip: vip
        });
        await this.adaptee.saveItemToDb<typeof item>(table, item, SaveCondition.Upsert, false);
        this.proxy.logAsInfo('called registerFortiAnalyzer');
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

        // NOTE: Autoscale leverages Azure Function access keys to ensure security
        // see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=csharp#authorization-keys
        const reqHeaders = await this.proxy.getReqHeaders();
        const reqQueryParams = await this.proxy.getReqQueryParameters();
        const functionAccessKey =
            String(reqHeaders['x-functions-key']) || reqQueryParams.code || null;
        const response = await this.adaptee.invokeAzureFunction(
            functionEndpoint,
            JSON.stringify(p),
            functionAccessKey
        );
        this.proxy.logAsInfo(`invocation response status code: ${response.status}`);
        this.proxy.logAsInfo('called invokeAutoscaleFunction');
        return response.status;
    }
    createAutoscaleFunctionInvocationKey(
        payload: unknown,
        functionEndpoint: string,
        invocable: string
    ): string {
        const psk = this.settings.get(AzureFortiGateAutoscaleSetting.FortiGatePskSecret).value;
        return genChecksum(
            `${functionEndpoint}:${invocable}:${psk}:${JSON.stringify(payload)}`,
            'sha256'
        );
    }

    async getSecretFromKeyVault(name: string): Promise<string> {
        try {
            const decrypted = await this.adaptee.keyVaultGetSecret(name);
            this.proxy.logAsInfo('Environment variable is decrypted. Use the decrpted value.');
            return decrypted;
        } catch (error) {
            this.proxy.logAsWarning(
                'Unseccessfully decrypt the given varable, probably because ' +
                    'the input is a non-encrypted value. Use its original value instead.'
            );
            throw error;
        }
    }

    async saveLogs(logs: LogItem[]): Promise<void> {
        if (!logs) {
            return;
        }
        let content = '';
        logs.forEach(log => {
            const args =
                (log.arguments &&
                    log.arguments.map((arg, index) => {
                        const prefix = index > 0 ? `arg${index}: ` : '';
                        return `${prefix}${arg}`;
                    })) ||
                [];
            content =
                `${content}<log timestamp:${log.timestamp} level:${log.level}>` +
                `${args.join('\n')}</log>\n`;
        });
        const table = new AzureCustomLog();
        const item = table.downcast({
            id: undefined,
            timestamp: undefined,
            logContent: content
        });
        const save = (logItem: typeof item): Promise<typeof item> => {
            const now = Date.now();
            logItem.id = `${now}-${Math.round(Math.random() * 1000)}`;
            logItem.timestamp = now;
            return this.adaptee.saveItemToDb<typeof item>(table, item, SaveCondition.InsertOnly);
        };

        try {
            let tryAgainWhenFailed = false;
            await save(item).catch(error => {
                if (error instanceof DbSaveError) {
                    tryAgainWhenFailed = true;
                } else {
                    throw error;
                }
            });
            if (tryAgainWhenFailed) {
                await save(item);
            }
        } catch (error) {
            this.proxy.logForError('Error in saving logs to CustomLog', error);
        }
    }
}
