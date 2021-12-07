import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import {
    AwsCloudFormationCustomResourceEventProxy,
    AwsFortiGateAutoscale,
    AwsFortiGateAutoscaleSetting,
    AwsFortiGateAutoscaleSettingItemDictionary,
    AwsPlatformAdapter
} from '.';
import {
    AutoscaleServiceProvider,
    FortiGateAutoscaleServiceType,
    NicAttachmentStrategyResult,
    ReqType,
    VpnAttachmentStrategyResult
} from '..';

export const AwsFortiGateAutoscaleServiceType = {
    ...FortiGateAutoscaleServiceType,
    InitiateAutoscale: 'initiateAutoscale'
};
export interface AwsFortiGateAutoscaleServiceEventBase {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ServiceToken: string;
}

export interface AwsFortiGateAutoscaleServiceEventStartAutoscale
    extends AwsFortiGateAutoscaleServiceEventBase {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ServiceType: 'initiateAutoscale' | 'startAutoscale';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    DesireCapacity?: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    MinSize?: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    MaxSize?: number;
}

export interface AwsFortiGateAutoscaleServiceEventStopAutoscale
    extends AwsFortiGateAutoscaleServiceEventBase {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ServiceType: 'stopAutoscale';
}

export interface AwsFortiGateAutoscaleServiceEventSaveSettings
    extends AwsFortiGateAutoscaleServiceEventBase {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ServiceType: 'saveSettings';
    [key: string]: string;
}

export interface AwsFortiGateAutoscaleServiceEventRegisterFortiAnalyzer
    extends AwsFortiGateAutoscaleServiceEventBase {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ServiceType: 'registerFortiAnalyzer';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    InstanceId?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    PrivateIp?: string;
}

export interface AwsFortiGateAutoscaleServiceEventTriggerFazDeviceAuth
    extends AwsFortiGateAutoscaleServiceEventBase {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ServiceType: 'triggerFazDeviceAuth';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    InstanceId?: string;
}

export interface AwsFortiGateAutoscaleServiceEventUnknown
    extends AwsFortiGateAutoscaleServiceEventBase {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ServiceType: undefined;
    [key: string]: string;
}

export type AwsFortiGateAutoscaleServiceEvent =
    | AwsFortiGateAutoscaleServiceEventStartAutoscale
    | AwsFortiGateAutoscaleServiceEventStopAutoscale
    | AwsFortiGateAutoscaleServiceEventSaveSettings
    | AwsFortiGateAutoscaleServiceEventRegisterFortiAnalyzer
    | AwsFortiGateAutoscaleServiceEventTriggerFazDeviceAuth
    | AwsFortiGateAutoscaleServiceEventUnknown;

