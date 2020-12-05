import { Context, ScheduledEvent } from 'aws-lambda';
import { ReqType } from '../../cloud-function-proxy';
import { FazIntegrationServiceProvider } from '../../autoscale-core';
import { AwsScheduledEventProxy } from './aws-cloud-function-proxy';
import { AwsFortiGateAutoscale } from './aws-fortigate-autoscale';
import { AwsPlatformAdapter } from './aws-platform-adapter';

export interface FazAuthorizationServiceDetail {
    ServiceType: FazAuthorizationServiceType;
    ServiceToken: string;
}

export type FazAuthorizationServiceType = 'triggerFazDeviceAuth' | string;
export type FazAuthorizationEventSource = 'fortinet.autoscale' | string;

export class AwsFortiGateAutoscaleFazIntegrationServiceProvider
    implements FazIntegrationServiceProvider<ScheduledEvent<FazAuthorizationServiceDetail>, void> {
    constructor(
        readonly autoscale: AwsFortiGateAutoscale<
            ScheduledEvent<FazAuthorizationServiceDetail>,
            Context,
            void
        >
    ) {
        this.autoscale = autoscale;
    }
    get proxy(): AwsScheduledEventProxy {
        return this.autoscale.proxy as AwsScheduledEventProxy;
    }
    get platform(): AwsPlatformAdapter {
        return this.autoscale.platform;
    }
    async handleServiceRequest(): Promise<void> {
        this.proxy.logAsInfo('calling handleServiceRequest');
        try {
            const reqType: ReqType = await this.platform.getRequestType();
            this.proxy.logAsInfo(`RequestBody ${this.proxy.getReqBody()}`);
            // NOTE: source now supports 'fortinet.autoscale' only
            const source: FazAuthorizationEventSource = this.proxy.getReqBody().source;
            // NOTE: detail must be type: FazAuthorizationServiceDetail
            const serviceDetail: FazAuthorizationServiceDetail = {
                ServiceType: undefined,
                ServiceToken: undefined
            };
            Object.assign(serviceDetail, this.proxy.getReqBody().detail || {});
            if (serviceDetail.ServiceToken !== this.proxy.context.invokedFunctionArn) {
                throw new Error(`Invalid ServiceToken: ${serviceDetail.ServiceToken}.`);
            }
            if (source === 'fortinet.autoscale' && reqType === ReqType.ServiceProviderRequest) {
                switch (serviceDetail.ServiceType) {
                    case 'triggerFazDeviceAuth':
                        await this.autoscale.init();
                        await this.autoscale.triggerFazDeviceAuth();
                        break;
                    case undefined:
                    default:
                        throw new Error(`Unsupported service type: [${serviceDetail.ServiceType}]`);
                }
            } else {
                this.proxy.logAsWarning('Not a service provider request.');
                this.proxy.logAsInfo('called handleServiceRequest');
            }
        } catch (error) {
            this.proxy.logForError('Handle service request error.', error);
            this.proxy.logAsInfo('called handleServiceRequest');
        }
    }
}
