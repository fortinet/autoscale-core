import {
    FortiGateAutoscaleSetting,
    FortiGateAutoscaleSettingItemDictionary,
    SettingItemDictionary,
    SettingItemReference
} from '..';

// NOTE: every key must start with 'Aws' prefix but the value do not need the prefix
export const AwsFortiGateAutoscaleSetting: SettingItemReference = {
    ...FortiGateAutoscaleSetting,
    AwsEnableTransitGatewayVpn: 'enable-transit-gateway-vpn',
    AwsLifecycleHookTimeout: 'lifecycle-hook-timeout',
    AwsLoadBalancerTargetGroupArn: 'fortigate-autoscale-target-group-arn',
    AwsSNSTopicArn: 'sns-topic-arn',
    AwsTransitGatewayId: 'transit-gateway-id',
    AwsTransitGatewayRouteTableInbound: 'transit-gateway-route-table-inbound',
    AwsTransitGatewayRouteTableOutbound: 'transit-gateway-route-table-outbound',
    AwsTransitGatewayVpnHandlerName: 'transit-gateway-vpn-handler-name'
};

export const AwsFortiGateAutoscaleSettingItemDictionary: SettingItemDictionary = {
    ...FortiGateAutoscaleSettingItemDictionary,
    [AwsFortiGateAutoscaleSetting.AwsEnableTransitGatewayVpn]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsEnableTransitGatewayVpn,
        description: 'Toggle ON / OFF the Transit Gateway VPN creation on each FortiGate instance',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [AwsFortiGateAutoscaleSetting.AwsLifecycleHookTimeout]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsLifecycleHookTimeout,
        description: 'The auto scaling group lifecycle hook timeout time in second.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AwsFortiGateAutoscaleSetting.AwsLoadBalancerTargetGroupArn]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsLoadBalancerTargetGroupArn,
        description: 'The ARN of the target group for FortiGate to receive load balanced traffic.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AwsFortiGateAutoscaleSetting.AwsTransitGatewayId]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsTransitGatewayId,
        description: 'The ID of the Transit Gateway the FortiGate Autoscale is attached to.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AwsFortiGateAutoscaleSetting.AwsSNSTopicArn]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsSNSTopicArn,
        description: 'The ARN of the SNS Topic to publish Autoscale notifications.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AwsFortiGateAutoscaleSetting.AwsTransitGatewayRouteTableInbound]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsTransitGatewayRouteTableInbound,
        description: 'The Id of the Transit Gateway inbound route table.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AwsFortiGateAutoscaleSetting.AwsTransitGatewayRouteTableOutbound]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsTransitGatewayRouteTableOutbound,
        description: 'The Id of the Transit Gateway outbound route table.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AwsFortiGateAutoscaleSetting.AwsTransitGatewayVpnHandlerName]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsTransitGatewayVpnHandlerName,
        description: 'The Transit Gateway VPN handler function name.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    }
};
