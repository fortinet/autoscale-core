import {
    CloudFunctionInvocationPayload,
    CloudFunctionInvocationTimeOutError,
    FortiGateAutoscaleFunctionInvocable
} from './index';

export type AzureFunctionInvocationPayload = CloudFunctionInvocationPayload;

export type AzureFunctionInvocableExecutionTimeOutError = CloudFunctionInvocationTimeOutError;

export const AzureFunctionInvocable = {
    ...FortiGateAutoscaleFunctionInvocable
};