export class AwsFortiGateAutoscaleCfnServiceProvider
    implements AutoscaleServiceProvider<CloudFormationCustomResourceEvent, void> {
    autoscale: AwsFortiGateAutoscale<CloudFormationCustomResourceEvent, Context, void>;
    constructor(
        autoscale: AwsFortiGateAutoscale<CloudFormationCustomResourceEvent, Context, void>
    ) {
        this.autoscale = autoscale;
    }
    get proxy(): AwsCloudFormationCustomResourceEventProxy {
        return this.autoscale.proxy as AwsCloudFormationCustomResourceEventProxy;
    }
    get platform(): AwsPlatformAdapter {
        return this.autoscale.platform;
    }
    async handleServiceRequest(): Promise<void> {
        this.proxy.logAsInfo('calling handleServiceRequest');
        try {
            const reqType: ReqType = await this.platform.getRequestType();
            const serviceEventType: string = (await this.proxy.getReqBody()).RequestType;
            const serviceEvent: AwsFortiGateAutoscaleServiceEvent = {
                ServiceType: undefined,
                ServiceToken: undefined
            };
            Object.assign(serviceEvent, (await this.proxy.getReqBody()).ResourceProperties || {});
            this.proxy.logAsInfo(
                `RequestType: ${this.proxy.request.RequestType}, serviceType: ${serviceEvent.ServiceType}`
            );
            if (reqType === ReqType.ServiceProviderRequest) {
                switch (serviceEventType) {
                    case 'Create':
                    case 'Update':
                        switch (serviceEvent.ServiceType) {
                            case AwsFortiGateAutoscaleServiceType.InitiateAutoscale:
                            case AwsFortiGateAutoscaleServiceType.StartAutoscale:
                                await this.autoscale.init();
                                await this.startAutoscale();
                                break;
                            case AwsFortiGateAutoscaleServiceType.SaveAutoscaleSettings:
                                await this.saveAutoscaleSettings(
                                    serviceEvent as AwsFortiGateAutoscaleServiceEventSaveSettings
                                );
                                break;
                            case AwsFortiGateAutoscaleServiceType.StopAutoscale:
                                this.proxy.logAsWarning(
                                    `ServiceType: [${serviceEvent.ServiceType}] is skipped in ` +
                                        `the RequestType: [${serviceEventType}]`
                                );
                                break;
                            case AwsFortiGateAutoscaleServiceType.RegisterFortiAnalyzer:
                                await this.autoscale.init();
                                await this.registerFortiAnalyzer(
                                    serviceEvent as AwsFortiGateAutoscaleServiceEventRegisterFortiAnalyzer
                                );
                                break;
                            case undefined:
                            default:
                                throw new Error(
                                    `Unsupported service type: [${serviceEvent.ServiceType}]`
                                );
                        }
                        break;
                    case 'Delete':
                        switch (serviceEvent.ServiceType) {
                            case AwsFortiGateAutoscaleServiceType.InitiateAutoscale:
                            case AwsFortiGateAutoscaleServiceType.StartAutoscale:
                            case AwsFortiGateAutoscaleServiceType.SaveAutoscaleSettings:
                            case AwsFortiGateAutoscaleServiceType.RegisterFortiAnalyzer:
                                this.proxy.logAsWarning(
                                    `ServiceType: [${serviceEvent.ServiceType}] is skipped in ` +
                                        `the RequestType: [${serviceEventType}]`
                                );
                                break;
                            case AwsFortiGateAutoscaleServiceType.StopAutoscale:
                                await this.autoscale.init();
                                await this.stopAutoscale();
                                break;
                            case undefined:
                            default:
                                throw new Error(
                                    `Unsupported service type: [${serviceEvent.ServiceType}]`
                                );
                        }
                        break;
                    default:
                        throw new Error(`Unsupported RequestType: [${serviceEventType}]`);
                }
                await this.proxy.sendResponse(true);
            } else {
                this.proxy.logAsWarning('Not a service provider request.');
                this.proxy.logAsInfo('called handleServiceRequest');
                await this.proxy.sendResponse(false);
            }
        } catch (error) {
            this.proxy.logForError('Handle service request error.', error);
            this.proxy.logAsInfo('called handleServiceRequest');
            await this.proxy.sendResponse(false);
        }
    }
    async startAutoscale(): Promise<boolean> {
        this.proxy.logAsInfo('calling startAutoscale');
        const settings = await this.platform.getSettings();
        const byolGroupName = settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupName).value;
        const byolDesiredCapacity = Number(
            settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupDesiredCapacity).value
        );
        const byolMinSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupMinSize).value
        );
        const byolMaxSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.ByolScalingGroupMaxSize).value
        );
        const paygGroupName = settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupName).value;
        const paygDesiredCapacity = Number(
            settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupDesiredCapacity).value
        );
        const paygMinSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupMinSize).value
        );
        const paygMaxSize = Number(
            settings.get(AwsFortiGateAutoscaleSetting.PaygScalingGroupMaxSize).value
        );
        const startScalingGroup = async (
            groupName: string,
            desiredCapacity: number,
            minSize?: number,
            maxSize?: number
        ): Promise<boolean> => {
            await this.platform.updateScalingGroupSize(
                groupName,
                desiredCapacity,
                minSize,
                maxSize
            );
            return true;
        };
        const tasks: Promise<boolean>[] = [];
        if (byolGroupName) {
            tasks.push(
                startScalingGroup(
                    byolGroupName,
                    byolDesiredCapacity,
                    byolMinSize,
                    byolMaxSize
                ).catch(error => {
                    this.proxy.logForError('BYOL scaling group failed to start.', error);
                    return false;
                })
            );
        }
        if (paygGroupName) {
            tasks.push(
                startScalingGroup(
                    paygGroupName,
                    paygDesiredCapacity,
                    paygMinSize,
                    paygMaxSize
                ).catch(error => {
                    this.proxy.logForError('PAYG scaling group failed to start.', error);
                    return false;
                })
            );
        }
        const [s1, s2] = await Promise.all(tasks);
        this.proxy.logAsInfo('called startAutoscale');
        return s1 && s2;
    }

    async stopAutoscale(): Promise<boolean> {
        this.proxy.logAsInfo('calling stopAutoscale');
        const settings = await this.platform.getSettings();
        await this.autoscale.stopScalingGroup();
        const funcCleanupNic = async (): Promise<boolean> => {
            const enableNic2 = settings.get(AwsFortiGateAutoscaleSetting.EnableNic2).truthValue;
            if (enableNic2) {
                const cleanupNicResult = await this.autoscale.cleanupUnusedNic();
                if (cleanupNicResult !== NicAttachmentStrategyResult.Success) {
                    throw new Error(
                        'Failed to stop Autoscale. Please see the log messages before this one.'
                    );
                }
            }
            return true;
        };
        const funcCleanupVpn = async (): Promise<boolean> => {
            const enableVpn = settings.get(AwsFortiGateAutoscaleSetting.AwsEnableTransitGatewayVpn)
                .truthValue;
            if (enableVpn) {
                const cleanupVpnResult = await this.autoscale.cleanupUnusedVpn();
                if (cleanupVpnResult !== VpnAttachmentStrategyResult.Success) {
                    throw new Error(
                        'Failed to stop Autoscale. Please see the log messages before this one.'
                    );
                }
            }
            return true;
        };
        const [s1, s2] = await Promise.all([funcCleanupNic(), funcCleanupVpn()]);
        this.proxy.logAsInfo('called stopAutoscale');
        return s1 && s2;
    }

    /**
     * Save those setting values collected from the CloudFormation template deployment
     * into Autoscale system.
     * @param {AwsFortiGateAutoscaleServiceEventRegisterFortiAnalyzer} event the trigger event
     * for the certain FortiGate Autoscale service.
     */
    async saveAutoscaleSettings(
        event: AwsFortiGateAutoscaleServiceEventSaveSettings
    ): Promise<boolean> {
        this.proxy.logAsInfo('calling saveAutoscaleSettings');
        const props: { [key: string]: string } = { ...event };
        delete props.ServiceToken;
        delete props.ServiceType;
        await this.autoscale.saveSettings(props, AwsFortiGateAutoscaleSettingItemDictionary);
        this.proxy.logAsInfo('called saveAutoscaleSettings');
        return true;
    }

    /**
     * Register a FortiAnalyzer to the Autoscale system.
     * @param {AwsFortiGateAutoscaleServiceEventRegisterFortiAnalyzer} event the trigger event
     * for the certain FortiGate Autoscale service.
     */
    async registerFortiAnalyzer(
        event: AwsFortiGateAutoscaleServiceEventRegisterFortiAnalyzer
    ): Promise<boolean> {
        this.proxy.logAsInfo('calling registerFortiAnalyzer');
        const props: { [key: string]: string } = { ...event };
        delete props.ServiceToken;
        delete props.ServiceType;
        await this.autoscale.registerFortiAnalyzer(event.InstanceId, event.PrivateIp);
        this.proxy.logAsInfo('called registerFortiAnalyzer');
        return true;
    }
}
