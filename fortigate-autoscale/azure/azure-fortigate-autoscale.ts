import { AutoscaleEnvironment } from '../../autoscale-environment';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import {
    ConstantIntervalHeartbeatSyncStrategy,
    PreferredGroupPrimaryElection
} from '../../context-strategy/autoscale-context';
import { ReusableLicensingStrategy } from '../../context-strategy/licensing-context';
import { FortiGateAutoscale } from '../fortigate-autoscale';
import { AzureFortiGateBootstrapStrategy } from './azure-fortigate-bootstrap-config-strategy';
import { AzureHybridScalingGroupStrategy } from './azure-hybrid-scaling-group-strategy';
import { AzurePlatformAdapter } from './azure-platform-adapter';
import { AzureRoutingEgressTrafficViaPrimaryVmStrategy } from './azure-routing-egress-traffic-via-primary-vm-strategy';
import { AzureTaggingAutoscaleVmStrategy } from './azure-tagging-autoscale-vm-strategy';

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
        this.setScalingGroupStrategy(new AzureHybridScalingGroupStrategy(platform, proxy));
        // use peferred group primary election for Hybrid licensing model
        this.setPrimaryElectionStrategy(new PreferredGroupPrimaryElection(platform, proxy));
        // use a constant interval heartbeat sync strategy
        this.setHeartbeatSyncStrategy(new ConstantIntervalHeartbeatSyncStrategy(platform, proxy));
        // TODO: implement the Azure tagging feature
        // use Azure resource tagging strategy
        this.setTaggingAutoscaleVmStrategy(new AzureTaggingAutoscaleVmStrategy(platform, proxy));
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(
            new AzureFortiGateBootstrapStrategy(platform, proxy, env)
        );
        // // use the Resuable licensing strategy
        this.setLicensingStrategy(new ReusableLicensingStrategy(platform, proxy));
        // TODO: need to figure out how Azure VNet route egress traffic
        // use the routing egress traffic via primary vm strategy
        this.setRoutingEgressTrafficStrategy(
            new AzureRoutingEgressTrafficViaPrimaryVmStrategy(platform, proxy, env)
        );
        // use the reactive authorization strategy for FAZ integration
        // this.setFazIntegrationStrategy(new AwsFazReactiveAuthorizationStrategy(platform, proxy));
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
