import path from 'path';
import process from 'process';
import fs from 'fs';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import EC2 from 'aws-sdk/clients/ec2';
import { DocumentClient, ExpressionAttributeValueMap } from 'aws-sdk/clients/dynamodb';
import { S3 } from 'aws-sdk';

import * as AwsDBDef from './aws-db-definitions';
import { VpnAttachmentContext } from '../../context-strategy/vpn-attachment-context';
import {
    NicAttachmentStrategy,
    NicAttachmentRecord,
    NicAttachmentStatus,
    NicAttachmentResult
} from '../../context-strategy/nic-attachment-context';
import { VirtualMachine, NetworkInterface } from '../../virtual-machine';
import { SubnetPair, SettingItem, Settings } from '../../autoscale-setting';
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
    CloudFunctionResponseBody
} from '../../cloud-function-proxy';
import {
    ReqMethod,
    ReqType,
    PlatformAdapter,
    VmDescriptor,
    ResourceTag
} from '../../platform-adapter';
import { HealthCheckRecord, MasterRecord, MasterRecordVoteState } from '../../master-election';
import {
    Table,
    Record,
    KeyValue,
    CreateOrUpdate,
    MasterElectionDbItem,
    NicAttachmentDbItem
} from '../../db-definitions';
import { Blob } from '../../blob';
import { FortiGateAutoscaleSetting } from '../fortigate-autoscale-settings';

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
            return rec.vmId === vm.instanceId;
        });
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.getRecord');
        return records;
    }

    private async getRecord(
        vm: VirtualMachine,
        nic: NetworkInterface
    ): Promise<NicAttachmentRecord | null> {
        const [record] = (await this.platform.listNicAttachmentRecord()).filter(rec => {
            return rec.vmId === vm.instanceId && rec.nicId === nic.id;
        });
        return record;
    }

    protected async setAttaching(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setAttaching');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Attaching) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already attaching to vm(id: ${vm.instanceId})`
                );
                return;
            } else {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.instanceId}).` +
                        `Changing state from ${record.attachmentState} to attaching is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(
            vm.instanceId,
            nic.id,
            NicAttachmentStatus.Attaching
        );
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setAttaching');
    }

    protected async setAttached(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setAttaching');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Attached) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already attached to vm(id: ${vm.instanceId})`
                );
                return;
            } else {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.instanceId}).` +
                        `Changing state from ${record.attachmentState} to attached is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(
            vm.instanceId,
            nic.id,
            NicAttachmentStatus.Attached
        );
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setAttaching');
    }

    protected async setDetaching(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setDetaching');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Detaching) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already detaching from vm(id: ${vm.instanceId})`
                );
                return;
            } else {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.instanceId}).` +
                        `Changing state from ${record.attachmentState} to detaching is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(
            vm.instanceId,
            nic.id,
            NicAttachmentStatus.Detaching
        );
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setDetaching');
    }

    protected async setDetached(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.setDetached');
        const record = await this.getRecord(vm, nic);
        if (record) {
            if (record.attachmentState === NicAttachmentStatus.Detached) {
                this.proxy.logAsWarning(
                    `The nic (id: ${nic.id}) is already detached from vm(id: ${vm.instanceId})`
                );
                return;
            } else {
                this.proxy.logAsError(
                    `The nic (id: ${nic.id}) is in` +
                        ` state: ${record.attachmentState} with vm(id: ${vm.instanceId}).` +
                        `Changing state from ${record.attachmentState} to detached is not allowed.`
                );
                throw new Error('Incorrect transition of Nic Attachment.');
            }
        }
        await this.platform.updateNicAttachmentRecord(
            vm.instanceId,
            nic.id,
            NicAttachmentStatus.Detached
        );
        this.proxy.logAsDebug('called AwsNicAttachmentStrategy.setDetached');
    }

    protected async deleteRecord(vm: VirtualMachine, nic: NetworkInterface): Promise<void> {
        this.proxy.logAsDebug('calling AwsNicAttachmentStrategy.deleteRecord');
        const record = await this.getRecord(vm, nic);
        if (record) {
            await this.platform.deleteNicAttachmentRecord(vm.instanceId, nic.id);
        } else {
            this.proxy.logAsWarning(
                `no nic attachment found for vm(id: ${vm.instanceId}) and nic(id: ${nic.id}).`
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
                    `Addtional nic for instance(id:${this.vm.instanceId}) ` +
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
                    await this.platform.attachNetworkInterface(
                        this.vm.instanceId,
                        nic.id,
                        nicDeviceIndex
                    );
                } catch (error) {
                    this.proxy.logAsError(
                        `failed to attach nic (id: ${nic.id}) to` +
                            ` vm (id: ${this.vm.instanceId}).`
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
    createOrUpdate?: CreateOrUpdate;
}

export class AwsPlatform
    implements PlatformAdaptee<APIGatewayProxyEvent, Context, APIGatewayProxyResult> {
    docClient: DocumentClient;
    s3: S3;
    ec2: EC2;
    constructor() {
        this.docClient = new DocumentClient({ apiVersion: '2012-08-10' });
        this.s3 = new S3({ apiVersion: '2006-03-01' });
        this.ec2 = new EC2({ apiVersion: '2016-11-15' });
    }
    loadSettings(): Promise<Settings> {
        // TODO: add real implementation
        return Promise.resolve(new Map<string, SettingItem>());
    }
    getReqMethod(
        proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>
    ): ReqMethod {
        return mapHttpMethod(proxy.request.httpMethod);
    }
    getReqType(
        proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>
    ): ReqType {
        const httpMethod = proxy.request.httpMethod;
        if (
            proxy.request.headers['Fos-instance-id'] !== null &&
            httpMethod.toUpperCase() === 'GET'
        ) {
            return ReqType.BootstrapConfig;
        } else {
            throw new Error('Method partially implemented. Reached unimplemented section.');
        }
    }

    /**
     * Save a document db item into DynamoDB.
     * @param  {Table} table the instance of Table to save the item.
     * @param  {Record} item the item to save into the db table.
     * @param  {AwsDdbOperations} conditionExp (optional) the condition expression for saving the item
     * @returns {Promise} return void
     * @throws whatever docClient.put throws.
     * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#put-property
     */
    async saveItemToDb(table: Table, item: Record, conditionExp?: AwsDdbOperations): Promise<void> {
        // CAUTION: validate the db input
        table.validateInput(item);
        if (
            conditionExp &&
            conditionExp.createOrUpdate &&
            conditionExp.createOrUpdate === CreateOrUpdate.update
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
     * @param  {Table} table the instance of Table to get the item.
     * @param  {KeyValue[]} keyValue an array of table key and a value to get the item
     * @returns {Promise} return Record or null
     */
    async getItemFromDb(table: Table, keyValue: KeyValue[]): Promise<Record | null> {
        const keys = {};
        keyValue.forEach(kv => {
            keys[kv.key] = kv.value;
        });
        const getItemInput: DocumentClient.GetItemInput = {
            TableName: table.name,
            Key: keys
        };
        const result = await this.docClient.get(getItemInput).promise();
        return result.Item;
    }
    /**
     * Delte a given item from the db
     * @param  {Table} table the instance of Table to delete the item.
     * @param  {Record} item the item to be deleted from the db table.
     * @param  {AwsDdbOperations} condition (optional) the condition expression for deleting the item
     * @returns {Promise} void
     */
    async deleteItemFromDb(
        table: Table,
        item: Record,
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
     * @param  {Table} table the instance of Table to delete the item.
     * @param  {AwsDdbOperations} filterExp (optional) a filter for listing the records
     * @param  {number} limit (optional) number or records to return
     * @returns {Promise} array of db record
     */
    async listItemFromDb(
        table: Table,
        filterExp?: AwsDdbOperations,
        limit?: number
    ): Promise<Record[]> {
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
        let records: Record[] = [];
        if (response && response.Items) {
            records = response.Items.map(item => {
                const rec: Record = {};
                Object.assign(rec, item);
                return rec;
            });
        }
        return records;
    }

    /**
     * get a blob from a storage
     * @param  {string} s3Bucket the s3 bucket nemt
     * @param  {string} s3KeyPrefix the s3 key prefix to the blob file
     * @returns {Promise} Blob
     */
    async getBlobFromStorage(s3Bucket: string, s3KeyPrefix: string): Promise<Blob> {
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
            return {
                content: buffer.toString()
            };
        } else {
            const data = await this.s3.getObject({ Bucket: s3Bucket, Key: s3KeyPrefix }).promise();
            return {
                content: (data && data.Body && data.Body.toString()) || ''
            };
        }
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

    async describeNetworkInterface(nicId: string): Promise<EC2.NetworkInterface> {
        const request: EC2.DescribeNetworkInterfacesRequest = {
            NetworkInterfaceIds: [nicId]
        };
        const result = await this.ec2.describeNetworkInterfaces(request).promise();
        const [nic] = result.NetworkInterfaces.filter(eni => eni.NetworkInterfaceId === nicId);
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
}

export class AwsPlatformAdapter implements PlatformAdapter {
    adaptee: AwsPlatform;
    proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>;
    settings: Settings;
    readonly awsOnlyConfigset = ['setuptgwvpn', 'internalelbwebserv'];
    constructor(
        p: AwsPlatform,
        proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>
    ) {
        this.adaptee = p;
        this.proxy = proxy;
    }
    async init(): Promise<void> {
        this.settings = await this.adaptee.loadSettings();
        await this.validateSettings();
    }
    getRequestType(): ReqType {
        return this.adaptee.getReqType(this.proxy);
    }
    getReqHeartbeatInterval(): number {
        throw new Error('Method not implemented.');
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
            FortiGateAutoscaleSetting.HeartbeatInterval
        ];
        const missingKeys = required.filter(key => !this.settings.has(key)).join(', ');
        if (missingKeys) {
            throw new Error(`The following required setting item not found: ${missingKeys}`);
        }
        return Promise.resolve(true);
    }
    getTargetVm(): Promise<VirtualMachine> {
        throw new Error('Method not implemented.');
    }
    getMasterVm(): Promise<VirtualMachine> {
        throw new Error('Method not implemented.');
    }
    getHealthCheckRecord(vm: VirtualMachine): Promise<HealthCheckRecord> {
        throw new Error('Method not implemented.');
    }
    getMasterRecord(): Promise<MasterRecord> {
        throw new Error('Method not implemented.');
    }
    equalToVm(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean {
        if (!(vmA && vmB) || JSON.stringify(vmA) !== JSON.stringify(vmB)) {
            return false;
        } else {
            return true;
        }
    }
    describeVm(desc: VmDescriptor): Promise<VirtualMachine> {
        throw new Error('Method not implemented.');
    }
    deleteVm(vm: VirtualMachine): Promise<void> {
        throw new Error('Method not implemented.');
    }
    createHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
    updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void> {
        throw new Error('Method not implemented.');
    }
    async createMasterRecord(rec: MasterRecord, oldRec: MasterRecord | null): Promise<void> {
        this.proxy.log('calling createMasterRecord.', LogLevel.Log);
        try {
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsMasterElection(
                settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
            );
            const item: MasterElectionDbItem = {
                id: rec.id,
                scalingGroupName: rec.scalingGroupName,
                ip: rec.ip,
                vmId: rec.instanceId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: String(rec.voteEndTime),
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

            await this.adaptee.saveItemToDb(table, { ...item }, conditionExp);
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
                vmId: rec.instanceId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: String(rec.voteEndTime),
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
            await this.adaptee.saveItemToDb(table, { ...item }, conditionExp);
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
        const blob = await this.adaptee.getBlobFromStorage(bucket, path.join(...keyPrefix));
        this.proxy.logAsInfo('configset loaded.');
        return blob.content;
    }
    async listNicAttachmentRecord(): Promise<NicAttachmentRecord[]> {
        this.proxy.logAsInfo('calling listNicAttachmentRecord');
        const table = new AwsDBDef.AwsNicAttachment(
            this.settings.get(FortiGateAutoscaleSetting.ResourceTagPrefix).value
        );
        const records = await this.adaptee.listItemFromDb(table);
        const nicRecords: NicAttachmentRecord[] = records.map(record => {
            return {
                vmId: record.instanceId,
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
                createOrUpdate: CreateOrUpdate.update
            };
            await this.adaptee.saveItemToDb(table, { ...item }, conditionExp);
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
            await this.adaptee.deleteItemFromDb(table, { ...item });
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
}
