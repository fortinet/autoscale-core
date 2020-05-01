/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AutoScaling, EC2, ELBv2, Lambda, S3 } from 'aws-sdk';
import * as commentJson from 'comment-json';
import fs from 'fs';
import path from 'path';
import Sinon, { SinonStub } from 'sinon';

import { SettingItem, Settings } from '../autoscale-setting';
import { JSONable } from '../jsonable';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';

export type ApiGatewayRequestHandler = (
    event: APIGatewayProxyEvent,
    context: Context
) => Promise<APIGatewayProxyResult>;

export function readFileAsJson(filePath: string): Promise<JSONable> {
    const buffer = fs.readFileSync(filePath);
    return Promise.resolve(commentJson.parse(buffer.toString('utf-8')));
}

export interface ApiResult {
    promise(): Promise<any>;
}

export function CreateApiResult(f: () => any): ApiResult {
    return {
        promise: () => {
            return Promise.resolve(f());
        }
    };
}

export class AwsTestMan {
    constructor(readonly rootDir: string) {}
    readFileAsJson(filePath: string): Promise<JSONable> {
        return readFileAsJson(filePath);
    }

    fakeApiGatewayContext(): Promise<Context> {
        return Promise.resolve({
            callbackWaitsForEmptyEventLoop: false,
            functionName: 'fake-caller',
            functionVersion: '1.0.0',
            invokedFunctionArn: 'arn::',
            memoryLimitInMB: '128',
            awsRequestId: 'fake-aws-request-id',
            logGroupName: 'fake-log-group-name',
            logStreamName: 'fake-log-stream-name'
        } as Context);
    }
    async makeApiGatewayRequest(
        requestHandler: ApiGatewayRequestHandler,
        requestEvent: APIGatewayProxyEvent,
        requestContext?: Context
    ): Promise<void> {
        await requestHandler.call(
            requestHandler,
            requestEvent,
            requestContext || (await this.fakeApiGatewayContext())
        );
    }

    async fakeLaunchingVmRequest(): Promise<JSONable> {
        return await this.readFileAsJson(path.resolve(this.rootDir, 'launching-vm'));
    }

    async fakeApiGatewayRequest(filePath: string): Promise<APIGatewayProxyEvent> {
        const e = await this.readFileAsJson(path.resolve(this.rootDir, filePath));
        const event = {} as APIGatewayProxyEvent;
        Object.assign(event, e);
        return event;
    }

    async fakeCustomRequest(filePath: string): Promise<JSONable> {
        return await this.readFileAsJson(path.resolve(this.rootDir, filePath));
    }

    fakeDescribeInstance(instances: EC2.Instance[]): Promise<EC2.DescribeInstancesResult> {
        const result: EC2.DescribeInstancesResult = {
            Reservations: [
                {
                    Groups: [],
                    Instances: instances,
                    OwnerId: 'fake-owner-id',
                    RequesterId: 'fake-request-id',
                    ReservationId: 'fake-reservation-id'
                }
            ]
        };
        return Promise.resolve(result);
    }

    async loadSettings(filePath: string): Promise<Settings> {
        const json = await readFileAsJson(path.resolve(filePath));
        const settings: Map<string, SettingItem> = new Map(
            Object.values(json.Items).map(entry => {
                const item = entry as { [key: string]: { [key: string]: string } };
                const settingItem: SettingItem = new SettingItem(
                    item.settingKey.S,
                    item.settingValue.S,
                    item.description.S,
                    item.editable.S === 'true',
                    item.jsonEncoded.S === 'true'
                );
                return [settingItem.key, settingItem];
            })
        );
        return settings;
    }
}

export abstract class TestFixture {
    redirName: string;
    readonly stubs: Map<string, SinonStub> = new Map();
    abstract init(): void;
    restoreAll(): void {
        this.stubs.forEach(stub => {
            stub.restore();
        });
    }
    redir(filePath: string): void {
        this.redirName = filePath;
    }

    clearRedir(): void {
        this.redirName = '';
    }
}

export class MockS3 extends TestFixture {
    rootDir: string;
    s3: S3;
    constructor(s3: S3, rootDir: string) {
        super();
        this.rootDir = rootDir;
        this.s3 = s3;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.stubs.set('listObjectsV2', Sinon.stub(this.s3, 'listObjectsV2'));
        this.stubs.get('listObjectsV2').callsFake(args => {
            return this.listObjectsV2(args);
        });
        // NOTE: stub
        this.stubs.set('getObject', Sinon.stub(this.s3, 'getObject'));
        this.stubs.get('getObject').callsFake(args => {
            return this.getObject(args);
        });
    }

