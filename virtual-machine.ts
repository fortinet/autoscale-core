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
    name?: string;
}
