/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import AutoScaling from 'aws-sdk/clients/autoscaling';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import EC2 from 'aws-sdk/clients/ec2';
import ELBv2 from 'aws-sdk/clients/elbv2';
import Lambda from 'aws-sdk/clients/lambda';
import S3 from 'aws-sdk/clients/s3';
import fs from 'fs';
import { describe, it } from 'mocha';
import path from 'path';
import Sinon from 'sinon';
import { Settings } from '../../../autoscale-setting';
import {
    CloudFunctionProxyAdapter,
    CloudFunctionResponseBody,
    LogLevel,
    ReqHeaders,
    ReqMethod
} from '../../../cloud-function-proxy';
import { AwsFortiGateAutoscaleSetting } from '../../../fortigate-autoscale/aws/aws-fortigate-autoscale-settings';
import { AwsPlatformAdaptee } from '../../../fortigate-autoscale/aws/aws-platform-adaptee';
import { AwsPlatformAdapter } from '../../../fortigate-autoscale/aws/aws-platform-adapter';
import { compare } from '../../../helper-function';
import { ResourceFilter } from '../../../platform-adapter';
import {
    AwsTestMan,
    MockAutoScaling,
    MockEC2,
    MockElbv2,
    MockLambda,
    MockS3,
    readFileAsJson
} from '../../../test-helper/aws-testman';

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
class TestCloudFunctionProxyAdapter implements CloudFunctionProxyAdapter {
    private executionStartTime: number;
    constructor() {
        this.executionStartTime = Date.now();
    }
    getReqBody(): Promise<unknown> {
        return Promise.resolve('fake-body-as-string');
    }
    getRequestAsString(): Promise<string> {
        return Promise.resolve('fake-req-as-string');
    }
    formatResponse(httpStatusCode: number, body: CloudFunctionResponseBody, headers: {}): {} {
        throw new Error('Method not implemented.');
    }
    log(message: string, level: LogLevel): void {
        console.log(message);
    }
    logAsDebug(message: string): void {
        console.log(message);
    }
    logAsInfo(message: string): void {
        console.log(message);
    }
    logAsWarning(message: string): void {
        console.log(message);
    }
    logAsError(message: string): void {
        console.log(message);
    }
    logForError(messagePrefix: string, error: Error): void {
        console.log(error);
    }
    getRemainingExecutionTime(): Promise<number> {
        // set it to 60 seconds
        return Promise.resolve(this.executionStartTime + 60000 - Date.now());
    }
    getReqHeaders(): Promise<ReqHeaders> {
        throw new Error('Method not implemented.');
    }
    getReqMethod(): Promise<ReqMethod> {
        throw new Error('Method not implemented.');
    }
}

