import {
    AutoscaleEnvironment,
    AwsFortiGateAutoscaleSetting,
    AwsPlatformAdapter,
    CloudFunctionProxyAdapter,
    isIpV4,
    RoutingEgressTrafficStrategy,
    SettingItem,
    Settings
} from './index';

/**
 * This strategy updates the route table associated with the private subnets which need outgoing
 * traffic capability. It adds/replace the route to the primary FortiGate vm in the Autoscale cluster
 * so the FortiGate can handle such egress traffic.
 */
export class AwsRoutingEgressTrafficViaPrimaryVmStrategy implements RoutingEgressTrafficStrategy {
    protected platform: AwsPlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected env: AutoscaleEnvironment;
    constructor(
        platform: AwsPlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ) {
        this.platform = platform;
        this.proxy = proxy;
        this.env = env;
    }
    async apply(): Promise<void> {
        this.proxy.logAsInfo('calling RoutingEgressTrafficViaPrimaryVmStrategy.apply');
        const settings: Settings = await this.platform.getSettings();
        const enableNic2: SettingItem = settings.get(AwsFortiGateAutoscaleSetting.EnableNic2);
        const routeTableIdList: SettingItem = settings.get(
            AwsFortiGateAutoscaleSetting.EgressTrafficRouteTableList
        );
        const routeTableIds: string[] = (routeTableIdList && routeTableIdList.value.split(',')) || [
            ''
        ];
        if (routeTableIds.length === 1 && routeTableIds[0] === '') {
            this.proxy.logAsWarning(
                'Route table is required but non is provided. The process is now skipped.' +
                    " If it is just a mistake, the setting item should've been mis-configured."
            );
            this.proxy.logAsInfo('called RoutingEgressTrafficViaPrimaryVmStrategy.apply');
            return;
        }

        // check if primary vm is available
        if (!this.env.primaryVm) {
            this.proxy.logAsWarning('No primary vm is found. The process is now skipped.');
            this.proxy.logAsInfo('called RoutingEgressTrafficViaPrimaryVmStrategy.apply');
            return;
        }

        // check if second nic is enabled. yes, then use the nic2 as the target, no, then
        // use the 1st nic as the target
        let networkInterfaceId: string;
        // route traffic via nic2
        if (enableNic2 && enableNic2.truthValue) {
            // find the nic that has  DeviceIndex === 1 (property and value set by AWS EC2)
            if (this.env.primaryVm.networkInterfaces.length >= 1) {
                [networkInterfaceId] = this.env.primaryVm.networkInterfaces
                    .filter(eni => eni.index === 1)
                    .map(eni => eni.id);
            }
            if (!networkInterfaceId) {
                throw new Error(
                    'The Autoscale settings indicate Nic2 is enabled and the eni on DeviceIndex 1' +
                        ' is expected available. However, no matching eni found. This is a fatal error.'
                );
            }
        }
        // route traffic via nic1
        else {
            if (this.env.primaryVm.networkInterfaces.length >= 1) {
                [networkInterfaceId] = this.env.primaryVm.networkInterfaces
                    .filter(eni => eni.index === 0)
                    .map(eni => eni.id);
            }
            if (!networkInterfaceId) {
                throw new Error(
                    `No network interface found on the primary vm (id: ${this.env.primaryVm.id}).` +
                        ' This is a fatal error and an impossible situation!'
                );
            }
        }

        // add / replace the route in each provided route table
        await this.updateRouteTables('0.0.0.0/0', networkInterfaceId, routeTableIds);

        this.proxy.logAsInfo('called RoutingEgressTrafficViaPrimaryVmStrategy.apply');
    }

    async updateRouteTables(
        destination: string,
        networkInterfaceId: string,
        routeTableIds: string[]
    ): Promise<void> {
        // validate ip
        if (!isIpV4(destination)) {
            throw new Error(`Invalid IPv4 address:${destination}`);
        }
        const results = await Promise.all(
            routeTableIds.map(routeTableId => {
                return this.platform
                    .updateVpcRouteTableRoute(routeTableId, destination, networkInterfaceId)
                    .catch(error => {
                        this.proxy.logForError('Error in updateVpcRouteTableRoute', error);
                        return false;
                    });
            })
        );
        const failureCount = results.filter(result => !result).length;
        if (failureCount > 0) {
            throw new Error(`${failureCount} not updated. Please see the previous log(s).`);
        }
    }
}
