type Encoding = 'utf8' | 'base64' | 'base64url';
type WithImplicitCoercion<T> = T | {
    valueOf(): T;
};
interface NodeJSBuffer<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> extends Uint8Array<TArrayBuffer> {
    byteLength: number;
    toString(encoding?: Encoding): string;
    slice(start?: number, end?: number): NodeJSBuffer<ArrayBuffer>;
    subarray(start?: number, end?: number): NodeJSBuffer<TArrayBuffer>;
}
interface NodeJSBufferConstructor {
    new (input: string, encoding?: Encoding): NodeJSBuffer;
    from(string: WithImplicitCoercion<string>, encoding?: BufferEncoding): NodeJSBuffer<ArrayBuffer>;
    from(arrayOrString: WithImplicitCoercion<ArrayLike<number> | string>): NodeJSBuffer<ArrayBuffer>;
    from<TArrayBuffer extends ArrayBufferLike>(arrayBuffer: WithImplicitCoercion<TArrayBuffer>, byteOffset?: number, length?: number): NodeJSBuffer<TArrayBuffer>;
    concat(list: readonly Uint8Array[], totalLength?: number): NodeJSBuffer<ArrayBuffer>;
    byteLength(input: string, encoding?: Encoding): number;
    prototype: NodeJSBuffer;
}
export declare const NodeJSBuffer: NodeJSBufferConstructor | null;
export {};
//# sourceMappingURL=nodejs-buffer.d.ts.map