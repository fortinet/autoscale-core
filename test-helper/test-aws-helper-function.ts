import {
    APIGatewayProxyEvent,
    Context,
    APIGatewayProxyResult,
    ScheduledEvent,
    CloudFormationCustomResourceEvent
} from 'aws-lambda';
import {
    TestAwsFortiGateAutoscale,
    TestAwsTgwFortiGateAutoscale
} from './test-aws-fortigate-autoscale';
import { AutoscaleEnvironment, AwsPlatformAdapter } from '../index';
import { TestAwsPlatformAdaptee } from './test-aws-platform-adaptee';
import { TestAwsApiGatewayEventProxy } from './test-aws-api-gateway-event-proxy';
import { TestAwsScheduledEventProxy } from './test-aws-scheduled-event-proxy';
import { AwsFortiGateAutoscaleServiceProvider } from '../fortigate-autoscale/aws/aws-fortigate-autoscale-service';
import { AwsCloudFormationCustomResourceEventProxy } from '../fortigate-autoscale/aws/aws-cloud-function-proxy';

export const createAwsApiGatewayEventHandler = (
    event: APIGatewayProxyEvent,
    context: Context
): {
    autoscale: TestAwsFortiGateAutoscale<APIGatewayProxyEvent, Context, APIGatewayProxyResult>;
    env: AutoscaleEnvironment;
    platformAdaptee: TestAwsPlatformAdaptee;
    platformAdapter: AwsPlatformAdapter;
    proxy: TestAwsApiGatewayEventProxy;
} => {
    const env = {} as AutoscaleEnvironment;
    const proxy = new TestAwsApiGatewayEventProxy(event, context);
    const p = new TestAwsPlatformAdaptee();
    const pa = new AwsPlatformAdapter(p, proxy);
    const autoscale = new TestAwsFortiGateAutoscale<
        APIGatewayProxyEvent,
        Context,
        APIGatewayProxyResult
    >(pa, env, proxy);
    return {
        autoscale: autoscale,
        env: env,
        platformAdaptee: p,
        platformAdapter: pa,
        proxy: proxy
    };
};

export const createAwsTgwApiGatewayEventHandler = (
    event: APIGatewayProxyEvent,
    context: Context
): {
    autoscale: TestAwsTgwFortiGateAutoscale<APIGatewayProxyEvent, Context, APIGatewayProxyResult>;
    env: AutoscaleEnvironment;
    platformAdaptee: TestAwsPlatformAdaptee;
    platformAdapter: AwsPlatformAdapter;
    proxy: TestAwsApiGatewayEventProxy;
} => {
    const env = {} as AutoscaleEnvironment;
    const proxy = new TestAwsApiGatewayEventProxy(event, context);
    const p = new TestAwsPlatformAdaptee();
    const pa = new AwsPlatformAdapter(p, proxy);
    const autoscale = new TestAwsTgwFortiGateAutoscale<
        APIGatewayProxyEvent,
        Context,
        APIGatewayProxyResult
    >(pa, env, proxy);
    return {
        autoscale: autoscale,
        env: env,
        platformAdaptee: p,
        platformAdapter: pa,
        proxy: proxy
    };
};

export const createTestAwsScheduledEventHandler = (
    event: ScheduledEvent,
    context: Context
): {
    autoscale: TestAwsFortiGateAutoscale<ScheduledEvent, Context, void>;
    env: AutoscaleEnvironment;
    platformAdaptee: TestAwsPlatformAdaptee;
    platformAdapter: AwsPlatformAdapter;
    proxy: TestAwsScheduledEventProxy;
} => {
    const env = {} as AutoscaleEnvironment;
    const proxy = new TestAwsScheduledEventProxy(event, context);
    const p = new TestAwsPlatformAdaptee();
    const pa = new AwsPlatformAdapter(p, proxy);
    const autoscale = new TestAwsFortiGateAutoscale<ScheduledEvent, Context, void>(pa, env, proxy);
    return {
        autoscale: autoscale,
        env: env,
        platformAdaptee: p,
        platformAdapter: pa,
        proxy: proxy
    };
};

export const createTestAwsApiGatewayEventHandler = (
    event: APIGatewayProxyEvent,
    context: Context
): {
    autoscale: TestAwsFortiGateAutoscale<APIGatewayProxyEvent, Context, APIGatewayProxyResult>;
    env: AutoscaleEnvironment;
    platformAdaptee: TestAwsPlatformAdaptee;
    platformAdapter: AwsPlatformAdapter;
    proxy: TestAwsApiGatewayEventProxy;
} => {
    const env = {} as AutoscaleEnvironment;
    const proxy = new TestAwsApiGatewayEventProxy(event, context);
    const p = new TestAwsPlatformAdaptee();
    const pa = new AwsPlatformAdapter(p, proxy);
    const autoscale = new TestAwsFortiGateAutoscale<
        APIGatewayProxyEvent,
        Context,
        APIGatewayProxyResult
    >(pa, env, proxy);
    return {
        autoscale: autoscale,
        env: env,
        platformAdaptee: p,
        platformAdapter: pa,
        proxy: proxy
    };
};

export const createTestAwsTgwScheduledEventHandler = (
    event: ScheduledEvent,
    context: Context
): {
    autoscale: TestAwsTgwFortiGateAutoscale<ScheduledEvent, Context, void>;
    env: AutoscaleEnvironment;
    platformAdaptee: TestAwsPlatformAdaptee;
    platformAdapter: AwsPlatformAdapter;
    proxy: TestAwsScheduledEventProxy;
} => {
    const env = {} as AutoscaleEnvironment;
    const proxy = new TestAwsScheduledEventProxy(event, context);
    const p = new TestAwsPlatformAdaptee();
    const pa = new AwsPlatformAdapter(p, proxy);
    const autoscale = new TestAwsTgwFortiGateAutoscale<ScheduledEvent, Context, void>(
        pa,
        env,
        proxy
    );
    return {
        autoscale: autoscale,
        env: env,
        platformAdaptee: p,
        platformAdapter: pa,
        proxy: proxy
    };
};

export const createAwsCloudFormationCustomResourceEventHandler = (
    event: CloudFormationCustomResourceEvent,
    context: Context
): {
    autoscale: TestAwsFortiGateAutoscale<CloudFormationCustomResourceEvent, Context, void>;
    env: AutoscaleEnvironment;
    platformAdaptee: TestAwsPlatformAdaptee;
    platformAdapter: AwsPlatformAdapter;
    proxy: AwsCloudFormationCustomResourceEventProxy;
    serviceProvider: AwsFortiGateAutoscaleServiceProvider;
} => {
    const env = {} as AutoscaleEnvironment;
    const proxy = new AwsCloudFormationCustomResourceEventProxy(event, context);
    const p = new TestAwsPlatformAdaptee();
    const pa = new AwsPlatformAdapter(p, proxy);
    const autoscale = new TestAwsFortiGateAutoscale<
        CloudFormationCustomResourceEvent,
        Context,
        void
    >(pa, env, proxy);
    const serviceProvider: AwsFortiGateAutoscaleServiceProvider = new AwsFortiGateAutoscaleServiceProvider(
        autoscale
    );
    return {
        autoscale: autoscale,
        env: env,
        platformAdaptee: p,
        platformAdapter: pa,
        proxy: proxy,
        serviceProvider: serviceProvider
    };
};
