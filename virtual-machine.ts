export interface VirtualMachine {
    instanceId: string;
    scalingGroupName: string;
    primaryPrivateIpAddress: string;
    primaryPublicIpAddress: string;
    virtualNetworkId: string;
    subnetId: string;
    securityGroups?: {}[];
    networkInterfaces?: {}[];
    sourceData?: {};
}
