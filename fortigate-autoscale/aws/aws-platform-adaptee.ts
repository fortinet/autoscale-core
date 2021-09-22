import AutoScaling, {
    LifecycleActionResult,
    UpdateAutoScalingGroupType
} from 'aws-sdk/clients/autoscaling';
import {
    DocumentClient,
    ExpressionAttributeNameMap,
    ExpressionAttributeValueMap
} from 'aws-sdk/clients/dynamodb';
import EC2 from 'aws-sdk/clients/ec2';
import ELBv2 from 'aws-sdk/clients/elbv2';
import KMS from 'aws-sdk/clients/kms';
import Lambda from 'aws-sdk/clients/lambda';
import S3 from 'aws-sdk/clients/s3';
import SNS, { PublishInput } from 'aws-sdk/clients/sns';
import { AWSError } from 'aws-sdk/lib/error';
import fs from 'fs';
import { isIPv4 } from 'net';
import path from 'path';
import { AwsDdbOperations, AwsFortiGateAutoscaleSetting, AwsSettings } from '.';
import { Blob, PlatformAdaptee, ResourceFilter, SettingItem, Settings } from '..';
import { KeyValue, SaveCondition, SettingsDbItem, Table } from '../db-definitions';

let seq = 1;
interface TimeLog {
    seq: number;
    message: string;
    time: number;
}

function getTimeLogger(message: string): TimeLog {
    return {
        seq: seq++,
        message: message,
        time: Date.now()
    };
}

function printTimerLog(logger: TimeLog): void {
    const msg: string = logger.message
        ? `${logger.message}(seq: ${logger.seq}) `
        : `log seq: ${logger.seq}`;
    if (process.env.LOG_SERVICE_PROCESSING_TIME === 'true') {
        console.log(`${msg}, Time used: ${Date.now() - logger.time} ms.`);
    }
}

