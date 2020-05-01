import { Settings } from './autoscale-setting';
import { VirtualMachine, NetworkInterface } from './virtual-machine';
import { HealthCheckRecord, MasterRecord } from './master-election';
import { NicAttachmentRecord } from './context-strategy/nic-attachment-context';
import { KeyValue } from 'db-definitions';

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

export interface VmDescriptor {
    id: string;
}

export interface ResourceTag {
    key: string;
    value: string;
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
    getHealthCheckRecord(vm: VirtualMachine): Promise<HealthCheckRecord | null>;
    getMasterRecord(filters?: KeyValue[]): Promise<MasterRecord | null>;
    equalToVm(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean;
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
    listUnusedNetworkInterface(tags: ResourceTag[]): Promise<NetworkInterface[]>;
    tagNetworkInterface(nicId: string, tags: ResourceTag[]): Promise<void>;
}