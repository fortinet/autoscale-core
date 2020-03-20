import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import * as EC2 from 'aws-sdk/clients/ec2';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';

import * as AwsDBDef from './aws-db-definitions';
import { VpnAttachmentContext } from '../../context-strategy/vpn-attachment-context';
import {
    NicAttachmentStrategy,
    NicAttachmentRecord,
    NicAttachmentStatus
} from '../../context-strategy/nic-attachment-context';
import { VirtualMachine } from '../../virtual-machine';
import { SubnetPair, AutoscaleSetting, SettingItem, Settings } from '../../autoscale-setting';
import { PlatformAdaptee, mapHttpMethod } from '../../autoscale-core';
import {
    CloudFunctionProxy,
    LogLevel,
    CloudFunctionResponseBody
} from '../../cloud-function-proxy';
import { ReqMethod, ReqType, PlatformAdapter, VmDescriptor } from '../../platform-adapter';
import { HealthCheckRecord, MasterRecord, MasterRecordVoteState } from '../../master-election';
import { Table } from '../../db-definitions';

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

    protected async getPairedSubnetId(vm: VirtualMachine): Promise<string> {
        const settings = await this.platform.getSettings();
        const subnetPairs: SubnetPair[] = settings.get(AutoscaleSetting.SubnetPairs)
            .jsonValue as SubnetPair[];
        const subnets: SubnetPair[] = (Array.isArray(subnetPairs) &&
            subnetPairs.filter(element => element.subnetId === vm.subnetId)) || [null];
        return Promise.resolve(subnets[0].pairId);
    }

    async apply(): Promise<void> {
        this.proxy.logAsInfo('applying AwsNicAttachmentStrategy.');
        // this implementation is to attach a single nic
        // list all attachment records
        const records = await this.listRecord(this.vm);
        const record = (records.length > 0 && records[0]) || null;
        // one additional nic is enough.
        // so if there's already an attachment record, do not need to attach another one.
        if (record) {
            this.proxy.logAsInfo(
                `instance (id: ${record.instanceId} has been in ` +
                    `association with nic (id: ${record.nicId}) ` +
                    `in state (${record.attachmentState})`
            );
            return;
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
            return;
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
    settings: Settings;
    constructor(
        p: AwsPlatform,
        proxy: CloudFunctionProxy<APIGatewayProxyEvent, Context, APIGatewayProxyResult>
    ) {
        this.adaptee = p;
        this.proxy = proxy;
    }
    async init(): Promise<void> {
        this.settings = await this.adaptee.loadSettings();
    }
    getRequestType(): ReqType {
        return this.adaptee.getReqType(this.proxy);
    }
    getReqHeartbeatInterval(): number {
        throw new Error('Method not implemented.');
    }
    async getSettings(): Promise<Settings> {
        return (
            (this.settings && Promise.resolve(this.settings)) || (await this.adaptee.loadSettings())
        );
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
                settings.get(AutoscaleSetting.ResourceTagPrefix).value
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
            const settings = await this.getSettings();
            const table = new AwsDBDef.AwsMasterElection(
                settings.get(AutoscaleSetting.ResourceTagPrefix).value
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
    loadConfigSet(name: string): Promise<string> {
        throw new Error('Method not implemented.');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTgwVpnAttachmentRecord(id: string): Promise<{ [key: string]: any }> {
        throw new Error('Method not implemented.');
    }
}
