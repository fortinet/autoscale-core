import {
    CloudFunctionProxyAdapter,
    ResourceFilter,
    TaggingVmStrategy,
    VmTagging
} from '@fortinet/fortigate-autoscale';
import {
    AwsFortiGateAutoscaleSetting,
    AwsPlatformAdapter,
    TAG_KEY_AUTOSCALE_ROLE,
    TAG_KEY_RESOURCE_GROUP
} from '.';

export class AwsTaggingAutoscaleVmStrategy implements TaggingVmStrategy {
    protected platform: AwsPlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected taggings: VmTagging[];
    constructor(platform: AwsPlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(taggings: VmTagging[]): Promise<void> {
        this.taggings = taggings;
        return Promise.resolve();
    }
    async apply(): Promise<void> {
        this.proxy.logAsInfo('calling AwsTaggingAutoscaleVmStrategy.apply');
        const creationTaggings: VmTagging[] = this.taggings.filter(tagging => !tagging.clear);
        const deletionTaggings: VmTagging[] = this.taggings.filter(tagging => tagging.clear);
        if (creationTaggings.length > 0) {
            await this.add(creationTaggings);
        }
        if (deletionTaggings.length > 0) {
            await this.clear(deletionTaggings);
        }
        this.proxy.logAsInfo('calling AwsTaggingAutoscaleVmStrategy.apply');
    }
    async add(taggings: VmTagging[]): Promise<void> {
        this.proxy.logAsInfo('calling AwsTaggingAutoscaleVmStrategy.add');
        try {
            // if there's a vm with new primary role flag, delete the primary role tag from any other
            // vm in autoscale, then add primary role tag to the new primary vm
            const newPrimaryTagging = taggings.find(tagging => tagging.newPrimaryRole);
            if (newPrimaryTagging) {
                const vmIds: string[] = await this.platform.listPrimaryRoleVmId();
                // delete Autoscale role tag from those vms
                if (vmIds.length > 0) {
                    await this.platform.removePrimaryRoleTag(vmIds);
                }
            }
            // add necessary tags to each new vm.
            const ResTagPrefix = this.platform.settings.get(
                AwsFortiGateAutoscaleSetting.ResourceTagPrefix
            ).value;
            const tags: ResourceFilter[] = [
                {
                    key: TAG_KEY_RESOURCE_GROUP,
                    value: ResTagPrefix
                }
            ];
            await Promise.all(
                taggings.map(tagging => {
                    const allTags: ResourceFilter[] = [...tags];
                    if (tagging.newVm) {
                        allTags.push({
                            key: 'Name',
                            value: `${ResTagPrefix}-fortigate-autoscale-instance-${tagging.vmId}`
                        });
                    }
                    if (tagging.newPrimaryRole) {
                        allTags.push({
                            key: TAG_KEY_AUTOSCALE_ROLE,
                            value: 'primary'
                        });
                    }
                    return this.platform.tagResource([tagging.vmId], allTags).catch(error => {
                        this.proxy.logForError(
                            `failed to add tags to vm (id: ${tagging.vmId})`,
                            error
                        );
                        return true;
                    });
                })
            );
        } catch (error) {
            this.proxy.logForError('tagging Autoscale Vm unsucessfully.', error);
        }
        this.proxy.logAsInfo('called AwsTaggingAutoscaleVmStrategy.add');
    }

    async clear(taggings: VmTagging[]): Promise<void> {
        this.proxy.logAsInfo('calling AwsTaggingAutoscaleVmStrategy.clear');
        try {
            const vmIds: string[] = await this.platform.listPrimaryRoleVmId();
            // delete Autoscale role tag from those vms with primary role tag as well as
            // in the taggings list
            const deleteIds: string[] = taggings
                .filter(tagging => vmIds.includes(tagging.vmId))
                .map(tagging => tagging.vmId);
            await this.platform.removePrimaryRoleTag(deleteIds);
        } catch (error) {
            this.proxy.logForError('clearing tag from Autoscale vm unsucessfully', error);
        }
        this.proxy.logAsInfo('called AwsTaggingAutoscaleVmStrategy.clear');
    }
}
