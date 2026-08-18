import { base64, base64url } from 'multiformats/bases/base64';
import { NodeJSBuffer } from './lib/nodejs-buffer.js';
const Buffer = NodeJSBuffer;
export const toBase64Native = typeof Uint8Array.prototype.toBase64 === 'function'
    ? function toBase64Native(bytes, alphabet = 'base64') {
        return bytes.toBase64({ alphabet, omitPadding: true });
    }
    : /* v8 ignore next -- @preserve */ null;
export const toBase64Node = Buffer
    ? function toBase64Node(bytes, alphabet = 'base64') {
        const buffer = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
        const b64 = buffer.toString(alphabet);
        // @NOTE We strip padding for strict compatibility with multiformats
        // behavior. Tests failing because of the presence of padding are not
        // really synonymous with an actual error and we might (should?) actually
        // want to keep the padding at some point.
        return b64.charCodeAt(b64.length - 1) === /* '=' */ 0x3d
            ? b64.charCodeAt(b64.length - 2) === /* '=' */ 0x3d
                ? b64.slice(0, -2) // '=='
                : b64.slice(0, -1) // '='
            : b64;
    }
    : /* v8 ignore next -- @preserve */ null;
export function toBase64Ponyfill(bytes, alphabet = 'base64') {
    const codec = alphabet === 'base64url' ? base64url : base64;
    // @NOTE multiformats requires to strip the prefix, which is definitely not
    // optimal. It might be worth considering a different library here.
    return codec.encoder.encode(bytes).slice(codec.prefix.length);
}
//# sourceMappingURL=uint8array-to-base64.js.map