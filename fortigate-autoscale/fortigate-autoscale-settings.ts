import {
    AutoscaleSetting,
    AutoscaleSettingItemDictionary,
    SettingItemDefinition
} from '../autoscale-setting';

export enum FortiGateAutoscaleSettingEX {
    EgressTrafficRouteTableList = 'egress-traffic-route-table',
    EnableFazIntegration = 'enable-fortianalyzer-integration',
    FortiAnalyzerHandlerName = 'faz-handler-name',
    FortiGateAdminPort = 'fortigate-admin-port',
    FortiGateAutoscaleVirtualNetworkId = 'fortigate-autoscale-virtual-network-id',
    FortiGateExternalElbDns = 'fortigate-external-elb-dns',
    FortiGateInternalElbDns = 'fortigate-internal-elb-dns',
    FortiGatePskSecret = 'fortigate-psk-secret',
    FortiGateAutoscaleSubnetIdList = 'fortigate-autoscale-subnet-id-list',
    FortiGateAutoscaleSubnetPairs = 'fortigate-autoscale-subnet-pairs',
    FortiGateSyncInterface = 'fortigate-sync-interface',
    FortiGateTrafficPort = 'fortigate-traffic-port'
}

export const FortiGateAutoscaleSettingItemDictionary: { [key: string]: SettingItemDefinition } = {
    ...AutoscaleSettingItemDictionary
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.EgressTrafficRouteTableList] = {
    keyName: FortiGateAutoscaleSettingEX.EgressTrafficRouteTableList,
    description:
        'The comma-separeted list of route tables associated with any subnets,' +
        ' which should bet configured to contain a route 0.0.0.0/0 to the' +
        ' master fortigate to handle egress traffic.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.EnableFazIntegration] = {
    keyName: FortiGateAutoscaleSettingEX.EnableFazIntegration,
    description: 'Enable FortiAnalyzer integration with the FortiGates cluster in the Autoscale.',
    editable: false,
    jsonEncoded: false,
    booleanType: true
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.FortiAnalyzerHandlerName] = {
    keyName: FortiGateAutoscaleSettingEX.FortiAnalyzerHandlerName,
    description: 'The FortiGate Autoscale - FortiAnalyzer handler function name.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.FortiGateAdminPort] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateAdminPort,
    description: 'The port number for administrative login to FortiGate.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[
    FortiGateAutoscaleSettingEX.FortiGateAutoscaleVirtualNetworkId
] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateAutoscaleVirtualNetworkId,
    description: 'Virtual Network ID of the FortiGate Autoscale.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.FortiGateExternalElbDns] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateExternalElbDns,
    description: 'The DNS name of the elastic load balancer for the FortiGate scaling groups.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.FortiGateInternalElbDns] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateInternalElbDns,
    description:
        'The DNS name of the elastic load balancer for the scaling ' +
        'groups of services protected by FortiGate.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.FortiGatePskSecret] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGatePskSecret,
    description: 'The PSK for FortiGate Autoscale Synchronization.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[
    FortiGateAutoscaleSettingEX.FortiGateAutoscaleSubnetIdList
] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateAutoscaleSubnetIdList,
    description: 'The list of ID of the subnet of the FortiGate Autoscale. Comma separated.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[
    FortiGateAutoscaleSettingEX.FortiGateAutoscaleSubnetPairs
] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateAutoscaleSubnetPairs,
    description:
        'A list of paired subnet for the north-south traffic routing purposes.' +
        ' Format: [{subnetId: [pairId1, pairId2, ...]}, ...]',
    editable: false,
    jsonEncoded: true,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.FortiGateSyncInterface] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateSyncInterface,
    description: 'The interface the FortiGate uses for configuration synchronization.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

FortiGateAutoscaleSettingItemDictionary[FortiGateAutoscaleSettingEX.FortiGateTrafficPort] = {
    keyName: FortiGateAutoscaleSettingEX.FortiGateTrafficPort,
    description:
        'The port number for load balancer to route traffic through ' +
        'FortiGate to the protected services behind the load balancer.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

export const FortiGateAutoscaleSetting = { ...AutoscaleSetting, ...FortiGateAutoscaleSettingEX };
