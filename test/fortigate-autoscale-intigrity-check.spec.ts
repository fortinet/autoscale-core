/* eslint-disable mocha/no-hooks-for-single-case */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as path from 'path';
import { describe, it } from 'mocha';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { AwsFortiGateAutoscaleSetting } from '../fortigate-autoscale';
import {
    AwsTestMan,
    MockEC2,
    MockS3,
    MockAutoScaling,
    MockElbv2,
    MockLambda,
    MockDocClient
} from '../test-helper/aws-testman';

import Sinon from 'sinon';
import { createAwsApiGatewayEventHandler } from '../test-helper/test-aws-helper-function';

describe('FortiGate sanity test.', () => {
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
    let event: APIGatewayProxyEvent;

    before(function() {
        process.env.RESOURCE_TAG_PREFIX = '';
        mockDataRootDir = path.resolve(__dirname, './mockup-data');
        awsTestMan = new AwsTestMan(mockDataRootDir);
    });
    after(function() {
        mockEC2.restoreAll();
        mockS3.restoreAll();
        mockElbv2.restoreAll();
        mockLambda.restoreAll();
        mockAutoscaling.restoreAll();
        mocDocClient.restoreAll();
    });
    it('Setting key match the keys in saveSettings.', async () => {
        mockDataDir = path.resolve(mockDataRootDir, 'integrity-check');
        event = await awsTestMan.fakeApiGatewayRequest(
            path.resolve(mockDataDir, 'request/event-fgt-get-config.json')
        );
        context = await awsTestMan.fakeLambdaContext();

        const {
            autoscale,
            platformAdaptee: awsPlatformAdaptee,
            platformAdapter: awsPlatformAdapter
        } = await createAwsApiGatewayEventHandler(event, context);

        ({
            s3: mockS3,
            ec2: mockEC2,
            autoscaling: mockAutoscaling,
            elbv2: mockElbv2,
            lambda: mockLambda,
            docClient: mocDocClient
        } = awsPlatformAdaptee.stubAwsServices(path.resolve(mockDataDir, 'aws-api')));

        const spySaveSettingItem = Sinon.spy(awsPlatformAdapter, 'saveSettingItem');

        // change the s3 root dir
        mockS3.rootDir = mockDataDir;

        const settingsToSave: { [key: string]: string } = {};
        Object.values({ ...AwsFortiGateAutoscaleSetting }).forEach(value => {
            const settingKey = value.toLowerCase().replace(new RegExp('-', 'g'), '');
            settingsToSave[settingKey] = value;
            return settingsToSave;
        });

        const result = await autoscale.saveSettings(settingsToSave);
        // ASSERT: saveSettings() completes sucessfully without any error.
        Sinon.assert.match(result, true);
        // ASSERT: saveSettings() completes sucessfully without any error.
        Sinon.assert.match(spySaveSettingItem.threw(), false);
        // ASSERT: each key has been processed and saved.
        const savedKeys = await Promise.all(spySaveSettingItem.returnValues);
        const keyNotSaved = Object.values(settingsToSave).filter(value => {
            return !savedKeys.includes(value);
        });
        if (savedKeys.length !== Object.keys(settingsToSave).length) {
            console.log('The following keys not processed: ', keyNotSaved);
        }
        Sinon.assert.match(savedKeys.length, Object.keys(settingsToSave).length);
    });
});
