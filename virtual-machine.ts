export interface VirtualMachine {
    instanceId: string;
    scalingGroupName: string;
    primaryPrivateIpAddress: string;
    primaryPublicIpAddress: string;
    virtualNetworkId: string;
    subnetId: string;
    securityGroups?: SecurityGroup[];
    networkInterfaces?: NetworkInterface[];
    sourceData?: { [key: string]: unknown };
}

export interface NetworkInterface {
    id: string;
    privateIpAddress: string;
    subnetId?: string;
    virtualNetworkId?: string;
    attachmentId?: string;
    description?: string;
}

export interface SecurityGroup {
    id: string;
}
