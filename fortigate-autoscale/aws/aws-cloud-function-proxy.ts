import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
    CloudFormationCustomResourceEvent,
    Context,
    ScheduledEvent
} from 'aws-lambda';

import {
    CloudFunctionProxy,
    CloudFunctionResponseBody,
    LogLevel,
    mapHttpMethod,
    ReqBody,
    ReqHeaders,
    ReqMethod
} from '../../cloud-function-proxy';
import { JSONable } from '../../jsonable';
import * as AwsCfnResponse from './aws-cfn-response';

export class AwsScheduledEventProxy extends CloudFunctionProxy<
    ScheduledEvent,
    Context,
    { [key: string]: unknown }
> {
    request: ScheduledEvent;
    context: Context;
    log(message: string, level: LogLevel): void {
        switch (level) {
            case LogLevel.Debug:
                console.debug(message);
                break;
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     * @returns {{}} empty object
     */
    formatResponse(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        httpStatusCode: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        body: CloudFunctionResponseBody,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        headers: {}
    ): { [key: string]: unknown } {
        return {};
    }
    getReqBody(): Promise<ScheduledEvent> {
        return Promise.resolve(this.request);
    }
    getRequestAsString(): Promise<string> {
        return Promise.resolve(JSON.stringify(this.request));
    }
    getRemainingExecutionTime(): Promise<number> {
        return Promise.resolve(this.context.getRemainingTimeInMillis());
    }

    getReqHeaders(): Promise<ReqHeaders> {
        return Promise.resolve({});
    }
    getReqMethod(): Promise<ReqMethod> {
        return Promise.resolve(null);
    }
}

export class AwsApiGatewayEventProxy extends CloudFunctionProxy<
    APIGatewayProxyEvent,
    Context,
    APIGatewayProxyResult
> {
    request: APIGatewayProxyEvent;
    context: Context;
    log(message: string, level: LogLevel): void {
        switch (level) {
            case LogLevel.Debug:
                if (process.env.DEBUG_MODE === 'true') {
                    console.debug(message);
                } else {
                    console.debug(
                        'Debug level log is disabled. To view debug level logs, please' +
                            " add the process environment variable 'DEBUG_MODE' with value 'true'."
                    );
                }
                break;
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     * @returns {APIGatewayProxyResult} response
     */
    formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers?: { [key: string]: string }
    ): APIGatewayProxyResult {
        return {
            statusCode: httpStatusCode,
            headers: headers,
            body: (typeof body === 'string' && body) || JSON.stringify(body),
            isBase64Encoded: false
        };
    }
    getRequestAsString(): Promise<string> {
        return Promise.resolve(JSON.stringify(this.request));
    }
    getReqBody(): Promise<ReqBody> {
        let body: ReqBody;
        try {
            body = (this.request.body && JSON.parse(this.request.body)) || {};
        } catch (error) {}
        return Promise.resolve(body || {});
    }
    getReqHeaders(): Promise<ReqHeaders> {
        const headers: ReqHeaders = { ...this.request.headers };
        return Promise.resolve(headers);
    }
    getReqMethod(): Promise<ReqMethod> {
        return Promise.resolve(mapHttpMethod(this.request.httpMethod));
    }
    getRemainingExecutionTime(): Promise<number> {
        return Promise.resolve(this.context.getRemainingTimeInMillis());
    }
}

export enum AwsCloudFormationCustomResourceEventResponseStatus {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED'
}
export interface AwsCloudFormationCustomResourceEventResponse {
    status: AwsCloudFormationCustomResourceEventResponseStatus;
    data: {};
}
export class AwsCloudFormationCustomResourceEventProxy extends CloudFunctionProxy<
    CloudFormationCustomResourceEvent,
    Context,
    void
> {
    request: CloudFormationCustomResourceEvent;
    context: Context;
    log(message: string, level: LogLevel): void {
        switch (level) {
            case LogLevel.Debug:
                if (process.env.DEBUG_MODE === 'true') {
                    console.debug(message);
                } else {
                    console.debug(
                        'Debug level log is disabled. To view debug level logs, please' +
                            " add the process environment variable 'DEBUG_MODE' with value 'true'."
                    );
                }
                break;
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     */
    formatResponse(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        httpStatusCode: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        body: CloudFunctionResponseBody,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        headers: {}
    ): AwsCloudFormationCustomResourceEventResponse {
        throw new Error('Not supposed to call the formatResponse method in this implementation.');
    }
    getReqBody(): Promise<CloudFormationCustomResourceEvent> {
        return Promise.resolve(this.request);
    }
    getRequestAsString(): Promise<string> {
        return Promise.resolve(JSON.stringify(this.request));
    }

    async sendResponse(successful?: boolean, data?: JSONable): Promise<void> {
        await AwsCfnResponse.send(
            this.request,
            this.context,
            (successful && AwsCfnResponse.ResponseStatus.SUCCESS) ||
                AwsCfnResponse.ResponseStatus.FAILED,
            data || {}
        );
    }
    getRemainingExecutionTime(): Promise<number> {
        return Promise.resolve(this.context.getRemainingTimeInMillis());
    }

    getReqHeaders(): Promise<ReqHeaders> {
        return Promise.resolve({});
    }
    getReqMethod(): Promise<ReqMethod> {
        return Promise.resolve(null);
    }
}

export class AwsLambdaInvocationProxy extends CloudFunctionProxy<JSONable, Context, void> {
    request: JSONable;
    context: Context;
    log(message: string, level: LogLevel): void {
        switch (level) {
            case LogLevel.Debug:
                if (process.env.DEBUG_MODE === 'true') {
                    console.debug(message);
                } else {
                    console.debug(
                        'Debug level log is disabled. To view debug level logs, please' +
                            " add the process environment variable 'DEBUG_MODE' with value 'true'."
                    );
                }
                break;
            case LogLevel.Error:
                console.error(message);
                break;
            case LogLevel.Info:
                console.info(message);
                break;
            case LogLevel.Warn:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     */
    formatResponse(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        httpStatusCode: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        body: CloudFunctionResponseBody,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        headers: {}
    ): {} {
        throw new Error('Not supposed to call the formatResponse method in this implementation.');
    }

    getReqBody(): Promise<JSONable> {
        try {
            if (typeof this.request === 'string') {
                return JSON.parse(this.request as string);
            } else if (typeof this.request === 'object') {
                return Promise.resolve(this.request);
            } else {
                return Promise.resolve({});
            }
        } catch (error) {
            return Promise.resolve({});
        }
    }

    getRequestAsString(): Promise<string> {
        return Promise.resolve(JSON.stringify(this.request));
    }

    getRemainingExecutionTime(): Promise<number> {
        return Promise.resolve(this.context.getRemainingTimeInMillis());
    }

    getReqHeaders(): Promise<ReqHeaders> {
        return Promise.resolve({});
    }
    getReqMethod(): Promise<ReqMethod> {
        return Promise.resolve(null);
    }
}
