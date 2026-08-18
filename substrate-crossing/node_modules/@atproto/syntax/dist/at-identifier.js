import { ensureValidDidRegex, isValidDid } from './did.js';
import { InvalidHandleError, ensureValidHandleRegex, isValidHandle, } from './handle.js';
/**
 * Discriminates {@link HandleString} from a valid {@link AtIdentifierString}.
 *
 * @return `true` if the identifier is a handle, `false` otherwise
 */
export function isHandleIdentifier(id) {
    return !isDidIdentifier(id);
}
/**
 * Discriminates {@link DidString} from a valid {@link AtIdentifierString}.
 *
 * @return `true` if the identifier is a DID, `false` otherwise
 */
export function isDidIdentifier(id) {
    return id.startsWith('did:');
}
/**
 * Validates that a string is a valid {@link AtIdentifierString} format string,
 * throwing an error if it is not.
 *
 * @throws InvalidHandleError if the input string does not meet the atproto 'datetime' format requirements.
 * @see {@link AtIdentifierString}
 */
export function assertAtIdentifierString(input) {
    try {
        if (!input || typeof input !== 'string') {
            throw new TypeError('Identifier must be a non-empty string');
        }
        else if (input.startsWith('did:')) {
            ensureValidDidRegex(input);
        }
        else {
            ensureValidHandleRegex(input);
        }
    }
    catch (cause) {
        throw new InvalidHandleError('Invalid DID or handle', { cause });
    }
}
/**
 * Casts a string to a {@link AtIdentifierString} if it is a valid at-identifier
 * string, throwing an error if it is not.
 *
 * @throws InvalidHandleError if the input string does not meet the atproto 'at-identifier' format requirements.
 * @see {@link AtIdentifierString}
 */
export function asAtIdentifierString(input) {
    assertAtIdentifierString(input);
    return input;
}
/**
 * Type guard that checks if a value is a valid AT identifier (DID or handle).
 *
 * @param value - The value to check
 * @returns `true` if the value is a valid AT identifier
 * @see {@link AtIdentifierString}
 */
export function isAtIdentifierString(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }
    else if (input.startsWith('did:')) {
        return isValidDid(input);
    }
    else {
        return isValidHandle(input);
    }
}
/**
 * Returns the input if it is a valid {@link AtIdentifierString} format string, or
 * `undefined` if it is not.
 *
 * @see {@link AtIdentifierString}
 */
export function ifAtIdentifierString(input) {
    return isAtIdentifierString(input) ? input : undefined;
}
// Legacy exports (should we deprecate these ?)
export { assertAtIdentifierString as ensureValidAtIdentifier, isAtIdentifierString as isValidAtIdentifier, };
//# sourceMappingURL=at-identifier.js.map