    listObjectsV2(request: S3.ListObjectsV2Request): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                's3',
                [request.Bucket, ...request.Prefix.split('/'), this.redirName]
                    .filter(v => v)
                    .join('/')
            );
            const files = await fs.readdirSync(filePath);
            this.clearRedir();
            return {
                Contents: files.map(fname => {
                    return {
                        Key: path.join(request.Prefix, fname)
                    };
                })
            };
        });
    }

    getObject(request: S3.GetObjectAclRequest): ApiResult {
        return CreateApiResult(() => {
            const filePath = path.resolve(
                this.rootDir,
                's3',
                [request.Bucket, ...request.Key.split('/'), this.redirName].filter(v => v).join('/')
            );
            const data = fs.readFileSync(filePath);
            this.clearRedir();
            return {
                Body: data.toString()
            };
        });
    }
}

export class MockEC2 extends TestFixture {
    rootDir: string;
    ec2: EC2;
    constructor(ec2: EC2, rootDir: string) {
        super();
        this.rootDir = rootDir;
        this.ec2 = ec2;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.stubs.set('describeInstances', Sinon.stub(this.ec2, 'describeInstances'));
        this.stubs.get('describeInstances').callsFake(args => {
            return this.describeInstances(args);
        });
        // NOTE: stub
        this.stubs.set('createNetworkInterface', Sinon.stub(this.ec2, 'createNetworkInterface'));
        this.stubs.get('createNetworkInterface').callsFake(args => {
            return this.createNetworkInterface(args);
        });
        // NOTE: stub
        this.stubs.set('deleteNetworkInterface', Sinon.stub(this.ec2, 'deleteNetworkInterface'));
        this.stubs.get('deleteNetworkInterface').callsFake(args => {
            return this.deleteNetworkInterface(args);
        });
        // NOTE: stub
        this.stubs.set(
            'describeNetworkInterfaces',
            Sinon.stub(this.ec2, 'describeNetworkInterfaces')
        );
        this.stubs.get('describeNetworkInterfaces').callsFake(args => {
            return this.describeNetworkInterfaces(args);
        });
        // NOTE: stub
        this.stubs.set('attachNetworkInterface', Sinon.stub(this.ec2, 'attachNetworkInterface'));
        this.stubs.get('attachNetworkInterface').callsFake(args => {
            return this.attachNetworkInterface(args);
        });
        // NOTE: stub
        this.stubs.set('detachNetworkInterface', Sinon.stub(this.ec2, 'detachNetworkInterface'));
        this.stubs.get('detachNetworkInterface').callsFake(nicId => {
            return this.detachNetworkInterface(nicId);
        });
        // NOTE: stub
        this.stubs.set('createTags', Sinon.stub(this.ec2, 'createTags'));
        this.stubs.get('createTags').callsFake(args => {
            return this.createTags(args);
        });
        // NOTE: stub
        this.stubs.set('deleteTags', Sinon.stub(this.ec2, 'deleteTags'));
        this.stubs.get('deleteTags').callsFake(args => {
            return this.deleteTags(args);
        });
        // NOTE: stub
        this.stubs.set('modifyInstanceAttribute', Sinon.stub(this.ec2, 'modifyInstanceAttribute'));
        this.stubs.get('modifyInstanceAttribute').callsFake(args => {
            return this.modifyInstanceAttribute(args);
        });
        // NOTE: stub
        this.stubs.set('createCustomerGateway', Sinon.stub(this.ec2, 'createCustomerGateway'));
        this.stubs.get('createCustomerGateway').callsFake(args => {
            return this.createCustomerGateway(args);
        });
        // NOTE: stub
        this.stubs.set('deleteCustomerGateway', Sinon.stub(this.ec2, 'deleteCustomerGateway'));
        this.stubs.get('deleteCustomerGateway').callsFake(args => {
            return this.deleteCustomerGateway(args);
        });
        // NOTE: stub
        this.stubs.set('createVpnConnection', Sinon.stub(this.ec2, 'createVpnConnection'));
        this.stubs.get('createVpnConnection').callsFake(args => {
            return this.createVpnConnection(args);
        });
        // NOTE: stub
        this.stubs.set('deleteVpnConnection', Sinon.stub(this.ec2, 'deleteVpnConnection'));
        this.stubs.get('deleteVpnConnection').callsFake(args => {
            return this.deleteVpnConnection(args);
        });
        // NOTE: stub
        this.stubs.set(
            'describeTransitGatewayAttachments',
            Sinon.stub(this.ec2, 'describeTransitGatewayAttachments')
        );
        this.stubs.get('describeTransitGatewayAttachments').callsFake(args => {
            return this.describeTransitGatewayAttachments(args);
        });
        // NOTE: stub
        this.stubs.set(
            'enableTransitGatewayRouteTablePropagation',
            Sinon.stub(this.ec2, 'enableTransitGatewayRouteTablePropagation')
        );
        this.stubs.get('enableTransitGatewayRouteTablePropagation').callsFake(args => {
            return this.enableTransitGatewayRouteTablePropagation(args);
        });
        // NOTE: stub
        this.stubs.set(
            'associateTransitGatewayRouteTable',
            Sinon.stub(this.ec2, 'associateTransitGatewayRouteTable')
        );
        this.stubs.get('associateTransitGatewayRouteTable').callsFake(args => {
            return this.associateTransitGatewayRouteTable(args);
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    describeInstances(request: any): ApiResult {
        return CreateApiResult(async () => {
            const [sampleName] =
                request.Filters &&
                request.Filters.filter(f => {
                    return f.Name === 'instance-id';
                }).map(f => {
                    return f.Values[0];
                });
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                ['describe-instances', sampleName || this.redirName].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }

    createNetworkInterface(request: any): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                ['create-network-interface', this.redirName].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            data.SubnetId = request.SubnetId;
            data.Description = request.Description;
            data.Groups = request.Groups;
            data.PrivateIpAddress = request.PrivateIpAddress;
            this.clearRedir();
            return data;
        });
    }

    deleteNetworkInterface(request: any): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }

    describeNetworkInterfaces(request: any): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                ['describe-network-interfaces', this.redirName].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }

