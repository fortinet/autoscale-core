export enum LogLevel {
    Log = 'Log',
    Info = 'Info',
    Warn = 'Warn',
    Error = 'Error',
    Debug = 'Debug'
}

export enum ReqType {
    BootstrapConfig = 'BootstrapConfig',
    ByolLicense = 'ByolLicense',
    CloudFunctionPeerInvocation = 'PeerFunctionInvocation',
    CustomLog = 'CustomLog',
    HeartbeatSync = 'HeartbeatSync',
    LaunchedVm = 'LaunchedVm',
    LaunchingVm = 'LaunchingVm',
    ServiceProviderRequest = 'ServiceProviderRequest',
    StatusMessage = 'StatusMessage',
    TerminatedVm = 'TerminatedVm',
    TerminatingVm = 'TerminatingVm',
    VmNotLaunched = 'VmNotLaunched'
}

export enum ReqMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
    TRACE,
    OPTIONS,
    CONNECT
}

const reqMethod: Map<string, ReqMethod> = new Map([
    ['GET', ReqMethod.GET],
    ['POST', ReqMethod.POST],
    ['PUT', ReqMethod.PUT],
    ['DELETE', ReqMethod.DELETE],
    ['PATCH', ReqMethod.PATCH],
    ['HEAD', ReqMethod.HEAD],
    ['TRACE', ReqMethod.TRACE],
    ['OPTIONS', ReqMethod.OPTIONS],
    ['CONNECT', ReqMethod.CONNECT]
]);

export function mapHttpMethod(s: string): ReqMethod {
    return s && reqMethod.get(s.toUpperCase());
}

export interface ReqBody {
    [key: string]: unknown;
}

export interface ReqHeaders {
    [key: string]: unknown;
}

export type CloudFunctionResponseBody =
    | string
    | {}
    | {
          [key: string]: unknown;
      };

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
    getRequestAsString(): Promise<string>;
    /**
     * return the remaining execution time (in millisecond) of the current cloud function process.
     *
     * @returns {number}
     * @memberof CloudFunctionProxyAdapter
     */
    getRemainingExecutionTime(): Promise<number>;
    getReqBody(): Promise<unknown>;
    getReqHeaders(): Promise<ReqHeaders>;
    getReqMethod(): Promise<ReqMethod>;
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
    abstract getRequestAsString(): Promise<string>;
    abstract getRemainingExecutionTime(): Promise<number>;
    abstract getReqBody(): Promise<unknown>;
    abstract getReqHeaders(): Promise<ReqHeaders>;
    abstract getReqMethod(): Promise<ReqMethod>;
    abstract getReqQueryParameters(): Promise<{ [name: string]: string }>;
}
