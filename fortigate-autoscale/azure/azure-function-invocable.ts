import { FortiGateAutoscaleFunctionInvocable } from '../fortigate-autoscale-function-invocation';
import {
    CloudFunctionInvocationPayload,
    CloudFunctionInvocationTimeOutError
} from '../../cloud-function-peer-invocation';

export type AzureFunctionInvocationPayload = CloudFunctionInvocationPayload;

export type AzureFunctionInvocableExecutionTimeOutError = CloudFunctionInvocationTimeOutError;

export const AzureFunctionInvocable = {
    ...FortiGateAutoscaleFunctionInvocable
};
