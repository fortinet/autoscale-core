import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { ScalingGroupStrategy } from '../../context-strategy/scaling-group-context';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsPlatformAdapter, LifecyleState } from './aws-platform-adapter';

export class AwsHybridScalingGroupStrategy implements ScalingGroupStrategy {
    platform: AwsPlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    prepare(platform: AwsPlatformAdapter, proxy: CloudFunctionProxyAdapter): Promise<void> {
        this.platform = platform;
        this.proxy = proxy;
        return Promise.resolve();
    }
    async onLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling AwsHybridScalingGroupStrategy.onLaunchingVm');
        const settings = await this.platform.getSettings();
        const targetVm = await this.platform.getTargetVm();
        let reqDetail: { [key: string]: string };
        try {
            reqDetail = JSON.parse(this.platform.getReqAsString());
        } catch (error) {
            this.proxy.logForError('Unable to convert request detail to JSON object.', error);
            throw new Error('Malformed request.');
        }
        const lifecycleItem = this.platform.extractLifecycleItemFromRequest(reqDetail);
        lifecycleItem.vmId = targetVm.id;
        lifecycleItem.scalingGroupName = targetVm.scalingGroupName;
        lifecycleItem.state = LifecyleState.Launching;
        let elbAttachedDone = false;

        const targetGroupArn = settings.get(
            AwsFortiGateAutoscaleSetting.AwsLoadBalancerTargetGroupArn
        ).value;
        try {
            [, elbAttachedDone] = await Promise.all([
                // update FGT source dest checking
                this.platform
                    .updateVmSourceDestinationChecking(targetVm.id, false)
                    .then(() => true)
                    .catch(err0 => {
                        this.proxy.logForError(
                            'Unable to complete updateVmSourceDestinationChecking.',
                            err0
                        );
                        return false;
                    }),
                // attach instance to load balancer target group
                this.platform
                    .loadBalancerAttachVm(targetGroupArn, [targetVm.id])
                    .then(() => true)
                    .catch(err1 => {
                        this.proxy.logForError('Unable to complete loadBalancerAttachVm.', err1);
                        return false;
                    })
            ]);
            // create lifecycle hook item for launching
            await this.platform.createLifecycleItem(lifecycleItem);
            this.proxy.logAsInfo('called AwsHybridScalingGroupStrategy.onLaunchingVm');
            return Promise.resolve('');
        } catch (error) {
            this.proxy.logForError('error in launching vm', error);
            // if attached to elb, detach it
            if (elbAttachedDone) {
                try {
                    await this.platform.loadBalancerDetachVm(targetGroupArn, [targetVm.id]);
                } catch (err2) {
                    this.proxy.logForError(
                        'Unable to complete loadBalancerDetachVm. Error is now suppressed.',
                        err2
                    );
                }
            }
            // abandon the lifecycle of this vm and let it enter termination
            this.proxy.logAsWarning(`Abandoning this vm (id: ${targetVm.id})`);
            await this.platform.completeLifecycleAction(lifecycleItem, false);
            throw new Error('Launching vm unsuccessfully.');
        }
    }
    async onLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('calling AwsHybridScalingGroupStrategy.onLaunchedVm');
        // get the current lifecycle item associated with the target vm
        const targetVm = await this.platform.getTargetVm();
        // ASSERT: terget vm is available or throw error
        const lifecycleItem = await this.platform.getLifecycleItem(targetVm.id);
        if (lifecycleItem) {
            // ASSERT: the associated lifecyle item is in Launching state.
            // only complete the lifecycle of launching
            if (lifecycleItem.state === LifecyleState.Launching) {
                // complete the lifecycle action with a success
                await this.platform.completeLifecycleAction(lifecycleItem, true);
            } else {
                throw new Error(
                    'Incorrec    t state found in attempting to complete a lifecycle ' +
                        `of vm(id: ${targetVm.id}). ` +
                        `Expected state: [${LifecyleState.Launching}], ` +
                        `actual state: [${lifecycleItem.state}]`
                );
            }
        } else {
            this.proxy.logAsWarning(
                `Attempting to complete a (stete: ${LifecyleState.Launching}) ` +
                    `lifecycle of vm(id: ${targetVm.id}). Lifecycle item not found.`
            );
        }
        this.proxy.logAsInfo('called AwsHybridScalingGroupStrategy.onLaunchedVm');
        return Promise.resolve('');
    }
    async onTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('calling AwsHybridScalingGroupStrategy.onTerminatingVm');
        const settings = await this.platform.getSettings();
        // update FGT source dest checking
        const targetVm = await this.platform.getTargetVm();
        let reqDetail: { [key: string]: string };
        try {
            reqDetail = JSON.parse(this.platform.getReqAsString());
        } catch (error) {
            this.proxy.logForError('Unable to convert request detail to JSON object.', error);
            throw new Error('Malformed request.');
        }
        const lifecycleItem = this.platform.extractLifecycleItemFromRequest(reqDetail);
        lifecycleItem.vmId = targetVm.id;
        lifecycleItem.scalingGroupName = targetVm.scalingGroupName;
        lifecycleItem.state = LifecyleState.Terminating;

        try {
            // detach instance from load balancer target group
            const targetGroupArn = settings.get(
                AwsFortiGateAutoscaleSetting.AwsLoadBalancerTargetGroupArn
            ).value;
            await this.platform.loadBalancerDetachVm(targetGroupArn, [targetVm.id]);
            // NOTE: TODO: REVIEW: is it possible to enter a terminating state while it is in
            // another transitioning state such as launching?
            // NOTE: TODO: REVIEW: what if a vm is manually deleted externally, ie. termination
            // not triggered by the scaling group? will the terminating hook be triggered as well?
            // create lifecycle hook
            await this.platform.createLifecycleItem(lifecycleItem);
            this.proxy.logAsInfo('called AwsHybridScalingGroupStrategy.onTerminatingVm');
            return Promise.resolve('');
        } catch (error) {
            this.proxy.logForError('error in terminating vm', error);
            // abandon the lifecycle of this vm and let it enter termination
            this.proxy.logAsWarning(`Abandoning this vm (id: ${this.platform.getReqVmId()})`);
            await this.platform.completeLifecycleAction(lifecycleItem, false);
            this.proxy.logAsInfo('called AwsHybridScalingGroupStrategy.onTerminatingVm');
            return Promise.resolve('');
        }
    }
    async onTerminatedVm(): Promise<string> {
        this.proxy.logAsInfo('calling AwsHybridScalingGroupStrategy.onTerminatedVm');
        // get the current lifecycle item associated with the target vm
        const targetVm = await this.platform.getTargetVm();
        // ASSERT: terget vm is available or throw error
        const lifecycleItem = await this.platform.getLifecycleItem(targetVm.id);
        if (lifecycleItem) {
            // ASSERT: the associated lifecyle item is in terminating state.
            // only complete the lifecycle of terminating
            if (lifecycleItem.state === LifecyleState.Terminating) {
                // complete the lifecycle action with a success
                await this.platform.completeLifecycleAction(lifecycleItem, true);
            } else {
                throw new Error(
                    'Incorrec    t state found in attempting to complete a lifecycle ' +
                        `of vm(id: ${targetVm.id}). ` +
                        `Expected state: [${LifecyleState.Terminating}], ` +
                        `actual state: [${lifecycleItem.state}]`
                );
            }
        } else {
            this.proxy.logAsWarning(
                `Attempting to complete a (stete: ${LifecyleState.Terminating}) ` +
                    `lifecycle of vm(id: ${targetVm.id}). Lifecycle item not found.`
            );
        }
        this.proxy.logAsInfo('called AwsHybridScalingGroupStrategy.onTerminatedVm');
        return Promise.resolve('');
    }
}
