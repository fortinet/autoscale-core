export enum LogLevel {
    Log = 'Log',
    Info = 'Info',
    Warn = 'Warn',
    Error = 'Error',
    Debug = 'Debug'
}

export type CloudFunctionResponseBody = string | {};

export interface CloudFunctionProxyAdapter {
    formatResponse(httpStatusCode: number, body: CloudFunctionResponseBody, headers: {}): {};
    log(message: string, level: LogLevel): void;
    logAsDebug(message: string): void;
    logAsInfo(message: string): void;
    logAsWarning(message: string): void;
    logAsError(message: string): void;
    /**
     * Output an Error level message containing the given message prefix, the error.message
     * and error.stack of the given error.
     *
     * @param {string} messagePrefix
     * @param {Error | string} error
     * @memberof CloudFunctionProxyAdapter
     */
    logForError(messagePrefix: string, error: Error): void;
}

export abstract class CloudFunctionProxy<TReq, TContext, TRes>
    implements CloudFunctionProxyAdapter {
    request: TReq;
    context: TContext;
    constructor(req: TReq, context: TContext) {
        this.request = req;
        this.context = context;
    }
    abstract log(message: string, level: LogLevel): void;
    logAsDebug(message: string): void {
        this.log(message, LogLevel.Debug);
    }
    logAsError(message: string): void {
        this.log(message, LogLevel.Error);
    }
    logAsInfo(message: string): void {
        this.log(message, LogLevel.Info);
    }
    logAsWarning(message: string): void {
        this.log(message, LogLevel.Warn);
    }
    logForError(messagePrefix: string, error: Error): void {
        const errMessage = error.message || '(no error message available)';
        const errStack = (error.stack && ` Error stack:${error.stack}`) || '';

        this.log(`${messagePrefix}. Error: ${errMessage}${errStack}`, LogLevel.Error);
    }
    abstract formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers: {}
    ): TRes;
}
