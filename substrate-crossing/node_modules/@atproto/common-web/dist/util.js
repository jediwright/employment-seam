export const noUndefinedVals = (obj) => {
    for (const k of Object.keys(obj)) {
        if (obj[k] === undefined) {
            delete obj[k];
        }
    }
    return obj;
};
export function aggregateErrors(errors, message) {
    if (errors.length === 1) {
        return errors[0] instanceof Error
            ? errors[0]
            : new Error(message ?? stringifyError(errors[0]), { cause: errors[0] });
    }
    else {
        return new AggregateError(errors, message ?? `Multiple errors: ${errors.map(stringifyError).join('\n')}`);
    }
}
function stringifyError(reason) {
    if (reason instanceof Error) {
        return reason.message;
    }
    return String(reason);
}
export function omit(src, rejectedKeys) {
    // Hot path
    if (!src)
        return src;
    const dst = {};
    const srcKeys = Object.keys(src);
    for (let i = 0; i < srcKeys.length; i++) {
        const key = srcKeys[i];
        if (!rejectedKeys.includes(key)) {
            dst[key] = src[key];
        }
    }
    return dst;
}
export const jitter = (maxMs) => {
    return Math.round((Math.random() - 0.5) * maxMs * 2);
};
export const wait = (ms) => {
    return new Promise((res) => setTimeout(res, ms));
};
export const bailableWait = (ms) => {
    let bail;
    const waitPromise = new Promise((res) => {
        const timeout = setTimeout(res, ms);
        bail = () => {
            clearTimeout(timeout);
            res();
        };
    });
    return { bail: bail, wait: () => waitPromise };
};
export const flattenUint8Arrays = (arrs) => {
    const length = arrs.reduce((acc, cur) => {
        return acc + cur.length;
    }, 0);
    const flattened = new Uint8Array(length);
    let offset = 0;
    arrs.forEach((arr) => {
        flattened.set(arr, offset);
        offset += arr.length;
    });
    return flattened;
};
export const streamToBuffer = async (stream) => {
    const arrays = [];
    for await (const chunk of stream) {
        arrays.push(chunk);
    }
    return flattenUint8Arrays(arrays);
};
const S32_CHAR = '234567abcdefghijklmnopqrstuvwxyz';
export const s32encode = (i) => {
    let s = '';
    while (i) {
        const c = i % 32;
        i = Math.floor(i / 32);
        s = S32_CHAR.charAt(c) + s;
    }
    return s;
};
export const s32decode = (s) => {
    let i = 0;
    for (const c of s) {
        i = i * 32 + S32_CHAR.indexOf(c);
    }
    return i;
};
export const asyncFilter = async (arr, fn) => {
    const results = await Promise.all(arr.map((t) => fn(t)));
    return arr.filter((_, i) => results[i]);
};
export const isErrnoException = (err) => {
    // @TODO This implementation does not actually safely checks if the error is
    // an ErrnoException.
    return !!err?.code;
};
export const errHasMsg = (err, msg) => {
    return typeof err === 'object' && err != null && err.message === msg;
};
export const chunkArray = (arr, chunkSize) => {
    return arr.reduce((acc, cur, i) => {
        const chunkI = Math.floor(i / chunkSize);
        if (!acc[chunkI]) {
            acc[chunkI] = [];
        }
        acc[chunkI].push(cur);
        return acc;
    }, []);
};
export const range = (num) => {
    const nums = [];
    for (let i = 0; i < num; i++) {
        nums.push(i);
    }
    return nums;
};
export const dedupeStrs = (strs) => {
    return [...new Set(strs)];
};
export const parseIntWithFallback = (value, fallback) => {
    const parsed = parseInt(value || '', 10);
    return isNaN(parsed) ? fallback : parsed;
};
//# sourceMappingURL=util.js.map