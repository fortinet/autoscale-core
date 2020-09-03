import {
    FortiGateAutoscaleSetting,
    FortiGateAutoscaleSettingItemDictionary
} from '../fortigate-autoscale-settings';
import { SettingItemDictionary } from '../../autoscale-setting';

// NOTE: every key must start with 'Aws' prefix but the value do not need the prefix
export const AwsFortiGateAutoscaleSetting = {
    ...FortiGateAutoscaleSetting,
    AwsAutoscaleFunctionMaxExecutionTime: 'autoscale-function-max-execution-time',
    AwsAutoscaleFunctionExtendExecution: 'autoscale-function-extend-execution',
    AwsEnableTransitGatewayVpn: 'enable-transit-gateway-vpn',
    AwsLifecycleHookTimeout: 'lifecycle-hook-timeout',
    AwsLoadBalancerTargetGroupArn: 'fortigate-autoscale-target-group-arn',
    AwsTransitGatewayId: 'transit-gateway-id',
    AwsTransitGatewayRouteTableInbound: 'transit-gateway-route-table-inbound',
    AwsTransitGatewayRouteTableOutbound: 'transit-gateway-route-table-outbound',
    AwsTransitGatewayVpnHandlerName: 'transit-gateway-vpn-handler-name'
};

export const AwsFortiGateAutoscaleSettingItemDictionary: SettingItemDictionary = {
    ...FortiGateAutoscaleSettingItemDictionary,
    [AwsFortiGateAutoscaleSetting.AwsAutoscaleFunctionMaxExecutionTime]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsAutoscaleFunctionMaxExecutionTime,
        description:
            'Maximum execution time allowed for an Autoscale Cloud Function that can run' +
            ' in one cloud function invocation or multiple extended invocations.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AwsFortiGateAutoscaleSetting.AwsAutoscaleFunctionExtendExecution]: {
        keyName: AwsFortiGateAutoscaleSetting.AwsAutoscaleFunctionExtendExecution,
        description:
            'Allow one single Autoscale function to be executed in multiple extended invocations' +
            ' of a cloud platform function if it cannot finish within one invocation and its' +
            ' functionality supports splitting into extended invocations.',
        editable: true,
        jsonEncoded: false,
        booleanType: true
    },
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
