import type { AtIdentifierString } from './at-identifier.js';
import type { Result } from './lib/result.js';
import type { NsidString } from './nsid.js';
export type AtUriStringBase = `at://${AtIdentifierString}` | `at://${AtIdentifierString}/${NsidString}` | `at://${AtIdentifierString}/${NsidString}/${string}`;
export type AtUriStringFragment = `#/${string}`;
/**
 * A URI string as used to point at resources in the AT Protocol
 *
 * The full, general structure of an AT URI is:
 *
 * ```bnf
 * AT-URI = "at://" AUTHORITY [ PATH ] [ "?" QUERY ] [ "#" FRAGMENT ]
 * ```
 *
 * The authority part of the URI can be either a handle or a DID, indicating the
 * identity associated with the repository. In current atproto Lexicon use, the
 * query and fragment parts are not yet supported, and only a fixed pattern of
 * paths are allowed:
 *
 * ```bnf
 * AT-URI     = "at://" AUTHORITY [ "/" COLLECTION [ "/" RKEY ] ]
 *
 * AUTHORITY  = HANDLE | DID
 * COLLECTION = NSID
 * RKEY       = RECORD-KEY
 * ```
 *
 * The authority section is required, and should be normalized.
 *
 * AT URI strings must respect the following syntax (as prescribed by the AT
 * protocol specification):
 *
 * - The overall URI is restricted to a subset of ASCII characters
 * - For reference below, the set of unreserved characters, as defined in [RFC-3986](https://www.rfc-editor.org/rfc/rfc3986), includes alphanumeric (`A-Za-z0-9`), period, hyphen, underscore, and tilde (`.-_~`)
 * - Maximum overall length is 8 kilobytes (which may be shortened in the future)
 * - Hex-encoding of characters is permitted (but in practice not necessary and should be avoided to keep the URI normalized and human-readable)
 * - The URI scheme is `at`, and an authority part preceded with double slashes is always required. AT URIs always start with `at://`.
 * - An authority section is required and must be non-empty. the authority can be either an atproto Handle, or a DID meeting the restrictions for use with atproto. The authority part can *not* be interpreted as a host:port pair, because of the use of colon characters (`:`) in DIDs. Colons and unreserved characters should not be escaped in DIDs, but other reserved characters (including `#`, `/`, `$`, `&`, `@`) must be escaped.
 *     - Note that none of the current "blessed" DID methods for atproto allow these characters in DID identifiers
 * - An optional path section may follow the authority. The path may contain multiple segments separated by a single slash (`/`). Generic URI path normalization rules may be used.
 * - An optional query part is allowed, following generic URI syntax restrictions
 * - An optional fragment part is allowed, using JSON Path syntax
 *
 * @example "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.actor.profile/self"
 *
 * @see {@link https://atproto.com/specs/at-uri-scheme AT protocol - AT URI Scheme}
 */
export type AtUriString = AtUriStringBase | `${AtUriStringBase}${AtUriStringFragment}`;
/**
 * Type guard that checks if a value is a valid {@link AtUriString}
 *
 * @see {@link AtUriString}
 */
export declare function isAtUriString<I>(input: I, options?: Omit<ParseAtUriStringOptions, 'detailed'>): input is I & AtUriString;
/**
 * Returns the input if it is a valid {@link AtUriString} format string, or
 * `undefined` if it is not.
 *
 * @see {@link AtUriString}
 */
export declare function ifAtUriString<I>(input: I, options?: Omit<ParseAtUriStringOptions, 'detailed'>): undefined | (I & AtUriString);
/**
 * Casts a string to an {@link AtUriString} if it is a valid AT URI format
 * string, throwing an error if it is not.
 *
 * @throws InvalidAtUriError if the input string does not meet the atproto AT URI format requirements.
 * @see {@link AtUriString}
 */
export declare function asAtUriString<I>(input: I, options?: ParseAtUriStringOptions): I & AtUriString;
/**
 * Assert the validity of an {@link AtUriString}, throwing an error if the
 * {@link input} is not a valid AT URI.
 *
 * @throws InvalidAtUriError if the {@link input} is not a valid {@link AtUriString}
 */
export declare function assertAtUriString<I>(input: I, options?: ParseAtUriStringOptions): asserts input is I & AtUriString;
/**
 * Assert the **non-strict** validity of an {@link AtUriString}, throwing a
 * detailed error if the {@link input} is not a valid AT URI.
 *
 * @throws InvalidAtUriError if the {@link input} is not a valid {@link AtUriString}
 * @deprecated use {@link assertAtUriString} with `{ strict: false }` option instead
 */
export declare function ensureValidAtUri<I>(input: I): asserts input is I & AtUriString;
/**
 * Assert the (non-strict!) validity of an {@link AtUriString}, throwing an
 * error if the {@link input} is not a valid AT URI.
 *
 * @throws InvalidAtUriError if the {@link input} is not a valid {@link AtUriString}
 * @deprecated use {@link assertAtUriString} with `{ strict: false }` option instead
 */
export declare function ensureValidAtUriRegex<I>(input: I): asserts input is I & AtUriString;
/**
 * Type guard that checks if a value is a valid {@link AtUriString} format
 * string, without enforcing strict record key validation. This is useful for
 * cases where you want to allow a wider range of valid ATURIs, such as when
 * validating user input or when the record key is not relevant.
 *
 * @deprecated use {@link isAtUriString} with `{ strict: false }` option instead
 */
export declare function isValidAtUri<I>(input: I): input is I & AtUriString;
export declare class InvalidAtUriError extends Error {
}
export type ParseAtUriStringOptions = {
    /**
     * If true, the parser will enforce that the record key (rkey) part of the URI
     * is a valid record key (validated by {@link isValidRecordKey}). If false,
     * any non-empty string of allowed chars will be accepted as a record key.
     *
     * @default true
     */
    strict?: boolean;
    /**
     * If true, the parser will return detailed error messages for why a string is
     * not a valid AT URI. This option has no effect on the behavior of
     * {@link isAtUriString}, which will always return false for invalid strings
     * regardless of this option.
     *
     * @default false
     */
    detailed?: boolean;
};
export type AtUriParts = {
    authority: AtIdentifierString;
    query?: string;
    hash?: string;
} & ({
    collection?: NsidString;
    rkey?: undefined;
} | {
    collection: NsidString;
    rkey?: string;
});
/**
 * Parses a valid {@link AtUriString} into a {@link AtUriParts} object, or
 * returns a failure with a detailed error message if the string is not a valid
 * {@link AtUriString}.
 */
export declare function parseAtUriString(input: unknown, options?: ParseAtUriStringOptions): Result<AtUriParts>;
//# sourceMappingURL=aturi_validation.d.ts.map