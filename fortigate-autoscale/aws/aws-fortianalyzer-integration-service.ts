import { Context, ScheduledEvent } from 'aws-lambda';
import {
    AutoscaleServiceProvider,
    AwsFortiGateAutoscale,
    AwsPlatformAdapter,
    AwsScheduledEventProxy,
    FortiGateAutoscaleServiceRequestSource,
    ReqType
} from './index';

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

export class AwsFortiGateAutoscaleFortiGateAutoscaleServiceProvider
    implements AutoscaleServiceProvider<AwsFazAuthorizationServiceEvent, void> {
    constructor(
        readonly autoscale: AwsFortiGateAutoscale<
            ScheduledEvent<AwsFazAuthorizationServiceDetail>,
            Context,
            void
        >
    ) {
        this.autoscale = autoscale;
    }
    startAutoscale(): Promise<boolean> {
        this.autoscale.proxy.logAsWarning('[startAutoscale] Method not implemented.');
        return Promise.resolve(true);
    }
    stopAutoscale(): Promise<boolean> {
        this.autoscale.proxy.logAsWarning('[stopAutoscale] Method not implemented.');
        return Promise.resolve(true);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    saveAutoscaleSettings(props: { [key: string]: string }): Promise<boolean> {
        this.autoscale.proxy.logAsWarning('[SaveAutoscaleSettings] Method not implemented.');
        return Promise.resolve(true);
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
            const source: AwsFazAuthorizationEventSource = (await this.proxy.getReqBody()).source;
            // NOTE: detail must be type: FazAuthorizationServiceDetail
            const serviceDetail: AwsFazAuthorizationServiceDetail = {
                ServiceType: undefined,
                ServiceToken: undefined
            };
            Object.assign(serviceDetail, (await this.proxy.getReqBody()).detail || {});
            if (serviceDetail.ServiceToken !== this.proxy.context.invokedFunctionArn) {
                throw new Error(`Invalid ServiceToken: ${serviceDetail.ServiceToken}.`);
            }
            if (
                source === FortiGateAutoscaleServiceRequestSource.FortiGateAutoscale &&
                reqType === ReqType.ServiceProviderRequest
            ) {
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
