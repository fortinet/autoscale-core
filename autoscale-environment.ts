import { VirtualMachine } from './virtual-machine';
import { HealthCheckRecord, MasterRecord } from './master-election';

export interface AutoscaleEnvironment {
    masterId?: string;
    masterVm?: VirtualMachine;
    masterScalingGroup?: string;
    masterHealthCheckRecord?: HealthCheckRecord;
    masterRecord: MasterRecord;
    masterRoleChanged?: boolean;
    targetId?: string;
    targetVm?: VirtualMachine;
    targetScalingGroup?: string;
    targetHealthCheckRecord?: HealthCheckRecord;
    [key: string]: {};
}
