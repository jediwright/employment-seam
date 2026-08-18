import { CID } from 'multiformats/cid';
import { check, ipldToJson, jsonToIpld, } from '@atproto/common-web';
import { BlobRef, jsonBlobRef } from './blob-refs.js';
// @NOTE avoiding use of check.is() here only because it makes
// these implementations slow, and they often live in hot paths.
/**
 * @deprecated Use `LexValue` from `@atproto/lex-data` instead (which doesn't need conversion to IPLD).
 */
export const lexToIpld = (val) => {
    // walk arrays
    if (Array.isArray(val)) {
        return val.map((item) => lexToIpld(item));
    }
    // objects
    if (val && typeof val === 'object') {
        // convert blobs, leaving the original encoding so that we don't change CIDs on re-encode
        if (val instanceof BlobRef) {
            return val.original;
        }
        // retain cids & bytes
        if (CID.asCID(val) || val instanceof Uint8Array) {
            return val;
        }
        // walk plain objects
        const toReturn = {};
        for (const key of Object.keys(val)) {
            toReturn[key] = lexToIpld(val[key]);
        }
        return toReturn;
    }
    // pass through
    return val;
};
/**
 * @deprecated Use `LexValue` from `@atproto/lex-data` instead instead (which doesn't need conversion to IPLD).
 */
export const ipldToLex = (val) => {
    // map arrays
    if (Array.isArray(val)) {
        return val.map((item) => ipldToLex(item));
    }
    // objects
    if (val && typeof val === 'object') {
        // convert blobs, using hints to avoid expensive is() check
        const obj = val;
        if ((obj['$type'] === 'blob' ||
            (typeof obj['cid'] === 'string' &&
                typeof obj['mimeType'] === 'string')) &&
            check.is(obj, jsonBlobRef)) {
            return BlobRef.fromJsonRef(obj);
        }
        // retain cids, bytes
        if (CID.asCID(val) || val instanceof Uint8Array) {
            return val;
        }
        // map plain objects
        const toReturn = {};
        for (const key of Object.keys(obj)) {
            toReturn[key] = ipldToLex(obj[key]);
        }
        return toReturn;
    }
    // pass through
    return val;
};
export const lexToJson = (val) => {
    return ipldToJson(lexToIpld(val));
};
export const stringifyLex = (val) => {
    return JSON.stringify(lexToJson(val));
};
export const jsonToLex = (val) => {
    return ipldToLex(jsonToIpld(val));
};
export const jsonStringToLex = (val) => {
    return jsonToLex(JSON.parse(val));
};
//# sourceMappingURL=serialize.js.map