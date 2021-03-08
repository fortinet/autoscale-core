import { AutoscaleServiceType } from './index';

// all supported FortiGate Autoscale Service type
export const FortiGateAutoscaleServiceType = {
    ...AutoscaleServiceType,
    RegisterFortiAnalyzer: 'registerFortiAnalyzer',
    TriggerFazDeviceAuth: 'triggerFazDeviceAuth'
};
export enum FortiGateAutoscaleServiceRequestSource {
    FortiGateAutoscale = 'fortinet.autoscale'
}
