import type { LexValue } from '@atproto/lex-data';
export declare const BASE64_NATIVE_THRESHOLD = 256;
export declare class JsonBytesDecoder {
    private readonly data;
    private readonly strict;
    private pos;
    constructor(data: Uint8Array, strict?: boolean);
    decode(): LexValue;
    private parseValue;
    private parseObject;
    private parseArray;
    private parseString;
    private parseEscapeSequence;
    private parseUnicodeEscape;
    private hexValue;
    private base64Value;
    private decodeUnescapedString;
    private parseNumber;
    private parseTrue;
    private parseFalse;
    private parseNull;
    private skipWhitespace;
}
//# sourceMappingURL=json-bytes-decoder.d.ts.map