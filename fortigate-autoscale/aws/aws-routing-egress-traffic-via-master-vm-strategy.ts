import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { RoutingEgressTrafficStrategy } from '../../context-strategy/autoscale-context';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AutoscaleEnvironment } from '../../autoscale-environment';
import { Settings, SettingItem } from '../../autoscale-setting';
import { PlatformAdapter } from '../../platform-adapter';
import { isIpV4 } from '../../helper-function';
import { AwsPlatformAdapter } from './aws-platform-adapter';

/**
 * This strategy updates the route table associated with the private subnets which need outgoing
 * trffic capability. It adds/replace the route to the master FortiGate vm in the Autoscale cluster
 * so the FortiGate can handle such egress traffic.
 */
export class AwsRoutingEgressTrafficViaMasterVmStrategy implements RoutingEgressTrafficStrategy {
    protected platform: AwsPlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected env: AutoscaleEnvironment;
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ): Promise<void> {
        if (!(platform instanceof AwsPlatformAdapter)) {
            throw new Error('Wrong PlatformAdapter instance. Expected AwsPlatformAdapter.');
        }
        this.platform = platform as AwsPlatformAdapter;
        this.proxy = proxy;
        this.env = env;
        return Promise.resolve();
    }
    async apply(): Promise<void> {
        this.proxy.logAsInfo('calling RoutingEgressTrafficViaMasterVmStrategy.apply');
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
            this.proxy.logAsInfo('called RoutingEgressTrafficViaMasterVmStrategy.apply');
            return;
        }

        // check if master vm is available
        if (!this.env.masterVm) {
            this.proxy.logAsWarning('No master vm is found. The process is now skipped.');
            this.proxy.logAsInfo('called RoutingEgressTrafficViaMasterVmStrategy.apply');
            return;
        }

        // check if second nic is enabled. yes, then use the nic2 as the target, no, then
        // use the 1st nic as the target
        let networkInterfaceId: string;
        if (enableNic2 && enableNic2.truthValue) {
            // find the nic that has  DeviceIndex === 1 (property and value set by AWS EC2)
            if (this.env.masterVm.networkInterfaces.length >= 1) {
                [networkInterfaceId] = this.env.masterVm.networkInterfaces
                    .filter(eni => eni.index === 1)
                    .map(eni => eni.id);
            }
            if (!networkInterfaceId) {
                throw new Error(
                    'The Autoscale settings indicate Nic2 is enabled and the eni on DeviceIndex 1' +
                        ' is expected available. However, no matching eni found. This is a fatal error.'
                );
            }
        } else {
            throw new Error(
                `No network interface found on the master vm (id: ${this.env.masterVm.id}).` +
                    ' This is a fatal error and an impposible situation!'
            );
        }

        // add / replace the route in each provided route table
        await this.updateRouteTables('0.0.0.0/0', networkInterfaceId, routeTableIds);

        this.proxy.logAsInfo('called RoutingEgressTrafficViaMasterVmStrategy.apply');
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
