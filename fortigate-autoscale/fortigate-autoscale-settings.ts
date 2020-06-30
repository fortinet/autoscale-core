import { AutoscaleSetting } from '../autoscale-setting';

export enum FortiGateAutoscaleSettingEX {
    FortiGateAdminPort = 'fortigate-admin-port',
    FortiGateAutoscaleVirtualNetworkId = 'fortigate-autoscale-virtual-network-id',
    FortiGateInternalElbDns = 'fortigate-protected-internal-elb-dns',
    FortiGatePskSecret = 'fortigate-psk-secret',
    FortiGateAutoscaleSubnetIdList = 'fortigate-autoscale-subnet-id-list',
    FortiGateAutoscaleSubnetPairs = 'fortigate-autoscale-subnet-pairs',
    FortiGateSyncInterface = 'fortigate-sync-interface',
    FortiGateTrafficPort = 'fortigate-traffic-port'
}

export const FortiGateAutoscaleSetting = { ...AutoscaleSetting, ...FortiGateAutoscaleSettingEX };
