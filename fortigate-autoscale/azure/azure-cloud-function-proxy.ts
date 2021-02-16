import { Context, HttpRequest } from '@azure/functions';
import {
    CloudFunctionProxy,
    CloudFunctionResponseBody,
    LogLevel,
    mapHttpMethod,
    ReqHeaders,
    ReqMethod
} from '../../cloud-function-proxy';
import { jsonStringifyReplacer } from '../../helper-function';
import { JSONable } from '../../jsonable';

export interface AzureFunctionResponse {
    status: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any;
}

export interface LogItem {
    level: LogLevel;
    timestamp: number;
    arguments?: unknown[];
}

export class AzureFunctionInvocationProxy extends CloudFunctionProxy<
    HttpRequest,
    Context,
    AzureFunctionResponse
> {
    request: HttpRequest;
    context: Context;
    private messageQueue: LogItem[] = [];
    log(message: string, level: LogLevel, ...optionalParams: unknown[]): void {
        switch (level) {
            case LogLevel.Debug:
                if (process.env.DEBUG_MODE === 'true') {
                    console.debug(message, ...optionalParams);
                } else {
                    console.debug(
                        'Debug level log is disabled. To view debug level logs, please' +
                            " add the process environment variable 'DEBUG_MODE' with value 'true'.",
                        ...optionalParams
                    );
                }
                break;
            case LogLevel.Error:
                console.error(message, ...optionalParams);
                break;
            case LogLevel.Info:
                console.info(message, ...optionalParams);
                break;
            case LogLevel.Warn:
                console.warn(message, ...optionalParams);
                break;
            default:
                console.log(message, ...optionalParams);
        }
        this.enqueue(message, level, ...optionalParams);
    }

    /**
     * return a formatted AWS Lambda handler response
     * @param  {number} httpStatusCode http status code
     * @param  {CloudFunctionResponseBody} body response body
     * @param  {{}} headers response header
     * @returns {AzureFunctionResponse} function response
     */
    formatResponse(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        httpStatusCode: number,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        body: CloudFunctionResponseBody,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        headers: {}
    ): AzureFunctionResponse {
        return {
            status: httpStatusCode,
            body: body
        };
    }

    getReqBody(): Promise<JSONable> {
        try {
            if (this.context.req && typeof this.context.req === 'string') {
                return JSON.parse(this.context.req as string);
            } else if (this.context.req && typeof this.context.req === 'object') {
                return Promise.resolve({ ...this.request });
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    getRequestAsString(): Promise<string> {
        return Promise.resolve(this.context.req && JSON.stringify(this.context.req));
    }

    getRemainingExecutionTime(): Promise<number> {
        throw new Error(
            'Not supposed to call the AzureFunctionInvocationProxy.getRemainingExecutionTime()' +
                ' method in this implementation.' +
                ' Is it just a mistake?'
        );
    }

    getReqHeaders(): Promise<ReqHeaders> {
        // NOTE: header keys will be treated case-insensitive as per
        // the RFC https://tools.ietf.org/html/rfc7540#section-8.1.2
        const headers: ReqHeaders = (this.context.req.headers && {}) || null;
        if (this.context.req.headers) {
            Object.entries(this.context.req.headers).forEach(([k, v]) => {
                headers[String(k).toLowerCase()] = v;
            });
        }
        return Promise.resolve(headers);
    }

    getReqMethod(): Promise<ReqMethod> {
        return Promise.resolve(mapHttpMethod(this.context.req.method));
    }

    getReqQueryParameters(): Promise<{ [name: string]: string }> {
        return Promise.resolve(this.context.req.params);
    }

    protected enqueue(message: string, level: LogLevel, ...args: unknown[]): void {
        const item: LogItem = {
            level: level,
            timestamp: Date.now() + new Date().getTimezoneOffset() * 60000, // GMT time in ms
            arguments: []
        };
        item.arguments = Array.from(args).map(arg => {
            return JSON.stringify(arg, jsonStringifyReplacer);
        });
        item.arguments.unshift(message);
        this.messageQueue.push(item);
    }

    get allLogs(): LogItem[] {
        return this.messageQueue;
    }
}
