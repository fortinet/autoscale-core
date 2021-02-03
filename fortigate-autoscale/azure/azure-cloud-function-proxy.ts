import { Context } from '@azure/functions';
import {
    CloudFunctionProxy,
    CloudFunctionResponseBody,
    LogLevel,
    mapHttpMethod,
    ReqHeaders,
    ReqMethod
} from '../../cloud-function-proxy';
import { JSONable } from '../../jsonable';

export interface AzureFunctionResponse {
    status: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any;
}

export class AzureFunctionInvocationProxy extends CloudFunctionProxy<
    JSONable,
    Context,
    AzureFunctionResponse
> {
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
                return Promise.resolve(this.request);
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
        return Promise.resolve(this.context.req.headers);
    }

    getReqMethod(): Promise<ReqMethod> {
        return Promise.resolve(mapHttpMethod(this.context.req.method));
    }

    getReqQueryParameters(): Promise<{ [name: string]: string }> {
        return Promise.resolve(this.context.req.params);
    }
}
