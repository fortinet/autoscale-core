import {
    AwsFortiGateAutoscale,
    PrimaryElectionStrategy,
    BootstrapConfigurationStrategy,
    HeartbeatSyncStrategy,
    AwsFortiGateAutoscaleTgw,
    AwsFortiGateBootstrapTgwStrategy,
    LicensingStrategy
} from '../index';
import { AwsFortiGateAutoscaleCfnServiceProvider } from '../fortigate-autoscale/aws/aws-fortigate-autoscale-service';
import { AwsNicAttachmentStrategy, AwsTgwVpnAttachmentStrategy } from '../fortigate-autoscale';

export class TestAwsFortiGateAutoscale<TReq, TContext, TRes> extends AwsFortiGateAutoscale<
    TReq,
    TContext,
    TRes
> {
    expose(): {
        primaryElectionStrategy: PrimaryElectionStrategy;
        heartbeatSyncStrategy: HeartbeatSyncStrategy;
        bootstrapConfigStrategy: BootstrapConfigurationStrategy;
        licensingStrategy: LicensingStrategy;
    } {
        return {
            primaryElectionStrategy: this.primaryElectionStrategy,
            heartbeatSyncStrategy: this.heartbeatSyncStrategy,
            bootstrapConfigStrategy: this.bootstrapConfigStrategy,
            licensingStrategy: this.licensingStrategy
        };
    }
}

export class TestAwsTgwFortiGateAutoscale<TReq, TContext, TRes> extends AwsFortiGateAutoscaleTgw<
    TReq,
    TContext,
    TRes
> {
    expose(): {
        primaryElectionStrategy: PrimaryElectionStrategy;
        heartbeatSyncStrategy: HeartbeatSyncStrategy;
        bootstrapConfigStrategy: AwsFortiGateBootstrapTgwStrategy;
    } {
        return {
            primaryElectionStrategy: this.primaryElectionStrategy,
            heartbeatSyncStrategy: this.heartbeatSyncStrategy,
            bootstrapConfigStrategy: this
                .bootstrapConfigStrategy as AwsFortiGateBootstrapTgwStrategy
        };
    }
}

export class TestAwsFortiGateAutoscaleServiceProvider extends AwsFortiGateAutoscaleCfnServiceProvider {
    expose(): {
        nicAttachmentStrategy: AwsNicAttachmentStrategy;
        vpnAttachmentStrategy: AwsTgwVpnAttachmentStrategy;
    } {
        return {
            nicAttachmentStrategy: this.autoscale.nicAttachmentStrategy as AwsNicAttachmentStrategy,
            vpnAttachmentStrategy: this.autoscale
                .vpnAttachmentStrategy as AwsTgwVpnAttachmentStrategy
        };
    }
}
