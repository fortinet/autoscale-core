import crypto from 'crypto';
import { CloudFunctionProxyAdapter } from './cloud-function-proxy';
export function genChecksum(str: string, algorithm: string): string {
    return crypto
        .createHash(algorithm)
        .update(str, 'utf8')
        .digest('hex');
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
/**
 * Component of WaitFor(). An emitter function that returns a promise of type TResult.
 * The returned value of type TResult will be passed to the WaitForConditionChecker.
 * @template TResult a generic type for the returning value.
 * @returns {Promise<TResult>} the returning result in a promise
 */
export type WaitForPromiseEmitter<TResult> = () => Promise<TResult>;

/**
 * Component of WaitFor(). A custom checker function that takes a value of type TInput.
 * The value of type TInput is passed from the returning value from WaitForPromiseEmitter.
 * The custom checker will check the TInput and return a boolean indicating whether a passing
 * condition is met or not.
 * @param {TInput} input a generic type for the input value
 * @param {number} callCount the number of time the emitter function been called.
 * @returns {boolean} the boolean result of condition which is used to quit the waitFor()
 */
export type WaitForConditionChecker<TInput> = (
    input: TInput,
    callCount: number,
    ...args
) => Promise<boolean>;

/**
 * A repeatedly running function that periodically takes a custom action, check the result
 * against a condition, and quit waiting until the condtion is met.
 *
 * @template TResult a generic type for the values being passed between emitter and checker.
 * @param {WaitForPromiseEmitter<TResult>} promiseEmitter the emitter that return a value of TResult
 * @param {WaitForConditionChecker<TResult>} conditionChecker the checker that
 * takes a value of TResult as an input and performs a custom checking for a condition to quit the
 * waitFor.
 * @param {number} interval milliseconds interval between each calling emitter.
 * @param {CloudFunctionProxyAdapter} [proxy] a proxy (if provided) that prints logs withing the
 * waitFor process.
 * @returns {Promise<TResult>} the returning result of the emitter
 */
export async function waitFor<TResult>(
    promiseEmitter: WaitForPromiseEmitter<TResult>,
    conditionChecker: WaitForConditionChecker<TResult>,
    interval: number,
    proxy?: CloudFunctionProxyAdapter
): Promise<TResult> {
    let count = 0;
    const maxCount = 30;
    if (interval <= 0) {
        interval = 5000; // soft default to 5 seconds
    }
    try {
        const result = await promiseEmitter();

        let complete = false;
        do {
            if (proxy) {
                proxy.logAsInfo('Await condition check result.');
            }
            complete = await conditionChecker(result, ++count, proxy || undefined);
            if (!complete) {
                if (count >= maxCount) {
                    throw new Error(`It reached the maximum amount (${maxCount}) of attempts.`);
                }
                if (proxy) {
                    proxy.logAsInfo(
                        `Condition check not passed, count: ${count}. Retry in ${interval} ms.`
                    );
                }
                await sleep(interval);
            } else {
                if (proxy) {
                    proxy.logAsInfo('Condition check passed. End waiting and returns task result.');
                }
                break;
            }
        } while (!complete);
        return result;
    } catch (error) {
        if (proxy) {
            proxy.logForError('WaitFor() is interrupted.', error);
        }
        throw error;
    }
}
