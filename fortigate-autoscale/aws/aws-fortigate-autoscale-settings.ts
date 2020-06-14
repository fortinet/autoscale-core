import {
    FortiGateAutoscaleSetting,
    FortiGateAutoscaleSettingItemDictionary
} from '../fortigate-autoscale-settings';
import { SettingItemDefinition } from '../../autoscale-setting';

// NOTE: every key must start with 'Aws' prefix but the value do not need the prefix
export enum AwsAutoscaleSettingEx {
    AwsEnableTransitGatewayVpn = 'enable-transit-gateway-vpn',
    AwsLifecycleHookTimeout = 'lifecycle-hook-timeout',
    AwsLoadBalancerTargetGroupArn = 'fortigate-autoscale-target-group-arn',
    AwsTransitGatewayId = 'transit-gateway-id',
    AwsTransitGatewayRouteTableInbound = 'transit-gateway-route-table-inbound',
    AwsTransitGatewayRouteTableOutbound = 'transit-gateway-route-table-outbound',
    AwsTransitGatewayVpnHandlerName = 'transit-gateway-vpn-handler-name'
}

export const AwsFortiGateAutoscaleSettingItemDictionary: {
    [key: string]: SettingItemDefinition;
} = {
    ...FortiGateAutoscaleSettingItemDictionary
};

AwsFortiGateAutoscaleSettingItemDictionary[AwsAutoscaleSettingEx.AwsEnableTransitGatewayVpn] = {
    keyName: AwsAutoscaleSettingEx.AwsEnableTransitGatewayVpn,
    description: 'Toggle ON / OFF the Transit Gateway VPN creation on each FortiGate instance',
    editable: false,
    jsonEncoded: false,
    booleanType: true
};

AwsFortiGateAutoscaleSettingItemDictionary[AwsAutoscaleSettingEx.AwsLifecycleHookTimeout] = {
    keyName: AwsAutoscaleSettingEx.AwsLifecycleHookTimeout,
    description: 'The auto scaling group lifecycle hook timeout time in second.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AwsFortiGateAutoscaleSettingItemDictionary[AwsAutoscaleSettingEx.AwsLoadBalancerTargetGroupArn] = {
    keyName: AwsAutoscaleSettingEx.AwsLoadBalancerTargetGroupArn,
    description: 'The ARN of the target group for FortiGate to receive load balanced traffic.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AwsFortiGateAutoscaleSettingItemDictionary[AwsAutoscaleSettingEx.AwsTransitGatewayId] = {
    keyName: AwsAutoscaleSettingEx.AwsTransitGatewayId,
    description: 'The ID of the Transit Gateway the FortiGate Autoscale is attached to.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AwsFortiGateAutoscaleSettingItemDictionary[
    AwsAutoscaleSettingEx.AwsTransitGatewayRouteTableInbound
] = {
    keyName: AwsAutoscaleSettingEx.AwsTransitGatewayRouteTableInbound,
    description: 'The Id of the Transit Gateway inbound route table.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AwsFortiGateAutoscaleSettingItemDictionary[
    AwsAutoscaleSettingEx.AwsTransitGatewayRouteTableOutbound
] = {
    keyName: AwsAutoscaleSettingEx.AwsTransitGatewayRouteTableOutbound,
    description: 'The Id of the Transit Gateway outbound route table.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AwsFortiGateAutoscaleSettingItemDictionary[
    AwsAutoscaleSettingEx.AwsTransitGatewayVpnHandlerName
] = {
    keyName: AwsAutoscaleSettingEx.AwsTransitGatewayVpnHandlerName,
    description: 'The Transit Gateway VPN handler function name.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

export const AwsFortiGateAutoscaleSetting = {
    ...FortiGateAutoscaleSetting,
    ...AwsAutoscaleSettingEx
};
