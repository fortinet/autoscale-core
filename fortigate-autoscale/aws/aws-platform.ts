import path from 'path';
import crypto from 'crypto';
import process from 'process';
import fs from 'fs';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult, ScheduledEvent } from 'aws-lambda';
import EC2 from 'aws-sdk/clients/ec2';
import { DocumentClient, ExpressionAttributeValueMap } from 'aws-sdk/clients/dynamodb';
import { S3, AutoScaling, ELBv2 } from 'aws-sdk';

import * as AwsDBDef from './aws-db-definitions';
import { VpnAttachmentContext } from '../../context-strategy/vpn-attachment-context';
import {
    NicAttachmentStrategy,
    NicAttachmentRecord,
    NicAttachmentStatus,
    NicAttachmentResult
} from '../../context-strategy/nic-attachment-context';
import { VirtualMachine, NetworkInterface } from '../../virtual-machine';
import { SubnetPair, SettingItem, Settings, AutoscaleSetting } from '../../autoscale-setting';
import {
    PlatformAdaptee,
    mapHttpMethod,
    WaitForConditionChecker,
    waitFor,
    WaitForPromiseEmitter
} from '../../autoscale-core';
import {
    CloudFunctionProxy,
    LogLevel,
    CloudFunctionResponseBody,
    CloudFunctionProxyAdapter
} from '../../cloud-function-proxy';
import {
    ReqMethod,
    ReqType,
    PlatformAdapter,
    ResourceTag,
    ReqBody,
    ReqHeaders,
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord
} from '../../platform-adapter';
import {
    HealthCheckRecord,
    MasterRecord,
    MasterRecordVoteState,
    HealthCheckSyncState
} from '../../master-election';
import {
    KeyValue,
    CreateOrUpdate,
    MasterElectionDbItem,
    NicAttachmentDbItem,
    SettingsDbItem,
    AutoscaleDbItem,
    Table,
    LicenseStockDbItem,
    LicenseUsageDbItem
} from '../../db-definitions';
import { LifecycleItemDbItem } from '../aws/aws-db-definitions';
import { Blob } from '../../blob';
import { FortiGateAutoscaleSetting } from '../fortigate-autoscale-settings';

const genChecksum = (str: string, algorithm: string): string => {
    return crypto
        .createHash(algorithm)
        .update(str, 'utf8')
        .digest('hex');
};

/**
 * To provide AWS Transit Gateway integration related logics
 */
export type TransitGatewayContext = VpnAttachmentContext;

export class AwsNicAttachmentStrategy implements NicAttachmentStrategy {
    vm: VirtualMachine;
    platform: AwsPlatformAdapter;
    proxy: AwsLambdaProxy;
    prepare(
        platform: AwsPlatformAdapter,
        proxy: AwsLambdaProxy,
        vm: VirtualMachine
    ): Promise<void> {
        this.vm = vm;
        this.platform = platform;
        this.proxy = proxy;
        return Promise.resolve();
    }

