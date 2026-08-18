import { type ValidationResult } from '../types.js';
export declare const datetime: <V extends string>(path: string, value: V) => ValidationResult<V & (`${string}-${string}-${string}T${string}:${string}:${string}+${string}:${string}` | `${string}-${string}-${string}T${string}:${string}:${string}-${string}:${string}` | `${string}-${string}-${string}T${string}:${string}:${string}Z`)>;
export declare const uri: <V extends string>(path: string, value: V) => ValidationResult<V & `${string}:${string}`>;
export declare const atUri: <V extends string>(path: string, value: V) => ValidationResult<V & (`at://${string}.${string}` | `at://${string}.${string}#/${string}` | `at://${string}.${string}/${string}.${string}.${string}` | `at://${string}.${string}/${string}.${string}.${string}#/${string}` | `at://${string}.${string}/${string}.${string}.${string}/${string}` | `at://${string}.${string}/${string}.${string}.${string}/${string}#/${string}` | `at://did:${string}:${string}` | `at://did:${string}:${string}#/${string}` | `at://did:${string}:${string}/${string}.${string}.${string}` | `at://did:${string}:${string}/${string}.${string}.${string}#/${string}` | `at://did:${string}:${string}/${string}.${string}.${string}/${string}` | `at://did:${string}:${string}/${string}.${string}.${string}/${string}#/${string}`)>;
export declare const did: <V extends string>(path: string, value: V) => ValidationResult<V & `did:${string}:${string}`>;
export declare const handle: <V extends string>(path: string, value: V) => ValidationResult<V & `${string}.${string}`>;
export declare const atIdentifier: <V extends string>(path: string, value: V) => ValidationResult<V & (`${string}.${string}` | `did:${string}:${string}`)>;
export declare const nsid: <V extends string>(path: string, value: V) => ValidationResult<V & `${string}.${string}.${string}`>;
export declare const cid: <V extends string>(path: string, value: V) => ValidationResult<V>;
export declare const language: (path: string, value: string) => ValidationResult<string>;
export declare const tid: <V extends string>(path: string, value: V) => ValidationResult<V>;
export declare const recordKey: <V extends string>(path: string, value: V) => ValidationResult<V>;
//# sourceMappingURL=formats.d.ts.map