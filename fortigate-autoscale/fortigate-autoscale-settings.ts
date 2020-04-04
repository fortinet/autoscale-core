import { AutoscaleSetting as Settings } from '../autoscale-setting';

enum FortiGateAutoscaleSetting {
    CustomConfigSetContainer = 'custom-configset-container',
    CustomConfigSetDirectory = 'custom-configset-directory',
    CustomConfigSetName = 'custom-configset-name',
    FortiGateAdminPort = 'fortigate-admin-port',
    FortiGateInternalElbDns = 'fortigate-protected-internal-elb-dns',
    FortiGatePskSecret = 'fortigate-psk-secret',
    FortiGateSyncInterface = 'fortigate-sync-interface',
    FortiGateTrafficPort = 'fortigate-traffic-port'
}

export const AutoscaleSetting = { ...Settings, ...FortiGateAutoscaleSetting };