    attachNetworkInterface(request: EC2.AttachNetworkInterfaceRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                [
                    'attach-network-interface',
                    request.InstanceId,
                    request.NetworkInterfaceId,
                    request.DeviceIndex
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }

    detachNetworkInterface(request: EC2.DetachNetworkInterfaceRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                ['detach-network-interface', request.AttachmentId].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }
    createTags(request: EC2.CreateTagsRequest): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
    deleteTags(request: EC2.DeleteTagsRequest): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
    modifyInstanceAttribute(request: EC2.ModifyInstanceAttributeRequest): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
    createCustomerGateway(request: EC2.CreateCustomerGatewayRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                ['create-customer-gateway', this.redirName].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }
    deleteCustomerGateway(request: EC2.DeleteCustomerGatewayRequest): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
    createVpnConnection(request: EC2.CreateVpnConnectionRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                [
                    'create-vpn-connection',
                    request.CustomerGatewayId,
                    request.TransitGatewayId,
                    this.redirName
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }
    deleteVpnConnection(request: EC2.DeleteVpnConnectionRequest): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
    describeTransitGatewayAttachments(
        request: EC2.DescribeTransitGatewayAttachmentsRequest
    ): ApiResult {
        return CreateApiResult(async () => {
            let transitGatewayId: string;
            let resourceId: string;
            request.Filters.forEach(f => {
                if (f.Name === 'resource-id') {
                    resourceId = f.Values[0];
                } else if (f.Name === 'transit-gateway-id') {
                    transitGatewayId = f.Values[0];
                }
            });
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                [
                    'describe-transit-gateway-attachments',
                    transitGatewayId,
                    resourceId,
                    this.redirName
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }
    enableTransitGatewayRouteTablePropagation(
        request: EC2.EnableTransitGatewayRouteTablePropagationRequest
    ): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                [
                    'enable-transit-gateway-route-table-propagation',
                    request.TransitGatewayAttachmentId,
                    request.TransitGatewayRouteTableId,
                    this.redirName
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }
    associateTransitGatewayRouteTable(
        request: EC2.AssociateTransitGatewayRouteTableRequest
    ): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'ec2',
                [
                    'associate-transit-gateway-route-table',
                    request.TransitGatewayAttachmentId,
                    request.TransitGatewayRouteTableId,
                    this.redirName
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }
}

export class MockAutoScaling extends TestFixture {
    rootDir: string;
    autoscaling: AutoScaling;
    constructor(autoscaling: AutoScaling, rootDir: string) {
        super();
        this.rootDir = rootDir;
        this.autoscaling = autoscaling;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.stubs.set(
            'describeAutoScalingGroups',
            Sinon.stub(this.autoscaling, 'describeAutoScalingGroups')
        );
        this.stubs.get('describeAutoScalingGroups').callsFake(args => {
            return this.describeAutoScalingGroups(args);
        });
        // NOTE: stub
        this.stubs.set(
            'completeLifecycleAction',
            Sinon.stub(this.autoscaling, 'completeLifecycleAction')
        );
        this.stubs.get('completeLifecycleAction').callsFake(args => {
            return this.completeLifecycleAction(args);
        });
        // NOTE: stub
        this.stubs.set(
            'terminateInstanceInAutoScalingGroup',
            Sinon.stub(this.autoscaling, 'terminateInstanceInAutoScalingGroup')
        );
        this.stubs.get('terminateInstanceInAutoScalingGroup').callsFake(args => {
            return this.terminateInstanceInAutoScalingGroup(args);
        });
    }

    describeAutoScalingGroups(request: AutoScaling.AutoScalingGroupNamesType): ApiResult {
        return CreateApiResult(async () => {
            const data = await Promise.all(
                request.AutoScalingGroupNames.map(name => {
                    const filePath = path.resolve(
                        this.rootDir,
                        'autoscaling',
                        ['describe-auto-scaling-groups', name, this.redirName]
                            .filter(v => v)
                            .join('-')
                    );
                    return readFileAsJson(filePath);
                })
            );
            this.clearRedir();
            let groups = [];
            data.forEach(d => {
                groups = [...groups, ...(d.AutoScalingGroups as Array<any>)];
            });
            return {
                AutoScalingGroups: groups
            };
        });
    }

    completeLifecycleAction(request: AutoScaling.CompleteLifecycleActionType): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }

    terminateInstanceInAutoScalingGroup(
        request: AutoScaling.TerminateInstanceInAutoScalingGroupType
    ): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
}

export class MockElbv2 extends TestFixture {
    rootDir: string;
    elbv2: ELBv2;
    constructor(elbv2: ELBv2, rootDir: string) {
        super();
        this.rootDir = rootDir;
        this.elbv2 = elbv2;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.stubs.set('registerTargets', Sinon.stub(this.elbv2, 'registerTargets'));
        this.stubs.get('registerTargets').callsFake(args => {
            return this.registerTargets(args);
        });
        // NOTE: stub
        this.stubs.set('deregisterTargets', Sinon.stub(this.elbv2, 'deregisterTargets'));
        this.stubs.get('deregisterTargets').callsFake(args => {
            return this.deregisterTargets(args);
        });
    }

    registerTargets(request: ELBv2.Types.RegisterTargetsInput): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }

    deregisterTargets(request: ELBv2.Types.DeregisterTargetsInput): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
}

export class MockLambda extends TestFixture {
    rootDir: string;
    lambda: Lambda;
    constructor(lambda: Lambda, rootDir: string) {
        super();
        this.rootDir = rootDir;
        this.lambda = lambda;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.stubs.set('invoke', Sinon.stub(this.lambda, 'invoke'));
        this.stubs.get('invoke').callsFake(args => {
            return this.invoke(args);
        });
    }

    invoke(request: Lambda.InvocationRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'lambda',
                ['invoke', request.FunctionName, this.redirName].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearRedir();
            return data;
        });
    }
}

export class MockDocClient extends TestFixture {
    rootDir: string;
    docClient: DocumentClient;
    constructor(docClient: DocumentClient, rootDir: string) {
        super();
        this.rootDir = rootDir;
        this.docClient = docClient;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.stubs.set('scan', Sinon.stub(this.docClient, 'scan'));
        this.stubs.get('scan').callsFake(args => {
            return this.scan(args);
        });
        // NOTE: stub
        this.stubs.set('get', Sinon.stub(this.docClient, 'get'));
        this.stubs.get('get').callsFake(args => {
            return this.get(args);
        });
        // NOTE: stub
        this.stubs.set('put', Sinon.stub(this.docClient, 'put'));
        this.stubs.get('put').callsFake(args => {
            return this.put(args);
        });
        // NOTE: stub
        this.stubs.set('update', Sinon.stub(this.docClient, 'update'));
        this.stubs.get('update').callsFake(args => {
            return this.update(args);
        });
        // NOTE: stub
        this.stubs.set('delete', Sinon.stub(this.docClient, 'delete'));
        this.stubs.get('delete').callsFake(args => {
            return this.delete(args);
        });
    }

    scan(request: DocumentClient.ScanInput): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'docclient',
                ['scan', request.TableName.toLowerCase(), this.redirName].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            const items = (data.Items as Array<any>).map(entry => {
                const o = {};
                for (const prop in entry) {
                    o[prop] = entry[prop].S as string;
                }
                return o;
            });
            data.Items = items;
            this.clearRedir();
            return data;
        });
    }

    get(request: DocumentClient.GetItemInput): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                'docclient',
                [
                    'get',
                    request.TableName.toLowerCase(),
                    ...Object.values(request.Key),
                    this.redirName
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            let item: {} = null;
            for (const prop in data.Item as {}) {
                if (!item) {
                    item = {};
                }
                item[prop] = Object.values(data.Item[prop])[0];
            }
            data.Item = item;
            this.clearRedir();
            return data;
        });
    }

    put(request: DocumentClient.PutItemInput): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }

    update(request: DocumentClient.UpdateItemInput): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }

    delete(request: DocumentClient.DeleteItemInput): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
}
