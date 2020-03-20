import { AutoscaleSetting } from '../autoscale-setting';

export class FortiGateAutoscaleSetting extends AutoscaleSetting {
    static FortiGatePskSecret = 'fortigate-psk-secret';
    static FortiGateSyncInterface = 'fortigate-sync-interface';
    static FortiGateTrafficPort = 'fortigate-traffic-port';
    static FortiGateAdminPort = 'fortigate-admin-port';
    static FortiGateInternalElbDns = 'fortigate-protected-internal-elb-dns';
    static EnableTransitGatewayVpn = 'enable-transit-gateway-vpn';
}
