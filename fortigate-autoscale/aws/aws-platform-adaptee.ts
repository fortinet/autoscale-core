import AutoScaling, {
    LifecycleActionResult,
    UpdateAutoScalingGroupType
} from 'aws-sdk/clients/autoscaling';
import { DocumentClient, ExpressionAttributeValueMap } from 'aws-sdk/clients/dynamodb';
import EC2 from 'aws-sdk/clients/ec2';
import ELBv2 from 'aws-sdk/clients/elbv2';
import Lambda from 'aws-sdk/clients/lambda';
import S3 from 'aws-sdk/clients/s3';
import fs from 'fs';
import { isIPv4 } from 'net';
import path from 'path';

import { PlatformAdaptee } from '../../autoscale-core';
import { SettingItem, Settings } from '../../autoscale-setting';
import { Blob } from '../../blob';
import { CreateOrUpdate, KeyValue, SettingsDbItem, Table } from '../../db-definitions';
import { ResourceTag } from '../../platform-adapter';
import * as AwsDBDef from './aws-db-definitions';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsDdbOperations } from './aws-platform-adapter';

export class AwsPlatformAdaptee implements PlatformAdaptee {
    protected docClient: DocumentClient;
    protected s3: S3;
    protected ec2: EC2;
    protected autoscaling: AutoScaling;
    protected elbv2: ELBv2;
    protected lambda: Lambda;
    constructor() {
        this.docClient = new DocumentClient({ apiVersion: '2012-08-10' });
        this.s3 = new S3({ apiVersion: '2006-03-01' });
        this.ec2 = new EC2({ apiVersion: '2016-11-15' });
        this.autoscaling = new AutoScaling({ apiVersion: '2011-01-01' });
        this.elbv2 = new ELBv2({ apiVersion: '2015-12-01' });
        this.lambda = new Lambda({ apiVersion: '2015-03-31' });
    }
    async loadSettings(): Promise<Settings> {
        const table = new AwsDBDef.AwsSettings(process.env.RESOURCE_TAG_PREFIX || '');
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
                if (attr.isKey) {
                    return;
                }
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
        return (result.Item && table.convertRecord(result.Item)) || null;
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

    async listInstancesByTags(tags: ResourceTag[]): Promise<EC2.Instance[]> {
        const request: EC2.DescribeInstancesRequest = {
            Filters: tags.map(tag => {
                return {
                    Name: tag.key,
                    Values: [tag.value]
                };
            })
        };
        const result = await this.ec2.describeInstances(request).promise();
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
        const result = await this.autoscaling.describeAutoScalingInstances(request).promise();
        const map: Map<string, string> = new Map();
        result.AutoScalingInstances.forEach(detail => {
            map.set(detail.InstanceId, detail.AutoScalingGroupName);
        });
        return map;
    }

    async describeInstance(instanceId: string): Promise<EC2.Instance> {
        const tag: ResourceTag = {
            key: 'instance-id',
            value: instanceId
        };
        const instances = await this.listInstancesByTags([tag]);
        return instances.find(instance => instance.InstanceId === instanceId);
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

    async listNetworkInterfacesByInstanceId(instanceId: string): Promise<EC2.NetworkInterface[]> {
        const tag: ResourceTag = {
            key: 'attachment.instance-id',
            value: instanceId
        };
        return await this.listNetworkInterfacesByTags([tag]);
    }

    async listNetworkInterfacesById(nicIds: string[]): Promise<EC2.NetworkInterface[]> {
        const request: EC2.DescribeNetworkInterfacesRequest = {
            NetworkInterfaceIds: nicIds
        };
        const result = await this.ec2.describeNetworkInterfaces(request).promise();
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
        return await this.ec2.attachNetworkInterface(request).promise();
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
        await this.ec2.detachNetworkInterface(request).promise();
    }

    async tagResource(resIds: string[], tags: ResourceTag[]): Promise<void> {
        const request: EC2.CreateTagsRequest = {
            Resources: resIds,
            Tags: tags.map(tag => {
                return { Key: tag.key, Value: tag.value };
            })
        };
        await this.ec2.createTags(request).promise();
    }
    async untagResource(resIds: string[], tags: ResourceTag[]): Promise<void> {
        const request: EC2.DeleteTagsRequest = {
            Resources: resIds,
            Tags: tags.map(tag => {
                return { Key: tag.key, Value: tag.value };
            })
        };
        await this.ec2.deleteTags(request).promise();
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

    async updateNetworkInterfaceSrcDestChecking(nicId: string, enable?: boolean): Promise<void> {
        const request: EC2.ModifyNetworkInterfaceAttributeRequest = {
            SourceDestCheck: {
                Value: enable
            },
            NetworkInterfaceId: nicId
        };
        await this.ec2.modifyNetworkInterfaceAttribute(request).promise();
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

    async terminateInstanceInAutoScalingGroup(
        instanceId: string,
        descCapacity = false
    ): Promise<void> {
        const params: AutoScaling.TerminateInstanceInAutoScalingGroupType = {
            InstanceId: instanceId,
            ShouldDecrementDesiredCapacity: descCapacity
        };
        await this.autoscaling.terminateInstanceInAutoScalingGroup(params).promise();
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
        const result = await this.ec2.createCustomerGateway(request).promise();
        return result.CustomerGateway;
    }

    async deleteCustomerGateway(customerGatewayId: string): Promise<void> {
        const request: EC2.DeleteCustomerGatewayRequest = {
            CustomerGatewayId: customerGatewayId
        };
        await this.ec2.deleteCustomerGateway(request).promise();
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
        const result = await this.ec2.createVpnConnection(request).promise();
        return result.VpnConnection;
    }

    async deleteVpnConnection(vpnConnectionId: string): Promise<void> {
        const request: EC2.DeleteVpnConnectionRequest = {
            VpnConnectionId: vpnConnectionId
        };
        await this.ec2.deleteVpnConnection(request).promise();
    }

    async describeVpnConnection(vpnConnectionId: string): Promise<EC2.VpnConnection> {
        const request: EC2.DescribeVpnConnectionsRequest = {
            VpnConnectionIds: [vpnConnectionId]
        };
        const result = await this.ec2.describeVpnConnections(request).promise();
        const [connection] = result.VpnConnections;
        return connection;
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
        const result = await this.ec2.describeTransitGatewayAttachments(request).promise();
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
        // TODO: KNOWN ISSUE: if attempt to enable one which was already enabled, will throw an error
        // TransitGatewayRouteTablePropagation.Duplicate
        // this error should be caught and ignored.
        const result = await this.ec2.enableTransitGatewayRouteTablePropagation(request).promise();
        return result.Propagation.State;
    }

    async updateTgwRouteTableAssociation(
        attachmentId: string,
        routeTableId: string
    ): Promise<string> {
        const request: EC2.AssociateTransitGatewayRouteTableRequest = {
            TransitGatewayAttachmentId: attachmentId,
            TransitGatewayRouteTableId: routeTableId
        };
        // TODO: KNOWN ISSUE: if attempt to associate one which was already associated, will throw an error
        // Resource.AlreadyAssociated
        // this error should be caught and ignored.
        const result = await this.ec2.associateTransitGatewayRouteTable(request).promise();
        return result.Association.State;
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

        const result = await this.ec2.describeTransitGatewayAttachments(request).promise();
        return result.TransitGatewayAttachments.find(attachment => {
            return attachment.TransitGatewayAttachmentId === attachmentId;
        });
    }

    invokeLambda(functionName: string, payload: string): Promise<Lambda._Blob> {
        return new Promise((resolve, reject) => {
            this.lambda.invoke(
                {
                    FunctionName: functionName,
                    Payload: JSON.stringify(payload)
                },
                (err, data) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(data.Payload);
                }
            );
        });
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
        await this.autoscaling.updateAutoScalingGroup(request).promise();
    }
}
