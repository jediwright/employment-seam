import { z } from 'zod';
import { CID } from '@atproto/lex-data';
import type { Def } from './check.js';
declare const carHeader: z.ZodObject<{
    version: z.ZodLiteral<1>;
    roots: z.ZodArray<z.ZodEffects<z.ZodUnknown, CID<unknown, number, number, import("multiformats/cid").Version>, unknown>, "many">;
}, "strip", z.ZodTypeAny, {
    version: 1;
    roots: CID<unknown, number, number, import("multiformats/cid").Version>[];
}, {
    version: 1;
    roots: unknown[];
}>;
export type CarHeader = z.infer<typeof carHeader>;
export declare const schema: {
    cid: z.ZodEffects<z.ZodUnknown, CID<unknown, number, number, import("multiformats/cid").Version>, unknown>;
    carHeader: z.ZodObject<{
        version: z.ZodLiteral<1>;
        roots: z.ZodArray<z.ZodEffects<z.ZodUnknown, CID<unknown, number, number, import("multiformats/cid").Version>, unknown>, "many">;
    }, "strip", z.ZodTypeAny, {
        version: 1;
        roots: CID<unknown, number, number, import("multiformats/cid").Version>[];
    }, {
        version: 1;
        roots: unknown[];
    }>;
    bytes: z.ZodType<Uint8Array<ArrayBufferLike>, z.ZodTypeDef, Uint8Array<ArrayBufferLike>>;
    string: z.ZodString;
    array: z.ZodArray<z.ZodUnknown, "many">;
    map: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    unknown: z.ZodUnknown;
};
export declare const def: {
    cid: Def<CID>;
    carHeader: Def<CarHeader>;
    bytes: Def<Uint8Array>;
    string: Def<string>;
    map: Def<Record<string, unknown>>;
    unknown: Def<unknown>;
};
export type ArrayEl<A> = A extends readonly (infer T)[] ? T : never;
export type NotEmptyArray<T> = [T, ...T[]];
export {};
//# sourceMappingURL=types.d.ts.map