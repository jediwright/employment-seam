import { z } from 'zod';
export declare const isValidDidDoc: (doc: unknown) => doc is DidDocument;
export declare const getDid: (doc: DidDocument) => string;
export declare const getHandle: (doc: DidDocument) => string | undefined;
export declare const getSigningKey: (doc: DidDocument) => {
    type: string;
    publicKeyMultibase: string;
} | undefined;
export declare const getVerificationMaterial: (doc: DidDocument, keyId: string) => {
    type: string;
    publicKeyMultibase: string;
} | undefined;
export declare const getSigningDidKey: (doc: DidDocument) => string | undefined;
export declare const getPdsEndpoint: (doc: DidDocument) => string | undefined;
export declare const getFeedGenEndpoint: (doc: DidDocument) => string | undefined;
export declare const getNotifEndpoint: (doc: DidDocument) => string | undefined;
export declare const getServiceEndpoint: (doc: DidDocument, opts: {
    id: string;
    type?: string;
}) => string | undefined;
/**
 * @deprecated Use `DidDocument` from `@atproto/did` instead as it applies
 * stricter (and more spec-compliant) validation.
 */
export declare const didDocument: z.ZodObject<{
    '@context': z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"https://www.w3.org/ns/did/v1">, z.ZodArray<z.ZodString, "many">]>>;
    id: z.ZodString;
    alsoKnownAs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    verificationMethod: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        controller: z.ZodString;
        publicKeyJwk: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        publicKeyMultibase: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    }, {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    }>, "many">>;
    authentication: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        controller: z.ZodString;
        publicKeyJwk: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        publicKeyMultibase: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    }, {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    }>]>, "many">>;
    service: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        serviceEndpoint: z.ZodUnion<[z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>]>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: string;
        serviceEndpoint: string | Record<string, unknown>;
    }, {
        id: string;
        type: string;
        serviceEndpoint: string | Record<string, unknown>;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    '@context'?: "https://www.w3.org/ns/did/v1" | string[] | undefined;
    id: string;
    alsoKnownAs?: string[] | undefined;
    verificationMethod?: {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    }[] | undefined;
    authentication?: (string | {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    })[] | undefined;
    service?: {
        id: string;
        type: string;
        serviceEndpoint: string | Record<string, unknown>;
    }[] | undefined;
}, {
    '@context'?: "https://www.w3.org/ns/did/v1" | string[] | undefined;
    id: string;
    alsoKnownAs?: string[] | undefined;
    verificationMethod?: {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    }[] | undefined;
    authentication?: (string | {
        id: string;
        type: string;
        controller: string;
        publicKeyJwk?: Record<string, unknown> | undefined;
        publicKeyMultibase?: string | undefined;
    })[] | undefined;
    service?: {
        id: string;
        type: string;
        serviceEndpoint: string | Record<string, unknown>;
    }[] | undefined;
}>;
export type DidDocument = z.infer<typeof didDocument>;
//# sourceMappingURL=did-doc.d.ts.map