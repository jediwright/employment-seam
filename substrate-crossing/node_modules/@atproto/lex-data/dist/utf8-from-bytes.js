import { NodeJSBuffer } from './lib/nodejs-buffer.js';
const Buffer = NodeJSBuffer;
export const utf8FromBytesNode = Buffer
    ? function utf8FromBytesNode(bytes) {
        // @NOTE Buffer.from(bytes) creates a copy of the ArrayBuffer. The following
        // allows us to avoid the copy by creating a Buffer that shares the same
        // memory as the input Uint8Array.
        const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return buffer.toString('utf8');
    }
    : /* v8 ignore next -- @preserve */ null;
export function utf8FromBytesNative(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
}
//# sourceMappingURL=utf8-from-bytes.js.map