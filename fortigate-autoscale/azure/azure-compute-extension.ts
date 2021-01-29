import * as msRest from '@azure/ms-rest-js';
import * as Parameters from '@azure/arm-compute/src/models/parameters';
import * as ComputeMappers from '@azure/arm-compute/src/models/virtualMachineScaleSetVMsMappers';
import * as ComputeModels from '@azure/arm-compute/src/models';
import * as Compute from '@azure/arm-compute';
import * as ComputeOperations from '@azure/arm-compute/src/operations';
import * as NetworkModels from '@azure/arm-network/src/models';
import * as NetworkMappers from '@azure/arm-network/src/models/networkInterfacesMappers';

const serializer = new msRest.Serializer(NetworkMappers);
const networkInterfacesListOperationSpec: msRest.OperationSpec = {
    httpMethod: 'GET',
    path:
        'subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Compute/virtualMachineScaleSets/{virtualMachineScaleSetName}/virtualmachines/{instanceId}/networkInterfaces',
    urlParameters: [
        Parameters.resourceGroupName,
        Parameters.virtualMachineScaleSetName,
        Parameters.instanceId,
        Parameters.subscriptionId
    ],
    queryParameters: [Parameters.apiVersion0],
    headerParameters: [Parameters.acceptLanguage],
    responses: {
        200: {
            bodyMapper: NetworkMappers.NetworkInterfaceListResult
        },
        default: {
            bodyMapper: ComputeMappers.CloudError
        }
    },
    serializer
};

export class ExtendedVirtualMachineScaleSetVMs extends ComputeOperations.VirtualMachineScaleSetVMs {
    private readonly exClient: Compute.ComputeManagementClientContext;
    constructor(client: Compute.ComputeManagementClientContext) {
        super(client);
        this.exClient = client;
    }
    listNetworkInterfaces(
        resourceGroupName: string,
        virtualMachineScaleSetName: string,
        instanceId: string
    ): Promise<NetworkModels.NetworkInterfacesListResponse> {
        return this.exClient.sendOperationRequest(
            {
                resourceGroupName,
                virtualMachineScaleSetName,
                instanceId
            },
            networkInterfacesListOperationSpec
        ) as Promise<NetworkModels.NetworkInterfacesListResponse>;
    }
}

export class ExtendedComputeManagementClient extends Compute.ComputeManagementClient {
    extendedVirtualMachineScaleSetVMs: ExtendedVirtualMachineScaleSetVMs;
    constructor(
        credentials: msRest.ServiceClientCredentials,
        subscriptionId: string,
        options?: ComputeModels.ComputeManagementClientOptions
    ) {
        super(credentials, subscriptionId, options);
    }
}
