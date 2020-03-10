import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import * as EC2 from 'aws-sdk/clients/ec2';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import {
    LogLevel,
    ReqType,
    CloudFunctionProxy,
    PlatformAdaptee,
    PlatformAdapter,
    CloudFunctionResponseBody,
    VirtualMachine,
    HealthCheckRecord,
    MasterRecord,
    ReqMethod,
    mapHttpMethod,
    VpnAttachmentContext,
    NicAttachmentStrategy,
    NicAttachmentRecord,
    GeneralStrategyResult,
    NicAttachmentStatus,
    MasterRecordVoteState
} from '../autoscale-core';
import { Settings, AutoscaleSetting, SubnetPair } from '../autoscale-setting';
import * as DB from './aws-db-definitions';
import { Table } from '../db-definitions';

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

    protected listRecord(vm: VirtualMachine): Promise<NicAttachmentRecord[]> {
        throw new Error('Method not implemented.');
    }

    protected updateRecord(
        vm: VirtualMachine,
        nic: EC2.NetworkInterface,
        status: NicAttachmentStatus
    ): Promise<void> {
        throw new Error('Method not implemented.');
    }

    protected deleteRecord(vm: VirtualMachine, nic: EC2.NetworkInterface): Promise<void> {
        throw new Error('Method not implemented.');
    }

    protected getPairedSubnetId(vm: VirtualMachine): Promise<string> {
        const subnetPairs: SubnetPair[] = this.platform
            .getSettings()
            .get(AutoscaleSetting.SubnetPairs)
            .toJSON() as SubnetPair[];
        const subnets: SubnetPair[] = (Array.isArray(subnetPairs) &&
            subnetPairs.filter(element => element.subnetId === vm.subnetId)) || [null];
        return Promise.resolve(subnets[0].pairId);
    }

    async apply(): Promise<string> {
        this.proxy.log('applying AwsNicAttachmentStrategy.', LogLevel.Info);
        // this implementation is to attach a single nic
        // list all attachment records
        const records = await this.listRecord(this.vm);
        const record = (records.length > 0 && records[0]) || null;
        // one additional nic is enough.
        // so if there's already an attachment record, do not need to attach another one.
        if (record) {
            this.proxy.log(
                `instance (id: ${record.instanceId} has been in ` +
                    `association with nic (id: ${record.nicId}) ` +
                    `in state (${record.attachmentState})`,
                LogLevel.Info
            );
            return GeneralStrategyResult.Success;
        } else {
            // need to create a nic and attach it to the vm

            // create a nic attachment
            // collect the security group from the vm first
            const securtyGroupIds: string[] = this.vm.securityGroups.map(
                sg => (sg as EC2.SecurityGroup).GroupId
            );
            // determine the private subnet paired with the vm subnet
            const pairedSubnetId: string = await this.getPairedSubnetId(this.vm);

            const description =
                `Addtional nic for instance(id:${this.vm.instanceId}) ` +
                `in auto scaling group: ${this.vm.scalingGroupName}`;

            const nic = await this.platform.adaptee.createNetworkInterface(
                description,
                pairedSubnetId,
                securtyGroupIds
            );

            if (!nic) {
                throw new Error('create network interface unsuccessfully.');
            }

            // update nic attachment record
            await this.updateRecord(this.vm, nic, NicAttachmentStatus.Attaching);
            const nicDeviceIndex: number = this.vm.networkInterfaces.length;
            const attached: boolean = await this.platform.adaptee.attachNetworkInterface(
                this.vm.instanceId,
                nic.NetworkInterfaceId,
                nicDeviceIndex
            );

            // if not attached, delete the nic
            if (!attached) {
                await Promise.all([
                    this.platform.adaptee.deleteNetworkInterface(nic.NetworkInterfaceId),
                    this.deleteRecord(this.vm, nic)
                ]);
                throw new Error('attach network interface unsuccessfully.');
            }

            // update nic attachment record again
            await this.updateRecord(this.vm, nic, NicAttachmentStatus.Attached);
            return GeneralStrategyResult.Success;
        }
    }
}

export interface DynamoDbOperationConditions {
    attributeName: string;
    attributevalue: string;
    checkExistence: boolean;
    compareValue: boolean;
}

