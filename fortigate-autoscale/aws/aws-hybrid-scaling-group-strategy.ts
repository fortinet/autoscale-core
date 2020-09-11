import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { ScalingGroupStrategy } from '../../context-strategy/scaling-group-context';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsPlatformAdapter, LifecycleState, LifecycleActionResult } from './aws-platform-adapter';
import { JSONable } from 'jsonable';

export class AwsHybridScalingGroupStrategy implements ScalingGroupStrategy {
    platform: AwsPlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    constructor(platform: AwsPlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    async onLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling AwsHybridScalingGroupStrategy.onLaunchingVm');
        const settings = await this.platform.getSettings();
        const targetVm = await this.platform.getTargetVm();
        let reqDetail: JSONable;
        try {
            const req = JSON.parse(this.platform.getReqAsString());
            if (!req.detail) {
                this.proxy.logAsError(`Request content: ${JSON.stringify(req)}`);
                throw new Error("'detail' property not found on the request.");
            }
            reqDetail = req.detail as JSONable;
        } catch (error) {
            this.proxy.logForError('Unable to convert request detail to JSON object.', error);
            throw new Error('Malformed request.');
        }
        const lifecycleItem = this.platform.extractLifecycleItemFromRequest(reqDetail);
        lifecycleItem.vmId = targetVm.id;
        lifecycleItem.scalingGroupName = targetVm.scalingGroupName;
        lifecycleItem.state = LifecycleState.Launching;
        let elbAttachedDone = false;

        const enableElb = settings.get(AwsFortiGateAutoscaleSetting.EnableExternalElb).truthValue;
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
                // if enable external elb, attach instance to load balancer target group
                (enableElb &&
                    this.platform
                        .loadBalancerAttachVm(targetGroupArn, [targetVm.id])
                        .then(() => true)
                        .catch(err1 => {
                            this.proxy.logForError(
                                'Unable to complete loadBalancerAttachVm.',
                                err1
                            );
                            return false;
                        })) ||
                    Promise.resolve(true)
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
            // ASSERT: the associated lifecycle item is in launching state.
            // only delete the lifecycle item of launching state
            if (lifecycleItem.state === LifecycleState.Launching) {
                // cleanup the lifecycle item because now the lifecycle hook is in launched state
                await this.platform.deleteLifecycleItem(lifecycleItem.vmId);
            } else {
                throw new Error(
                    `Incorrect lifecycle item state (${lifecycleItem.state}) found in handling` +
                        ` the terminated vm(id: ${targetVm.id}).` +
                        ` Expected state is: [${LifecycleState.Launching}].`
                );
            }
        } else {
            this.proxy.logAsWarning(
                `A lifecycle item for vm(id: ${targetVm.id} isn't found in the LifecycleItem table.`
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
        let req: JSONable;
        try {
            req = JSON.parse(this.platform.getReqAsString()) as JSONable;
        } catch (error) {
            this.proxy.logForError('Unable to convert request detail to JSON object.', error);
            throw new Error('Malformed request.');
        }
        if (!req.detail) {
            this.proxy.logAsError(`Request content: ${JSON.stringify(req)}`);
            throw new Error("'detail' property not found on the request.");
        }
        const reqDetail = req.detail as JSONable;
        const lifecycleItem = this.platform.extractLifecycleItemFromRequest(reqDetail);
        lifecycleItem.vmId = targetVm.id;
        lifecycleItem.scalingGroupName = targetVm.scalingGroupName;
        lifecycleItem.state = LifecycleState.Terminating;

        try {
            // if enabled elb, detach instance from load balancer target group
            const enableElb = settings.get(AwsFortiGateAutoscaleSetting.EnableExternalElb)
                .truthValue;
            const targetGroupArn = settings.get(
                AwsFortiGateAutoscaleSetting.AwsLoadBalancerTargetGroupArn
            ).value;
            if (enableElb) {
                await this.platform.loadBalancerDetachVm(targetGroupArn, [targetVm.id]);
            }

            // check if any existing lifecycle item for the target vm (such as in launching)
            // then change to abandon it later.
            const existingLifecycleItem = await this.platform.getLifecycleItem(targetVm.id);
            if (existingLifecycleItem) {
                // NOTE: REVIEW: is it possible to enter a terminating state while it is in
                // another transitioning state such as launching?
                // if the hook item state is launching, it means there's must be something wrong
                // in the auto scaling group. try to abandon the lifecycle hook and delete the
                // lifecycle item.
                // NOTE: it may always be an inconsistent lifecycle item left in the db but its
                // lifecycle hook doesn't exist, so calling the AWS api to abandon it will cause
                // and error. should catch it.
                existingLifecycleItem.actionResult = LifecycleActionResult.Abandon;
                try {
                    // call platform to complete the lifecycle hook.
                    await this.platform.completeLifecycleAction(existingLifecycleItem, false);
                } catch (error) {
                    this.proxy.logAsWarning(
                        `The corresponding lifecycle hook doesn't exist:${JSON.stringify(
                            existingLifecycleItem
                        )}`
                    );
                }
            }
            // NOTE: TODO: REVIEW: what if a vm is manually deleted externally, ie. termination
            // not triggered by the scaling group? will the terminating hook be triggered as well?
            // create lifecycle hook
            await this.platform.createLifecycleItem(lifecycleItem);
            // call platform to complete the lifecycle hook.
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
            // ASSERT: the associated lifecycle item is in terminating state.
            // only delete the lifecycle item of terminating state
            if (lifecycleItem.state === LifecycleState.Terminating) {
                // cleanup the lifecycle item because now the lifecycle hook is in terminated state
                await this.platform.deleteLifecycleItem(lifecycleItem.vmId);
            } else {
                throw new Error(
                    `Incorrect lifecycle item state (${lifecycleItem.state}) found in handling` +
                        ` the terminated vm(id: ${targetVm.id}).` +
                        ` Expected state is: [${LifecycleState.Terminating}].`
                );
            }
        } else {
            this.proxy.logAsWarning(
                `A lifecycle item for vm(id: ${targetVm.id} isn't found in the LifecycleItem table.`
            );
        }
        this.proxy.logAsInfo('called AwsHybridScalingGroupStrategy.onTerminatedVm');
        return Promise.resolve('');
    }
    async completeLaunching(success = true): Promise<string> {
        this.proxy.logAsInfo(`calling completeLaunching (${success})`);
        // get the current lifecycle item associated with the target vm
        const targetVm = await this.platform.getTargetVm();
        // ASSERT: terget vm is available or throw error
        const lifecycleItem = await this.platform.getLifecycleItem(targetVm.id);
        if (lifecycleItem) {
            // ASSERT: the associated lifecycle item is in Launching state.
            // only complete the lifecycle of launching
            if (lifecycleItem.state === LifecycleState.Launching) {
                // complete the lifecycle action with a success
                await this.platform.completeLifecycleAction(lifecycleItem, success);
                this.proxy.logAsInfo(`called completeLaunching (${success})`);
            } else {
                throw new Error(
                    'Incorrect state found in attempting to complete a lifecycle ' +
                        `of vm(id: ${targetVm.id}). ` +
                        `Expected state: [${LifecycleState.Launching}], ` +
                        `actual state: [${lifecycleItem.state}]`
                );
            }
        } else {
            this.proxy.logAsWarning(
                `Attempting to complete a (stete: ${LifecycleState.Launching}) ` +
                    `lifecycle of vm(id: ${targetVm.id}). Lifecycle item not found.`
            );
        }
        return Promise.resolve('');
    }
    async completeTerminating(success = true): Promise<string> {
        this.proxy.logAsInfo(`calling completeTerminating (${success})`);
        // get the current lifecycle item associated with the target vm
        const targetVm = await this.platform.getTargetVm();
        // ASSERT: terget vm is available or throw error
        const lifecycleItem = await this.platform.getLifecycleItem(targetVm.id);
        if (lifecycleItem) {
            // ASSERT: the associated lifecycle item is in Launching state.
            // only complete the lifecycle of launching
            if (lifecycleItem.state === LifecycleState.Terminating) {
                // complete the lifecycle action with a success
                await this.platform.completeLifecycleAction(lifecycleItem, success);
                this.proxy.logAsInfo(`called completeTerminating (${success})`);
            } else {
                throw new Error(
                    'Incorrect state found in attempting to complete a lifecycle ' +
                        `of vm(id: ${targetVm.id}). ` +
                        `Expected state: [${LifecycleState.Terminating}], ` +
                        `actual state: [${lifecycleItem.state}]`
                );
            }
        } else {
            this.proxy.logAsWarning(
                `Attempting to complete a (stete: ${LifecycleState.Terminating}) ` +
                    `lifecycle of vm(id: ${targetVm.id}). Lifecycle item not found.`
            );
            this.proxy.logAsInfo(`called completeTerminating (${success})`);
        }
        return Promise.resolve('');
    }
}
