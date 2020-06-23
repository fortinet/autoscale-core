import { JSONable } from '../../jsonable';

export interface AwsLambdaInvocationPayload extends JSONable {
    invocable: string;
    invocationSecretKey: string;
}

export const AwsTgwLambdaInvocable: { [key: string]: string } = {
    UpdateTgwAttachmentRoutTable: 'UpdateTgwAttachmentRoutTable'
};
