/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, ScheduledEvent } from 'aws-lambda';
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

    async fakeLaunchingVmRequest(filePath: string): Promise<ScheduledEvent> {
        const e = await this.readFileAsJson(path.resolve(this.rootDir, filePath));
        const event = {} as ScheduledEvent;
        Object.assign(event, e);
        return event;
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

export type FakeCall = (...args: any[]) => any;
export type Hook = (...args: any[]) => any;
interface SubCall {
    subPath: string;
    callOnce: boolean;
}
export interface StubStack {
    stub: SinonStub;
    fakeCall: FakeCall;
    sequentialCall: boolean;
    subCalls: Map<number, SubCall>;
    hooks: Hook[];
}

export abstract class TestFixture {
    subCall: SubCall;
    subCallOwner: string;
    subCallNth: number;
    readonly stubs: Map<string, StubStack> = new Map();
    abstract init(): void;
    restoreAll(): void {
        this.stubs.forEach(stack => {
            stack.stub.restore();
        });
    }

    clearAll(): void {
        this.stubs.forEach(stack => {
            stack.stub.restore();
            stack.fakeCall = null;
            stack.subCalls = new Map();
        });
    }

    setStub(stubKey: string, stub: SinonStub): TestFixture {
        const stubStack: StubStack = {
            stub: stub,
            fakeCall: null,
            sequentialCall: false,
            subCalls: new Map(),
            hooks: []
        };
        this.stubs.set(stubKey, stubStack);
        return this;
    }

    getStub(stubkey: string): SinonStub {
        return this.stubs.get(stubkey).stub;
    }

    setFakeCall(stubKey: string, func: FakeCall): TestFixture {
        this.stubs.get(stubKey).fakeCall = func;
        this.stubs.get(stubKey).stub.callsFake(args => {
            const stubStack = this.stubs.get(stubKey);
            const callCount = this.stubs.get(stubKey).stub.callCount;
            // -1 is the position for a permanent call sub
            if (stubStack.subCalls.has(-1)) {
                this.setSubCall(stubKey, callCount + 1, stubStack.subCalls.get(-1));
            }
            // this callfake is a sequential call. call sub with seq-{nth} pattern
            else if (callCount > 0 && stubStack.sequentialCall) {
                this.setSubCall(stubKey, callCount, {
                    subPath: `seq-${callCount}`,
                    callOnce: false
                });
            }
            // there's a call sub for current call. use call sub on current call instead
            else if (stubStack.subCalls.has(callCount)) {
                this.setSubCall(stubKey, callCount, stubStack.subCalls.get(callCount));
                if (!stubStack.subCalls.get(callCount).callOnce) {
                    stubStack.subCalls.set(-1, stubStack.subCalls.get(callCount));
                }
            } else {
                this.setSubCall(stubKey, callCount, {
                    subPath: '',
                    callOnce: true
                });
            }
            stubStack.hooks.forEach(hook => {
                hook.call(this);
            });
            return stubStack.fakeCall.apply(this, [args]);
        });
        return this;
    }

    callSubOnNthFake(stubKey: string, nth: number, subPath: string, callOnce = true): TestFixture {
        this.stubs.get(stubKey).subCalls.set(nth, {
            subPath: subPath,
            callOnce: callOnce
        });
        return this;
    }

    callSubOnNextFake(stubKey: string, subPath: string): TestFixture {
        const callCount = this.stubs.get(stubKey).stub.callCount;
        return this.callSubOnNthFake(stubKey, callCount + 1, subPath);
    }

    clearSub(stubKey: string): TestFixture {
        this.stubs.get(stubKey).subCalls.clear();
        return this;
    }

    hookOnStub(stubKey: string, hook: Hook): TestFixture {
        this.stubs.get(stubKey).hooks.push(hook);
        return this;
    }

    enableSequentialFakeCall(stubKey: string): TestFixture {
        this.stubs.get(stubKey).sequentialCall = true;
        return this;
    }

    disableSequentialFakeCall(stubKey: string): TestFixture {
        this.stubs.get(stubKey).sequentialCall = false;
        return this;
    }

    setSubCall(owner: string, nth: number, subCall: SubCall): void {
        this.subCall = subCall;
        this.subCallOwner = owner;
        this.subCallNth = nth;
    }

    clearSubPath(): void {
        if (this.subCall.callOnce) {
            this.stubs.get(this.subCallOwner).subCalls.delete(this.subCallNth);
        }
        this.subCall = null;
        this.subCallOwner = null;
        this.subCallNth = NaN;
    }
}

export class MockS3 extends TestFixture {
    rootDir: string;
    s3: S3;
    constructor(s3: S3, rootDir: string) {
        super();
        this.rootDir = path.join(rootDir, 's3');
        this.s3 = s3;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.setStub('listObjectsV2', Sinon.stub(this.s3, 'listObjectsV2'));
        this.setFakeCall('listObjectsV2', args => {
            return this.listObjectsV2(args);
        });
        // NOTE: stub
        this.setStub('getObject', Sinon.stub(this.s3, 'getObject'));
        this.setFakeCall('getObject', args => {
            return this.getObject(args);
        });
    }

    listObjectsV2(request: S3.ListObjectsV2Request): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                [request.Bucket, ...request.Prefix.split('/'), this.subCall.subPath]
                    .filter(v => v)
                    .join('/')
            );
            const files = await fs.readdirSync(filePath);
            this.clearSubPath();
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
                [request.Bucket, ...request.Key.split('/'), this.subCall.subPath]
                    .filter(v => v)
                    .join('/')
            );
            const data = fs.readFileSync(filePath);
            this.clearSubPath();
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
        this.rootDir = path.join(rootDir, 'ec2');
        this.ec2 = ec2;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.setStub('describeInstances', Sinon.stub(this.ec2, 'describeInstances'));
        this.setFakeCall('describeInstances', args => {
            return this.describeInstances(args);
        });
        // NOTE: stub
        this.setStub('createNetworkInterface', Sinon.stub(this.ec2, 'createNetworkInterface'));
        this.setFakeCall('createNetworkInterface', args => {
            return this.createNetworkInterface(args);
        });
        // NOTE: stub
        this.setStub('deleteNetworkInterface', Sinon.stub(this.ec2, 'deleteNetworkInterface'));
        this.setFakeCall('deleteNetworkInterface', args => {
            return this.deleteNetworkInterface(args);
        });
        // NOTE: stub
        this.setStub(
            'describeNetworkInterfaces',
            Sinon.stub(this.ec2, 'describeNetworkInterfaces')
        );
        this.setFakeCall('describeNetworkInterfaces', args => {
            return this.describeNetworkInterfaces(args);
        });
        // NOTE: stub
        this.setStub('attachNetworkInterface', Sinon.stub(this.ec2, 'attachNetworkInterface'));
        this.setFakeCall('attachNetworkInterface', args => {
            return this.attachNetworkInterface(args);
        });
        // NOTE: stub
        this.setStub('detachNetworkInterface', Sinon.stub(this.ec2, 'detachNetworkInterface'));
        this.setFakeCall('detachNetworkInterface', nicId => {
            return this.detachNetworkInterface(nicId);
        });
        // NOTE: stub
        this.setStub('createTags', Sinon.stub(this.ec2, 'createTags'));
        this.setFakeCall('createTags', args => {
            return this.createTags(args);
        });
        // NOTE: stub
        this.setStub('deleteTags', Sinon.stub(this.ec2, 'deleteTags'));
        this.setFakeCall('deleteTags', args => {
            return this.deleteTags(args);
        });
        // NOTE: stub
        this.setStub('modifyInstanceAttribute', Sinon.stub(this.ec2, 'modifyInstanceAttribute'));
        this.setFakeCall('modifyInstanceAttribute', args => {
            return this.modifyInstanceAttribute(args);
        });
        // NOTE: stub
        this.setStub('createCustomerGateway', Sinon.stub(this.ec2, 'createCustomerGateway'));
        this.setFakeCall('createCustomerGateway', args => {
            return this.createCustomerGateway(args);
        });
        // NOTE: stub
        this.setStub('deleteCustomerGateway', Sinon.stub(this.ec2, 'deleteCustomerGateway'));
        this.setFakeCall('deleteCustomerGateway', args => {
            return this.deleteCustomerGateway(args);
        });
        // NOTE: stub
        this.setStub('createVpnConnection', Sinon.stub(this.ec2, 'createVpnConnection'));
        this.setFakeCall('createVpnConnection', args => {
            return this.createVpnConnection(args);
        });
        // NOTE: stub
        this.setStub('deleteVpnConnection', Sinon.stub(this.ec2, 'deleteVpnConnection'));
        this.setFakeCall('deleteVpnConnection', args => {
            return this.deleteVpnConnection(args);
        });
        // NOTE: stub
        this.setStub('describeVpnConnection', Sinon.stub(this.ec2, 'describeVpnConnections'));
        this.setFakeCall('describeVpnConnection', args => {
            return this.describeVpnConnection(args);
        });
        // NOTE: stub
        this.setStub(
            'describeTransitGatewayAttachments',
            Sinon.stub(this.ec2, 'describeTransitGatewayAttachments')
        );
        this.setFakeCall('describeTransitGatewayAttachments', args => {
            return this.describeTransitGatewayAttachments(args);
        });
        // NOTE: stub
        this.setStub(
            'enableTransitGatewayRouteTablePropagation',
            Sinon.stub(this.ec2, 'enableTransitGatewayRouteTablePropagation')
        );
        this.setFakeCall('enableTransitGatewayRouteTablePropagation', args => {
            return this.enableTransitGatewayRouteTablePropagation(args);
        });
        // NOTE: stub
        this.setStub(
            'associateTransitGatewayRouteTable',
            Sinon.stub(this.ec2, 'associateTransitGatewayRouteTable')
        );
        this.setFakeCall('associateTransitGatewayRouteTable', args => {
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
                ['describe-instances', sampleName || this.subCall.subPath].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
        });
    }

    createNetworkInterface(request: any): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                ['create-network-interface', this.subCall.subPath].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            const nic: JSONable = data.NetworkInterface as JSONable;
            nic.SubnetId = request.SubnetId;
            nic.Description = request.Description;
            nic.Groups = request.Groups;
            nic.PrivateIpAddress = request.PrivateIpAddress;
            this.clearSubPath();
            return { NetworkInterface: nic };
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
                ['describe-network-interfaces', this.subCall.subPath].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
        });
    }

    attachNetworkInterface(request: EC2.AttachNetworkInterfaceRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
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
            this.clearSubPath();
            return data;
        });
    }

    detachNetworkInterface(request: EC2.DetachNetworkInterfaceRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                ['detach-network-interface', request.AttachmentId].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
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
                ['create-customer-gateway', request.PublicIp, request.BgpAsn, this.subCall.subPath]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
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
                [
                    'create-vpn-connection',
                    request.CustomerGatewayId,
                    request.TransitGatewayId,
                    this.subCall.subPath
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
        });
    }
    deleteVpnConnection(request: EC2.DeleteVpnConnectionRequest): ApiResult {
        return CreateApiResult(() => {
            return;
        });
    }
    describeVpnConnection(request: EC2.DescribeVpnConnectionsRequest): ApiResult {
        return CreateApiResult(async () => {
            const vpnconnectionId: string = request.VpnConnectionIds[0];
            const filePath = path.resolve(
                this.rootDir,
                ['describe-vpn-connections', vpnconnectionId, this.subCall.subPath]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
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
                [
                    'describe-transit-gateway-attachments',
                    transitGatewayId,
                    resourceId,
                    this.subCall.subPath
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
        });
    }
    enableTransitGatewayRouteTablePropagation(
        request: EC2.EnableTransitGatewayRouteTablePropagationRequest
    ): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                [
                    'enable-transit-gateway-route-table-propagation',
                    request.TransitGatewayAttachmentId,
                    request.TransitGatewayRouteTableId,
                    this.subCall.subPath
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
        });
    }
    associateTransitGatewayRouteTable(
        request: EC2.AssociateTransitGatewayRouteTableRequest
    ): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                [
                    'associate-transit-gateway-route-table',
                    request.TransitGatewayAttachmentId,
                    request.TransitGatewayRouteTableId,
                    this.subCall.subPath
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
        });
    }
}

