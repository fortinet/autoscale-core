import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, ScheduledEvent } from 'aws-lambda';

import {
    CloudFunctionProxy,
    CloudFunctionResponseBody,
    LogLevel,
    ReqBody,
    ReqHeaders,
    ReqMethod
} from '../../cloud-function-proxy';

import { mapHttpMethod } from '../../autoscale-core';

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
    getReqBody(): ScheduledEvent {
        return this.request;
    }
    getRequestAsString(): string {
        return JSON.stringify(this.request);
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
    getRequestAsString(): string {
        return JSON.stringify(this.request);
    }
    getReqBody(): ReqBody {
        let body: ReqBody;
        try {
            body = (this.request.body && JSON.parse(this.request.body)) || {};
        } catch (error) {}
        return body;
    }
    getReqHeaders(): ReqHeaders {
        const headers: ReqHeaders = { ...this.request.headers };
        return headers;
    }
    getReqMethod(): ReqMethod {
        return mapHttpMethod(this.request.httpMethod);
    }
}
