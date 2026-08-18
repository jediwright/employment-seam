import { z } from 'zod';
import { CID } from '@atproto/lex-data';
const cidSchema = z.unknown().transform((obj, ctx) => {
    const cid = CID.asCID(obj);
    if (cid == null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Not a valid CID',
        });
        return z.NEVER;
    }
    return cid;
});
const carHeader = z.object({
    version: z.literal(1),
    roots: z.array(cidSchema),
});
export const schema = {
    cid: cidSchema,
    carHeader,
    bytes: z.instanceof(Uint8Array),
    string: z.string(),
    array: z.array(z.unknown()),
    map: z.record(z.string(), z.unknown()),
    unknown: z.unknown(),
};
export const def = {
    cid: {
        name: 'cid',
        schema: schema.cid,
    },
    carHeader: {
        name: 'CAR header',
        schema: schema.carHeader,
    },
    bytes: {
        name: 'bytes',
        schema: schema.bytes,
    },
    string: {
        name: 'string',
        schema: schema.string,
    },
    map: {
        name: 'map',
        schema: schema.map,
    },
    unknown: {
        name: 'unknown',
        schema: schema.unknown,
    },
};
//# sourceMappingURL=types.js.map