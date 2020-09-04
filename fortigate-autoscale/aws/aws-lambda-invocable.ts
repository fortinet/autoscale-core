import { JSONable } from '../../jsonable';

export interface AwsLambdaInvocationPayload extends JSONable {
    invocable: string;
    invocationSecretKey: string;
    executionTime?: number;
}

export class AwsLambdaInvocableExecutionTimeOutError extends Error {}

export const AwsTgwLambdaInvocable: { [key: string]: string } = {
    UpdateTgwAttachmentRouteTable: 'UpdateTgwAttachmentRouteTable'
};
