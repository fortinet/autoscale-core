import { AutoscaleSetting } from '../autoscale-setting';

enum FortiGateOwnAutoscaleSetting {
    CustomConfigSetContainer = 'custom-configset-container',
    CustomConfigSetDirectory = 'custom-configset-directory',
    CustomConfigSetName = 'custom-configset-name',
    EnableTransitGatewayVpn = 'enable-transit-gateway-vpn',
    FortiGateAdminPort = 'fortigate-admin-port',
    FortiGateInternalElbDns = 'fortigate-protected-internal-elb-dns',
    FortiGatePskSecret = 'fortigate-psk-secret',
    FortiGateSyncInterface = 'fortigate-sync-interface',
    FortiGateTrafficPort = 'fortigate-traffic-port',
    LoadBalancerTargetGroupArn = 'fortigate-autoscale-target-group-arn'
}

export const FortiGateAutoscaleSetting = { ...AutoscaleSetting, ...FortiGateOwnAutoscaleSetting };
