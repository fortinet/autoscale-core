import { AutoscaleEnvironment } from '../../autoscale-environment';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import {
    ConstantIntervalHeartbeatSyncStrategy,
    PreferredGroupPrimaryElection
} from '../../context-strategy/autoscale-context';
import { ReusableLicensingStrategy } from '../../context-strategy/licensing-context';
import { NoopScalingGroupStrategy } from '../../context-strategy/scaling-group-context';
import { FortiGateAutoscale } from '../fortigate-autoscale';
import { AzurePlatformAdapter } from './azure-platform-adapter';

export class AzureFortiGateAutoscale<TReq, TContext, TRes> extends FortiGateAutoscale<
    TReq,
    TContext,
    TRes
> {
    constructor(
        readonly platform: AzurePlatformAdapter,
        readonly env: AutoscaleEnvironment,
        readonly proxy: CloudFunctionProxyAdapter
    ) {
        super();
        // TODO: to be implemented
        // use noop scaling group strategy
        this.setScalingGroupStrategy(new NoopScalingGroupStrategy(platform, proxy));
        // use peferred group primary election for Hybrid licensing model
        this.setPrimaryElectionStrategy(new PreferredGroupPrimaryElection(platform, proxy));
        // use a constant interval heartbeat sync strategy
        this.setHeartbeatSyncStrategy(new ConstantIntervalHeartbeatSyncStrategy(platform, proxy));
        // // use AWS resource tagging strategy
        // this.setTaggingAutoscaleVmStrategy(new AwsTaggingAutoscaleVmStrategy(platform, proxy));
        // // use FortiGate bootstrap configuration strategy
        // this.setBootstrapConfigurationStrategy(
        //     new AwsFortiGateBootstrapStrategy(platform, proxy, env)
        // );
        // // use the Resuable licensing strategy
        this.setLicensingStrategy(new ReusableLicensingStrategy(platform, proxy));
        // // use the secondary nic attachment strategy to create and attach an additional nic
        // // during launching
        // this.setNicAttachmentStrategy(new AwsNicAttachmentStrategy(platform, proxy));
        // // use Noop vpn attachment strategy
        // this.setVpnAttachmentStrategy(new NoopVpnAttachmentStrategy(platform, proxy));
        // // use the routing egress traffic via primary vm strategy
        // this.setRoutingEgressTrafficStrategy(
        //     new AwsRoutingEgressTrafficViaPrimaryVmStrategy(platform, proxy, env)
        // );
        // use the reactive authorization strategy for FAZ integration
        // this.setFazIntegrationStrategy(new AwsFazReactiveAuthorizationStrategy(platform, proxy));
    }

    /**
     * @override FortiGateAutoscale
     */
    async handleLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling AzureFortiGateAutoscale.handleLaunchingVm');
        await super.handleLaunchingVm();
        // other logics required during launching
        this.proxy.logAsInfo('called AzureFortiGateAutoscale.handleLaunchingVm');
        return '';
    }

    /**
     * @override FortiGateAutoscale
     */
    async onVmFullyConfigured(): Promise<void> {
        // the 1st hb is also the indication of the the vm becoming in-service.
        // complete the scaling group launching strategy
        await this.scalingGroupStrategy.completeLaunching(true);
        await super.onVmFullyConfigured();
    }
}

// export abstract class AzureFunctionInvocationHandler
//     implements CloudFunctionPeerInvocation<AzureFunctionInvocationProxy, AzurePlatformAdapter> {
//     proxy: AzureFunctionInvocationProxy;
//     platform: AzurePlatformAdapter;
//     executeInvocable(payload: JSONable, invocable: string): Promise<void> {
//         if (invocable === AzureFunctionInvocable.TriggerFazDeviceAuth)
//     }
//     handleLambdaPeerInvocation(): Promise<void> {
//         throw new Error('Method not implemented.');
//     }
// }
