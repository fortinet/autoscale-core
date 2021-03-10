import {
    CloudFunctionInvocationPayload,
    CloudFunctionInvocationTimeOutError,
    FortiGateAutoscaleFunctionInvocable
} from '@fortinet/fortigate-autoscale';

export type AzureFunctionInvocationPayload = CloudFunctionInvocationPayload;

export type AzureFunctionInvocableExecutionTimeOutError = CloudFunctionInvocationTimeOutError;

export const AzureFunctionInvocable = {
    ...FortiGateAutoscaleFunctionInvocable
};
