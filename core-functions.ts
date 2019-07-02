'use strict';

/*
Author: Fortinet
*
* AutoscaleHandler contains the core used to handle serving configuration files and
* manage the autoscale events from multiple cloud platforms.
*
* Use this class in various serverless cloud contexts. For each serverless cloud
* implementation extend this class and implement the handle() method. The handle() method
* should call other methods as needed based on the input events from that cloud's
* autoscale mechanism and api gateway requests from the FortiGate's callback-urls.
* (see reference AWS implementation {@link AwsAutoscaleHandler})
*
* Each cloud implementation should also implement a concrete version of the abstract
* {@link CloudPlatform} class which should be passed to super() in the constructor. The
* CloudPlatform interface should abstract each specific cloud's api. The reference
* implementation {@link AwsPlatform} handles access to the dynamodb for persistence and
* locking, interacting with the aws autoscaling api and determining the api endpoint url
* needed for the FortiGate config's callback-url parameter.
*/

import uuidv5 from 'uuid/v5';
import { Logger, LogLevels, LogQueueItem } from './logger';
export { Logger, LogLevels, LogQueueItem };

const scriptStartTime: number = Date.now();

export function uuidGenerator(inStr: string) {
    return uuidv5(inStr, uuidv5.URL);
}

export function toGmtTime(time: Date | number | string): Date | null {
    let timeObject;
    if (time instanceof Date) {
        timeObject = time;
    } else if (typeof time === 'number') {
        timeObject = new Date(Math.floor(time));
    } else {
        timeObject = new Date(parseInt(time));
    }
    if (timeObject.getTime()) {
        return new Date(timeObject.getTime() + timeObject.getTimezoneOffset() * 60000);
    } else {
        return null; // unable to be converted to Date
    }
}

export class DefaultLogger extends Logger {
    constructor(loggerObject: Console) {
        super(loggerObject);
    }
    log(...args: any[]) {
        this._logCount++;
        if (!(this.level && this.level.log === false)) {
            if (this._outputQueue && !this._flushing) {
                this.enQueue('log', args);
            } else {
                this.logger.log(...args);
            }
        }
        return this;
    }
    debug(...args: any[]) {
        this._debugCount++;
        if (!(this.level && this.level.debug === false)) {
            if (this._outputQueue && !this._flushing) {
                this.enQueue('debug', args);
            } else {
                this.logger.debug(...args);
            }
        }
        return this;
    }
    info(...args: any[]) {
        this._infoCount++;
        if (!(this.level && this.level.info === false)) {
            if (this._outputQueue && !this._flushing) {
                this.enQueue('info', args);
            } else {
                this.logger.info(...args);
            }
        }
        return this;
    }
    warn(...args: any[]) {
        this._warnCount++;
        if (!(this.level && this.level.warn === false)) {
            if (this._outputQueue && !this._flushing) {
                this.enQueue('warn', args);
            } else {
                this.logger.warn(...args);
            }
        }
        return this;
    }
    error(...args: any[]) {
        this._errorCount++;
        if (!(this.level && this.level.error === false)) {
            if (this._outputQueue && !this._flushing) {
                this.enQueue('error', args);
            } else {
                this.logger.error(...args);
            }
        }
        return this;
    }
    flush(level: keyof LogLevels = 'log') {
        if (!this._outputQueue) {
            return '';
        }
        let outputContent = '';
        if (this._queue.length > 0) {
            outputContent += `Queued Logs: [log: ${this._logCount}, info: ${this._infoCount}, ` +
                `debug: ${this._debugCount}, warn: ${this._warnCount}, error: ${this._errorCount}]\n`;
        }
        while (this._queue.length > 0) {
            // this would complain that item may be null, but the while loop won't proceed if the queue is empty so we ca
            // just assert that it's not.
            let item = <LogQueueItem>this._queue.shift();
            outputContent += `[${item.level}][${item.timestamp.toString()}][/${item.level}]\n`;
            if (item.arguments.length > 0) {
                item.arguments.forEach(arg => {
                    outputContent += `${arg}\n`;
                });
            }

        }
        this._flushing = true;
        switch (level) {
            case 'log':
                this.log(outputContent);
                break;
            case 'debug':
                this.debug(outputContent);
                break;
            case 'info':
                this.info(outputContent);
                break;
            case 'warn':
                this.warn(outputContent);
                break;
            case 'error':
                this.error(outputContent);
                break;
            default:
                this.log(outputContent);
                break;
        }
        this._flushing = false;
        return outputContent;
    }
}

