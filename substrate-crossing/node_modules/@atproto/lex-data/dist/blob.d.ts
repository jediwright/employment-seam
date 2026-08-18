import type { Cid, RawCid } from './cid.js';
import type { LexValue } from './lex.js';
/**
 * Reference to binary data (like images, videos, etc.) in the AT Protocol data
 * model.
 *
 * This type represents a reference to a blob of binary data, identified by its
 * content hash (CID) and accompanied by metadata such as MIME type and size.
 *
 * The {@link BlobRef} type is a union of the current {@link TypedBlobRef}
 * format and the legacy {@link LegacyBlobRef} format.
 */
export type BlobRef<Ref extends Cid = Cid> = TypedBlobRef<Ref> | LegacyBlobRef;
/**
 * Options for validating a {@link BlobRef}.
 */
export type BlobRefCheckOptions = {
    /**
     * If `false`, skips strict CID validation of {@link BlobRef.ref}, allowing
     * any valid CID. Otherwise, validates that the CID is v1, uses the raw
     * multicodec, and has a sha256 multihash.
     *
     * @default true
     */
    strict?: boolean;
};
/**
 * Type guard to check if a value is a valid {@link BlobRef}, which can be
 * either a {@link TypedBlobRef} or a {@link LegacyBlobRef}. By default, strict
 * CID validation is applied to ensure that the CID in the blob reference is in
 * the expected format for the AT Protocol, but this can be relaxed with the
 * `strict: false` option.
 */
export declare function isBlobRef(input: unknown): input is BlobRef<RawCid>;
export declare function isBlobRef<TOptions extends BlobRefCheckOptions>(input: unknown, options: TOptions): input is LegacyBlobRef | InferTypedBlobRef<TOptions>;
export declare function isBlobRef(input: unknown, options?: BlobRefCheckOptions): input is BlobRef<RawCid>;
/**
 * Extracts the MIME type from a {@link BlobRef}.
 *
 * @example
 * ```ts
 * const mimeType = getBlobMime(blobRef)
 * console.log(mimeType)  // e.g., 'image/jpeg'
 * ```
 */
export declare function getBlobMime(blob: BlobRef): string;
export declare function getBlobMime(blob?: BlobRef): string | undefined;
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
export declare function getBlobSize(blob: BlobRef): number | undefined;
/**
 * Extracts the {@link Cid} from a {@link BlobRef}.
 *
 * @throws If the input input is a {@link LegacyBlobRef} with an invalid CID string
 * @example
 * ```ts
 * const cid = getBlobCid(blobRef)
 * console.log(cid.bytes)
 * ```
 */
export declare function getBlobCid(blob: BlobRef): Cid;
export declare function getBlobCid(blob?: BlobRef): Cid | undefined;
/**
 * Extracts the CID string from a {@link BlobRef}.
 *
 * This is similar to `getBlobCid(blob).toString()` but is more optimized since
 * the CID string is already available in the legacy format and we can avoid
 * parsing it into a CID object just to convert it back to a string.
 *
 * @example
 * ```ts
 * const cidString = getBlobCidString(blobRef)
 * console.log(cidString)
 * ```
 */
export declare function getBlobCidString(blob: BlobRef): string;
export declare function getBlobCidString(blob?: BlobRef): string | undefined;
/**
 * Reference to binary data (like images, videos, etc.) in the AT Protocol data model.
 *
 * A {@link TypedBlobRef} is a {@link LexMap} with a specific structure that
 * identifies binary content by its content hash (CID), along with metadata
 * about the content type and size.
 *
 * @typeParam Ref - The type of CID reference, defaults to any {@link Cid}
 *
 * @example
 * ```typescript
 * import type { TypedBlobRef } from '@atproto/lex-data'
 *
 * const imageRef: TypedBlobRef = {
 *   $type: 'blob',
 *   mimeType: 'image/jpeg',
 *   ref: cid,  // CID of the blob content
 *   size: 12345
 * }
 * ```
 *
 * @see {@link isTypedBlobRef} to check if a value is a valid {@link TypedBlobRef}
 * @see {@link LegacyBlobRef} for the older blob reference format
 */
export type TypedBlobRef<Ref extends Cid = Cid> = {
    $type: 'blob';
    mimeType: string;
    ref: Ref;
    size: number;
};
/**
 * Infers the BlobRef type based on the check options.
 *
 * @typeParam TOptions - The options used for checking
 */
