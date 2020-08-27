import { Settings } from './autoscale-setting';
import { ReqType } from './cloud-function-proxy';
import { NicAttachmentRecord } from './context-strategy/nic-attachment-context';
import { KeyValue } from './db-definitions';
import { JSONable } from './jsonable';
import { HealthCheckRecord, MasterRecord } from './master-election';
import { NetworkInterface, VirtualMachine } from './virtual-machine';
import { Blob } from './blob';

export interface ResourceFilter {
    key: string;
    value: string;
    isTag?: boolean;
}

export interface LicenseFile {
    fileName: string;
    checksum: string;
    algorithm: string;
    content: string;
}

export interface LicenseStockRecord {
    fileName: string;
    checksum: string;
    algorithm: string;
    productName: string;
}

export interface LicenseUsageRecord {
    fileName: string;
    checksum: string;
    algorithm: string;
    productName: string;
    vmId: string;
    scalingGroupName: string;
    assignedTime: number;
    vmInSync: boolean;
}

export interface TgwVpnAttachmentRecord {
    vmId: string;
    ip: string;
    vpnConnectionId: string;
    transitGatewayId: string;
    transitGatewayAttachmentId: string;
    customerGatewayId: string;
    vpnConnection: JSONable;
}

export interface PlatformAdapter {
    adaptee: {};
    readonly createTime: number;
    // checkRequestIntegrity(): void;
    init(): Promise<void>;
    saveSettingItem(
        key: string,
        value: string,
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<string>;
    getRequestType(): Promise<ReqType>;
    /**
     * heartbeat interval in the request in ms.
     * @returns number interval in ms
     */
    getReqHeartbeatInterval(): number;
    getReqVmId(): string;
    getReqAsString(): string;
    getSettings(): Promise<Settings>;
    /**
     * validate settings by checking the integrity of each required setting item. Ensure that they
     * have been added properly.
     * @returns Promise
     */
    validateSettings(): Promise<boolean>;
    getTargetVm(): Promise<VirtualMachine | null>;
    getMasterVm(): Promise<VirtualMachine | null>;
    listAutoscaleVm(
        identifyScalingGroup?: boolean,
        listNic?: boolean
    ): Promise<VirtualMachine[] | null>;
    getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord | null>;
    getMasterRecord(filters?: KeyValue[]): Promise<MasterRecord | null>;
    vmEquals(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean;
    createHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    /**
     * create the master record in the db system.
     * @param rec the new master record
     * @param oldRec the old master record, if provided, will try to replace this record by
     * matching the key properties.
     */
    createMasterRecord(rec: MasterRecord, oldRec: MasterRecord | null): Promise<void>;
    /**
     * update the master record using the given rec. update only when the record key match
     * the record in the db.
     * @param rec master record to be updated.
     */
    updateMasterRecord(rec: MasterRecord): Promise<void>;
    loadConfigSet(name: string, custom?: boolean): Promise<string>;
    listConfigSet(subDirectory?: string, custom?: boolean): Promise<Blob[]>;
    deleteVmFromScalingGroup(vmId: string): Promise<void>;
    listLicenseFiles(
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<LicenseFile[]>;
    listLicenseStock(productName: string): Promise<LicenseStockRecord[]>;
    listLicenseUsage(productName: string): Promise<LicenseUsageRecord[]>;
    updateLicenseStock(records: LicenseStockRecord[]): Promise<void>;
    updateLicenseUsage(
        records: { item: LicenseUsageRecord; reference: LicenseUsageRecord }[]
    ): Promise<void>;
    loadLicenseFileContent(storageContainerName: string, filePath: string): Promise<string>;

    // NOTE: are the following methods relevant to this interface or should move to
    // a more specific interface?
    listNicAttachmentRecord(): Promise<NicAttachmentRecord[]>;
    updateNicAttachmentRecord(vmId: string, nicId: string, status: string): Promise<void>;
    deleteNicAttachmentRecord(vmId: string, nicId: string): Promise<void>;
    /**
     * create a network interface
     * @param  {string} subnetId? (optional) id of subnet where the network interface is located
     * @param  {string} description? (optional) description
     * @param  {string[]} securityGroups? (optional) security groups
     * @param  {string} privateIpAddress? (optional) private ip address
     * @returns Promise
     */
    createNetworkInterface(
        subnetId?: string,
        description?: string,
        securityGroups?: string[],
        privateIpAddress?: string
    ): Promise<NetworkInterface | null>;

    deleteNetworkInterface(nicId: string): Promise<void>;
    attachNetworkInterface(vmId: string, nicId: string, index?: number): Promise<void>;
    detachNetworkInterface(vmId: string, nicId: string): Promise<void>;
    listNetworkInterfaces(tags: ResourceFilter[], status?: string): Promise<NetworkInterface[]>;
    tagNetworkInterface(nicId: string, tags: ResourceFilter[]): Promise<void>;
}
