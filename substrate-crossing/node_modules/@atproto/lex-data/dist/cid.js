import { CID } from 'multiformats/cid';
import { create as createDigest } from 'multiformats/hashes/digest';
import { sha256, sha512 } from 'multiformats/hashes/sha2';
import { isUint8, toHexString } from './lib/util.js';
import { isObject } from './object.js';
import { ui8Equals } from './uint8array.js';
/**
 * Codec code that indicates the CID references a CBOR-encoded data structure.
 *
 * Used when encoding structured data in AT Protocol repositories.
 *
 * @see {@link https://dasl.ing/cid.html Content IDs (DASL)}
 */
export const CBOR_DATA_CODEC = 0x71;
/**
 * Codec code that indicates the CID references raw binary data (like media blobs).
 *
 * Used in DASL CIDs for binary blobs like images and media.
 *
 * @see {@link https://dasl.ing/cid.html Content IDs (DASL)}
 */
export const RAW_DATA_CODEC = 0x55;
/**
 * Hash code that indicates that a CID uses SHA-256.
 */
export const SHA256_HASH_CODE = sha256.code;
/**
 * Hash code that indicates that a CID uses SHA-512.
 */
export const SHA512_HASH_CODE = sha512.code;
/**
 * Compares two {@link Multihash} for equality.
 *
 * @param a - First {@link Multihash}
 * @param b - Second {@link Multihash}
 * @returns `true` if both multihashes have the same code and digest
 */
export function multihashEquals(a, b) {
    if (a === b)
        return true;
    return a.code === b.code && ui8Equals(a.digest, b.digest);
}
// multiformats' CID class is not very portable because:
//
// - In dependent packages that use "moduleResolution" set to "node16",
//   "nodenext" or "bundler", TypeScript fails to properly resolve the
//   multiformats package when importing CID from @atproto/lex-data. This causes
//   type errors in those packages. This is caused by the fact that the
//   multiformats version <10 (which is the last version that supports CommonJS)
//   uses "exports" field in package.json, which do not contain "types"
//   entrypoints.
//   https://www.npmjs.com/package/multiformats/v/9.9.0?activeTab=code
// - By defining our own interface and helper functions, we can have more
//   control over the public API exposed by this package.
// - It allow us to have a stable interface in case we need to swap out, or
//   eventually update multiformats (should we choose to drop CommonJS support)
//   in the future.
// @NOTE Even though it is not portable, we still re-export CID here so that
// dependent packages where it can be used, have access to it (instead of
// importing directly from "multiformats" or "multiformats/cid").
export { /** @deprecated */ CID };
/**
 * Converts a {@link Cid} to a multiformats {@link CID} instance.
 *
 * @deprecated Packages depending on `@atproto/lex-data` should use the
 * {@link Cid} interface instead of relying on `multiformats`'s {@link CID}
 * implementation directly. This is to avoid compatibility issues, and in order
 * to allow better portability, compatibility and future updates.
 */
export function asMultiformatsCID(input) {
    const cid = 
    // Already a multiformats CID instance
    CID.asCID(input) ??
        // Create a new multiformats CID instance
        CID.create(input.version, input.code, createDigest(input.multihash.code, input.multihash.digest));
    // @NOTE: the "satisfies" operator is used here to ensure that the Cid
    // interface is indeed compatible with multiformats' CID implementation, which
    // allows us to safely rely on multiformats' CID implementation where Cid are
    // needed.
    return cid;
}
/**
 * Type guard to check if a CID is a raw binary CID.
 *
 * @param cid - The CID to check
 * @returns `true` if the CID is a version 1 CID with raw multicodec
 */
export function isRawCid(cid) {
    return cid.version === 1 && cid.code === RAW_DATA_CODEC;
}
/**
 * Type guard to check if a CID is DASL compliant.
 *
 * @param cid - The CID to check
 * @returns `true` if the CID is DASL compliant (v1, raw/dag-cbor, sha256)
 */
export function isDaslCid(cid) {
    return (cid.version === 1 &&
        (cid.code === RAW_DATA_CODEC || cid.code === CBOR_DATA_CODEC) &&
        cid.multihash.code === SHA256_HASH_CODE &&
        cid.multihash.digest.byteLength === 0x20 // Should always be 32 bytes (256 bits) for SHA-256, but double-checking anyways
    );
}
/**
 * Type guard to check if a CID is a DAG-CBOR CID.
 *
 * @param cid - The CID to check
 * @returns `true` if the CID is a DAG-CBOR CID (v1, dag-cbor, sha256)
 */
export function isCborCid(cid) {
    return cid.code === CBOR_DATA_CODEC && isDaslCid(cid);
}
export function checkCid(cid, options) {
    switch (options?.flavor) {
        case undefined:
            return true;
        case 'cbor':
            return isCborCid(cid);
        case 'dasl':
            return isDaslCid(cid);
        case 'raw':
            return isRawCid(cid);
        default:
            throw new TypeError(`Unknown CID flavor: ${options?.flavor}`);
    }
}
export function isCid(value, options) {
    return isCidImplementation(value) && checkCid(value, options);
}
export function ifCid(value, options) {
    if (isCid(value, options))
        return value;
    return null;
}
export function asCid(value, options) {
    if (isCid(value, options))
        return value;
    throw new Error(`Invalid ${options?.flavor ? `${options.flavor} CID` : 'CID'} "${value}"`);
}
export function decodeCid(cidBytes, options) {
    const cid = CID.decode(cidBytes);
    return asCid(cid, options);
}
export function parseCid(input, options) {
    const cid = CID.parse(input);
    return asCid(cid, options);
}
/**
 * Validates that a string is a valid CID representation.
 *
 * Unlike {@link parseCid}, this function returns a boolean instead of throwing.
 * It also verifies that the string is the canonical representation of the CID.
 *
 * @param input - The string to validate
 * @param options - Optional flavor constraints
 * @returns `true` if the string is a valid CID
 */
