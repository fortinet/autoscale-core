import { AutoscaleSetting } from '../autoscale-setting';

export enum FortiGateAutoscaleSettingEX {
    AdditionalConfigSetNameList = 'additional-configset-name-list',
    CustomAssetContainer = 'custom-asset-container',
    CustomAssetDirectory = 'custom-asset-directory',
    FortiGateAdminPort = 'fortigate-admin-port',
    FortiGateInternalElbDns = 'fortigate-protected-internal-elb-dns',
    FortiGatePskSecret = 'fortigate-psk-secret',
    FortiGateSyncInterface = 'fortigate-sync-interface',
    FortiGateTrafficPort = 'fortigate-traffic-port'
}

export const FortiGateAutoscaleSetting = { ...AutoscaleSetting, ...FortiGateAutoscaleSettingEX };
