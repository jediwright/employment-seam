import { lexEquals } from '@atproto/lex-data';
import { jsonToLex, lexToJson } from '@atproto/lex-json';
/**
 * Converts a JSON-compatible value to an IPLD-compatible value.
 * @deprecated Use {@link jsonToLex} from `@atproto/lex-cbor` instead.
 */
export const jsonToIpld = (val) => {
    return jsonToLex(val, { strict: false });
};
/**
 * Converts an IPLD-compatible value to a JSON-compatible value.
 * @deprecated Use {@link lexToJson} from `@atproto/lex-cbor` instead.
 */
export const ipldToJson = (val) => {
    // Legacy behavior(s)
    if (val === undefined)
        return val;
    if (Number.isNaN(val))
        return val;
    return lexToJson(val);
};
/**
 * Compares two IPLD-compatible values for deep equality.
 * @deprecated Use {@link lexEquals} from `@atproto/lex-cbor` instead.
 */
export const ipldEquals = (a, b) => {
    if (!lexEquals(a, b))
        return false;
    // @NOTE The previous implementation used "===" which treats NaN as unequal to
    // NaN.
    if (Number.isNaN(a))
        return false;
    return true;
};
//# sourceMappingURL=ipld.js.map