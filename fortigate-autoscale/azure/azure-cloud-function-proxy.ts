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
    log(message: string, level: LogLevel, ...others: unknown[]): void {
        if (process.env.DEBUG_LOGGER_OUTPUT_QUEUE_ENABLED === 'true') {
            this.enqueue(message, level, ...others);
            return;
        }
        switch (level) {
            case LogLevel.Debug:
                this.context.log(message, ...others);
                break;
            case LogLevel.Error:
                this.context.log.error(message, ...others);
                break;
            case LogLevel.Info:
                this.context.log.info(message, ...others);
                break;
            case LogLevel.Warn:
                this.context.log.warn(message, ...others);
                break;
            default:
                this.context.log.error(message, ...others);
        }
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
        // NOTE: if enable queued log output, output log here
        if (process.env.DEBUG_LOGGER_OUTPUT_QUEUE_ENABLED === 'true') {
            const messages: unknown[] = [];
            this.allLogs.forEach(log => {
                messages.push(`[${log.level}]`);
                messages.push(...log.arguments);
                messages.push('\n');
            });
            this.context.log(...messages);
        }
        return {
            status: httpStatusCode,
            body: body
        };
    }

    getReqBody(): Promise<JSONable> {
        try {
            if (this.context.req.body && typeof this.context.req.body === 'string') {
                return JSON.parse(this.context.req.body as string);
            } else if (this.context.req.body && typeof this.context.req.body === 'object') {
                return Promise.resolve({ ...this.context.req.body });
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
