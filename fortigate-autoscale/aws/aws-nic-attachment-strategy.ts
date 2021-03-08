import {
    AwsFortiGateAutoscaleSetting,
    AwsPlatformAdapter,
    CloudFunctionProxyAdapter,
    DebugMode,
    JSONable,
    NetworkInterface,
    NicAttachmentRecord,
    NicAttachmentStatus,
    NicAttachmentStrategy,
    NicAttachmentStrategyResult,
    ResourceFilter,
    SubnetPair,
    SubnetPairIndex,
    VirtualMachine
} from './index';

export class AwsNicAttachmentStrategy implements NicAttachmentStrategy {
    vm: VirtualMachine;
    platform: AwsPlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    constructor(platform: AwsPlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(vm: VirtualMachine): Promise<void> {
        this.vm = vm;
        return Promise.resolve();
    }

    protected async listRecord(vm: VirtualMachine): Promise<NicAttachmentRecord[]> {
        this.proxy.logAsDebug(DebugMode.DebugOnly, 'calling AwsNicAttachmentStrategy.getRecord');
        const records = (await this.platform.listNicAttachmentRecord()).filter(rec => {
            return rec.vmId === vm.id;
        });
        this.proxy.logAsDebug(DebugMode.DebugOnly, 'called AwsNicAttachmentStrategy.getRecord');
        return records;
    }

    private async getRecord(
        vm: VirtualMachine,
        nic: NetworkInterface
    ): Promise<NicAttachmentRecord | null> {
        const [record] = (await this.platform.listNicAttachmentRecord()).filter(rec => {
            return rec.vmId === vm.id && rec.nicId === nic.id;
        });
        return record;
    }

    protected async setAttaching(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setAttaching');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Attaching) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already attaching to vm(id: ${vm.id})`
                );
                return;
            } else {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.id}).` +
                        `Changing state from ${record.attachmentState} to attaching is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(vm.id, nic.id, NicAttachmentStatus.Attaching);
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setAttaching');
    }

    protected async setAttached(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setAttached');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Attached) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already attached to vm(id: ${vm.id})`
                );
                return;
            } else if (record.attachmentState !== NicAttachmentStatus.Attaching) {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.id}).` +
                        `Changing state from ${record.attachmentState} to attached is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(vm.id, nic.id, NicAttachmentStatus.Attached);
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setAttaching');
    }

    protected async setDetaching(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setAttached');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Detaching) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already detaching from vm(id: ${vm.id})`
                );
                return;
            } else {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.id}).` +
                        `Changing state from ${record.attachmentState} to detaching is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(vm.id, nic.id, NicAttachmentStatus.Detaching);
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setDetaching');
    }

    protected async setDetached(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setDetached');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Detached) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already detached from vm(id: ${vm.id})`
                );
                return;
            } else {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.id}).` +
                        `Changing state from ${record.attachmentState} to detached is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(vm.id, nic.id, NicAttachmentStatus.Detached);
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setDetached');
    }

    protected async deleteRecord(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.deleteRecord');
        const record = await this.getRecord(vm, nic);
        if (record) {
            await this.platform.deleteNicAttachmentRecord(vm.id, nic.id);
        } else {
            this.proxy.logAsWarning(
                `no nic attachment found for vm(id: ${vm.id}) and nic(id: ${nic.id}).`
            );
        }
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.deleteRecord');
    }

    protected async getPairedSubnetId(vm: VirtualMachine, index: SubnetPairIndex): Promise<string> {
        const settings = await this.platform.getSettings();
        const subnetPairs: JSONable = settings.get(
            AwsFortiGateAutoscaleSetting.FortiGateAutoscaleSubnetPairs
        ).jsonValue;
        const subnets: SubnetPair[] =
            Array.isArray(subnetPairs) &&
            subnetPairs
                .map((element: unknown) => {
                    const [entry] = Object.entries(element);
                    return (
                        entry &&
                        ({
                            subnetId: entry[0],
                            pairIdList: entry[1]
                        } as SubnetPair)
                    );
                })
                .filter(element => element.subnetId === vm.subnetId);
        return Promise.resolve(subnets[0] && subnets[0].pairIdList[index]);
    }

    protected async tags(): Promise<ResourceFilter[]> {
        const settings = await this.platform.getSettings();
        const tagPrefix = settings.get(AwsFortiGateAutoscaleSetting.ResourceTagPrefix).value;
        return [
            {
                key: 'FortiGateAutoscaleNicAttachment',
                value: tagPrefix,
                isTag: true
            },
            {
                key: 'ResourceGroup',
                value: tagPrefix,
                isTag: true
            }
        ];
    }

    protected async tagNic(nic: NetworkInterface): Promise<void> {
        // tag the nic
        try {
            const tags = await this.tags();
            tags.push({
                key: 'Name',
                value: 'fortigate-autoscale-instance-nic2'
            });
            await this.platform.tagNetworkInterface(nic.id, tags);
        } catch (error) {
            this.proxy.logAsError(`faild to add tag to nic(id: ${nic.id})`);
            throw error;
        }
    }

    async attach(): Promise<NicAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling AwsNicAttachmentStrategy.attach');
        // this implementation is to attach one nic to the paired subnet for 'service' use
        // list all attachment records and get the first
        const [record] = await this.listRecord(this.vm);

        // so if there's already an attachment record, do not need to attach another one.
        if (record) {
            this.proxy.logAsInfo(
                `instance (id: ${record.vmId} has been in ` +
                    `association with nic (id: ${record.nicId}) ` +
                    `in state (${record.attachmentState})`
            );
            this.proxy.logAsInfo('called AwsNicAttachmentStrategy.attach');
            return NicAttachmentStrategyResult.Success;
        } else {
            let nic: NetworkInterface;
            try {
                // need to create a nic and attach it to the vm

                // create a nic attachment
                // collect the security group from the vm first
                const securtyGroupIds: string[] = this.vm.securityGroups.map(sg => sg.id);
                // determine the private subnet paired with the vm subnet
                const pairedSubnetId: string = await this.getPairedSubnetId(
                    this.vm,
                    SubnetPairIndex.Service
                );
                const description =
                    `Addtional nic for instance(id:${this.vm.id}) ` +
                    `in auto scaling group: ${this.vm.scalingGroupName}`;

                try {
                    nic = await this.platform.createNetworkInterface(
                        pairedSubnetId,
                        description,
                        securtyGroupIds
                    );
                } catch (error) {
                    this.proxy.logForError('platform create network interface failed.', error);
                    throw error;
                }

                // tag nic
                await this.tagNic(nic);
                // update nic attachment record
                await this.setAttaching(this.vm, nic);
                const nicDeviceIndex: number = this.vm.networkInterfaces.length;
                try {
                    await this.platform.attachNetworkInterface(this.vm.id, nic.id, nicDeviceIndex);
                } catch (error) {
                    this.proxy.logAsError(
                        `failed to attach nic (id: ${nic.id}) to` + ` vm (id: ${this.vm.id}).`
                    );
                    throw error;
                }

                // update the source dest check on this new eni
                await this.platform.updateVmSourceDestinationChecking(this.vm.id, false);

                // update nic attachment record again
                await this.setAttached(this.vm, nic);
                return NicAttachmentStrategyResult.Success;
            } catch (error) {
                // if there's a nic created, deleted and delete the record
                if (nic) {
                    await Promise.all([
                        this.platform.adaptee.deleteNetworkInterface(nic.id),
                        this.deleteRecord(this.vm, nic).catch(err => {
                            this.proxy.logForError('failed to delete nic attachment record', err);
                        })
                    ]);
                }
                this.proxy.logForError('platform create network interface failed.', error);
                this.proxy.logAsInfo('called AwsNicAttachmentStrategy.attach');
                return NicAttachmentStrategyResult.Failed;
            }
        }
    }
    async detach(): Promise<NicAttachmentStrategyResult> {
        this.proxy.logAsInfo('calling AwsNicAttachmentStrategy.detach');
        // list all record attached to a vm
        const records = await this.listRecord(this.vm);
        let failures = 0;
        const detachedNicIdList: string[] = [];
        await Promise.all(
            records.map(async record => {
                try {
                    // detach the network interface
                    await this.platform.detachNetworkInterface(record.vmId, record.nicId);
                    // delete the network interface
                    await this.platform.deleteNetworkInterface(record.nicId);
                    // delete attachment record
                    await this.platform.deleteNicAttachmentRecord(record.vmId, record.nicId);
                    detachedNicIdList.push(record.nicId);
                } catch (error) {
                    failures++;
                    this.proxy.logForError(
                        'failed to fully detach and delete' +
                            `network interface (id: ${record.nicId}) from vm (id: ${record.vmId})`,
                        error
                    );
                }
            })
        );
        if (failures === 0) {
            this.proxy.logAsInfo(
                `all secondary nics are detached from vm(id: ${this.vm.id}).` +
                    ` Detached eni: ${detachedNicIdList.join(', ')}.`
            );
        } else {
            this.proxy.logAsWarning(`${failures} nics failed to detach. Cleanup may be required`);
        }
        this.proxy.logAsInfo('called AwsNicAttachmentStrategy.detach');
        return (
            (failures > 0 && NicAttachmentStrategyResult.Failed) ||
            NicAttachmentStrategyResult.Success
        );
    }
    async cleanUp(): Promise<number> {
        this.proxy.logAsInfo('calling AwsNicAttachmentStrategy.cleanUp');
        const tags = await this.tags();
        const nics = await this.platform.listNetworkInterfaces(tags, 'available');
        const failures: string[] = [];
        this.proxy.logAsInfo(`Unused nics: ${nics.length} found.`);
        await Promise.all(
            nics.map(nic => {
                this.platform
                    .deleteNetworkInterface(nic.id)
                    .then(() => {
                        this.proxy.logAsInfo(`nic(id: ${nic.id}) deleted.`);
                    })
                    .catch(error => {
                        failures.push(nic.id);
                        this.proxy.logForError(`nic(id: ${nic.id}) not deleted. see:`, error);
                    });
            })
        );
        if (failures.length > 0) {
            this.proxy.logAsError(
                'Network interfaces with the following id failed to delete: ' +
                    `${failures.join(', ')}. They need to be manually deleted.`
            );
        }
        this.proxy.logAsInfo('called AwsNicAttachmentStrategy.cleanUp');
        return failures.length;
    }
}
