export enum VirtualMachineState {
    Pending = 'Pending',
    Running = 'Running',
    Stopped = 'Stopped',
    Terminated = 'Terminated'
}
export interface VirtualMachine {
    id: string;
    scalingGroupName: string;
    productName?: string;
    primaryPrivateIpAddress: string;
    primaryPublicIpAddress?: string;
    virtualNetworkId: string;
    subnetId: string;
    securityGroups?: SecurityGroup[];
    networkInterfaces?: NetworkInterface[];
    networkInterfaceIds?: string[];
    sourceData?: { [key: string]: unknown };
    state: VirtualMachineState;
}

export interface NetworkInterface {
    id: string;
    privateIpAddress: string;
    index: number;
    subnetId?: string;
    virtualNetworkId?: string;
    attachmentId?: string;
    description?: string;
}

export interface SecurityGroup {
    id: string;
    name?: string;
}
