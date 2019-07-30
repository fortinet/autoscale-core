'use strict'

/*
Author: Fortinet
*/
/* eslint-disable no-unused-vars */
export interface LogLevels {
    log: boolean
    info: boolean
    warn: boolean
    error: boolean
    debug: boolean
}

export interface LogQueueItem {
    // TODO: level should be an enum instead.
    level: keyof LogLevels
    timestamp: Date
    arguments: any[]
}

export interface LoggerLike {
    log(...args:any[]): void | any,
    info(...args: any[]): void | any,
    warn(...args: any[]): void | any,
    error(...args: any[]): void | any,
    debug(...args: any[]): void | any
}
/**
 * A unified logger class to handle logging across different platforms.
 */
export abstract class Logger {
    private _timeZoneOffset = 0
    protected _logCount = 0
    protected _infoCount = 0
    protected _debugCount = 0
    protected _warnCount = 0
    protected _errorCount = 0
    protected _outputQueue = false
    protected _queue: LogQueueItem[] = []
    protected _flushing: boolean = false
    level: LogLevels | null = null

    // TODO:
    // for log output [object object] issues, check util.inspect(result, false, null) for more info
    constructor(public logger: LoggerLike, public depth: number = 2) {}

    /**
     * control logging output or queue level.
     * @param {Object} levelObject {log: true | false, info: true | false, warn: true | false,
     *  error: true | false}
     */
    setLoggingLevel(level: LogLevels) {
        this.level = level
    }

    /**
     * if use output queue to output all logs as a single log item.
     * @param {Boolean} enable enable this logging feature or not
     */
    set outputQueue(enable) {
        this._outputQueue = enable
    }

    get outputQueue() {
        return this._outputQueue
    }

    set timeZoneOffset(offset: number | string) {
        if (typeof offset === 'string') {
            offset = Number(offset)
        }
        this._timeZoneOffset = isNaN(offset) ? 0 : offset
    }

    get timeZoneOffset() {
        return this._timeZoneOffset
    }

    get logCount() {
        return this._logCount
    }

    get infoCount() {
        return this._infoCount
    }

    get debugCount() {
        return this._debugCount
    }

    get warnCount() {
        return this._warnCount
    }

    get errorCount() {
        return this._errorCount
    }

    enQueue(level: keyof LogLevels, args: any[]) {
        let d = new Date()
        d.setUTCHours(d.getTimezoneOffset() / 60 + this._timeZoneOffset)
        let item = { level: level, timestamp: d, arguments: <any[]>[] }
        item.arguments = Array.from(args).map(arg => {
            return arg && JSON.stringify(arg) || arg
        })
        this._queue.push(item)
        return this
    }

    /**
     * output or queue information to a regular logging stream.
     * @returns logger instance for chaining
     */
    abstract log(message?: any, ...optionalParams: any[]): this
    /**
     * output or queue information to the debug logging stream.
     * @returns logger instance for chaining
     */
    abstract debug(message?: any, ...optionalParams: any[]): this
    /**
     * output or queue information to the info logging stream.
     * @returns logger instance for chaining
     */
    abstract info(message?: any, ...optionalParams: any[]): this
    /**
     * output or queue information to the warning logging stream.
     * @returns logger instance for chaining
     */
    abstract warn(message?: any, ...optionalParams: any[]): this
    /**
     * output or queue information to the error logging stream.
     * @returns logger instance for chaining
     */
    abstract error(message?: any, ...optionalParams: any[]): this

    /**
     * flush all queued logs to the output
     * @param level flush all queued logs with this level
     */
    abstract flush(level?: keyof LogLevels): string
}
