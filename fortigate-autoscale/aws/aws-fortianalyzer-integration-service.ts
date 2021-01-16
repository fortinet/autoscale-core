import { Context, ScheduledEvent } from 'aws-lambda';

import { FazIntegrationServiceProvider } from '../../autoscale-core';
import { ReqType } from '../../cloud-function-proxy';
import { AwsScheduledEventProxy } from './aws-cloud-function-proxy';
import { AwsFortiGateAutoscale } from './aws-fortigate-autoscale';
import { AwsPlatformAdapter } from './aws-platform-adapter';

export interface AwsFazAuthorizationServiceDetail {
    ServiceType: AwsFazAuthorizationServiceType;
    ServiceToken: string;
}

export interface AwsFazAuthorizationServiceEvent {
    source: AwsFazAuthorizationEventSource;
    'detail-type': AwsFazAuthorizationEventDetailType;
    detail: AwsFazAuthorizationServiceDetail;
}

export type AwsFazAuthorizationServiceType = 'triggerFazDeviceAuth' | string;
export type AwsFazAuthorizationEventSource = 'fortinet.autoscale' | string;
export type AwsFazAuthorizationEventDetailType = 'FortiAnalyzer Authorization Request' | string;

export class AwsFortiGateAutoscaleFazIntegrationServiceProvider
    implements FazIntegrationServiceProvider<AwsFazAuthorizationServiceEvent, void> {
    constructor(
        readonly autoscale: AwsFortiGateAutoscale<
            ScheduledEvent<AwsFazAuthorizationServiceDetail>,
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
            // NOTE: source now supports 'fortinet.autoscale' only
            const source: AwsFazAuthorizationEventSource = this.proxy.getReqBody().source;
            // NOTE: detail must be type: FazAuthorizationServiceDetail
            const serviceDetail: AwsFazAuthorizationServiceDetail = {
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