export class MockAutoScaling extends TestFixture {
    rootDir: string;
    autoscaling: AutoScaling;
    constructor(autoscaling: AutoScaling, rootDir: string) {
        super();
        this.rootDir = path.join(rootDir, 'autoscaling');
        this.autoscaling = autoscaling;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.setStub(
            'describeAutoScalingGroups',
            Sinon.stub(this.autoscaling, 'describeAutoScalingGroups')
        );
        this.setFakeCall('describeAutoScalingGroups', args => {
            return this.describeAutoScalingGroups(args);
        });
        // NOTE: stub
        this.setStub(
            'completeLifecycleAction',
            Sinon.stub(this.autoscaling, 'completeLifecycleAction')
        );
        this.setFakeCall('completeLifecycleAction', args => {
            return this.completeLifecycleAction(args);
        });
        // NOTE: stub
        this.setStub(
            'terminateInstanceInAutoScalingGroup',
            Sinon.stub(this.autoscaling, 'terminateInstanceInAutoScalingGroup')
        );
        this.setFakeCall('terminateInstanceInAutoScalingGroup', args => {
            return this.terminateInstanceInAutoScalingGroup(args);
        });
    }

    describeAutoScalingGroups(request: AutoScaling.AutoScalingGroupNamesType): ApiResult {
        return CreateApiResult(async () => {
            const data = await Promise.all(
                request.AutoScalingGroupNames.map(name => {
                    const filePath = path.resolve(
                        this.rootDir,
                        ['describe-auto-scaling-groups', name, this.subCall.subPath]
                            .filter(v => v)
                            .join('-')
                    );
                    return readFileAsJson(filePath);
                })
            );
            this.clearSubPath();
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
        this.setStub('registerTargets', Sinon.stub(this.elbv2, 'registerTargets'));
        this.setFakeCall('registerTargets', args => {
            return this.registerTargets(args);
        });
        // NOTE: stub
        this.setStub('deregisterTargets', Sinon.stub(this.elbv2, 'deregisterTargets'));
        this.setFakeCall('deregisterTargets', args => {
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
        this.rootDir = path.join(rootDir, 'lambda');
        this.lambda = lambda;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.setStub('invoke', Sinon.stub(this.lambda, 'invoke'));
        this.setFakeCall('invoke', args => {
            return this.invoke(args);
        });
    }

    invoke(request: Lambda.InvocationRequest): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                ['invoke', request.FunctionName, this.subCall.subPath].filter(v => v).join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
            return data;
        });
    }
}

export class MockDocClient extends TestFixture {
    rootDir: string;
    docClient: DocumentClient;
    constructor(docClient: DocumentClient, rootDir: string) {
        super();
        this.rootDir = path.join(rootDir, 'docclient');
        this.docClient = docClient;
        this.init();
    }

