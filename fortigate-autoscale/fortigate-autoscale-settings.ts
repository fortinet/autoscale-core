import {
    AutoscaleSetting,
    SettingItemDictionary,
    AutoscaleSettingItemDictionary
} from '../autoscale-setting';

export const FortiGateAutoscaleSetting = {
    ...AutoscaleSetting,
    EgressTrafficRouteTableList: 'egress-traffic-route-table',
    EnableFazIntegration: 'enable-fortianalyzer-integration',
    FortiAnalyzerHandlerName: 'faz-handler-name',
    FortiGateAdminPort: 'fortigate-admin-port',
    FortiGateAutoscaleSubnetIdList: 'fortigate-autoscale-subnet-id-list',
    FortiGateAutoscaleSubnetPairs: 'fortigate-autoscale-subnet-pairs',
    FortiGateAutoscaleVirtualNetworkId: 'fortigate-autoscale-virtual-network-id',
    FortiGateAutoscaleVirtualNetworkCidr: 'fortigate-autoscale-virtual-network-cidr',
    FortiGateExternalElbDns: 'fortigate-external-elb-dns',
    FortiGateInternalElbDns: 'fortigate-internal-elb-dns',
    FortiGatePskSecret: 'fortigate-psk-secret',
    FortiGateSyncInterface: 'fortigate-sync-interface',
    FortiGateTrafficPort: 'fortigate-traffic-port',
    FortiGateTrafficProtocol: 'fortigate-traffic-protocol'
};

export const FortiGateAutoscaleSettingItemDictionary: SettingItemDictionary = {
    ...AutoscaleSettingItemDictionary,
    [FortiGateAutoscaleSetting.EgressTrafficRouteTableList]: {
        keyName: FortiGateAutoscaleSetting.EgressTrafficRouteTableList,
        description:
            'The comma-separeted list of route tables associated with any subnets,' +
            ' which should bet configured to contain a route 0.0.0.0/0 to the' +
            ' primary fortigate to handle egress traffic.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.EnableFazIntegration]: {
        keyName: FortiGateAutoscaleSetting.EnableFazIntegration,
        description:
            'Enable FortiAnalyzer integration with the FortiGates cluster in the Autoscale.',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [FortiGateAutoscaleSetting.FortiAnalyzerHandlerName]: {
        keyName: FortiGateAutoscaleSetting.FortiAnalyzerHandlerName,
        description: 'The FortiGate Autoscale - FortiAnalyzer handler function name.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAdminPort]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAdminPort,
        description: 'The port number for administrative login to FortiGate.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkId]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkId,
        description: 'Virtual Network ID of the FortiGate Autoscale.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkCidr]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkCidr,
        description: 'Virtual Network CIDR of the FortiGate Autoscale.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateExternalElbDns]: {
        keyName: FortiGateAutoscaleSetting.FortiGateExternalElbDns,
        description: 'The DNS name of the elastic load balancer for the FortiGate scaling groups.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateInternalElbDns]: {
        keyName: FortiGateAutoscaleSetting.FortiGateInternalElbDns,
        description:
            'The DNS name of the elastic load balancer for the scaling ' +
            'groups of services protected by FortiGate.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGatePskSecret]: {
        keyName: FortiGateAutoscaleSetting.FortiGatePskSecret,
        description: 'The PSK for FortiGate Autoscale Synchronization.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetIdList]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetIdList,
        description: 'The list of ID of the subnet of the FortiGate Autoscale. Comma separated.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetPairs]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetPairs,
        description:
            'A list of paired subnet for the north-south traffic routing purposes.' +
            ' Format: [{subnetId: [pairId1, pairId2, ...]}, ...]',
        editable: false,
        jsonEncoded: true,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateSyncInterface]: {
        keyName: FortiGateAutoscaleSetting.FortiGateSyncInterface,
        description: 'The interface the FortiGate uses for configuration synchronization.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateTrafficPort]: {
        keyName: FortiGateAutoscaleSetting.FortiGateTrafficPort,
        description:
            'The port number for load balancer to route traffic through ' +
            'FortiGate to the protected services behind the load balancer.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateTrafficProtocol]: {
        keyName: FortiGateAutoscaleSetting.FortiGateTrafficProtocol,
        description:
            'The protocol for the traffic to be routed by the load balancer through ' +
            'FortiGate to the protected services behind the load balancer.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    }
};
