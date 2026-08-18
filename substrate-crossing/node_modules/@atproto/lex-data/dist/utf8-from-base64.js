import { base64, base64url } from 'multiformats/bases/base64';
import { NodeJSBuffer } from './lib/nodejs-buffer.js';
const Buffer = NodeJSBuffer;
export const utf8FromBase64Node = Buffer
    ? function utf8FromBase64Node(b64, alphabet = 'base64') {
        return Buffer.from(b64, alphabet).toString('utf8');
    }
    : /* v8 ignore next -- @preserve */ null;
const textDecoder = /*#__PURE__*/ new TextDecoder();
export function utf8FromBase64Ponyfill(b64, alphabet) {
    const codec = alphabet === 'base64url' ? base64url : base64;
    const bytes = codec.decoder.decode(`${codec.prefix}${b64}`);
    return textDecoder.decode(bytes);
}
//# sourceMappingURL=utf8-from-base64.js.map