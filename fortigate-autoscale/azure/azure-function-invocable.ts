import {
    CloudFunctionInvocationPayload,
    CloudFunctionInvocationTimeOutError,
    FortiGateAutoscaleFunctionInvocable
} from '..';

export type AzureFunctionInvocationPayload = CloudFunctionInvocationPayload;

export type AzureFunctionInvocableExecutionTimeOutError = CloudFunctionInvocationTimeOutError;

export const AzureFunctionInvocable = {
    ...FortiGateAutoscaleFunctionInvocable
};
