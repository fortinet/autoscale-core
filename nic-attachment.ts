/**
 * Defines the network interface states in Autoscale project scope.
 */
export enum NicAttachmentState {
    // a state for fully attached.
    attached = 'attached',
    // a state for in transitioning from detached to attached
    pendingAttach = 'pendingAttach',
    // a state for fully detached
    detached = 'detached',
    // a state for in transitioning from not-attached to attached
    pendingDetach = 'pendingDetach'
}

/**
 * Network interface attachment record
 */
export interface NicAttachmentRecord {
    // instanceId of virtual machine
    instanceId: string;
    // network interface id of the nic resource
    nicId: string;
    // current state
    attachmentState: NicAttachmentState;
}