export type InferTypedBlobRef<TOptions extends BlobRefCheckOptions> = TOptions extends {
    strict: false;
} ? TypedBlobRef : {
    strict: boolean;
} extends TOptions ? TypedBlobRef : TypedBlobRef<RawCid>;
/**
 * Type guard to check if a value is a valid {@link BlobRef}.
 *
 * Validates the structure of the input including:
 * - `$type` must be `'blob'`
 * - `mimeType` must be a valid MIME type string (containing '/')
 * - `size` must be a non-negative safe integer
 * - `ref` must be a valid CID (strict validation by default)
 *
 * @param input - The value to check
 * @param options - Optional validation options
 * @returns `true` if the input is a valid BlobRef
 *
 * @example
 * ```typescript
 * import { isTypedBlobRef } from '@atproto/lex-data'
 *
 * if (isTypedBlobRef(data)) {
 *   console.log(data.mimeType)  // e.g., 'image/jpeg'
 *   console.log(data.size)      // e.g., 12345
 * }
 *
 * // Allow any valid CID (not just raw CIDs)
 * if (isTypedBlobRef(data, { strict: false })) {
 *   // ...
 * }
 * ```
 */
export declare function isTypedBlobRef(input: unknown): input is TypedBlobRef<RawCid>;
export declare function isTypedBlobRef<TOptions extends BlobRefCheckOptions>(input: unknown, options: TOptions): input is InferTypedBlobRef<TOptions>;
export declare function isTypedBlobRef(input: unknown, options?: BlobRefCheckOptions): input is TypedBlobRef<RawCid>;
/**
 * Legacy format for blob references used in older AT Protocol data.
 *
 * This is the older format that stores the CID as a string rather than
 * as a structured CID object. New code should use {@link BlobRef} instead.
 *
 * @example
 * ```typescript
 * import type { LegacyBlobRef } from '@atproto/lex-data'
 *
 * const legacyRef: LegacyBlobRef = {
 *   cid: 'bafyreib...',
 *   mimeType: 'image/jpeg'
 * }
 * ```
 *
 * @see {@link isLegacyBlobRef} to check if a value is a LegacyBlobRef
 * @see {@link BlobRef} for the current blob reference format
 * @deprecated Use {@link BlobRef} for new code
 */
export type LegacyBlobRef = {
    cid: string;
    mimeType: string;
};
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
export declare function isLegacyBlobRef(input: unknown, options?: BlobRefCheckOptions): input is LegacyBlobRef;
/**
 * Options for enumerating blob references within a {@link LexValue}.
 */
export type EnumBlobRefsOptions = BlobRefCheckOptions & {
    /**
     * If `true`, also yields {@link LegacyBlobRef} objects in addition to
     * {@link BlobRef} objects.
     *
     * @default false
     */
    allowLegacy?: boolean;
};
/**
 * Infers the yielded type of {@link enumBlobRefs} based on options.
 *
 * @typeParam TOptions - The options used for enumeration
 */
export type InferEnumBlobRefs<TOptions extends EnumBlobRefsOptions> = TOptions extends {
    allowLegacy: true;
} ? InferTypedBlobRef<TOptions> | LegacyBlobRef : {
    allowLegacy: boolean;
} extends TOptions ? InferTypedBlobRef<TOptions> | LegacyBlobRef : InferTypedBlobRef<TOptions>;
/**
 * Generator that enumerates all {@link BlobRef}s (and, optionally,
 * {@link LegacyBlobRef}s) found within a {@link LexValue}.
 *
 * Performs a deep traversal of the input value, yielding any blob references
 * found. This is useful for extracting all media references from a record.
 *
 * @param input - The LexValue to search for blob references
 * @param options - Optional configuration for the enumeration
 * @yields Each blob reference found in the input
 *
 * @example
 * ```typescript
 * import { enumBlobRefs } from '@atproto/lex-data'
 *
 * const record = {
 *   text: 'Hello',
 *   images: [
 *     { $type: 'blob', mimeType: 'image/jpeg', ref: cid1, size: 1000 },
 *     { $type: 'blob', mimeType: 'image/png', ref: cid2, size: 2000 }
 *   ]
 * }
 *
 * for (const blobRef of enumBlobRefs(record)) {
 *   console.log(blobRef.mimeType, blobRef.size)
 * }
 *
 * // Include legacy blob references
 * for (const ref of enumBlobRefs(record, { allowLegacy: true, strict: false })) {
 *   // ref may be BlobRef or LegacyBlobRef, with relaxed CID validation
 * }
 * ```
 */
export declare function enumBlobRefs(input: LexValue): Generator<BlobRef<RawCid>, void, unknown>;
export declare function enumBlobRefs<TOptions extends EnumBlobRefsOptions>(input: LexValue, options: TOptions): Generator<InferEnumBlobRefs<TOptions>, void, unknown>;
export declare function enumBlobRefs(input: LexValue, options?: EnumBlobRefsOptions): Generator<BlobRef, void, unknown>;
//# sourceMappingURL=blob.d.ts.map