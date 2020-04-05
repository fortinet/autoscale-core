import { Settings } from './autoscale-setting';
import { VirtualMachine, NetworkInterface } from './virtual-machine';
import { HealthCheckRecord, MasterRecord } from './master-election';
import { NicAttachmentRecord } from './context-strategy/nic-attachment-context';
import { KeyValue } from './db-definitions';
import { JSONable } from 'jsonable';

export enum ReqType {
    LaunchingVm = 'LaunchingVm',
    LaunchedVm = 'LaunchedVm',
    TerminatingVm = 'TerminatingVm',
    TerminatedVm = 'TerminatedVm',
    BootstrapConfig = 'BootstrapConfig',
    HeartbeatSync = 'HeartbeatSync',
    StatusMessage = 'StatusMessage'
}

export enum ReqMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
    TRACE,
    OPTIONS,
    CONNECT
}

export interface ReqBody {
    [key: string]: unknown;
}

export interface ReqHeaders {
    [key: string]: unknown;
}

export interface ResourceTag {
    key: string;
    value: string;
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
    attachmentId?: string;
    customerGatewayId?: string;
    vpnConnection?: JSONable;
}

export interface PlatformAdapter {
    adaptee: {};
    readonly createTime: number;
    // checkRequestIntegrity(): void;
    init(): Promise<void>;
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
    getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord | null>;
    getMasterRecord(filters?: KeyValue[]): Promise<MasterRecord | null>;
    vmEqualTo(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean;
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
    deleteVmFromScalingGroup(vmId: string): Promise<void>;
    listLicenseFiles(
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<LicenseFile[]>;
    listLicenseStock(productName: string): Promise<LicenseStockRecord[]>;
    listLicenseUsage(productName: string): Promise<LicenseUsageRecord[]>;
    updateLicenseStock(records: LicenseStockRecord[]): Promise<void>;
    updateLicenseUsage(records: LicenseUsageRecord[]): Promise<void>;
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
    listNetworkInterface(tags: ResourceTag[], status?: string): Promise<NetworkInterface[]>;
    tagNetworkInterface(nicId: string, tags: ResourceTag[]): Promise<void>;
}