    init(): void {
        // NOTE: stub
        this.setStub('scan', Sinon.stub(this.docClient, 'scan'));
        this.setFakeCall('scan', args => {
            return this.scan(args);
        });
        // NOTE: stub
        this.setStub('get', Sinon.stub(this.docClient, 'get'));
        this.setFakeCall('get', args => {
            return this.get(args);
        });
        // NOTE: stub
        this.setStub('put', Sinon.stub(this.docClient, 'put'));
        this.setFakeCall('put', args => {
            return this.put(args);
        });
        // NOTE: stub
        this.setStub('update', Sinon.stub(this.docClient, 'update'));
        this.setFakeCall('update', args => {
            return this.update(args);
        });
        // NOTE: stub
        this.setStub('delete', Sinon.stub(this.docClient, 'delete'));
        this.setFakeCall('delete', args => {
            return this.delete(args);
        });
    }

    scan(request: DocumentClient.ScanInput): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                ['scan', request.TableName.toLowerCase(), this.subCall.subPath]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            const items = (data.Items as Array<any>).map(entry => {
                const o = { ...entry };
                return o;
            });
            data.Items = items;
            this.clearSubPath();
            return data;
        });
    }

    get(request: DocumentClient.GetItemInput): ApiResult {
        return CreateApiResult(async () => {
            const filePath = path.resolve(
                this.rootDir,
                [
                    'get',
                    request.TableName.toLowerCase(),
                    ...Object.values(request.Key),
                    this.subCall.subPath
                ]
                    .filter(v => v)
                    .join('-')
            );
            const data = await readFileAsJson(filePath);
            this.clearSubPath();
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