export class AwsPlatformAdaptee implements PlatformAdaptee {
    protected docClient: DocumentClient;
    protected s3: S3;
    protected ec2: EC2;
    protected autoscaling: AutoScaling;
    protected elbv2: ELBv2;
    protected lambda: Lambda;
    protected kms: KMS;
    protected sns: SNS;
    constructor() {
        this.docClient = new DocumentClient({ apiVersion: '2012-08-10' });
        this.s3 = new S3({ apiVersion: '2006-03-01' });
        this.ec2 = new EC2({ apiVersion: '2016-11-15' });
        this.autoscaling = new AutoScaling({ apiVersion: '2011-01-01' });
        this.elbv2 = new ELBv2({ apiVersion: '2015-12-01' });
        this.lambda = new Lambda({ apiVersion: '2015-03-31' });
        this.kms = new KMS({ apiVersion: '2014-11-01' });
        this.sns = new SNS({ apiVersion: '2010-03-31' });
    }
    async loadSettings(): Promise<Settings> {
        const table = new AwsSettings(process.env.RESOURCE_TAG_PREFIX || '');
        const records: Map<string, SettingsDbItem> = new Map(
            (await this.listItemFromDb<SettingsDbItem>(table)).map(rec => [rec.settingKey, rec])
        );
        const settings: Settings = new Map<string, SettingItem>();
        Object.values(AwsFortiGateAutoscaleSetting).forEach(value => {
            if (records.has(value)) {
                const record = records.get(value);
                const settingItem = new SettingItem(
                    record.settingKey,
                    record.settingValue,
                    record.description,
                    record.editable,
                    record.jsonEncoded
                );
                settings.set(value, settingItem);
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
        if (conditionExp && conditionExp.type && conditionExp.type === SaveCondition.UpdateOnly) {
            const keys: DocumentClient.Key = {};
            // get the key names from table,
            // then assign the value of each key name of item to the key
            Array.from(table.keys.keys()).forEach(name => {
                keys[name] = item[name];
            });
            const attributeValues: ExpressionAttributeValueMap = {};
            const attributeNames: ExpressionAttributeNameMap = {};
            const attributeExp: string[] = [];
            Array.from(table.attributes.values()).forEach(attr => {
                if (attr.isKey) {
                    return;
                }
                const value =
                    typeof item[attr.name] === 'object'
                        ? JSON.stringify(item[attr.name])
                        : item[attr.name];
                if (value !== undefined && value !== null) {
                    attributeNames[`#${attr.name}`] = attr.name;
                    attributeValues[`:${attr.name}`] = value;
                    attributeExp.push(`#${attr.name} = :${attr.name}`);
                }
            });

            const updateItemInput: DocumentClient.UpdateItemInput = {
                TableName: table.name,
                Key: keys,
                UpdateExpression:
                    (attributeExp.length > 0 && `set ${attributeExp.join(', ')}`) || undefined,
                ExpressionAttributeValues: attributeValues,
                ExpressionAttributeNames: attributeNames
            };
            if (conditionExp.Expression) {
                updateItemInput.ConditionExpression = conditionExp.Expression;
            }
            const logger = getTimeLogger('saveItemToDb: docClient.update');
            await this.docClient.update(updateItemInput).promise();
            printTimerLog(logger);
        } else {
            const putItemInput: DocumentClient.PutItemInput = {
                TableName: table.name,
                Item: item,
                ConditionExpression: (conditionExp && conditionExp.Expression) || undefined,
                ExpressionAttributeValues:
                    (conditionExp && conditionExp.ExpressionAttributeValues) || undefined
            };
            const logger1 = getTimeLogger('saveItemToDb: docClient.put');
            await this.docClient.put(putItemInput).promise();
            printTimerLog(logger1);
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
        const logger = getTimeLogger('saveItemToDb: docClient.get');
        const result = await this.docClient.get(getItemInput).promise();
        printTimerLog(logger);
        return (result.Item && table.convertRecord(result.Item)) || null;
    }
    /**
     * Delete a given item from the db
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
        const logger = getTimeLogger('deleteItemFromDb: docClient.delete');
        await this.docClient.delete(deleteItemInput).promise();
        printTimerLog(logger);
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

        const logger = getTimeLogger('listItemFromDb: docClient.scan');
        const response = await this.docClient.scan(scanInput).promise();
        printTimerLog(logger);
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
            const logger = getTimeLogger('listS3Object: s3.listObjectsV2');
            const data = await this.s3
                .listObjectsV2({
                    Bucket: s3Bucket,
                    Prefix: prefix,
                    StartAfter: prefix
                })
                .promise();
            printTimerLog(logger);
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
            const logger = getTimeLogger('getS3ObjectContent: s3.getObject');
            const data = await this.s3.getObject({ Bucket: s3Bucket, Key: s3KeyPrefix }).promise();
            printTimerLog(logger);
            return (data && data.Body && data.Body.toString()) || '';
        }
    }

    async listInstances(filters: ResourceFilter[]): Promise<EC2.Instance[]> {
        const request: EC2.DescribeInstancesRequest = {
            Filters: filters.map(filter => {
                return {
                    Name: filter.isTag ? `tag:${filter.key}` : filter.key,
                    Values: [filter.value]
                };
            })
        };
        const logger = getTimeLogger('listInstances: ec2.describeInstances');
        const result = await this.ec2.describeInstances(request).promise();
        printTimerLog(logger);
        const instances: Map<string, EC2.Instance> = new Map();
        result.Reservations.forEach(reservation => {
            reservation.Instances.forEach(instance => {
                if (!instances.has(instance.InstanceId)) {
                    instances.set(instance.InstanceId, instance);
                }
            });
        });
        return Array.from(instances.values());
    }

    async identifyInstanceScalingGroup(instanceIds: string[]): Promise<Map<string, string>> {
        const request: AutoScaling.DescribeAutoScalingInstancesType = {
            InstanceIds: instanceIds
        };
        const logger = getTimeLogger(
            'identifyInstanceScalingGroup: autoscaling.describeAutoScalingInstances'
        );
        const result = await this.autoscaling.describeAutoScalingInstances(request).promise();
        printTimerLog(logger);
        const map: Map<string, string> = new Map();
        result.AutoScalingInstances.forEach(detail => {
            map.set(detail.InstanceId, detail.AutoScalingGroupName);
        });
        return map;
    }

    async describeInstance(instanceId: string): Promise<EC2.Instance> {
        const filter: ResourceFilter = {
            key: 'instance-id',
            value: instanceId
        };
        const instances = await this.listInstances([filter]);
        return instances.find(instance => instance.InstanceId === instanceId);
    }

    async describeAutoScalingGroups(
        scalingGroupNames: string[]
    ): Promise<AutoScaling.AutoScalingGroup[]> {
        const request: AutoScaling.AutoScalingGroupNamesType = {
            AutoScalingGroupNames: scalingGroupNames
        };
        const logger = getTimeLogger(
            'describeAutoScalingGroups: autoscaling.describeAutoScalingGroups'
        );
        const result = await this.autoscaling.describeAutoScalingGroups(request).promise();
        printTimerLog(logger);
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
        const logger = getTimeLogger('createNetworkInterface: ec2.createNetworkInterface');
        const result = await this.ec2.createNetworkInterface(request).promise();
        printTimerLog(logger);
        return result.NetworkInterface;
    }
    async deleteNetworkInterface(nicId: string): Promise<void> {
        const request: EC2.DeleteNetworkInterfaceRequest = {
            NetworkInterfaceId: nicId
        };
        const logger = getTimeLogger('deleteNetworkInterface: ec2.deleteNetworkInterface');
        await this.ec2.deleteNetworkInterface(request).promise();
        printTimerLog(logger);
    }

    async listNetworkInterfaces(filters: ResourceFilter[]): Promise<EC2.NetworkInterface[]> {
        const request: EC2.DescribeNetworkInterfacesRequest = {
            Filters: filters.map(filter => {
                return {
                    Name: filter.isTag ? `tag:${filter.key}` : filter.key,
                    Values: [filter.value]
                };
            })
        };
        const logger = getTimeLogger('listNetworkInterfaces: ec2.describeNetworkInterfaces');
        const result = await this.ec2.describeNetworkInterfaces(request).promise();
        printTimerLog(logger);
        return result.NetworkInterfaces;
    }

    async listNetworkInterfacesByInstanceId(instanceId: string): Promise<EC2.NetworkInterface[]> {
        const filter: ResourceFilter = {
            key: 'attachment.instance-id',
            value: instanceId
        };
        return await this.listNetworkInterfaces([filter]);
    }

    async listNetworkInterfacesById(nicIds: string[]): Promise<EC2.NetworkInterface[]> {
        const request: EC2.DescribeNetworkInterfacesRequest = {
            NetworkInterfaceIds: nicIds
        };
        const logger = getTimeLogger('listNetworkInterfacesById: ec2.describeNetworkInterfaces');
        const result = await this.ec2.describeNetworkInterfaces(request).promise();
        printTimerLog(logger);
        return result.NetworkInterfaces.filter(nic => nicIds.includes(nic.NetworkInterfaceId));
    }

    async describeNetworkInterface(nicId: string): Promise<EC2.NetworkInterface> {
        const [nic] = await this.listNetworkInterfacesById([nicId]);
        if (!nic) {
            throw new Error(`Nic (id: ${nicId}) does not exist.`);
        }
        return nic;
    }

    async attachNetworkInterface(
        instanceId: string,
        nicId: string,
        index: number
    ): Promise<EC2.AttachNetworkInterfaceResult> {
        const request: EC2.AttachNetworkInterfaceRequest = {
            DeviceIndex: index,
            InstanceId: instanceId,
            NetworkInterfaceId: nicId
        };
        const logger = getTimeLogger('attachNetworkInterface: ec2.attachNetworkInterface');
        const result = await this.ec2.attachNetworkInterface(request).promise();
        printTimerLog(logger);
        return result;
    }
    async detachNetworkInterface(instanceId: string, nicId: string): Promise<void> {
        const eni = await this.describeNetworkInterface(nicId);
        if (!eni.Attachment) {
            throw new Error(`Eni (id: ${eni.NetworkInterfaceId}) isn't attached to any instancee`);
        }
        const instance = await this.describeInstance(instanceId);
        if (
            instance.NetworkInterfaces.filter(eni2 => {
                return eni2.NetworkInterfaceId === nicId;
            }).length === 0
        ) {
            throw new Error(
                `Eni (id: ${eni.NetworkInterfaceId}) isn't attached to` +
                    ` instancee (id: ${instanceId})`
            );
        }
        const request: EC2.DetachNetworkInterfaceRequest = {
            AttachmentId: eni.Attachment.AttachmentId
        };
        const logger = getTimeLogger('attachNetworkInterface: ec2.detachNetworkInterface');
        await this.ec2.detachNetworkInterface(request).promise();
        printTimerLog(logger);
    }

    async tagResource(resIds: string[], tags: ResourceFilter[]): Promise<void> {
        const request: EC2.CreateTagsRequest = {
            Resources: resIds,
            Tags: tags.map(tag => {
                return { Key: tag.key, Value: tag.value };
            })
        };
        const logger = getTimeLogger('tagResource: ec2.createTags');
        await this.ec2.createTags(request).promise();
        printTimerLog(logger);
    }
    async untagResource(resIds: string[], tags: ResourceFilter[]): Promise<void> {
        const request: EC2.DeleteTagsRequest = {
            Resources: resIds,
            Tags: tags.map(tag => {
                return { Key: tag.key, Value: tag.value };
            })
        };
        const logger = getTimeLogger('untagResource: ec2.deleteTags');
        await this.ec2.deleteTags(request).promise();
        printTimerLog(logger);
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
        const logger = getTimeLogger(
            'completeLifecycleAction: autoscaling.completeLifecycleAction'
        );
        await this.autoscaling.completeLifecycleAction(actionType).promise();
        printTimerLog(logger);
    }

    async updateInstanceSrcDestChecking(instanceId: string, enable?: boolean): Promise<void> {
        const request: EC2.ModifyInstanceAttributeRequest = {
            SourceDestCheck: {
                Value: enable
            },
            InstanceId: instanceId
        };
        const logger = getTimeLogger('updateInstanceSrcDestChecking: ec2.modifyInstanceAttribute');
        await this.ec2.modifyInstanceAttribute(request).promise();
        printTimerLog(logger);
    }

    async updateNetworkInterfaceSrcDestChecking(nicId: string, enable?: boolean): Promise<void> {
        const request: EC2.ModifyNetworkInterfaceAttributeRequest = {
            SourceDestCheck: {
                Value: enable
            },
            NetworkInterfaceId: nicId
        };
        const logger = getTimeLogger(
            'updateNetworkInterfaceSrcDestChecking: ec2.modifyNetworkInterfaceAttribute'
        );
        await this.ec2.modifyNetworkInterfaceAttribute(request).promise();
        printTimerLog(logger);
    }

    async elbRegisterTargets(targetGroupArn: string, instanceIds: string[]): Promise<void> {
        const input: ELBv2.Types.RegisterTargetsInput = {
            TargetGroupArn: targetGroupArn,
            Targets: instanceIds.map(id => {
                return { Id: id };
            })
        };
        const logger = getTimeLogger('elbRegisterTargets: elbv2.registerTargets');
        await this.elbv2.registerTargets(input).promise();
        printTimerLog(logger);
    }

    async elbDeregisterTargets(targetGroupArn: string, instanceIds: string[]): Promise<void> {
        const input: ELBv2.Types.DeregisterTargetsInput = {
            TargetGroupArn: targetGroupArn,
            Targets: instanceIds.map(id => {
                return { Id: id };
            })
        };
        const logger = getTimeLogger('elbDeregisterTargets: elbv2.deregisterTargets');
        await this.elbv2.deregisterTargets(input).promise();
        printTimerLog(logger);
    }

    async terminateInstanceInAutoScalingGroup(
        instanceId: string,
        descCapacity = false
    ): Promise<void> {
        const params: AutoScaling.TerminateInstanceInAutoScalingGroupType = {
            InstanceId: instanceId,
            ShouldDecrementDesiredCapacity: descCapacity
        };
        const logger = getTimeLogger(
            'getTimeLogger: autoscaling.terminateInstanceInAutoScalingGroup'
        );
        await this.autoscaling.terminateInstanceInAutoScalingGroup(params).promise();
        printTimerLog(logger);
    }

    /**
     * create a customer gateway device
     *
     * @param {string} vpnType The type of VPN connection that is supported.
     * Possible values: "ipsec.1"
     * @param {number} [bgpAsn] BGP ASN (range: 1 - 65534) for devices that support BGP
     * @param {string} [publicIpv4] Public ip of the device
     * @param {string} [deviceName] A name of the device.
     * @param {string} [certArn] ARN for the customer gateway certificate.
     * @returns {Promise<EC2.CustomerGateway>} the created customer gateway device object
     * @see https://docs.aws.amazon.com/vpc/latest/adminguide/Introduction.html#CustomerGateway
     * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#createCustomerGateway-property
     */
    async createCustomerGateway(
        vpnType: string,
        bgpAsn = 65000,
        publicIpv4?: string,
        deviceName?: string,
        certArn?: string
    ): Promise<EC2.CustomerGateway> {
        // validate ip
        if (publicIpv4 && !isIPv4(publicIpv4)) {
            throw new Error(`Invalid IPv4 format: ${publicIpv4}.`);
        }
        // validate vpn type
        if (vpnType !== 'ipsec.1') {
            throw new Error(`Unsupported VPN type: ${vpnType}`);
        }
        // validate bgpasn
        if (isNaN(bgpAsn) || bgpAsn < 1 || bgpAsn > 65534) {
            throw new Error(`BGP ASN out of range: ${bgpAsn}, should be [1 - 65534]`);
        }
        const request: EC2.CreateCustomerGatewayRequest = {
            Type: vpnType,
            BgpAsn: bgpAsn,
            PublicIp: publicIpv4 || undefined,
            DeviceName: deviceName || undefined,
            CertificateArn: certArn || undefined
        };
        const logger = getTimeLogger('createCustomerGateway: ec2.createCustomerGateway');
        const result = await this.ec2.createCustomerGateway(request).promise();
        printTimerLog(logger);
        return result.CustomerGateway;
    }

    async deleteCustomerGateway(customerGatewayId: string): Promise<void> {
        const request: EC2.DeleteCustomerGatewayRequest = {
            CustomerGatewayId: customerGatewayId
        };
        const logger = getTimeLogger('deleteCustomerGateway: ec2.deleteCustomerGateway');
        await this.ec2.deleteCustomerGateway(request).promise();
        printTimerLog(logger);
    }

    async listCustomerGateways(filters: ResourceFilter[]): Promise<EC2.CustomerGateway[]> {
        const request: EC2.DescribeCustomerGatewaysRequest = {
            Filters: filters.map(filter => {
                return {
                    Name: filter.isTag ? `tag:${filter.key}` : filter.key,
                    Values: [filter.value]
                };
            })
        };
        const logger = getTimeLogger('listCustomerGateways: ec2.describeCustomerGateways');
        const result = await this.ec2.describeCustomerGateways(request).promise();
        printTimerLog(logger);
        return result.CustomerGateways || [];
    }

    async createVpnConnection(
        vpnType: string,
        bgpAsn: number,
        customerGatewayId: string,
        staticRouteOnly = false,
        vpnGatewayId?: string,
        transitGatewayId?: string
    ): Promise<EC2.VpnConnection> {
        // validate vpn type
        if (vpnType !== 'ipsec.1') {
            throw new Error(`Unsupported VPN type: ${vpnType}`);
        }
        // validate bgpasn
        if (isNaN(bgpAsn) || bgpAsn < 1 || bgpAsn > 65534) {
            throw new Error(`BGP ASN out of range: ${bgpAsn}, should be [1 - 65534]`);
        }
        const request: EC2.CreateVpnConnectionRequest = {
            CustomerGatewayId: customerGatewayId,
            Type: vpnType,
            Options: {
                StaticRoutesOnly: staticRouteOnly
            },
            VpnGatewayId: vpnGatewayId,
            TransitGatewayId: transitGatewayId
        };
        const logger = getTimeLogger('createVpnConnection: ec2.createVpnConnection');
        const result = await this.ec2.createVpnConnection(request).promise();
        printTimerLog(logger);
        return result.VpnConnection;
    }

    async deleteVpnConnection(vpnConnectionId: string): Promise<void> {
        const request: EC2.DeleteVpnConnectionRequest = {
            VpnConnectionId: vpnConnectionId
        };
        const logger = getTimeLogger('deleteVpnConnection: ec2.createVpnConnection');
        await this.ec2.deleteVpnConnection(request).promise();
        printTimerLog(logger);
    }

    async describeVpnConnection(vpnConnectionId: string): Promise<EC2.VpnConnection> {
        const request: EC2.DescribeVpnConnectionsRequest = {
            VpnConnectionIds: [vpnConnectionId]
        };
        const logger = getTimeLogger('describeVpnConnection: ec2.describeVpnConnections');
        const result = await this.ec2.describeVpnConnections(request).promise();
        printTimerLog(logger);
        const [connection] = result.VpnConnections;
        return connection;
    }

    async listVpnConnections(filters: ResourceFilter[]): Promise<EC2.VpnConnection[]> {
        const request: EC2.DescribeVpnConnectionsRequest = {
            Filters: filters.map(filter => {
                return {
                    Name: filter.isTag ? `tag:${filter.key}` : filter.key,
                    Values: [filter.value]
                };
            })
        };
        const logger = getTimeLogger('listVpnConnections: ec2.describeVpnConnections');
        const result = await this.ec2.describeVpnConnections(request).promise();
        printTimerLog(logger);
        return result.VpnConnections || [];
    }

    async describeTransitGatewayAttachment(
        transitGatewayId: string,
        resourceId: string
    ): Promise<EC2.TransitGatewayAttachment | null> {
        const request: EC2.DescribeTransitGatewayAttachmentsRequest = {
            Filters: [
                {
                    Name: 'resource-id',
                    Values: [resourceId]
                },
                {
                    Name: 'transit-gateway-id',
                    Values: [transitGatewayId]
                }
            ]
        };
        const logger = getTimeLogger(
            'describeTransitGatewayAttachment: ec2.describeTransitGatewayAttachments'
        );
        const result = await this.ec2.describeTransitGatewayAttachments(request).promise();
        printTimerLog(logger);
        // NOTE: by the time April 26, 2019. the AWS JavascriptSDK
        // ec2.describeTransitGatewayAttachments cannot properly filter resource
        // by resource-id. instead, it always return all resources so we must
        // filter the one we need.
        // see: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeTransitGatewayAttachments-property
        return (
            result.TransitGatewayAttachments.find(attachment => {
                return (
                    attachment.ResourceId === resourceId &&
                    attachment.TransitGatewayId === transitGatewayId
                );
            }) || null
        );
    }
    async updateTgwRouteTablePropagation(
        attachmentId: string,
        routeTableId: string
    ): Promise<string> {
        const request: EC2.EnableTransitGatewayRouteTablePropagationRequest = {
            TransitGatewayAttachmentId: attachmentId,
            TransitGatewayRouteTableId: routeTableId
        };
        // if attempt to enable one which was already enabled, will throw an error
        // TransitGatewayRouteTablePropagation.Duplicate
        // this error will be caught and ignored.
        try {
            const logger = getTimeLogger(
                'updateTgwRouteTablePropagation: ec2.enableTransitGatewayRouteTablePropagation'
            );
            const result = await this.ec2
                .enableTransitGatewayRouteTablePropagation(request)
                .promise();
            printTimerLog(logger);
            return result.Propagation.State;
        } catch (error) {
            if (
                (error as AWSError).message.includes(
                    'TransitGatewayRouteTablePropagation.Duplicate'
                )
            ) {
                return '';
            } else {
                throw error;
            }
        }
    }

    async updateTgwRouteTableAssociation(
        attachmentId: string,
        routeTableId: string
    ): Promise<string> {
        const request: EC2.AssociateTransitGatewayRouteTableRequest = {
            TransitGatewayAttachmentId: attachmentId,
            TransitGatewayRouteTableId: routeTableId
        };
        // if attempt to associate one which was already associated, will throw an error
        // Resource.AlreadyAssociated
        // this error will be caught and ignored.
        try {
            const logger = getTimeLogger(
                'updateTgwRouteTableAssociation: ec2.associateTransitGatewayRouteTable'
            );
            const result = await this.ec2.associateTransitGatewayRouteTable(request).promise();
            printTimerLog(logger);
            return result.Association.State;
        } catch (error) {
            if ((error as AWSError).message.includes('Resource.AlreadyAssociated')) {
                return '';
            } else {
                throw error;
            }
        }
    }

    async describeTgwAttachment(attachmentId: string): Promise<EC2.TransitGatewayAttachment> {
        const request: EC2.DescribeTransitGatewayAttachmentsRequest = {
            Filters: [
                {
                    Name: 'transit-gateway-attachment-id',
                    Values: [attachmentId]
                }
            ]
        };
        // NOTE: by the time April 26, 2019. the AWS JavascriptSDK
        // ec2.describeTransitGatewayAttachments cannot properly filter resource
        // by resource-id. instead, it always return all resources so we must
        // do the filtering in the function here.
        // eslint-disable-next-line max-len
        // ref link: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeTransitGatewayAttachments-property

        const logger = getTimeLogger(
            'describeTgwAttachment: ec2.describeTransitGatewayAttachments'
        );
        const result = await this.ec2.describeTransitGatewayAttachments(request).promise();
        printTimerLog(logger);
        return result.TransitGatewayAttachments.find(attachment => {
            return attachment.TransitGatewayAttachmentId === attachmentId;
        });
    }

    invokeLambda(
        functionName: string,
        type: Lambda.Types.InvocationType,
        payload: string
    ): Promise<Lambda.InvocationResponse> {
        const logger = getTimeLogger('invokeLambda: lambda.invoke');
        const result = this.lambda
            .invoke({
                FunctionName: functionName,
                InvocationType: type,
                Payload: JSON.stringify(payload)
            })
            .promise();
        printTimerLog(logger);
        return result;
    }

    async updateScalingGroupSize(
        groupName: string,
        desiredCapacity: number,
        minSize?: number,
        maxSize?: number
    ): Promise<void> {
        const request: UpdateAutoScalingGroupType = {
            AutoScalingGroupName: groupName,
            DesiredCapacity: desiredCapacity
        };
        if (minSize !== undefined) {
            request.MinSize = minSize;
        }
        if (maxSize !== undefined) {
            request.MaxSize = maxSize;
        }
        const logger = getTimeLogger('updateScalingGroupSize: autoscaling.updateAutoScalingGroup');
        await this.autoscaling.updateAutoScalingGroup(request).promise();
        printTimerLog(logger);
    }

    async createVpcRouteTableRoute(
        routeTableId: string,
        destination: string,
        nicId
    ): Promise<EC2.CreateRouteResult> {
        const request: EC2.CreateRouteRequest = {
            DestinationCidrBlock: destination,
            RouteTableId: routeTableId,
            NetworkInterfaceId: nicId
        };
        const logger = getTimeLogger('createVpcRouteTableRoute: ec2.createRoute');
        const result = await this.ec2.createRoute(request).promise();
        printTimerLog(logger);
        return result;
    }

    async replaceVpcRouteTableRoute(
        routeTableId: string,
        destination: string,
        nicId
    ): Promise<boolean> {
        const request: EC2.ReplaceRouteRequest = {
            DestinationCidrBlock: destination,
            RouteTableId: routeTableId,
            NetworkInterfaceId: nicId
        };
        const logger = getTimeLogger('replaceVpcRouteTableRoute: ec2.replaceRoute');
        const result = await this.ec2.replaceRoute(request).promise();
        printTimerLog(logger);
        return JSON.stringify(result) === '{}';
    }

    async kmsDecrypt(encryptedValue: string): Promise<string> {
        const logger = getTimeLogger('kmsDecrypt: kms.decrypt');
        const data = await this.kms
            .decrypt({ CiphertextBlob: Buffer.from(encryptedValue, 'base64') })
            .promise();
        printTimerLog(logger);
        return data.Plaintext.toString('ascii');
    }

    /**
     * need lambda:GetFunction permission on the function arn.
     * @param {string} functionName the name of function to get variable
     * @returns {Lambda.Types.EnvironmentVariables} object of {[key:string]:string}
     */
    async getFunctionEnvironmentVariables(
        functionName: string
    ): Promise<Lambda.Types.EnvironmentVariables> {
        const request: Lambda.Types.GetFunctionEventInvokeConfigRequest = {
            FunctionName: functionName
        };
        const logger = getTimeLogger(
            'getFunctionEnvironmentVariables: lambda.getFunctionConfiguration'
        );
        const data = await this.lambda.getFunctionConfiguration(request).promise();
        printTimerLog(logger);
        return data.Environment.Variables;
    }

    async publishSNSMessage(topicArn: string, message: string, subject?: string): Promise<void> {
        const input: PublishInput = {
            TopicArn: topicArn,
            Message: message,
            Subject: subject || undefined
        };
        await this.sns.publish(input).promise();
    }
}
