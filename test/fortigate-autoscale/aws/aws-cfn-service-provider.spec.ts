/* eslint-disable mocha/no-hooks-for-single-case */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import { describe, it } from 'mocha';
import * as path from 'path';
import Sinon from 'sinon';

import * as AwsCfnResponse from '../../../fortigate-autoscale/aws/aws-cfn-response';
import { AwsFortiGateAutoscaleSetting } from '../../../fortigate-autoscale/aws/aws-fortigate-autoscale-settings';
import {
    AwsTestMan,
    MockAutoScaling,
    MockDocClient,
    MockEC2,
    MockElbv2,
    MockLambda,
    MockS3
} from '../../../test-helper/aws-testman';
import { createAwsCloudFormationCustomResourceEventHandler } from '../../../test-helper/test-aws-helper-function';

describe('FortiGate Autoscale AWS CloudFormation service provider.', () => {
    let mockDataRootDir: string;
    let awsTestMan: AwsTestMan;
    let mockEC2: MockEC2;
    let mockS3: MockS3;
    let mockAutoscaling: MockAutoScaling;
    let mockElbv2: MockElbv2;
    let mockLambda: MockLambda;
    let mocDocClient: MockDocClient;
    let mockDataDir: string;
    let context: Context;

    before(function() {
        process.env.RESOURCE_TAG_PREFIX = '';
        mockDataRootDir = path.resolve(__dirname, './mockup-data');
        awsTestMan = new AwsTestMan(mockDataRootDir);
    });
    describe('Scaling Group services.', () => {
        after(function() {
            mockEC2.restoreAll();
            mockS3.restoreAll();
            mockElbv2.restoreAll();
            mockLambda.restoreAll();
            mockAutoscaling.restoreAll();
            mocDocClient.restoreAll();
        });
        let event: CloudFormationCustomResourceEvent;
        it('Calling startAutoscale service.', async () => {
            mockDataDir = path.resolve(mockDataRootDir, 'aws-cfn-service-provider');
            event = await awsTestMan.fakeCfnCustomResourceRequest(
                path.resolve(mockDataDir, 'request/event-cfn-start-autoscale.json')
            );
            context = await awsTestMan.fakeLambdaContext();

            const {
                proxy,
                platformAdapter: awsPlatformAdapter,
                platformAdaptee: awsPlatformAdaptee,
                serviceProvider: awsCfnServiceProvider
            } = await createAwsCloudFormationCustomResourceEventHandler(event, context);

            ({
                s3: mockS3,
                ec2: mockEC2,
                autoscaling: mockAutoscaling,
                elbv2: mockElbv2,
                lambda: mockLambda,
                docClient: mocDocClient
            } = awsPlatformAdaptee.stubAwsServices(path.resolve(mockDataDir, 'aws-api')));

            const spyUpdateScalingGroupSize = Sinon.spy(
                awsPlatformAdapter,
                'updateScalingGroupSize'
            );

            const spyProxySendResponse = Sinon.spy(proxy, 'sendResponse');

            const stubAwsCfnResponse = Sinon.stub(AwsCfnResponse, 'send');

            stubAwsCfnResponse.callsFake((event1, context1, responsStatus) => {
                // ASSERT: this function is called with arguments of expected types.
                Sinon.assert.match(event1, Sinon.match.object);
                Sinon.assert.match(context1, Sinon.match.object);
                Sinon.assert.match(responsStatus, Sinon.match.string);
                return Promise.resolve();
            });

            await awsCfnServiceProvider.handleServiceRequest();

            const settings = await awsPlatformAdapter.getSettings();
            const byolGroupName = settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupName)
                .value;
            const paygGroupName = settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupName)
                .value;

            // ASSERT: BYOL group is updated. desired cap: 1, min size: 1, max size: 2
            Sinon.assert.match(spyUpdateScalingGroupSize.calledWith(byolGroupName, 1, 1, 2), true);
            // ASSERT: PAYG group is updated. desired cap: 0, min size: 0, max size: 6
            Sinon.assert.match(spyUpdateScalingGroupSize.calledWith(paygGroupName, 0, 0, 6), true);
            // ASSERT: complete successfully with sending a 'true' as response
            Sinon.assert.match(spyProxySendResponse.calledWith(true), true);
        });
    });

    describe('Calling enable attachment service.', () => {
        // TODO: FortiAnalyzer integration service may be needed later. Keep a dummy test for now
        // required test cases:
        // registration
        // retrieveSettings
        // authorizeFgt
    });
    describe('Calling enable nic2 attachment service.', () => {
        // TODO: may need the start nic attachment service later but not now. Keep a dummy test for now
    });
});
