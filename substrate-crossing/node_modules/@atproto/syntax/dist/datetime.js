import * as isoDatestringValidator from 'iso-datestring-validator';
// Node ESM interop wraps "iso-datestring-validator" as { default: { ... } }
// @TODO Remove "iso-datestring-validator" dependency
const { isValidISODateString } = ((m) => m.default ?? m)(isoDatestringValidator);
/**
 * Indicates a date or string is not a valid representation of a datetime
 * according to the atproto
 * {@link https://atproto.com/specs/lexicon#datetime specification}.
 */
export class InvalidDatetimeError extends Error {
}
/**
 * @see {@link AtprotoDate}
 */
export function assertAtprotoDate(date) {
    const res = parseDate(date);
    if (!res.success) {
        throw new InvalidDatetimeError(res.message);
    }
}
/**
 * @see {@link AtprotoDate}
 */
export function asAtprotoDate(date) {
    assertAtprotoDate(date);
    return date;
}
/**
 * @see {@link AtprotoDate}
 */
export function isAtprotoDate(date) {
    return parseDate(date).success;
}
/**
 * @see {@link AtprotoDate}
 */
export function ifAtprotoDate(date) {
    return isAtprotoDate(date) ? date : undefined;
}
/**
 * Validates that a string is a valid {@link DatetimeString} format string,
 * throwing an error if it is not.
 *
 * @throws InvalidDatetimeError if the input string does not meet the atproto 'datetime' format requirements.
 * @see {@link DatetimeString}
 */
export function assertDatetimeString(input) {
    const result = parseString(input);
    if (!result.success) {
        throw new InvalidDatetimeError(result.message);
    }
}
/**
 * Casts a string to a {@link DatetimeString} if it is a valid datetime format
 * string, throwing an error if it is not.
 *
 * @throws InvalidDatetimeError if the input string does not meet the atproto 'datetime' format requirements.
 * @see {@link DatetimeString}
 */
export function asDatetimeString(input) {
    assertDatetimeString(input);
    return input;
}
/**
 * Checks if a string is a valid {@link DatetimeString} format string.
 *
 * @see {@link DatetimeString}
 */
export function isDatetimeString(input) {
    return parseString(input).success;
}
/**
 * Matches any ISO-ish datetime string. This is a more lenient check than
 * the strict {@link isDatetimeString} guard, which only allows datetimes that
 * fully conform to the AT Protocol specification (e.g. must include timezone).
 */
export function isDatetimeStringLenient(input) {
    // @NOTE the returned type assertion is inaccurate wrt. the DatetimeString
    // type definition. A more accurate solution would be to use a branded type
    // instead of a template literal for the "datetime" format
    if (typeof input !== 'string')
        return false;
    try {
        if (isValidISODateString(input))
            return true;
    }
    catch {
        // isValidISODateString can throw on some inputs.
    }
    // @NOTE The "iso-datestring-validator" implementation is *not* compliant with
    // the AT Protocol datetime specification. In particular, it rejects some
    // valid AT Protocol datetimes (eg: "1985-04-12T23:20:50.1235678912345Z",
    // "1985-04-12T23:20:50.123+01:45", "1985-04-12T23:20:50.1234567890Z"). For
    // this reason, we run "isDatetimeString" validation if "isValidISODateString"
    // does not return true.
    return isDatetimeString(input);
}
/**
 * Returns the input if it is a valid {@link DatetimeString} format string, or
 * `undefined` if it is not.
 *
 * @see {@link DatetimeString}
 */
export function ifDatetimeString(input) {
    return isDatetimeString(input) ? input : undefined;
}
/**
 * Returns the current date and time as a {@link DatetimeString}.
 *
 * @see {@link DatetimeString}
 */
export function currentDatetimeString() {
    return toDatetimeString(new Date());
}
/**
 * Converts any {@link Date} into a {@link DatetimeString} if possible, throwing
 * an error if the date is not a valid atproto datetime.
 *
 * This is short-hand for `asAtprotoDate(date).toISOString()`.
 *
 * @throws InvalidDatetimeError if the input date is not a valid atproto datetime (eg, it is too far in the future or past, or it normalizes to a negative year).
 * @see {@link DatetimeString}
 */
export function toDatetimeString(date) {
    return asAtprotoDate(date).toISOString();
}
/**
 * Takes a flexible datetime string and normalizes its representation.
 *
 * This function will work with any valid value that can be parsed as a date. It
 * *additionally* is more flexible about accepting datetimes that are missing
 * timezone information, and normalizing them to a valid atproto datetime.
 *
 * One use-case is a consistent, sortable string. Another is to work with older
 * invalid createdAt datetimes.
 *
 * @note This function might return different normalized strings for the same
 * input depending on the timezone of the machine it is run on, since it will
 * attempt to parse the input "as is" if it fails to parse with an explicit
 * timezone.
 *
 * @returns ISODatetimeString - a valid atproto datetime with millisecond precision (3 sub-second digits) and UTC timezone with trailing 'Z' syntax.
 * @throws InvalidDatetimeError - if the input string could not be parsed as a datetime, even with permissive parsing.
 */