export function validateCidString(input, options) {
    return parseCidSafe(input, options)?.toString() === input;
}
export function parseCidSafe(input, options) {
    try {
        return parseCid(input, options);
    }
    catch {
        return null;
    }
}
/**
 * Ensures that a string is a valid CID representation.
 *
 * @param input - The string to validate
 * @param options - Optional flavor constraints
 * @throws If the string is not a valid CID
 */
export function ensureValidCidString(input, options) {
    if (!validateCidString(input, options)) {
        throw new Error(`Invalid CID string "${input}"`);
    }
}
/**
 * Verifies whether the multihash of a given {@link cid} matches the hash of the provided {@link bytes}.
 * @params cid The CID to match against the bytes.
 * @params bytes The bytes to verify.
 * @returns true if the CID matches the bytes, false otherwise.
 */
export async function isCidForBytes(cid, bytes) {
    if (cid.multihash.code === sha256.code) {
        const multihash = await sha256.digest(bytes);
        return multihashEquals(multihash, cid.multihash);
    }
    if (cid.multihash.code === sha512.code) {
        const multihash = await sha512.digest(bytes);
        return multihashEquals(multihash, cid.multihash);
    }
    // Don't know how to verify other multihash codes
    throw new Error(`Unsupported CID multihash code: ${toHexString(cid.multihash.code)}`);
}
/**
 * Creates a CID from a multicodec, multihash code, and digest.
 *
 * @param code - The multicodec content type code
 * @param multihashCode - The multihash algorithm code
 * @param digest - The raw hash digest bytes
 * @returns A new CIDv1 instance
 *
 * @example
 * ```typescript
 * import { createCid, RAW_DATA_CODEC, SHA256_HASH_CODE } from '@atproto/lex-data'
 *
 * const cid = createCid(RAW_DATA_CODEC, SHA256_HASH_CODE, hashDigest)
 * ```
 */
export function createCid(code, multihashCode, digest) {
    const cid = CID.createV1(code, createDigest(multihashCode, digest));
    return cid;
}
/**
 * Creates a DAG-CBOR CID for the given CBOR bytes.
 *
 * Computes the SHA-256 hash of the bytes and creates a CIDv1 with DAG-CBOR multicodec.
 *
 * @param bytes - The CBOR-encoded bytes to hash
 * @returns A promise that resolves to the CborCid
 */
export async function cidForCbor(bytes) {
    const multihash = await sha256.digest(bytes);
    return CID.createV1(CBOR_DATA_CODEC, multihash);
}
/**
 * Creates a raw CID for the given binary bytes.
 *
 * Computes the SHA-256 hash of the bytes and creates a CIDv1 with raw multicodec.
 *
 * @param bytes - The raw binary bytes to hash
 * @returns A promise that resolves to the RawCid
 */
export async function cidForRawBytes(bytes) {
    const multihash = await sha256.digest(bytes);
    return CID.createV1(RAW_DATA_CODEC, multihash);
}
/**
 * Creates a raw CID from an existing SHA-256 hash digest.
 *
 * @param digest - The SHA-256 hash digest (must be 32 bytes)
 * @returns A RawCid with the given digest
 * @throws If the digest is not a valid SHA-256 hash (not 32 bytes)
 */
export function cidForRawHash(digest) {
    // Fool-proofing
    if (digest.length !== 0x20) {
        throw new Error(`Invalid SHA-256 hash length: ${toHexString(digest.length)}`);
    }
    return createCid(RAW_DATA_CODEC, sha256.code, digest);
}
function isCidImplementation(value) {
    if (CID.asCID(value)) {
        // CIDs created using older multiformats versions did not have a "bytes"
        // property.
        return value.bytes != null;
    }
    else {
        // Unknown implementation, do a structural check
        try {
            if (!isObject(value))
                return false;
            const val = value;
            if (val.version !== 0 && val.version !== 1)
                return false;
            if (!isUint8(val.code))
                return false;
            if (!isObject(val.multihash))
                return false;
            const mh = val.multihash;
            if (!isUint8(mh.code))
                return false;
            if (!(mh.digest instanceof Uint8Array))
                return false;
            // Ensure that the bytes array is consistent with other properties
            if (!(val.bytes instanceof Uint8Array))
                return false;
            if (val.bytes[0] !== val.version)
                return false;
            if (val.bytes[1] !== val.code)
                return false;
            if (val.bytes[2] !== mh.code)
                return false;
            if (val.bytes[3] !== mh.digest.length)
                return false;
            if (val.bytes.length !== 4 + mh.digest.length)
                return false;
            if (!ui8Equals(val.bytes.subarray(4), mh.digest))
                return false;
            if (typeof val.equals !== 'function')
                return false;
            if (val.equals(val) !== true)
                return false;
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=cid.js.map