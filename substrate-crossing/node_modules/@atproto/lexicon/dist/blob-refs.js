import { CID } from 'multiformats/cid';
import { z } from 'zod';
import { check, ipldToJson, schema } from '@atproto/common-web';
export const typedJsonBlobRef = z
    .object({
    $type: z.literal('blob'),
    ref: schema.cid,
    mimeType: z.string(),
    size: z.number(),
})
    .strict();
export const untypedJsonBlobRef = z
    .object({
    cid: z.string(),
    mimeType: z.string(),
})
    .strict();
export const jsonBlobRef = z.union([typedJsonBlobRef, untypedJsonBlobRef]);
export class BlobRef {
    constructor(ref, mimeType, size, original) {
        this.ref = ref;
        this.mimeType = mimeType;
        this.size = size;
        this.original = original ?? {
            $type: 'blob',
            ref,
            mimeType,
            size,
        };
    }
    static asBlobRef(obj) {
        if (check.is(obj, jsonBlobRef)) {
            return BlobRef.fromJsonRef(obj);
        }
        return null;
    }
    static fromJsonRef(json) {
        if (check.is(json, typedJsonBlobRef)) {
            return new BlobRef(json.ref, json.mimeType, json.size);
        }
        else {
            return new BlobRef(CID.parse(json.cid), json.mimeType, -1, json);
        }
    }
    ipld() {
        return this.original;
    }
    toJSON() {
        return ipldToJson(this.ipld());
    }
}
//# sourceMappingURL=blob-refs.js.map