export function normalizeDatetime(dtStr) {
    if (
    // Explicit timezone offset
    /[+-]\d\d:?\d\d/.test(dtStr) ||
        // 'Z' timezone designator
        /\dZ\b/.test(dtStr) ||
        // Timezone abbreviation (eg. "EST", "PST", "UTC", "GMT", etc), as in:
        // > Tue Mar 17 2026 16:38:44 PST (Pacific Standard Time)
        /\b[A-Z]{3,4}\b/.test(dtStr)) {
        // Since we do have a timezone designator, we can try parsing "as is" and
        // should get consistent results regardless of local timezone.
        // @NOTE NodeJS will reject dates with an un-recognized timezone designator
        // (like "AFT"), even if we add a well-known timezone abbreviation like
        // "UTC" or "Z".
        const date = new Date(dtStr);
        if (isAtprotoDate(date)) {
            return date.toISOString();
        }
    }
    else {
        // If there is no timezone information, try parsing as UTC using two
        // different syntaxes, falling back to parsing "as is".
        const dateZ = new Date(`${dtStr}Z`);
        if (isAtprotoDate(dateZ)) {
            return dateZ.toISOString();
        }
        const dateUTC = new Date(`${dtStr} UTC`);
        if (isAtprotoDate(dateUTC)) {
            return dateUTC.toISOString();
        }
        // Despite our best efforts to parse as a consistent value, appending "Z" or
        // " UTC" did not work, so we will try parsing "as is", which may yield
        // different results depending on the local timezone of the machine.
        const date = new Date(dtStr);
        if (isAtprotoDate(date)) {
            return date.toISOString();
        }
    }
    throw new InvalidDatetimeError('datetime did not parse as any timestamp format');
}
/**
 * Variant of {@link normalizeDatetime} which always returns a valid datetime
 * string.
 *
 * If a {@link InvalidDatetimeError} is encountered, returns the UNIX epoch time
 * as a UTC datetime (`1970-01-01T00:00:00.000Z`).
 *
 * @see {@link normalizeDatetime}
 */
export function normalizeDatetimeAlways(dtStr) {
    try {
        return normalizeDatetime(dtStr);
    }
    catch (err) {
        return '1970-01-01T00:00:00.000Z';
    }
}
// Legacy exports (should we deprecate these ?)
export { assertDatetimeString as ensureValidDatetime, isDatetimeString as isValidDatetime, };
const failure = (m) => ({ success: false, message: m });
const success = (v) => ({ success: true, value: v });
/**
 * @see {@link https://www.rfc-editor.org/rfc/rfc3339#section-5.6 Internet Date/Time Format}
 *
 * @example
 * ```abnf
 * date-fullyear   = 4DIGIT
 * date-month      = 2DIGIT  ; 01-12
 * date-mday       = 2DIGIT  ; 01-28, 01-29, 01-30, 01-31 based on
 *                           ; month/year
 * time-hour       = 2DIGIT  ; 00-23
 * time-minute     = 2DIGIT  ; 00-59
 * time-second     = 2DIGIT  ; 00-58, 00-59, 00-60 based on leap second
 *                           ; rules
 * time-secfrac    = "." 1*DIGIT
 * time-numoffset  = ("+" / "-") time-hour ":" time-minute
 * time-offset     = "Z" / time-numoffset
 * partial-time    = time-hour ":" time-minute ":" time-second
 *                   [time-secfrac]
 * full-date       = date-fullyear "-" date-month "-" date-mday
 * full-time       = partial-time time-offset
 * date-time       = full-date "T" full-time
 * ```
 */
const DATETIME_REGEX = /^(?<full_year>[0-9]{4})-(?<date_month>0[1-9]|1[012])-(?<date_mday>[0-2][0-9]|3[01])T(?<time_hour>[0-1][0-9]|2[0-3]):(?<time_minute>[0-5][0-9]):(?<time_second>[0-5][0-9]|60)(?<time_secfrac>\.[0-9]+)?(?<time_offset>Z|(?<time_numoffset>[+-](?:[0-1][0-9]|2[0-3]):[0-5][0-9]))$/;
/**
 * Validates that the input is a datetime string according to atproto Lexicon
 * rules, and parses it into a Date object.
 */
function parseString(input) {
    // @NOTE Performing cheap tests first
    if (typeof input !== 'string') {
        return failure('datetime must be a string');
    }
    if (input.length > 64) {
        return failure('datetime is too long (64 chars max)');
    }
    if (input.endsWith('-00:00')) {
        return failure('datetime can not use "-00:00" for UTC timezone');
    }
    if (!DATETIME_REGEX.test(input)) {
        return failure("datetime is not in a valid format (must match RFC 3339 & ISO 8601 with 'Z' or ±hh:mm timezone)");
    }
    // must parse as ISO 8601; this also verifies semantics like leap seconds and
    // correct number of days in month, which the regex does not check for
    const date = new Date(input);
    return parseDate(date);
}
/**
 * Ensures that a Date object represents a valid datetime according to atproto
 * Lexicon rules. This ensures that `date.toISOString()` will produce a valid
 * datetime string that can be used where {@link DatetimeString} is expected.
 */
function parseDate(date) {
    const fullYear = date.getUTCFullYear();
    // Ensures that the date is valid. We could check isNaN(date.getTime()) here
    // but since we'll check the year anyway, we just use that for the validity
    // check since an invalid date will have NaN year.
    if (Number.isNaN(fullYear)) {
        return failure('datetime did not parse as ISO 8601');
    }
    // Ensure that the ISO string representation does not start with ±YYYYYY
    if (fullYear < 0) {
        return failure('datetime normalized to a negative time');
    }
    if (fullYear > 9999) {
        return failure('datetime year is too far in the future');
    }
    return success(date);
}
//# sourceMappingURL=datetime.js.map