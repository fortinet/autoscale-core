import { Settings } from './autoscale-setting';
import { VirtualMachine } from './virtual-machine';
import { HealthCheckRecord, MasterRecord } from './master-election';

export enum ReqType {
    LaunchingVm = 'LaunchingVm',
    TerminatingVm = 'TerminatingVm',
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

export interface VmDescriptor {
    id: string;
}

export interface PlatformAdapter {
    adaptee: {};
    init(): Promise<void>;
    getRequestType(): ReqType;
    getReqHeartbeatInterval(): number;
    getSettings(): Promise<Settings>;
    getTargetVm(): Promise<VirtualMachine | null>;
    getMasterVm(): Promise<VirtualMachine | null>;
    getHealthCheckRecord(vm: VirtualMachine): Promise<HealthCheckRecord | null>;
    getMasterRecord(): Promise<MasterRecord | null>;
    equalToVm(vmA: VirtualMachine, vmB: VirtualMachine): boolean;
    describeVm(desc: VmDescriptor): Promise<VirtualMachine>;
    deleteVm(vm: VirtualMachine): Promise<void>;
    createHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    loadConfigSet(name: string): Promise<string>;
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
}
