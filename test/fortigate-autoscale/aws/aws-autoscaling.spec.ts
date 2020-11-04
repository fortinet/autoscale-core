/* eslint-disable mocha/no-hooks-for-single-case */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Context } from 'aws-lambda';
import { describe, it } from 'mocha';
import * as path from 'path';
import Sinon from 'sinon';

import {
    AwsTestMan,
    MockAutoScaling,
    MockDocClient,
    MockEC2,
    MockElbv2,
    MockLambda,
    MockS3
} from '../../../test-helper/aws-testman';
import { createTestAwsTgwScheduledEventHandler } from '../../../test-helper/test-aws-helper-function';

describe('FortiGate Autoscale AWS Auto Scaling group tests.', () => {
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
    describe('AWS Auto Scaling scheduled events.', () => {
        after(function() {
            mockEC2.restoreAll();
            mockS3.restoreAll();
            mockElbv2.restoreAll();
            mockLambda.restoreAll();
            mockAutoscaling.restoreAll();
            mocDocClient.restoreAll();
        });

        it('Mantis #0649656. Terminating a vm yet become fully up, running and being monitored.', async () => {
            mockDataDir = path.resolve(mockDataRootDir, 'aws-autoscaling');
            const event = await awsTestMan.fakeScheduledEventRequest(
                path.resolve(mockDataDir, 'request/event-aws-autoscaling-terminating-vm.json')
            );
            context = await awsTestMan.fakeLambdaContext();

            const {
                autoscale,
                // platformAdapter: awsPlatformAdapter,
                platformAdaptee: awsPlatformAdaptee
            } = await createTestAwsTgwScheduledEventHandler(event, context);

            ({
                s3: mockS3,
                ec2: mockEC2,
                autoscaling: mockAutoscaling,
                elbv2: mockElbv2,
                lambda: mockLambda,
                docClient: mocDocClient
            } = awsPlatformAdaptee.stubAwsServices(path.resolve(mockDataDir, 'aws-api')));

            await autoscale.init();

            // ASSERT: calling this handler should not throw error
            const spyHandleVmNotLaunched = Sinon.spy(autoscale, 'handleVmNotLaunched');
            await autoscale.handleVmNotLaunched();
            Sinon.assert.match(spyHandleVmNotLaunched.threw(), false);

            // ASSERT: terminating a vm that isn't in the monitor should not throw error
            const spyHandleTerminatingVm = Sinon.spy(autoscale, 'handleTerminatingVm');
            await autoscale.handleTerminatingVm();
            Sinon.assert.match(spyHandleTerminatingVm.threw(), false);

            spyHandleVmNotLaunched.restore();
            spyHandleTerminatingVm.restore();
        });
    });
});