export class AwsPlatform
    implements PlatformAdaptee<APIGatewayProxyEvent, Context, APIGatewayProxyResult> {
    docClient: DocumentClient;
    constructor() {
        this.docClient = new DocumentClient({ apiVersion: '2012-08-10' });
    }
    getReqMethod(
        proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>
    ): ReqMethod {
        return mapHttpMethod(proxy.request.httpMethod);
    }
    getReqType(
        proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>
    ): ReqType {
        throw new Error('Method not implemented.');
    }

    /**
     * Save a document db item into DynamoDB.
     * @param  {Table} table he instance of Table to save the item.
     * @param  {{}} item the item to save into the db table.
     * @param  {string} conditionExp the condition expression for saving the item
     * @returns {Promise} return void
     * @throws whatever docClient.put throws.
     * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#put-property
     */
    async saveItemToDb(table: Table, item: {}, conditionExp: string): Promise<void> {
        // CAUTION: validate the db input
        table.validateInput(item);
        const params = {
            TableName: table.name,
            Item: item,
            ConditionExpression: conditionExp
        };
        await this.docClient.put(params).promise();
    }
    createNetworkInterface(
        description: string,
        subnetId: string,
        securtyGroupIds: string[]
    ): Promise<EC2.NetworkInterface> {
        throw new Error('Method not implemented.');
    }
    attachNetworkInterface(instanceId: string, nicId: string, index: number): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    deleteNetworkInterface(nicId: string): Promise<void> {
        throw new Error('Method not implemented.');
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
    constructor(
        p: AwsPlatform,
        proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>
    ) {
        this.adaptee = p;
        this.proxy = proxy;
    }
    getRequestType(): ReqType {
        return this.adaptee.getReqType(this.proxy);
    }
    getReqHeartbeatInterval(): number {
        throw new Error('Method not implemented.');
    }
    getSettings(): Settings {
        throw new Error('Method not implemented.');
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
    equalToVm(vmA: VirtualMachine, vmB: VirtualMachine): boolean {
        throw new Error('Method not implemented.');
    }
    describeVm(desc: import('../autoscale-core').VmDescriptor): Promise<VirtualMachine> {
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
            const table = new DB.AwsMasterElection(
                this.getSettings().get(AutoscaleSetting.ResourceTagPrefix).value
            );
            const item: MasterRecord = {
                id: rec.id,
                scalingGroupName: rec.scalingGroupName,
                ip: rec.ip,
                instanceId: rec.instanceId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: rec.voteEndTime,
                voteState: rec.voteState
            };
            // save record only if record for a certain scaling group name not exists, or
            // if it exists but timeout
            let conditionExp = 'attribute_not_exists(scalingGroupName)';
            if (oldRec) {
                conditionExp =
                    `${conditionExp} OR ` +
                    `attribute_exists(scalingGroupName) AND id = '${oldRec.id}'`;
            }
            await this.adaptee.saveItemToDb(table, item, conditionExp);
            this.proxy.log('called createMasterRecord.', LogLevel.Log);
        } catch (error) {
            this.proxy.logForError('called createMasterRecord.', error);
            throw error;
        }
    }
    async updateMasterRecord(rec: MasterRecord): Promise<void> {
        this.proxy.log('calling updateMasterRecord.', LogLevel.Log);
        try {
            const table = new DB.AwsMasterElection(
                this.getSettings().get(AutoscaleSetting.ResourceTagPrefix).value
            );
            const item: MasterRecord = {
                id: rec.id,
                scalingGroupName: rec.scalingGroupName,
                ip: rec.ip,
                instanceId: rec.instanceId,
                virtualNetworkId: rec.virtualNetworkId,
                subnetId: rec.subnetId,
                voteEndTime: rec.voteEndTime,
                voteState: rec.voteState
            };
            // save record only if the keys in rec match the keys in db
            const condition =
                'attribute_not_exists(scalingGroupName) OR ' +
                'attribute_exists(scalingGroupName) AND ' +
                `voteState = '${MasterRecordVoteState.Pending}' AND ` +
                `voteEndTime < ${item.voteEndTime}`;
            await this.adaptee.saveItemToDb(table, item, condition);
            this.proxy.log('called updateMasterRecord.', LogLevel.Log);
        } catch (error) {
            this.proxy.logForError('called updateMasterRecord.', error);
            throw error;
        }
    }
}