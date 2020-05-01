import { AutoscaleSetting } from '../autoscale-setting';

export enum FortiGateAutoscaleSettingEX {
    CustomAssetContainer = 'custom-asset-container',
    CustomAssetDirectory = 'custom-asset-directory',
    CustomConfigSetName = 'custom-configset-name',
    FortiGateAdminPort = 'fortigate-admin-port',
    FortiGateInternalElbDns = 'fortigate-protected-internal-elb-dns',
    FortiGatePskSecret = 'fortigate-psk-secret',
    FortiGateSyncInterface = 'fortigate-sync-interface',
    FortiGateTrafficPort = 'fortigate-traffic-port'
}

export const FortiGateAutoscaleSetting = { ...AutoscaleSetting, ...FortiGateAutoscaleSettingEX };
