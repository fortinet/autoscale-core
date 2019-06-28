'use strict';

/*
Author: Fortinet
*
* A generic virtual machine wrapper class equivalent to:
* AWS - EC2 instance
* Azure - Virtial Machine
*/
export abstract class NetworkInterface {

}

export abstract class VirtualMachine {
    private _instanceId: string;
    protected _securityGroups: string[];
    protected _networkInterfaces: Array<NetworkInterface>;
    private _sourceVmData: {};
    constructor(instanceId: string, readonly scalingGroupName: string, readonly sourcePlatform: string, vmData: {}) {
        this._instanceId = instanceId;
        this._sourceVmData = vmData; // the original vm data retrieved from the platform
        this._securityGroups = [];
        this._networkInterfaces = [];
    }

    get instanceId(): string {
        return this._instanceId;
    }

    get sourceVmData(): {} {
        return this._sourceVmData;
    }

    abstract get primaryPrivateIpAddress(): string;

    abstract get primaryPublicIpAddress(): string;

    abstract get virtualNetworkId(): string;

    abstract get subnetId(): string;

    get securityGroups(): string[] {
        return this._securityGroups;
    }

    get networkInterfaces(): Array<NetworkInterface> {
        return this._networkInterfaces;
    }

    // TODO: prefer to implement VirtualMachine in the platform module.
    // comment this code snippet out for now
    // NOTE: DO NOT REMOVE until being handled properly.
    // static fromAwsEc2(instance, scalingGroupName = '') {
    //     let virtualMachine = new VirtualMachine(instance.InstanceId, 'aws', instance);
    //     virtualMachine._primaryPrivateIp = instance.PrivateIpAddress;
    //     virtualMachine._primaryPublicIp = instance.PublicIpAddress;
    //     virtualMachine._virtualNetworkId = instance.VpcId;
    //     virtualMachine._subnetId = instance.SubnetId;
    //     virtualMachine._scalingGroupName = scalingGroupName;
    //     virtualMachine._securityGroups = [...instance.SecurityGroups];
    //     virtualMachine._networkInterfaces = [...instance.NetworkInterfaces];
    //     return virtualMachine;
    // }

    // TODO: prefer to implement VirtualMachine in the platform module.
    // comment this code snippet out for now
    // NOTE: DO NOT REMOVE until being handled properly.
    // static fromAzureVm(vm, scalingGroupName = '') {
    //     let virtualMachine = new VirtualMachine(vm.instanceId, 'azure', vm);
    //     let retrieveNetworkInformation = function() {
    //         for (let networkInterface of vm.properties.networkProfile.networkInterfaces) {
    //             // primary nic
    //             if (networkInterface.properties.primary) {
    //                 for (let ipConfiguration of networkInterface.properties.ipConfigurations) {
    //                     if (ipConfiguration.properties.primary) {
    //                         let matchVPC = ipConfiguration.properties.subnet.id.match(
    //                             new RegExp('(?<=virtualNetworks/).*(?=/subnets)')),
    //                             matchSubnet = ipConfiguration.properties.subnet.id.match(
    //                                 new RegExp('(?<=subnets/).*'));
    //                         return {
    //                             vpcId: Array.isArray(matchVPC) && matchVPC[0],
    //                             subnetId: Array.isArray(matchSubnet) && matchSubnet[0],
    //                             ipv4: ipConfiguration.properties.privateIPAddress
    //                         };
    //                     }
    //                 }
    //             }
    //         }
    //         return {vpcId: null, subnetId: null, ipv4: null};
    //     };
    //     if (vm.properties.networkProfile &&
    //         Array.isArray(vm.properties.networkProfile.networkInterfaces)) {
    //         virtualMachine._networkInterfaces = [...vm.properties.networkProfile.networkInterfaces];
    //         let { vpcId, subnetId, ipv4 } = retrieveNetworkInformation();
    //         virtualMachine._virtualNetworkId = vpcId;
    //         virtualMachine._subnetId = subnetId;
    //         virtualMachine._primaryPrivateIp = ipv4;
    //     }
    //     virtualMachine._scalingGroupName = scalingGroupName;
    //     return virtualMachine;
    // }
}
