import { AutoscaleSetting as Settings } from '../fortigate-autoscale-settings';

// NOTE: every key must start with 'Aws' prefix but the value do not need the prefix
enum AwsAutoscaleSetting {
    AwsVpnBgpAsn = 'aws-vpn-bgp-asn',
    AwsEnableTransitGatewayVpn = 'enable-transit-gateway-vpn',
    AwsLoadBalancerTargetGroupArn = 'fortigate-autoscale-target-group-arn',
    AwsTransitGatewayId = 'transit-gateway-id',
    AwsTransitGatewayRouteTableInbound = 'transit-gateway-route-table-inbound',
    AwsTransitGatewayRouteTableOutbound = 'transit-gateway-route-table-outbound',
    AwsTransitGatewayVpnHandlerName = 'transit-gateway-vpn-handler-name'
}

export const AutoscaleSetting = { ...Settings, ...AwsAutoscaleSetting };