    protected async listRecord(vm: VirtualMachine): Promise<NicAttachmentRecord[]> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.getRecord');
        const records = (await this.platform.listNicAttachmentRecord()).filter(rec => {
            return rec.vmId === vm.id;
        });
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.getRecord');
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
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setAttaching');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Attached) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already attached to vm(id: ${vm.id})`
                );
                return;
            } else {
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
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setDetaching');
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

    protected async getPairedSubnetId(vm: VirtualMachine): Promise<string> {
        const settings = await this.platform.getSettings();
        const subnetPairs: SubnetPair[] = settings.get(FortiGateAutoscaleSetting.SubnetPairs)
            .jsonValue as SubnetPair[];
        const subnets: SubnetPair[] = (Array.isArray(subnetPairs) &&
            subnetPairs.filter(element => element.subnetId === vm.subnetId)) || [null];
        return Promise.resolve(subnets[0].pairId);
    }

    protected async tags(): Promise<ResourceTag[]> {
        const settings = await this.platform.getSettings();
        const tagPrefix = settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value;
        return [
            {
                key: 'FortiGateAutoscaleNicAttachment',
                value: tagPrefix
            },
            {
                key: 'Name',
                value: `${tagPrefix}-fortigate-autoscale-instance-nic2`
            },
            {
                key: 'ResourceGroup',
                value: tagPrefix
            }
        ];
    }

    protected async tagNic(nic: NetworkInterface): Promise<void> {
        // tag the nic
        try {
            const tags = await this.tags();
            await this.platform.tagNetworkInterface(nic.id, tags);
        } catch (error) {
            this.proxy.logAsError(`faild to add tag to nic(id: ${nic.id})`);
            throw error;
        }
    }

    async attach(): Promise<NicAttachmentResult> {
        this.proxy.logAsInfo('calling AwsNicAttachmentStrategy.attach');
        // this implementation is to attach a single nic
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
            return NicAttachmentResult.Success;
        } else {
            let nic: NetworkInterface;
            try {
                // need to create a nic and attach it to the vm

                // create a nic attachment
                // collect the security group from the vm first
                const securtyGroupIds: string[] = this.vm.securityGroups.map(sg => sg.id);
                // determine the private subnet paired with the vm subnet
                const pairedSubnetId: string = await this.getPairedSubnetId(this.vm);
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

                // update nic attachment record again
                await this.setAttached(this.vm, nic);
                return NicAttachmentResult.Success;
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
                return NicAttachmentResult.Failed;
            }
        }
    }
    async detach(): Promise<NicAttachmentResult> {
        this.proxy.logAsInfo('calling AwsNicAttachmentStrategy.detach');
        // list all record attached to a vm
        const records = await this.listRecord(this.vm);
        let failures = 0;
        await Promise.all(
            records.map(async record => {
                try {
                    // detach the network interface
                    await this.platform.detachNetworkInterface(record.vmId, record.nicId);
                    // delete the network interface
                    await this.platform.deleteNetworkInterface(record.nicId);
                    // delete attachment record
                    await this.platform.deleteNicAttachmentRecord(record.vmId, record.nicId);
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
            this.proxy.logAsInfo(`all secondary nics are detached from vm(id: ${this.vm}).`);
        } else {
            this.proxy.logAsWarning(`${failures} nics failed to detach. Cleanup may be required`);
        }
        this.proxy.logAsInfo('called AwsNicAttachmentStrategy.detach');
        return (failures > 0 && NicAttachmentResult.Failed) || NicAttachmentResult.Success;
    }
    async cleanUp(): Promise<void> {
        this.proxy.logAsInfo('calling AwsNicAttachmentStrategy.cleanUp');
        const tags = await this.tags();
        const nics = await this.platform.listUnusedNetworkInterface(tags);
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
    }
}

export interface AwsDdbOperations {
    Expression: string;
    ExpressionAttributeValues?: ExpressionAttributeValueMap;
    type?: CreateOrUpdate;
}

export class AwsPlatform implements PlatformAdaptee {
    docClient: DocumentClient;
    s3: S3;
    ec2: EC2;
    autoscaling: AutoScaling;
    elbv2: ELBv2;
    constructor() {
        this.docClient = new DocumentClient({ apiVersion: '2012-08-10' });
        this.s3 = new S3({ apiVersion: '2006-03-01' });
        this.ec2 = new EC2({ apiVersion: '2016-11-15' });
        this.autoscaling = new AutoScaling({ apiVersion: '2011-01-01' });
        this.elbv2 = new ELBv2({ apiVersion: '2015-12-01' });
    }
    // abstract checkReqIntegrity(proxy: CloudFunctionProxyAdapter): void;
    // abstract getReqType(proxy: CloudFunctionProxyAdapter): Promise<ReqType>;
    // abstract getReqMethod(proxy: CloudFunctionProxyAdapter): ReqMethod;
    // abstract getReqBody(proxy: CloudFunctionProxyAdapter): ReqBody;
    // abstract getReqHeaders(proxy: CloudFunctionProxyAdapter): ReqHeaders;
    async loadSettings(): Promise<Settings> {
        const table = new AwsDBDef.AwsSettings(process.env.RESOURCE_TAG_PREFIX || '');
        const records: Map<string, SettingsDbItem> = new Map(
            await (await this.listItemFromDb<SettingsDbItem>(table)).map(rec => [
                rec.settingKey,
                rec
            ])
        );
        const settings: Settings = new Map<string, SettingItem>();
        Object.keys(FortiGateAutoscaleSetting).forEach(key => {
            if (records.has(key)) {
                const record = records.get(key);
                const settingItem = new SettingItem(
                    record.settingKey,
                    record.settingValue,
                    record.description,
                    record.editable,
                    record.jsonEncoded
                );
                settings.set(key, settingItem);
            }
        });
        return settings;
    }

    /**
     * Save a document db item into DynamoDB.
     * @param  {Table<T>} table the instance of Table to save the item.
     * @param  {Record} item the item to save into the db table.
     * @param  {AwsDdbOperations} conditionExp (optional) the condition expression for saving the item
     * @returns {Promise} return void
     * @throws whatever docClient.put throws.
     * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#put-property
     */
    async saveItemToDb<T>(
        table: Table<T>,
        item: T,
        conditionExp?: AwsDdbOperations
    ): Promise<void> {
        // CAUTION: validate the db input
        table.validateInput<T>(item);
        if (
            conditionExp &&
            conditionExp.type &&
            conditionExp.type === CreateOrUpdate.UpdateExisting
        ) {
            const keys: DocumentClient.Key = {};
            // get the key names from table,
            // then assign the value of each key name of item to the key
            Array.from(table.keys.keys()).forEach(name => {
                keys[name] = item[name];
            });
            const attributeValues: ExpressionAttributeValueMap = {};
            const attributeExp: string[] = [];
            Array.from(table.attributes.values()).forEach(attr => {
                const value =
                    typeof item[attr.name] === 'object'
                        ? JSON.stringify(item[attr.name])
                        : item[attr.name];
                attributeValues[`:${attr.name}`] = value;
                attributeExp.push(`${attr.name} = :${attr.name}`);
            });

            const updateItemInput: DocumentClient.UpdateItemInput = {
                TableName: table.name,
                Key: keys,
                UpdateExpression:
                    (attributeExp.length > 0 && `set ${attributeExp.join(', ')}`) || undefined,
                ExpressionAttributeValues: attributeValues
            };
            await this.docClient.update(updateItemInput).promise();
        } else {
            const putItemInput: DocumentClient.PutItemInput = {
                TableName: table.name,
                Item: item,
                ConditionExpression: (conditionExp && conditionExp.Expression) || undefined,
                ExpressionAttributeValues:
                    (conditionExp && conditionExp.ExpressionAttributeValues) || undefined
            };
            await this.docClient.put(putItemInput).promise();
        }
    }
    /**
     * get an db table record from a given table
     * @param  {Table<T>} table the instance of Table to get the item.
     * @param  {KeyValue[]} keyValue an array of table key and a value to get the item
     * @returns {Promise} return Record or null
     */
    async getItemFromDb<T>(table: Table<T>, keyValue: KeyValue[]): Promise<T | null> {
        const keys = {};
        keyValue.forEach(kv => {
            keys[kv.key] = kv.value;
        });
        const getItemInput: DocumentClient.GetItemInput = {
            TableName: table.name,
            Key: keys
        };
        const result = await this.docClient.get(getItemInput).promise();
        return table.convertRecord(result.Item);
    }
    /**
     * Delte a given item from the db
     * @param  {Table<T>} table the instance of Table to delete the item.
     * @param  {T} item the item to be deleted from the db table.
     * @param  {AwsDdbOperations} condition (optional) the condition expression for deleting the item
     * @returns {Promise} void
     */
    async deleteItemFromDb<T>(
        table: Table<T>,
        item: T,
        condition?: AwsDdbOperations
    ): Promise<void> {
        const keys = {};
        // get the key names from table,
        // then assign the value of each key name of item to the key
        Array.from(table.keys.keys()).forEach(name => {
            keys[name] = item[name];
        });
        const deleteItemInput: DocumentClient.DeleteItemInput = {
            TableName: table.name,
            Key: keys,
            ConditionExpression: (condition && condition.Expression) || undefined,
            ExpressionAttributeValues:
                (condition && condition.ExpressionAttributeValues) || undefined
        };
        await this.docClient.delete(deleteItemInput).promise();
    }
    /**
     * Scan and list all or some record from a given db table
     * @param  {Table<T>} table the instance of Table to delete the item.
     * @param  {AwsDdbOperations} filterExp (optional) a filter for listing the records
     * @param  {number} limit (optional) number or records to return
     * @returns {Promise} array of db record
     */
    async listItemFromDb<T>(
        table: Table<T>,
        filterExp?: AwsDdbOperations,
        limit?: number
    ): Promise<T[]> {
        if (typeof filterExp === 'number') {
            [limit, filterExp] = [filterExp, undefined];
        }
        const scanInput: DocumentClient.ScanInput = {
            TableName: table.name,
            FilterExpression: (filterExp && filterExp.Expression) || undefined,
            ExpressionAttributeValues:
                (filterExp && filterExp.ExpressionAttributeValues) || undefined,
            Limit: (limit > 0 && limit) || undefined
        };

        const response = await this.docClient.scan(scanInput).promise();
        let records: T[] = [];
        if (response && response.Items) {
            records = response.Items.map(item => table.convertRecord(item));
        }
        return records;
    }

    /**
     * list objects in an S3 bucket within a certain prefix
     *
     * @param {string} s3Bucket S3 bucket name
     * @param {string} s3KeyPrefix S3 bucket prefix to the directory to list file
     * @returns {Promise<Blob[]>} an array of Blob
     * @see see reference: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-property
     */
    async listS3Object(s3Bucket: string, s3KeyPrefix: string): Promise<Blob[]> {
        let prefix = s3KeyPrefix || '';
        if (prefix && !prefix.endsWith('/')) {
            prefix = `${s3KeyPrefix}/`;
        }
        prefix = s3KeyPrefix.endsWith('/') ? s3KeyPrefix : `${s3KeyPrefix}/`;

        // DEBUG:
        // for local debugging use, the next lines get files from local file system instead
        if (process.env.LOCAL_DEV_MODE === 'true') {
            return fs
                .readdirSync(path.resolve(s3Bucket, prefix))
                .filter(fileName => {
                    const stat = fs.statSync(path.resolve(s3Bucket, prefix, fileName));
                    return !stat.isDirectory();
                })
                .map(fileName => {
                    return {
                        fileName: fileName,
                        content: ''
                    } as Blob;
                });
        } else {
            const data = await this.s3
                .listObjectsV2({
                    Bucket: s3Bucket,
                    Prefix: prefix,
                    StartAfter: prefix
                })
                .promise();
            return data.Contents.map(content => {
                return {
                    fileName: content.Key.substr(prefix.length),
                    content: ''
                } as Blob;
            });
        }
    }

    /**
     * get a blob from a storage
     * @param  {string} s3Bucket the s3 bucket name
     * @param  {string} s3KeyPrefix the s3 key prefix to the blob file
     * @returns {Promise} string
     */
    async getS3ObjectContent(s3Bucket: string, s3KeyPrefix: string): Promise<string> {
        // DEBUG:
        // for local debugging use, the next lines get files from local file system instead
        if (process.env.LOCAL_DEV_MODE === 'true') {
            const keyPrefix = s3KeyPrefix.split('/');
            const isCustom = keyPrefix.includes('custom-configset');
            const assetsDir =
                (isCustom && process.env.LOCAL_CUSTOM_ASSETS_DIR) || process.env.LOCAL_ASSESTS_DIR;
            const fileName = keyPrefix.splice(keyPrefix.lastIndexOf('configset')).join('/');
            const filePath = path.resolve(process.cwd(), assetsDir, fileName);
            const buffer = fs.readFileSync(filePath);
            return buffer.toString();
        } else {
            const data = await this.s3.getObject({ Bucket: s3Bucket, Key: s3KeyPrefix }).promise();
            return (data && data.Body && data.Body.toString()) || '';
        }
    }

    async describeInstance(instanceId: string): Promise<EC2.Instance> {
        const request: EC2.DescribeInstancesRequest = {
            Filters: [
                {
                    Name: 'instance-id',
                    Values: [instanceId]
                }
            ]
        };
        let instance: EC2.Instance;
        const result = await this.ec2.describeInstances(request).promise();
        result.Reservations.forEach(reserv => {
            const [ins] = reserv.Instances.filter(i => i.InstanceId === instanceId);
            instance = ins || instance;
        });
        return instance;
    }

    async describeAutoScalingGroups(
        scalingGroupNames: string[]
    ): Promise<AutoScaling.AutoScalingGroup[]> {
        const request: AutoScaling.AutoScalingGroupNamesType = {
            AutoScalingGroupNames: scalingGroupNames
        };
        const result = await this.autoscaling.describeAutoScalingGroups(request).promise();
        const scalingGroups = result.AutoScalingGroups.filter(group =>
            scalingGroupNames.includes(group.AutoScalingGroupName)
        );
        return scalingGroups;
    }
    async createNetworkInterface(
        subnetId: string,
        description?: string,
        securtyGroupIds?: string[],
        privateIpAddress?: string
    ): Promise<EC2.NetworkInterface> {
        const request: EC2.CreateNetworkInterfaceRequest = {
            SubnetId: subnetId,
            Description: description || undefined,
            Groups: securtyGroupIds || undefined,
            PrivateIpAddress: privateIpAddress || undefined
        };
        const result = await this.ec2.createNetworkInterface(request).promise();
        return result.NetworkInterface;
    }
    async deleteNetworkInterface(nicId: string): Promise<void> {
        const request: EC2.DeleteNetworkInterfaceRequest = {
            NetworkInterfaceId: nicId
        };
        await this.ec2.deleteNetworkInterface(request).promise();
    }

    async listNetworkInterfacesByTags(tags: ResourceTag[]): Promise<EC2.NetworkInterface[]> {
        const request: EC2.DescribeNetworkInterfacesRequest = {
            Filters: tags.map(tag => {
                const filter: EC2.Filter = {
                    Name: `tag:${tag.key}`,
                    Values: [tag.value]
                };
                return filter;
            })
        };
        const result = await this.ec2.describeNetworkInterfaces(request).promise();
        return result.NetworkInterfaces;
    }

    async listNetworkInterfacesById(nicIds: string[]): Promise<EC2.NetworkInterface[]> {
        const request: EC2.DescribeNetworkInterfacesRequest = {
            NetworkInterfaceIds: nicIds
        };
        const result = await this.ec2.describeNetworkInterfaces(request).promise();
        return result.NetworkInterfaces;
    }

    async describeNetworkInterface(nicId: string): Promise<EC2.NetworkInterface> {
        const [nic] = await this.listNetworkInterfacesById([nicId]);
        if (!nic) {
            throw new Error(`Nic (id: ${nicId}) does not exist.`);
        }
        return nic;
    }

    async attachNetworkInterface(instanceId: string, nicId: string, index: number): Promise<void> {
        const request: EC2.AttachNetworkInterfaceRequest = {
            DeviceIndex: index,
            InstanceId: instanceId,
            NetworkInterfaceId: nicId
        };
        await this.ec2.attachNetworkInterface(request).promise();
    }
    async detachNetworkInterface(instanceId: string, nicId: string): Promise<void> {
        const eni = await this.describeNetworkInterface(nicId);
        if (!eni.Attachment) {
            throw new Error(`Eni (id: ${eni.NetworkInterfaceId}) isn't attached to any instancee`);
        }
        const request: EC2.DetachNetworkInterfaceRequest = {
            AttachmentId: eni.Attachment.AttachmentId
        };
        await this.ec2.detachNetworkInterface(request).promise();
    }

    async tagResource(resId: string, tags: ResourceTag[]): Promise<void> {
        const request: EC2.CreateTagsRequest = {
            Resources: [resId],
            Tags: tags.map(tag => {
                return { Key: tag.key, Value: tag.value };
            })
        };
        await this.ec2.createTags(request).promise();
    }
    async completeLifecycleAction(
        autoScalingGroupName: string,
        actionResult: LifecycleActionResult,
        actionToken: string,
        hookName: string
    ): Promise<void> {
        const actionType: AutoScaling.CompleteLifecycleActionType = {
            LifecycleHookName: hookName,
            AutoScalingGroupName: autoScalingGroupName,
            LifecycleActionToken: actionToken,
            LifecycleActionResult: actionResult
        };
        await this.autoscaling.completeLifecycleAction(actionType).promise();
    }

    async updateInstanceSrcDestChecking(instanceId: string, enable?: boolean): Promise<void> {
        const request: EC2.ModifyInstanceAttributeRequest = {
            SourceDestCheck: {
                Value: enable
            },
            InstanceId: instanceId
        };
        await this.ec2.modifyInstanceAttribute(request).promise();
    }

    async elbRegisterTargets(targetGroupArn: string, instanceIds: string[]): Promise<void> {
        const input: ELBv2.Types.RegisterTargetsInput = {
            TargetGroupArn: targetGroupArn,
            Targets: instanceIds.map(id => {
                return { Id: id };
            })
        };
        await this.elbv2.registerTargets(input).promise();
    }

    async elbDeregisterTargets(targetGroupArn: string, instanceIds: string[]): Promise<void> {
        const input: ELBv2.Types.DeregisterTargetsInput = {
            TargetGroupArn: targetGroupArn,
            Targets: instanceIds.map(id => {
                return { Id: id };
            })
        };
        await this.elbv2.deregisterTargets(input).promise();
    }

    async terminateInstanceInAutoscalingGroup(
        instanceId: string,
        descCapacity?: boolean
    ): Promise<void> {
        const params: AutoScaling.TerminateInstanceInAutoScalingGroupType = {
            InstanceId: instanceId,
            ShouldDecrementDesiredCapacity: descCapacity
        };
        await this.autoscaling.terminateInstanceInAutoScalingGroup(params).promise();
    }
}

export enum LifecycleActionResult {
    Continue = 'CONTINUE',
    Abandon = 'ABANDON'
}

export enum LifecyleState {
    Launching = 'launching',
    Launched = 'launched',
    Terminating = 'terminating',
    Terminated = 'terminated'
}

export interface LifecycleItem {
    vmId: string;
    scalingGroupName: string;
    actionResult: LifecycleActionResult;
    actionToken: string;
    hookName: string;
    state: LifecyleState;
    timestamp: number;
}

export class AwsLambdaProxy extends CloudFunctionProxy<
    APIGatewayProxyEvent,
    Context,
    APIGatewayProxyResult
> {
    request: APIGatewayProxyEvent;
    context: Context;
    log(message: string, level: LogLevel): void {
        switch (level) {
            case LogLevel.Debug:
                console.debug(message);
                break;
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     * @returns {APIGatewayProxyResult} response
     */
    formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers: {}
    ): APIGatewayProxyResult {
        return {
            statusCode: httpStatusCode,
            body: (typeof body === 'string' && body) || JSON.stringify(body),
            isBase64Encoded: false
        };
    }
    getRequestAsString(): string {
        return JSON.stringify(this.request);
    }
}

export class AwsApiGatewayEventProxy extends CloudFunctionProxy<
    APIGatewayProxyEvent,
    Context,
    APIGatewayProxyResult
> {
    request: APIGatewayProxyEvent;
    context: Context;
    log(message: string, level: LogLevel): void {
        switch (level) {
            case LogLevel.Debug:
                console.debug(message);
                break;
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     * @returns {APIGatewayProxyResult} response
     */
    formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers: {}
    ): APIGatewayProxyResult {
        return {
            statusCode: httpStatusCode,
            body: (typeof body === 'string' && body) || JSON.stringify(body),
            isBase64Encoded: false
        };
    }
    getRequestAsString(): string {
        return JSON.stringify(this.request);
    }
    getReqBody(): ReqBody {
        let body: ReqBody;
        try {
            body = (this.request.body && JSON.parse(this.request.body)) || {};
        } catch (error) {}
        return body;
    }
    getReqHeaders(): ReqHeaders {
        const headers: ReqHeaders = { ...this.request.headers };
        return headers;
    }
    getReqMethod(): ReqMethod {
        return mapHttpMethod(this.request.httpMethod);
    }
}

export class AwsScheduledEventProxy extends CloudFunctionProxy<
    ScheduledEvent,
    Context,
    { [key: string]: unknown }
> {
    request: ScheduledEvent;
    context: Context;
    log(message: string, level: LogLevel): void {
        switch (level) {
            case LogLevel.Debug:
                console.debug(message);
                break;
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     * @returns {{}} empty object
     */
    formatResponse(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        httpStatusCode: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        body: CloudFunctionResponseBody,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        headers: {}
    ): { [key: string]: unknown } {
        return {};
    }
    getReqBody(): ScheduledEvent {
        return this.request;
    }
    getRequestAsString(): string {
        return JSON.stringify(this.request);
    }
}

export class AwsPlatformAdapter implements PlatformAdapter {
    adaptee: AwsPlatform;
    proxy: CloudFunctionProxyAdapter;
    settings: Settings;
    readonly createTime: number;
    readonly awsOnlyConfigset = ['setuptgwvpn', 'internalelbwebserv'];
    constructor(p: AwsPlatform, proxy: CloudFunctionProxyAdapter, createTime?: number) {
        this.adaptee = p;
        this.proxy = proxy;
        this.createTime = createTime ? createTime : Date.now();
    }
    vmEqualTo(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        if (!vmA || !vmB) {
            return false;
        } else {
            return (
                Object.keys(vmA).filter(prop => {
                    return vmA[prop] !== vmB[prop];
                }).length === 0
            );
        }
    }
    async deleteVmFromScalingGroup(vmId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteVmFromScalingGroup');
        try {
            await this.adaptee.terminateInstanceInAutoscalingGroup(vmId);
        } catch (error) {
            this.proxy.logForError('Failed to delele vm from scaling group.', error);
        }
        this.proxy.logAsInfo('called deleteVmFromScalingGroup');
    }

    getRequestType(): Promise<ReqType> {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const reqMethod = this.proxy.getReqMethod();
            if (reqMethod === ReqMethod.GET) {
                const headers = this.proxy.getReqHeaders();
                if (headers['Fos-instance-id'] === null) {
                    throw new Error(
                        'Invalid request. Fos-instance-id is missing in [GET] request header.'
                    );
                } else {
                    return Promise.resolve(ReqType.BootstrapConfig);
                }
            } else if (reqMethod === ReqMethod.POST) {
                const body = this.proxy.getReqBody();
                if (body.status) {
                    return Promise.resolve(ReqType.StatusMessage);
                } else if (body.instance) {
                    return Promise.resolve(ReqType.HeartbeatSync);
                } else {
                    throw new Error(
                        `Invalid request body: [instance: ${body.instance}],` +
                            ` [status: ${body.status}]`
                    );
                }
            } else {
                throw new Error(`Unsupported request method: ${reqMethod}`);
            }
        } else if (this.proxy instanceof AwsScheduledEventProxy) {
            const boby = this.proxy.getReqBody();
            if (boby.source === 'aws.autoscaling') {
                if (boby['detail-type'] === 'EC2 Instance-launch Lifecycle Action') {
                    return Promise.resolve(ReqType.LaunchingVm);
                } else if (boby['detail-type'] === 'EC2 Instance Launch Successful') {
                    return Promise.resolve(ReqType.LaunchedVm);
                } else if (boby['detail-type'] === 'EC2 Instance-terminate Lifecycle Action') {
                    return Promise.resolve(ReqType.TerminatingVm);
                } else if (boby['detail-type'] === 'EC2 Instance Terminate Successful') {
                    return Promise.resolve(ReqType.TerminatedVm);
                } else {
                    throw new Error(
                        'Invalid request. ' +
                            `Unsupported request detail-type: [${boby['detail-type']}]`
                    );
                }
            }
            throw new Error(`Unknown supported source: [${boby.source}]`);
        } else {
            throw new Error('Unsupported CloudFunctionProxy.');
        }
    }
    async init(): Promise<void> {
        this.settings = await this.adaptee.loadSettings();
        await this.validateSettings();
    }
    getReqVmId(): string {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const reqMethod = this.proxy.getReqMethod();
            if (reqMethod === ReqMethod.GET) {
                const headers = this.proxy.getReqHeaders();
                return headers['Fos-instance-id'] as string;
            } else if (reqMethod === ReqMethod.POST) {
                const body = this.proxy.getReqBody();
                return body.instance as string;
            } else {
                throw new Error(`Cannot get vm id in unknown request method: ${reqMethod}`);
            }
        } else if (this.proxy instanceof AwsScheduledEventProxy) {
            const body = this.proxy.getReqBody();
            if (body.source === 'aws.autoscaling') {
                return body.detail.EC2InstanceId;
            } else {
                throw new Error(`Cannot get vm id in unknown request: ${JSON.stringify(body)}`);
            }
        } else {
            throw new Error('Cannot get vm id in unknown request.');
        }
    }
    getReqHeartbeatInterval(): number {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            const body = this.proxy.getReqBody();
            return (body.interval && Number(body.interval)) || NaN;
        } else {
            return NaN;
        }
    }
    getReqAsString(): string {
        if (this.proxy instanceof AwsApiGatewayEventProxy) {
            return JSON.stringify(this.proxy.request);
        } else if (this.proxy instanceof AwsApiGatewayEventProxy) {
            return JSON.stringify(this.proxy.request);
        } else {
            throw new Error('Unknown request.');
        }
    }
    getSettings(): Promise<Settings> {
        return Promise.resolve(this.settings);
    }

    validateSettings(): Promise<boolean> {
        const required = [
            FortiGateAutoscaleSetting.AutoscaleHandlerUrl,
            FortiGateAutoscaleSetting.FortiGatePskSecret,
            FortiGateAutoscaleSetting.FortiGateSyncInterface,
            FortiGateAutoscaleSetting.FortiGateTrafficPort,
            FortiGateAutoscaleSetting.FortiGateAdminPort,
            FortiGateAutoscaleSetting.FortiGateInternalElbDns,
            FortiGateAutoscaleSetting.HeartbeatInterval,
            FortiGateAutoscaleSetting.ByolScalingGroupName,
            FortiGateAutoscaleSetting.PaygScalingGroupName
        ];
        const missingKeys = required.filter(key => !this.settings.has(key)).join(', ');
        if (missingKeys) {
            throw new Error(`The following required setting item not found: ${missingKeys}`);
        }
        return Promise.resolve(true);
    }

    protected instanceToVm(
        instance: EC2.Instance,
        scalingGroupName: string,
        enis?: EC2.NetworkInterface[]
    ): VirtualMachine {
        const vm: VirtualMachine = {
            id: instance.InstanceId,
            scalingGroupName: scalingGroupName,
            primaryPrivateIpAddress: instance.PrivateIpAddress,
            primaryPublicIpAddress: instance.PublicIpAddress || undefined,
            virtualNetworkId: instance.VpcId,
            subnetId: instance.SubnetId,
            securityGroups: instance.SecurityGroups.map(group => {
                return {
                    id: group.GroupId,
                    name: group.GroupName
                };
            }),
            networkInterfaces: (enis && enis.map(this.eniToNic)) || undefined,
            networkInterfaceIds: instance.NetworkInterfaces.map(eni => eni.NetworkInterfaceId)
        };
        Object.assign(vm.sourceData, instance);
        return vm;
    }

    protected eniToNic(eni: EC2.NetworkInterface): NetworkInterface {
        const nic: NetworkInterface = {
            id: eni.NetworkInterfaceId,
            privateIpAddress: eni.PrivateIpAddress,
            subnetId: eni.SubnetId,
            virtualNetworkId: eni.VpcId,
            attachmentId: (eni.Attachment && eni.Attachment.AttachmentId) || undefined,
            description: eni.Description
        };
        return nic;
    }

    async getTargetVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getTargetVm');
        const instance = await this.adaptee.describeInstance(this.getReqVmId());
        const byolGroupName = this.settings.get(AutoscaleSetting.ByolScalingGroupName).value;
        const paygGroupName = this.settings.get(AutoscaleSetting.PaygScalingGroupName).value;
        const scalingGroups = await this.adaptee.describeAutoScalingGroups([
            byolGroupName,
            paygGroupName
        ]);
        // get scaling group name
        // ASSERT: the instance can only locate in 1 scaling group
        const [scalingGroupName] = scalingGroups
            .filter(group => {
                return (
                    group.Instances.filter(ins => ins.InstanceId === instance.InstanceId).length > 0
                );
            })
            .map(group => group.AutoScalingGroupName);
        const vm = this.instanceToVm(instance, scalingGroupName);
        this.proxy.logAsInfo('called getTargetVm');
        return vm;
    }
    async getMasterVm(): Promise<VirtualMachine> {
        this.proxy.logAsInfo('calling getMasterVm');
        const masterRecord = await this.getMasterRecord();
        if (!masterRecord) {
            return null;
        }
        const instance = await this.adaptee.describeInstance(masterRecord.vmId);
        const vm = this.instanceToVm(instance, masterRecord.scalingGroupName);
        this.proxy.logAsInfo('called getMasterVm');
        return vm;
    }

    async getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord> {
        this.proxy.logAsInfo('calling getHealthCheckRecord');
        const table = new AwsDBDef.AwsAutoscale(process.env.RESOURCE_TAG_PREFIX || '');
        const dbItem = await this.adaptee.getItemFromDb<AutoscaleDbItem>(table, [
            {
                key: table.primaryKey.name,
                value: vmId
            }
        ]);

        // if heartbeatDelay is <= 0, it means hb arrives early or ontime
        const heartbeatDelay =
            this.createTime -
            dbItem.nextHeartBeatTime -
            Number(this.settings.get(FortiGateAutoscaleSetting.HeartbeatDelayAllowance).value);

        const [syncState] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return dbItem.syncState === value;
            })
            .map(([, v]) => v);
        const record: HealthCheckRecord = {
            vmId: vmId,
            scalingGroupName: dbItem.scalingGroupName,
            ip: dbItem.ip,
            masterIp: dbItem.masterIp,
            heartbeatInterval: dbItem.heartBeatInterval,
            heartbeatLossCount: dbItem.heartBeatLossCount,
            nextHeartbeatTime: dbItem.nextHeartBeatTime,
            syncState: syncState,
            seq: dbItem.seq,
            healthy: heartbeatDelay <= 0,
            upToDate: true
        };
        this.proxy.logAsInfo('called getHealthCheckRecord');
        return record;
    }
    async getMasterRecord(filters?: KeyValue[]): Promise<MasterRecord> {
        this.proxy.logAsInfo('calling getMasterRecord');
        const table = new AwsDBDef.AwsMasterElection(process.env.RESOURCE_TAG_PREFIX || '');
        const filterExp: AwsDdbOperations = {
            Expression: ''
        };
        filterExp.Expression = filters.map(kv => `${kv.key} = :${kv.value}`).join(' AND ');
        // ASSERT: there's only 1 matching master record
        const [masterRecord] = await this.adaptee.listItemFromDb<MasterElectionDbItem>(
            table,
            filterExp
        );
        const [voteState] = Object.entries(MasterRecordVoteState)
            .filter(([, value]) => {
                return masterRecord.voteState === value;
            })
            .map(([, v]) => v);
        this.proxy.logAsInfo('called getMasterRecord');
        return {
            id: masterRecord.id,
            vmId: masterRecord.vmId,
            ip: masterRecord.ip,
            scalingGroupName: masterRecord.scalingGroupName,
            virtualNetworkId: masterRecord.virtualNetworkId,
            subnetId: masterRecord.subnetId,
            voteEndTime: Number(masterRecord.voteEndTime),
            voteState: voteState
        };
    }
    equalToVm(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        if (!(vmA && vmB) || JSON.stringify(vmA) !== JSON.stringify(vmB)) {
            return false;
        } else {
            return true;
        }
    }
    async createHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        this.proxy.logAsInfo('calling createHealthCheckRecord');
        const table = new AwsDBDef.AwsAutoscale(process.env.RESOURCE_TAG_PREFIX || '');
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item: AutoscaleDbItem = {
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            masterIp: rec.masterIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            seq: rec.seq
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.CreateOrReplace
        };
        await this.adaptee.saveItemToDb<AutoscaleDbItem>(table, item, conditionExp);
        this.proxy.logAsInfo('called createHealthCheckRecord');
    }
    async updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        this.proxy.logAsInfo('calling updateHealthCheckRecord');
        const table = new AwsDBDef.AwsAutoscale(process.env.RESOURCE_TAG_PREFIX || '');
        const [syncStateString] = Object.entries(HealthCheckSyncState)
            .filter(([, value]) => {
                return rec.syncState === value;
            })
            .map(([, v]) => v);
        const item: AutoscaleDbItem = {
            vmId: rec.vmId,
            scalingGroupName: rec.scalingGroupName,
            ip: rec.ip,
            masterIp: rec.masterIp,
            heartBeatInterval: rec.heartbeatInterval,
            heartBeatLossCount: rec.heartbeatLossCount,
            nextHeartBeatTime: rec.nextHeartbeatTime,
            syncState: syncStateString,
            seq: rec.seq
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.UpdateExisting
        };
        await this.adaptee.saveItemToDb<AutoscaleDbItem>(table, item, conditionExp);
        this.proxy.logAsInfo('called updateHealthCheckRecord');
    }
    async createMasterRecord(rec: MasterRecord, oldRec: MasterRecord | null): Promise<void> {
        this.proxy.log('calling createMasterRecord.', LogLevel.Log);
        try {
            const table = new AwsDBDef.AwsMasterElection(process.env.RESOURCE_TAG_PREFIX || '');
            const item: MasterElectionDbItem = {
                id: rec.id,
                scalingGroupName: rec.scalingGroupName,
                ip: rec.ip,
                vmId: rec.vmId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: rec.voteEndTime,
                voteState: rec.voteState
            };
            // save record only if record for a certain scaling group name not exists, or
            // if it exists but timeout
            const conditionExp: AwsDdbOperations = {
                Expression: 'attribute_not_exists(scalingGroupName)'
            };
            if (oldRec) {
                conditionExp.Expression =
                    `${conditionExp.Expression} OR ` +
                    `attribute_exists(scalingGroupName) AND id = '${oldRec.id}'`;
            }

            await this.adaptee.saveItemToDb<MasterElectionDbItem>(table, item, conditionExp);
            this.proxy.log('called createMasterRecord.', LogLevel.Log);
        } catch (error) {
            this.proxy.logForError('called createMasterRecord.', error);
            throw error;
        }
    }
    async updateMasterRecord(rec: MasterRecord): Promise<void> {
        this.proxy.log('calling updateMasterRecord.', LogLevel.Log);
        try {
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsMasterElection(
                settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: MasterElectionDbItem = {
                id: rec.id,
                scalingGroupName: rec.scalingGroupName,
                ip: rec.ip,
                vmId: rec.vmId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: rec.voteEndTime,
                voteState: rec.voteState
            };
            // save record only if the keys in rec match the keys in db
            const conditionExp: AwsDdbOperations = {
                Expression:
                    'attribute_not_exists(scalingGroupName) OR ' +
                    'attribute_exists(scalingGroupName) AND ' +
                    `voteState = '${MasterRecordVoteState.Pending}' AND ` +
                    `voteEndTime < ${item.voteEndTime}`
            };
            await this.adaptee.saveItemToDb<MasterElectionDbItem>(table, item, conditionExp);
            this.proxy.log('called updateMasterRecord.', LogLevel.Log);
        } catch (error) {
            this.proxy.logForError('called updateMasterRecord.', error);
            throw error;
        }
    }
    async loadConfigSet(name: string, custom?: boolean): Promise<string> {
        this.proxy.logAsInfo(`loading${custom ? ' (custom)' : ''} configset: ${name}`);
        const bucket = custom
            ? this.settings.get(FortiGateAutoscaleSetting.CustomConfigSetContainer).value
            : this.settings.get(FortiGateAutoscaleSetting.AssetStorageContainer).value;
        const keyPrefix = [
            custom
                ? this.settings.get(FortiGateAutoscaleSetting.CustomConfigSetDirectory).value
                : this.settings.get(FortiGateAutoscaleSetting.AssetStorageDirectory).value,
            'configset'
        ];
        // if it is an AWS-only configset, load it from the aws subdirectory
        if (this.awsOnlyConfigset.includes(name)) {
            keyPrefix.push('aws');
        }
        keyPrefix.push(name);
        const content = await this.adaptee.getS3ObjectContent(bucket, path.join(...keyPrefix));
        this.proxy.logAsInfo('configset loaded.');
        return content;
    }
    async listLicenseFiles(
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<LicenseFile[]> {
        const blobs: Blob[] = await this.adaptee.listS3Object(
            storageContainerName,
            licenseDirectoryName
        );
        return await Promise.all(
            blobs.map(async blob => {
                const filePath = path.join(licenseDirectoryName, blob.fileName);
                const content = await this.adaptee.getS3ObjectContent(
                    storageContainerName,
                    filePath
                );
                const algorithm = 'sha256';
                const licenseFile: LicenseFile = {
                    fileName: blob.fileName,
                    checksum: genChecksum(blob.content, algorithm),
                    algorithm: algorithm,
                    content: content
                };
                return licenseFile;
            })
        );
    }

    async listLicenseStock(productName: string): Promise<LicenseStockRecord[]> {
        this.proxy.logAsInfo('calling listLicenseStock');
        const table = new AwsDBDef.AwsLicenseStock(
            this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const dbItems = await this.adaptee.listItemFromDb<LicenseStockDbItem>(table);
        const mapItems = dbItems
            .filter(item => item.productName === productName)
            .map(item => {
                return {
                    fileName: item.fileName,
                    checksum: item.checksum,
                    algorithm: item.algorithm
                } as LicenseStockRecord;
            });
        this.proxy.logAsInfo('called listLicenseStock');
        return mapItems;
    }
    async listLicenseUsage(productName: string): Promise<LicenseUsageRecord[]> {
        this.proxy.logAsInfo('calling listLicenseUsage');
        const table = new AwsDBDef.AwsLicenseUsage(
            this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const dbItems = await this.adaptee.listItemFromDb<LicenseUsageDbItem>(table);
        const mapItems = dbItems
            .filter(item => item.productName === productName)
            .map(item => {
                return {
                    fileName: item.fileName,
                    checksum: item.checksum,
                    algorithm: item.algorithm,
                    vmId: item.vmId,
                    scalingGroupName: item.scalingGroupName,
                    assignedTime: item.assignedTime,
                    vmInSync: item.vmInSync
                } as LicenseUsageRecord;
            });
        this.proxy.logAsInfo('called listLicenseUsage');
        return mapItems;
    }
    async updateLicenseStock(records: LicenseStockRecord[]): Promise<void> {
        this.proxy.logAsInfo('calling updateLicenseStock');
        const table = new AwsDBDef.AwsLicenseStock(
            this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const items = new Map<string, LicenseStockDbItem>(
            (await this.adaptee.listItemFromDb<LicenseStockDbItem>(table)).map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        await Promise.all(
            records.map(record => {
                const item: LicenseStockDbItem = {
                    checksum: record.checksum,
                    algorithm: record.algorithm,
                    fileName: record.fileName,
                    productName: record.productName
                };
                const conditionExp: AwsDdbOperations = {
                    Expression: ''
                };
                let typeText: string;
                // recrod exisit, update it
                if (items.has(record.checksum)) {
                    conditionExp.type = CreateOrUpdate.UpdateExisting;
                    typeText =
                        `update existing item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                } else {
                    conditionExp.type = CreateOrUpdate.CreateOrReplace;
                    typeText =
                        `create new item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                }
                return this.adaptee
                    .saveItemToDb<LicenseStockDbItem>(table, item, conditionExp)
                    .catch(err => {
                        this.proxy.logForError(`Failed to ${typeText}.`, err);
                        errorCount++;
                    });
            })
        );
        if (errorCount > 0) {
            this.proxy.logAsInfo('called updateLicenseStock');

            throw new Error('updateLicenseStock unsuccessfully.');
        }
        this.proxy.logAsInfo('called updateLicenseStock');
    }
    async updateLicenseUsage(records: LicenseUsageRecord[]): Promise<void> {
        this.proxy.logAsInfo('calling updateLicenseUsage');
        const table = new AwsDBDef.AwsLicenseUsage(
            this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const items = new Map<string, LicenseUsageDbItem>(
            (await this.adaptee.listItemFromDb<LicenseUsageDbItem>(table)).map(item => {
                return [item.checksum, item];
            })
        );
        let errorCount = 0;
        await Promise.all(
            records.map(record => {
                const item: LicenseUsageDbItem = {
                    checksum: record.checksum,
                    algorithm: record.algorithm,
                    fileName: record.fileName,
                    productName: record.productName,
                    vmId: record.vmId,
                    scalingGroupName: record.scalingGroupName,
                    assignedTime: record.assignedTime,
                    vmInSync: record.vmInSync
                };
                const conditionExp: AwsDdbOperations = {
                    Expression: ''
                };
                let typeText: string;
                // recrod exisit, update it
                if (items.has(record.checksum)) {
                    conditionExp.type = CreateOrUpdate.UpdateExisting;
                    typeText =
                        `update existing item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                } else {
                    conditionExp.type = CreateOrUpdate.CreateOrReplace;
                    typeText =
                        `create new item (filename: ${record.fileName},` +
                        ` checksum: ${record.checksum})`;
                }
                return this.adaptee
                    .saveItemToDb<LicenseUsageDbItem>(table, item, conditionExp)
                    .catch(err => {
                        this.proxy.logForError(`Failed to ${typeText}.`, err);
                        errorCount++;
                    });
            })
        );
        if (errorCount > 0) {
            this.proxy.logAsInfo('called updateLicenseUsage');

            throw new Error('updateLicenseUsage unsuccessfully.');
        }
        this.proxy.logAsInfo('called updateLicenseUsage');
    }
    async loadLicenseFileContent(storageContainerName: string, filePath: string): Promise<string> {
        this.proxy.logAsInfo('calling loadLicenseFileContent');
        const content = await this.adaptee.getS3ObjectContent(storageContainerName, filePath);
        this.proxy.logAsInfo('called loadLicenseFileContent');
        return content;
    }

    async listNicAttachmentRecord(): Promise<NicAttachmentRecord[]> {
        this.proxy.logAsInfo('calling listNicAttachmentRecord');
        const table = new AwsDBDef.AwsNicAttachment(
            this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const records = await this.adaptee.listItemFromDb<NicAttachmentDbItem>(table);
        const nicRecords: NicAttachmentRecord[] = records.map(record => {
            return {
                vmId: record.vmId,
                nicId: record.nicId,
                attachmentState: record.attachmentState
            } as NicAttachmentRecord;
        });
        this.proxy.logAsInfo(`listed ${nicRecords.length} records.`);
        this.proxy.logAsInfo('called listNicAttachmentRecord');
        return nicRecords;
    }
    async updateNicAttachmentRecord(vmId: string, nicId: string, status: string): Promise<void> {
        this.proxy.logAsInfo('calling updateNicAttachmentRecord');
        try {
            const table = new AwsDBDef.AwsNicAttachment(
                this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: NicAttachmentDbItem = {
                vmId: vmId,
                nicId: nicId,
                attachmentState: status
            };
            const conditionExp: AwsDdbOperations = {
                Expression: '',
                type: CreateOrUpdate.UpdateExisting
            };
            await this.adaptee.saveItemToDb<NicAttachmentDbItem>(table, item, conditionExp);
        } catch (error) {
            this.proxy.logAsError('cannot update nic attachment record');
            throw error;
        }
        this.proxy.logAsInfo('called updateNicAttachmentRecord');
    }

    async deleteNicAttachmentRecord(vmId: string, nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteNicAttachmentRecord');
        try {
            const table = new AwsDBDef.AwsNicAttachment(
                this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: NicAttachmentDbItem = {
                vmId: vmId,
                nicId: nicId,
                attachmentState: '' // this isn't a key so the value can be arbitrary
            };
            await this.adaptee.deleteItemFromDb<NicAttachmentDbItem>(table, item);
        } catch (error) {
            this.proxy.logAsError('cannot delete nic attachment record');
            throw error;
        }
        this.proxy.logAsInfo('called deleteNicAttachmentRecord');
    }
    async createNetworkInterface(
        subnetId?: string,
        description?: string,
        securityGroups?: string[],
        privateIpAddress?: string
    ): Promise<NetworkInterface | null> {
        this.proxy.logAsInfo('calling createNetworkInterface');

        const nic = await this.adaptee.createNetworkInterface(
            subnetId,
            description,
            securityGroups,
            privateIpAddress
        );
        this.proxy.logAsInfo('called createNetworkInterface');
        return {
            id: nic.NetworkInterfaceId,
            privateIpAddress: nic.PrivateIpAddress,
            subnetId: nic.SubnetId,
            virtualNetworkId: nic.VpcId,
            attachmentId: (nic.Attachment && nic.Attachment.AttachmentId) || undefined,
            description: nic.Description
        };
    }
    async deleteNetworkInterface(nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteNetworkInterface');
        const nic = await this.adaptee.describeNetworkInterface(nicId);
        if (nic) {
            if (nic.Status !== 'available') {
                this.proxy.logAsError(
                    `nic (id: ${nicId}) is in ${nic.Status} state.` +
                        "It can be deleted only when in 'available' state."
                );
                throw new Error("cannot delete nic not in 'available' state.");
            }
        }
        await this.adaptee.deleteNetworkInterface(nicId);
        this.proxy.logAsInfo('called deleteNetworkInterface');
    }

    async attachNetworkInterface(vmId: string, nicId: string, index?: number): Promise<void> {
        this.proxy.logAsInfo('calling attachNetworkInterface');
        if (!vmId) {
            throw new Error('Invalid vmId.');
        }
        if (!nicId) {
            throw new Error('Invalid nicId.');
        }
        // attach nic
        const eni = await this.adaptee.describeNetworkInterface(nicId);
        // eni is able to attach
        if (eni.Status === 'available' || eni.Status === 'attaching') {
            // not attaching yet? attach it.
            if (eni.Status === 'available') {
                await this.adaptee.attachNetworkInterface(
                    vmId,
                    nicId,
                    index && index > 0 ? index : 0
                );
            }
            // wait for its state to become attached
            const emitter: WaitForPromiseEmitter<EC2.NetworkInterface> = () => {
                return this.adaptee.describeNetworkInterface(nicId);
            };
            const checker: WaitForConditionChecker<EC2.NetworkInterface> = (nic, callCount) => {
                if (callCount > 12) {
                    throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
                }
                if (nic.Status === 'attached') {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            };
            await waitFor<EC2.NetworkInterface>(emitter, checker, 5000, this.proxy);
        } else if (eni.Status !== 'attached') {
            throw new Error(
                `nic (id: ${nicId}) is in state '${eni.Status}'` + ' which cannot perform attaching'
            );
        }
        this.proxy.logAsInfo('called attachNetworkInterface');
    }
    async detachNetworkInterface(vmId: string, nicId: string): Promise<void> {
        this.proxy.logAsInfo('calling detachNetworkInterface');
        if (!vmId) {
            throw new Error('Invalid vmId.');
        }
        if (!nicId) {
            throw new Error('Invalid nicId.');
        }
        // detach nic
        const eni = await this.adaptee.describeNetworkInterface(nicId);
        // eni is able to detach
        if (eni.Status === 'in-use' || eni.Status === 'detaching') {
            // not detaching yet? detach it.
            if (eni.Status === 'in-use') {
                await this.adaptee.detachNetworkInterface(vmId, nicId);
            }
            // wait for its state to become detached
            const emitter: WaitForPromiseEmitter<EC2.NetworkInterface> = () => {
                return this.adaptee.describeNetworkInterface(nicId);
            };
            const checker: WaitForConditionChecker<EC2.NetworkInterface> = (nic, callCount) => {
                if (callCount > 12) {
                    throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
                }
                if (nic.Status === 'available') {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            };
            await waitFor<EC2.NetworkInterface>(emitter, checker, 5000, this.proxy);
        } else if (eni.Status !== 'available') {
            throw new Error(
                `nic (id: ${nicId}) is in state '${eni.Status}'` + ' which cannot perform detaching'
            );
        }
        this.proxy.logAsInfo('called detachNetworkInterface');
    }
    async listUnusedNetworkInterface(tags: ResourceTag[]): Promise<NetworkInterface[]> {
        this.proxy.logAsInfo('calling listUnusedNetworkInterface');
        const enis = await this.adaptee.listNetworkInterfacesByTags(tags);
        const nics: NetworkInterface[] = enis
            .filter(e => e.Status === 'available')
            .map(eni => {
                const nic: NetworkInterface = {
                    id: eni.NetworkInterfaceId,
                    privateIpAddress: eni.PrivateIpAddress,
                    subnetId: eni.SubnetId,
                    virtualNetworkId: eni.VpcId,
                    attachmentId: (eni.Attachment && eni.Attachment.AttachmentId) || undefined,
                    description: eni.Description
                };
                return nic;
            });
        this.proxy.logAsInfo('called listUnusedNetworkInterface');
        return nics;
    }

    async tagNetworkInterface(nicId: string, tags: ResourceTag[]): Promise<void> {
        this.proxy.logAsInfo('calling tagNetworkInterface');
        await this.adaptee.tagResource(nicId, tags);
        this.proxy.logAsInfo('called tagNetworkInterface');
    }

    getTgwVpnAttachmentRecord(id: string): Promise<{ [key: string]: any }> {
        throw new Error('Method not implemented.');
    }

    async updateVmSourceDestinationChecking(vmId: string, enable?: boolean): Promise<void> {
        this.proxy.logAsInfo('calling updateVmSourceDestinationChecking');
        await this.adaptee.updateInstanceSrcDestChecking(vmId, enable);
        this.proxy.logAsInfo('called updateVmSourceDestinationChecking');
    }
    async loadBalancerAttachVm(elbId: string, vmIds: string[]): Promise<void> {
        this.proxy.logAsInfo('calling loadBalancerAttachVm');
        await this.adaptee.elbRegisterTargets(elbId, vmIds);
        this.proxy.logAsInfo('called loadBalancerAttachVm');
    }

    async loadBalancerDetachVm(elbId: string, vmIds: string[]): Promise<void> {
        this.proxy.logAsInfo('calling loadBalancerDetachVm');
        await this.adaptee.elbDeregisterTargets(elbId, vmIds);
        this.proxy.logAsInfo('called loadBalancerDetachVm');
    }

    extractLifecycleItemFromRequest(object: { [key: string]: unknown }): LifecycleItem {
        const actionResultString: string =
            (object.LifecycleActionResult && (object.LifecycleActionResult as string)) || undefined;
        const [actionResult] = Object.entries(LifecycleActionResult)
            .filter(([, value]) => {
                return actionResultString === value;
            })
            .map(([, v]) => v);
        const lifecycleItem: LifecycleItem = {
            vmId: '',
            scalingGroupName:
                (object.AutoScalingGroupName && (object.AutoScalingGroupName as string)) ||
                undefined,
            actionResult: actionResult,
            actionToken:
                (object.LifecycleActionToken && (object.LifecycleActionToken as string)) ||
                undefined,
            hookName:
                (object.LifecycleHookName && (object.LifecycleHookName as string)) || undefined,
            state: undefined,
            timestamp: Date.now()
        };
        return lifecycleItem;
    }

    async getLifecycleItem(vmId: string): Promise<LifecycleItem | null> {
        this.proxy.logAsInfo('calling getLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        const dbItem = await this.adaptee.getItemFromDb<LifecycleItemDbItem>(table, [
            {
                key: table.primaryKey.name,
                value: vmId
            }
        ]);
        const [actionResult] = Object.entries(LifecycleActionResult)
            .filter(([, value]) => {
                return dbItem.actionResult === value;
            })
            .map(([, v]) => v);
        const [state] = Object.entries(LifecyleState)
            .filter(([, value]) => {
                return dbItem.state === value;
            })
            .map(([, v]) => v);
        const lifecycleItem: LifecycleItem = {
            vmId: dbItem.vmId,
            scalingGroupName: dbItem.scalingGroupName,
            actionResult: actionResult,
            actionToken: dbItem.actionToken,
            hookName: dbItem.hookName,
            state: state,
            timestamp: dbItem.timestamp
        };
        this.proxy.logAsInfo('called getLifecycleItem');
        return lifecycleItem;
    }
    async createLifecycleItem(item: LifecycleItem): Promise<void> {
        this.proxy.logAsInfo('calling createLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        // ASSERT: item is vliad
        const dbItem: LifecycleItemDbItem = {
            vmId: item.vmId,
            scalingGroupName: item.scalingGroupName,
            actionResult: item.actionResult,
            actionToken: item.actionToken,
            hookName: item.hookName,
            state: item.state,
            timestamp: item.timestamp
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.CreateOrReplace
        };
        await this.adaptee.saveItemToDb<LifecycleItemDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called createLifecycleItem');
    }
    async updateLifecycleItem(item: LifecycleItem): Promise<void> {
        this.proxy.logAsInfo('calling updateLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        // ASSERT: item is vliad
        const dbItem: LifecycleItemDbItem = {
            vmId: item.vmId,
            scalingGroupName: item.scalingGroupName,
            actionResult: item.actionResult,
            actionToken: item.actionToken,
            hookName: item.hookName,
            state: item.state,
            timestamp: item.timestamp
        };
        const conditionExp: AwsDdbOperations = {
            Expression: '',
            type: CreateOrUpdate.UpdateExisting
        };
        await this.adaptee.saveItemToDb<LifecycleItemDbItem>(table, dbItem, conditionExp);
        this.proxy.logAsInfo('called updateLifecycleItem');
    }
    async deleteLifecycleItem(vmId: string): Promise<void> {
        this.proxy.logAsInfo('calling deleteLifecycleItem');
        const table = new AwsDBDef.AwsLifecycleItem(process.env.RESOURCE_TAG_PREFIX || '');
        const item: LifecycleItemDbItem = {
            vmId: vmId,
            // the value of the properties below aren't used.
            scalingGroupName: '',
            actionResult: '',
            actionToken: '',
            hookName: '',
            state: '',
            timestamp: 0
        };
        await this.adaptee.deleteItemFromDb(table, item);
        this.proxy.logAsInfo('called deleteLifecycleItem');
    }
    async completeLifecycleAction(item: LifecycleItem, success?: boolean): Promise<void> {
        this.proxy.logAsInfo('calling completeLifecycleAction');
        // ASSERT: item is correctly constructed.
        if (success) {
            item.actionResult = LifecycleActionResult.Continue;
        } else {
            item.actionResult = LifecycleActionResult.Abandon;
        }
        await this.adaptee.completeLifecycleAction(
            item.scalingGroupName,
            item.actionResult,
            item.actionToken,
            item.hookName
        );
        this.proxy.logAsInfo('called completeLifecycleAction');
    }
}
