import { aggregateErrors, bailableWait } from './util.js';
// reads values from a generator into a list
// breaks when isDone signals `true` AND `waitFor` completes OR when a max length is reached
// NOTE: does not signal generator to close. it *will* continue to produce values
export const readFromGenerator = async (gen, isDone, waitFor = Promise.resolve(), maxLength = Number.MAX_SAFE_INTEGER) => {
    const evts = [];
    let bail;
    let hasBroke = false;
    const awaitDone = async () => {
        if (await isDone(evts.at(-1))) {
            return true;
        }
        const bailable = bailableWait(20);
        await bailable.wait();
        bail = bailable.bail;
        if (hasBroke)
            return false;
        return await awaitDone();
    };
    const breakOn = new Promise((resolve) => {
        waitFor.then(() => {
            awaitDone().then(() => resolve());
        });
    });
    try {
        while (evts.length < maxLength) {
            const maybeEvt = await Promise.race([gen.next(), breakOn]);
            if (!maybeEvt)
                break;
            const evt = maybeEvt;
            if (evt.done)
                break;
            evts.push(evt.value);
        }
    }
    finally {
        hasBroke = true;
        if (bail)
            bail();
    }
    return evts;
};
export function createDeferrable() {
    let res;
    let rej;
    const promise = new Promise((resolve, reject) => {
        res = resolve;
        rej = reject;
    });
    return { resolve: res, reject: rej, complete: promise };
}
export const createDeferrables = (count) => {
    const list = [];
    for (let i = 0; i < count; i++) {
        list.push(createDeferrable());
    }
    return list;
};
export const allComplete = async (deferrables) => {
    await Promise.all(deferrables.map((d) => d.complete));
};
export class AsyncBuffer {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.buffer = [];
        this.closed = false;
        // Initializing to satisfy types/build, immediately reset by resetPromise()
        this.promise = Promise.resolve();
        this.resolve = () => null;
        this.resetPromise();
    }
    get curr() {
        return this.buffer;
    }
    get size() {
        return this.buffer.length;
    }
    get isClosed() {
        return this.closed;
    }
    resetPromise() {
        this.promise = new Promise((r) => (this.resolve = r));
    }
    push(item) {
        this.buffer.push(item);
        this.resolve();
    }
    pushMany(items) {
        items.forEach((i) => this.buffer.push(i));
        this.resolve();
    }
    async *events() {
        while (true) {
            if (this.closed && this.buffer.length === 0) {
                if (this.toThrow) {
                    throw this.toThrow;
                }
                else {
                    return;
                }
            }
            await this.promise;
            if (this.toThrow) {
                throw this.toThrow;
            }
            if (this.maxSize && this.size > this.maxSize) {
                throw new AsyncBufferFullError(this.maxSize);
            }
            const [first, ...rest] = this.buffer;
            if (first) {
                this.buffer = rest;
                yield first;
            }
            else {
                this.resetPromise();
            }
        }
    }
    throw(err) {
        this.toThrow = err;
        this.closed = true;
        this.resolve();
    }
    close() {
        this.closed = true;
        this.resolve();
    }
}
export class AsyncBufferFullError extends Error {
    constructor(maxSize) {
        super(`ReachedMaxBufferSize: ${maxSize}`);
    }
}
export function allFulfilled(promises) {
    return Promise.allSettled(promises).then(handleAllSettledErrors);
}
export function handleAllSettledErrors(results) {
    if (results.every(isFulfilledResult))
        return results.map(extractValue);
    const errors = results.filter(isRejectedResult).map(extractReason);
    throw aggregateErrors(errors);
}
export function isRejectedResult(result) {
    return result.status === 'rejected';
}
function extractReason(result) {
    return result.reason;
}
export function isFulfilledResult(result) {
    return result.status === 'fulfilled';
}
function extractValue(result) {
    return result.value;
}
//# sourceMappingURL=async.js.map