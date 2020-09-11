import { VirtualMachine } from './virtual-machine';
import { HealthCheckRecord, PrimaryRecord } from './primary-election';

export interface AutoscaleEnvironment {
    primaryId?: string;
    primaryVm?: VirtualMachine;
    primaryScalingGroup?: string;
    primaryHealthCheckRecord?: HealthCheckRecord;
    primaryRecord: PrimaryRecord;
    primaryRoleChanged?: boolean;
    targetId?: string;
    targetVm?: VirtualMachine;
    targetScalingGroup?: string;
    targetHealthCheckRecord?: HealthCheckRecord;
    [key: string]: {};
}
