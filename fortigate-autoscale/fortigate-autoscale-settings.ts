import { AutoscaleSetting } from '../autoscale-setting';

enum FortiGateOwnAutoscaleSetting {
    FortiGatePskSecret = 'fortigate-psk-secret',
    FortiGateSyncInterface = 'fortigate-sync-interface',
    FortiGateTrafficPort = 'fortigate-traffic-port',
    FortiGateAdminPort = 'fortigate-admin-port',
    FortiGateInternalElbDns = 'fortigate-protected-internal-elb-dns',
    EnableTransitGatewayVpn = 'enable-transit-gateway-vpn',
    CustomConfigSetContainer = 'custom-configset-container',
    CustomConfigSetDirectory = 'custom-configset-directory',
    CustomConfigSetName = 'custom-configset-name',
    LoadBalancerTargetGroupArn = 'fortigate-autoscale-target-group-arn'
}

export const FortiGateAutoscaleSetting = { ...AutoscaleSetting, ...FortiGateOwnAutoscaleSetting };