const logger = new DefaultLogger(console);
const moduleId: string = uuidGenerator(JSON.stringify(`${__filename}${Date.now()}`));

export function moduleRuntimeId(): string { return moduleId; };

export function sleep(ms: number) {
    return new Promise(resolve => {
        logger.warn(`sleep for ${ms} ms`);
        setTimeout(resolve, ms);
    });
};

/**
 * A wait-for function that periodically awaits an async promise, and does a custom validation on
 * the result and end the waiting on a certain condition.
 * This function will return a Promise resolved with the last result of promiseEmitter.
 * It will also end immediately if any error occurs during, and return a Promise rejected with the
 * error object.
 * @param promiseEmitter Function(result):Promise, A function returns a promise with a
 * result of actions which you wish to wait for.
 * @param validator A predicate that
 * takes the result of the promiseEmitter, decides whether it should end the waiting or not based on
 *  the result. The validator function should return true to end the waiting, or false to continue.
 * @param interval a period of time in milliseconds between each wait. Default is 5000.
 * @param counter An additonal
 * time-based condition that could end the waiting. This parameter accepts either a counter
 * function or the number of attempts where each attempt does one set of the following actions:
 * 1. awaits the return of one promise from the promiseEmitter;
 * 2. does one validation provided by the validator function.
 * If giving a counter function, the function takes the count of attempts been taken as parameter,
 * and should return true to end the waiting or false to continue. If giving a number, waiting
 * will end at the given number of attempts. Default is 12.
 */
export async function waitFor<T>(
    promiseEmitter: () => Promise<T>, validator: (value: T) => boolean, interval = 5000,
    retryOrTries: ((current: number) => boolean) | number | null = null) {
    let shouldRetry: (c: number) => boolean = typeof retryOrTries === 'function' ? retryOrTries : (c: number) => false;
    const
        DEFAULT_TRIES = 12,
        tries = typeof retryOrTries === 'number' ? retryOrTries : DEFAULT_TRIES;
    let currentCount = 0, result, maxCount = DEFAULT_TRIES;
    if (tries !== undefined) {
        maxCount = tries;
        shouldRetry = count => {
            if (count >= maxCount) {
                throw new Error(`failed to wait for a result within ${maxCount} attempts.`);
            }
            return false;
        };
    }
    try {
        result = await promiseEmitter();
        while (!(await validator(result) || await shouldRetry(currentCount))) {
            await sleep(interval);
            result = await promiseEmitter();
            currentCount++;
        }
    } catch (error) {
        let message = '';
        if (error instanceof Error) {
            message = error.message;
        } else {
            message = error && typeof error.toString === 'function' ?
                error.toString() : JSON.stringify(error);
        }
        return Promise.reject(`failed to wait due to error: ${message}`);
    }
    return Promise.resolve(result);
};

export function configSetResourceFinder(resObject: {}, nodePath: string): {} | string | null {
    if (Object.entries(resObject).length === 0 || !nodePath) {
        return '';
    }
    let nodePathMatcher: RegExpMatchArray = nodePath.match(/^{(.+)}$/i);
    let nodes: string[] = nodePathMatcher[1].split('.');
    let ref: { [k: string]: string | any[]; } = resObject;

    // TODO: what is the correct type for ref and the function return?
    // TODO: how to convert this properly with Array.find()
    nodes.forEach(nodeName => {
        let matches = nodeName.match(/^([A-Za-z_@-]+)#([0-9])+$/i);
        if (matches && matches.length > 0) {
            const refName: string = matches[1];
            const refIndex: number = matches[2] && parseInt(matches[2]) || 0;
            if (Array.isArray(ref[refName]) && ref[refName].length > refIndex) {
                ref = ref[refName][refIndex];
            }
            else if (!ref[nodeName]) {
                ref = null;
            } else {
                ref = Array.isArray(ref[nodeName]) && ref[nodeName].length > 0 ?
                    ref[nodeName][0] : ref[nodeName];
            }
        }
    });
    return ref;
}

/**
 * get the time lapse (in millisecond) in the current program runtime.
 */
export function getTimeLapse(): number {
    return Date.now() - scriptStartTime;
}