class TestAwsPlatformAdapee extends AwsPlatformAdaptee {
    /**
     * Expose non-public member for test frameworks to stub.
     *
     * @returns {{}} an object of some members not publicly accessible
     */
    testExpose(): {
        docClient: DocumentClient;
        s3: S3;
        ec2: EC2;
        autoscaling: AutoScaling;
        elbv2: ELBv2;
        lambda: Lambda;
    } {
        return {
            docClient: this.docClient,
            s3: this.s3,
            ec2: this.ec2,
            autoscaling: this.autoscaling,
            elbv2: this.elbv2,
            lambda: this.lambda
        };
    }
}
describe('AWS api test', () => {
    let mockDataRootDir: string;
    let awsTestMan: AwsTestMan;
    let awsPlatformAdaptee: TestAwsPlatformAdapee;
    let awsPlatformAdapter: AwsPlatformAdapter;
    let proxy: TestCloudFunctionProxyAdapter;
    let settings: Settings;
    let mockEC2: MockEC2;
    let mockS3: MockS3;
    let mockAutoscaling: MockAutoScaling;
    let mockElbv2: MockElbv2;
    let mockLambda: MockLambda;
    let mockAwsApiDir: string;
    before(async function() {
        mockDataRootDir = path.resolve(__dirname, 'mockup-data');
        awsTestMan = new AwsTestMan(mockDataRootDir);
        mockAwsApiDir = path.resolve(mockDataRootDir, 'aws-api');
        awsPlatformAdaptee = new TestAwsPlatformAdapee();
        proxy = new TestCloudFunctionProxyAdapter();
        settings = await awsTestMan.loadSettings(
            path.resolve(mockAwsApiDir, 'dynamodb/list-item-from-db-settings')
        );
        awsPlatformAdapter = new AwsPlatformAdapter(awsPlatformAdaptee, proxy);
        awsPlatformAdapter.settings = settings;

        const { s3, ec2, autoscaling, elbv2, lambda } = awsPlatformAdaptee.testExpose();
        mockEC2 = new MockEC2(ec2, mockAwsApiDir);
        mockS3 = new MockS3(s3, mockAwsApiDir);
        mockAutoscaling = new MockAutoScaling(autoscaling, mockAwsApiDir);
        mockElbv2 = new MockElbv2(elbv2, mockAwsApiDir);
        mockLambda = new MockLambda(lambda, mockAwsApiDir);
    });
    after(function() {
        mockEC2.restoreAll();
        mockS3.restoreAll();
        mockElbv2.restoreAll();
        mockLambda.restoreAll();
    });
    it('EC2 APIs', async () => {
        let json;
        let instance: any;
        let eni: any;
        let result: any;
        let filters: ResourceFilter[];
        let ids: string[];
        const instanceId = 'i-0c6cb881aad1a8d79';
        const nicId = 'eni-0fd3e92c4188f7243';
        const nicIndex = 1;
        let callCount: number;
        let customerGatewayId = 'cgw-0ff3a9958ec843ad3';
        let transitGatewayId = 'tgw-02c276ed71878c044';
        let vpnConnectionId = 'vpn-05d7645008b6ab211';
        let tgwAttachmentId = 'tgw-attach-08543bdd8322b68cb';
        let tgwRouteTableIdOutbound = 'tgw-rtb-0e382f2f6740ac313';
        let tgwRouteTableIdInbound = 'tgw-rtb-0f6059152d6227b70';
        const vpnType = 'ipsec.1';
        const bgpAsn = 65432;
        // NOTE: test
        json = await readFileAsJson(
            path.resolve(mockAwsApiDir, 'ec2', `describe-instances-${instanceId}`)
        );

        instance = await awsPlatformAdaptee.describeInstance(instanceId);
        Sinon.assert.match(compare(instance).isEqualTo(json.Reservations[0].Instances[0]), true);

        // NOTE: test
        json = await readFileAsJson(path.resolve(mockAwsApiDir, 'ec2', 'create-network-interface'));
        eni = await awsPlatformAdaptee.createNetworkInterface(
            json.NetworkInterface.SubnetId,
            json.NetworkInterface.Description,
            json.NetworkInterface.Groups,
            json.NetworkInterface.PrivateIpAddress
        );
        Sinon.assert.match(compare(eni).isEqualTo(json.NetworkInterface), true);

        // NOTE: test
        json = await readFileAsJson(path.resolve(mockAwsApiDir, 'ec2', 'create-network-interface'));
        result = await awsPlatformAdaptee.deleteNetworkInterface(
            json.NetworkInterface.NetworkInterfaceId
        );
        Sinon.assert.match(result, undefined);

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(mockAwsApiDir, 'ec2', 'describe-network-interfaces')
        );
        filters = [
            {
                key: '',
                value: ''
            }
        ];
        result = await awsPlatformAdaptee.listNetworkInterfaces(filters);
        Sinon.assert.match(compare(result).isEqualTo(json.NetworkInterfaces), true);

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(mockAwsApiDir, 'ec2', `describe-network-interfaces-${nicId}`)
        );
        ids = [nicId];
        result = await awsPlatformAdaptee.listNetworkInterfacesById(ids);
        Sinon.assert.match(compare(result).isEqualTo(json.NetworkInterfaces), true);

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(mockAwsApiDir, 'ec2', `describe-network-interfaces-${nicId}`)
        );
        result = await awsPlatformAdaptee.describeNetworkInterface(nicId);
        Sinon.assert.match(compare(result).isEqualTo(json.NetworkInterfaces[0]), true);

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(
                mockAwsApiDir,
                'ec2',
                `attach-network-interface-${instanceId}-${nicId}-${nicIndex}`
            )
        );
        result = await awsPlatformAdaptee.attachNetworkInterface(instanceId, nicId, 1);
        Sinon.assert.match(compare(result).isEqualTo(json), true);

        // NOTE: test
        const stub0 = Sinon.stub(awsPlatformAdaptee, 'describeNetworkInterface').callsFake(
            async nicId2 => {
                const eni1 = await readFileAsJson(
                    path.resolve(
                        mockAwsApiDir,
                        'ec2',
                        `describe-network-interfaces-${nicId}-${instanceId}`
                    )
                );
                const [eni3] = (eni1.NetworkInterfaces as Array<any>).filter(
                    eni2 => eni2.NetworkInterfaceId === nicId2
                );
                return eni3;
            }
        );
        const stub1 = Sinon.stub(awsPlatformAdaptee, 'describeInstance').callsFake(
            async instanceId1 => {
                const instance1 = await readFileAsJson(
                    path.resolve(mockAwsApiDir, 'ec2', `describe-instances-${instanceId1}-${nicId}`)
                );
                const [instance3] = instance1.Reservations[0].Instances.filter(instance2 => {
                    return instance2.InstanceId === instanceId1;
                });
                return instance3;
            }
        );
        result = await awsPlatformAdaptee.detachNetworkInterface(instanceId, nicId);
        Sinon.assert.match(result, undefined);

        // NOTE: test
        callCount = mockEC2.getStub('createTags').callCount;
        await awsPlatformAdaptee.tagResource([], []);
        // ASSERT: createTags being called
        Sinon.assert.match(mockEC2.getStub('createTags').callCount - callCount > 0, true);

        // NOTE: test
        callCount = mockEC2.getStub('modifyInstanceAttribute').callCount;
        await awsPlatformAdaptee.updateInstanceSrcDestChecking(instanceId, true);
        // ASSERT: createTags being called
        Sinon.assert.match(
            mockEC2.getStub('modifyInstanceAttribute').callCount - callCount > 0,
            true
        );

        // NOTE: test
        json = await readFileAsJson(path.resolve(mockAwsApiDir, 'ec2', 'create-customer-gateway'));
        result = await awsPlatformAdaptee.createCustomerGateway(vpnType, bgpAsn);
        Sinon.assert.match(compare(result).isEqualTo(json.CustomerGateway), true);

        // NOTE: test
        callCount = mockEC2.getStub('deleteCustomerGateway').callCount;
        await awsPlatformAdaptee.deleteCustomerGateway(customerGatewayId);
        // ASSERT: createTags being called
        Sinon.assert.match(
            mockEC2.getStub('deleteCustomerGateway').callCount - callCount > 0,
            true
        );

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(
                mockAwsApiDir,
                'ec2',
                `create-vpn-connection-${customerGatewayId}-${transitGatewayId}`
            )
        );
        result = await awsPlatformAdaptee.createVpnConnection(
            vpnType,
            bgpAsn,
            customerGatewayId,
            true,
            null,
            transitGatewayId
        );
        Sinon.assert.match(compare(result).isEqualTo(json.VpnConnection), true);

        // NOTE: test
        callCount = mockEC2.getStub('deleteVpnConnection').callCount;
        await awsPlatformAdaptee.deleteVpnConnection(vpnConnectionId);
        // ASSERT: createTags being called
        Sinon.assert.match(mockEC2.getStub('deleteVpnConnection').callCount - callCount > 0, true);

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(
                mockAwsApiDir,
                'ec2',
                `describe-transit-gateway-attachments-${transitGatewayId}-${vpnConnectionId}`
            )
        );
        result = await awsPlatformAdaptee.describeTransitGatewayAttachment(
            transitGatewayId,
            vpnConnectionId
        );
        Sinon.assert.match(compare(result).isEqualTo(json.TransitGatewayAttachments[0]), true);

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(
                mockAwsApiDir,
                'ec2',
                `enable-transit-gateway-route-table-propagation-${tgwAttachmentId}-${tgwRouteTableIdOutbound}`
            )
        );
        result = await awsPlatformAdaptee.updateTgwRouteTablePropagation(
            tgwAttachmentId,
            tgwRouteTableIdOutbound
        );
        Sinon.assert.match(json.Propagation.State, result);

        // NOTE: test
        json = await readFileAsJson(
            path.resolve(
                mockAwsApiDir,
                'ec2',
                `associate-transit-gateway-route-table-${tgwAttachmentId}-${tgwRouteTableIdInbound}`
            )
        );
        result = await awsPlatformAdaptee.updateTgwRouteTableAssociation(
            tgwAttachmentId,
            tgwRouteTableIdInbound
        );
        Sinon.assert.match(json.Association.State, result);

        // NOTE: restore all stubs
        stub0.restore();
        stub1.restore();
    });
    it('S3 APIs', async () => {
        let fileName;
        let files;
        let content;
        let result;
        let bucketName = 'assets';
        let prefix = 'configset';
        // NOTE: test
        files = fs.readdirSync(path.resolve(mockAwsApiDir, 's3', bucketName, prefix));
        result = await awsPlatformAdaptee.listS3Object(bucketName, prefix);
        let missing = result.filter(f => {
            return !files.includes(f.fileName);
        });

        Sinon.assert.match(missing, 0);

        // NOTE: test
        fileName = 'baseconfig';
        content = fs
            .readFileSync(path.resolve(mockAwsApiDir, 's3', bucketName, prefix, fileName))
            .toString();
        result = await awsPlatformAdapter.loadConfigSet(fileName);

        Sinon.assert.match(compare(result).isEqualTo(content), true);
    });

    it('Auto Scaling APIs', async () => {
        const instanceId = 'i-0c6cb881aad1a8d79';
        let callCount: number;
        // NOTE: test
        callCount = mockAutoscaling.getStub('describeAutoScalingGroups').callCount;
        const stub0 = Sinon.stub(awsPlatformAdapter, 'getReqVmId').callsFake(() => {
            return Promise.resolve(instanceId);
        });
        await awsPlatformAdapter.getTargetVm();
        Sinon.assert.match(
            mockAutoscaling.getStub('describeAutoScalingGroups').callCount - callCount > 0,
            true
        );
        stub0.restore();

        // NOTE: test
        callCount = mockAutoscaling.getStub('completeLifecycleAction').callCount;
        await awsPlatformAdaptee.completeLifecycleAction(
            settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupName).value,
            '',
            '',
            ''
        );
        Sinon.assert.match(
            mockAutoscaling.getStub('completeLifecycleAction').callCount - callCount > 0,
            true
        );

        // NOTE: test
        callCount = mockAutoscaling.getStub('terminateInstanceInAutoScalingGroup').callCount;
        await awsPlatformAdaptee.terminateInstanceInAutoScalingGroup(instanceId);
        Sinon.assert.match(
            mockAutoscaling.getStub('terminateInstanceInAutoScalingGroup').callCount - callCount >
                0,
            true
        );
    });

    it('ElbV2 APIs', async () => {
        let callCount: number;
        const instanceId = 'i-0c6cb881aad1a8d79';
        let targetGroupArn = settings.get(
            AwsFortiGateAutoscaleSetting.AwsLoadBalancerTargetGroupArn
        ).value;
        // NOTE: test
        callCount = mockElbv2.getStub('registerTargets').callCount;
        await awsPlatformAdaptee.elbRegisterTargets(targetGroupArn, [instanceId]);
        Sinon.assert.match(mockElbv2.getStub('registerTargets').callCount - callCount > 0, true);
        // NOTE: test
        callCount = mockElbv2.getStub('deregisterTargets').callCount;
        await awsPlatformAdaptee.elbDeregisterTargets(targetGroupArn, [instanceId]);
        Sinon.assert.match(mockElbv2.getStub('deregisterTargets').callCount - callCount > 0, true);
    });

    it('Lambda APIs', async () => {
        let callCount: number;
        const lambdaInvocable = '';
        const payload = {
            paramKey1: 'paramValue1',
            paramKey2: 'paramValue2'
        };
        // NOTE: test
        callCount = mockLambda.getStub('invoke').callCount;
        await awsPlatformAdapter.invokeAutoscaleFunction(
            payload,
            'fake-lambda-endpoint',
            lambdaInvocable
        );
        Sinon.assert.match(mockLambda.getStub('invoke').callCount - callCount > 0, true);
    });
});
