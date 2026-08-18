import { ifCid, parseCid, validateCidString } from './cid.js';
import { isPlainObject, isPlainProto } from './object.js';
/**
 * Options to use with {@link ifCid}, {@link validateCidString}, and related CID
 * validation functions when validating CIDs in BlobRefs, in strict mode. This
 * ensures that the CID is a {@link RawCid} (CID v1, raw multicodec, sha256
 * multihash), which is the expected format for blob references in the AT
 * Protocol data model.
 */
const STRICT_CID_CHECK_OPTIONS = { flavor: 'raw' };
// Number.isSafeInteger is actually safe to use with non-number values, so we
// can use it as a type guard.
const isSafeInteger = Number.isSafeInteger;
export function isBlobRef(input, options) {
    return input?.$type === 'blob'
        ? isTypedBlobRef(input, options)
        : isLegacyBlobRef(input, options);
}
export function getBlobMime(blob) {
    return blob?.mimeType;
}
/**
 * Extracts the size (in bytes) from a {@link TypedBlobRef}. For
 * {@link LegacyBlobRef}, size information is not available, so this function
 * returns `undefined` for legacy refs.
 *
 * @note The size property, in blob refs, cannot be 100% trusted since the PDS
 * might not have a local copy of the blob (to check the size against) and might
 * just be passing through the blob ref from the client without validating it.
 * So, while this function can be useful for getting size information when
 * available, it should not be solely relied upon for critical functionality
 * without additional validation.
 *
 * @example
 * ```ts
 * const size = getBlobSize(blobRef)
 * if (size !== undefined) {
 *   console.log(`Blob size: ${size} bytes`)
 * } else {
 *   console.log('Size information not available for legacy blob ref')
 * }
 * ```
 */
export function getBlobSize(blob) {
    if ('$type' in blob && blob.size >= 0)
        return blob.size;
    // LegacyBlobRef doesn't have size information
    return undefined;
}
export function getBlobCid(blob) {
    if (!blob)
        return undefined;
    return '$type' in blob ? blob.ref : parseCid(blob.cid);
}
export function getBlobCidString(blob) {
    if (!blob)
        return undefined;
    return '$type' in blob ? blob.ref.toString() : blob.cid;
}
export function isTypedBlobRef(input, options) {
    if (!isPlainObject(input)) {
        return false;
    }
    if (input?.$type !== 'blob') {
        return false;
    }
    const { mimeType, size, ref } = input;
    // @NOTE Very basic mime validation
    if (typeof mimeType !== 'string' || !mimeType.includes('/')) {
        return false;
    }
    if (size === -1 && options?.strict === false) {
        // In non-strict mode, allow size to be -1 to accommodate legacy blob refs
        // that don't include size information.
    }
    else if (!isSafeInteger(size) || size < 0) {
        return false;
    }
    if (typeof ref !== 'object' || ref === null) {
        return false;
    }
    for (const key in input) {
        if (key !== '$type' &&
            key !== 'mimeType' &&
            key !== 'ref' &&
            key !== 'size') {
            return false;
        }
    }
    const cid = ifCid(ref, 
    // Strict unless explicitly disabled
    options?.strict === false ? undefined : STRICT_CID_CHECK_OPTIONS);
    if (!cid) {
        return false;
    }
    return true;
}
/**
 * Type guard to check if a value is a valid {@link LegacyBlobRef}.
 *
 * Validates the structure of the input:
 * - `cid` must be a valid CID string
 * - `mimeType` must be a non-empty string
 * - No additional properties allowed
 *
 * @example
 * ```typescript
 * import { isLegacyBlobRef } from '@atproto/lex-data'
 *
 * if (isLegacyBlobRef(data)) {
 *   console.log(data.cid)       // CID as string
 *   console.log(data.mimeType)  // e.g., 'image/jpeg'
 * }
 * ```
 *
 * @see {@link isTypedBlobRef} for checking the current blob reference format
 */
export function isLegacyBlobRef(input, options) {
    if (!isPlainObject(input)) {
        return false;
    }
    const { cid, mimeType } = input;
    if (typeof cid !== 'string') {
        return false;
    }
    if (typeof mimeType !== 'string' || mimeType.length === 0) {
        return false;
    }
    for (const key in input) {
        if (key !== 'cid' && key !== 'mimeType') {
            return false;
        }
    }
    if (!validateCidString(cid, options?.strict === false ? undefined : STRICT_CID_CHECK_OPTIONS)) {
        return false;
    }
    return true;
}
export function* enumBlobRefs(input, options) {
    // LegacyBlobRef not included by default
    const includeLegacy = options?.allowLegacy === true;
    // Using a stack to avoid recursion depth issues.
    const stack = [input];
    // Since we are using a stack, we could end-up in an infinite loop with cyclic
    // structures. Cyclic structures are not valid LexValues and should, thus,
    // never occur, but let's be safe.
    const visited = new Set();
    do {
        const value = stack.pop();
        if (value != null && typeof value === 'object') {
            if (Array.isArray(value)) {
                if (visited.has(value))
                    continue;
                visited.add(value);
                stack.push(...value);
            }
            else if (isPlainProto(value)) {
                if (visited.has(value))
                    continue;
                visited.add(value);
                if (isTypedBlobRef(value, options)) {
                    yield value;
                }
                else if (includeLegacy && isLegacyBlobRef(value, options)) {
                    yield value;
                }
                else {
                    for (const v of Object.values(value)) {
                        if (v != null)
                            stack.push(v);
                    }
                }
            }
        }
    } while (stack.length > 0);
    // Optimization: ease GC's work
    visited.clear();
}
//# sourceMappingURL=blob.js.map