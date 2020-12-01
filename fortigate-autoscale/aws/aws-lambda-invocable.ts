import { JSONable } from '../../jsonable';

export interface AwsLambdaInvocationPayload extends JSONable {
    invocable: string;
    invocationSecretKey: string;
    executionTime?: number;
}

export class AwsLambdaInvocableExecutionTimeOutError extends Error {
    extendExecution: boolean;
    constructor(message?: string, extendExecution = false) {
        super(message);
        this.extendExecution = extendExecution;
    }
}

export enum AwsLambdaInvocable {
    UpdateTgwAttachmentRouteTable = 'UpdateTgwAttachmentRouteTable',
    RegisterDeviceInFortiAnalyzer = 'RegisterDeviceInFortiAnalyzer'
}
