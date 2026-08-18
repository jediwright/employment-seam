import type { Lexicons } from './lexicons.js';
import type { LexRecord, LexXrpcProcedure, LexXrpcQuery, LexXrpcSubscription } from './types.js';
export declare function assertValidRecord(lexicons: Lexicons, def: LexRecord, value: unknown): unknown;
export declare function assertValidXrpcParams(lexicons: Lexicons, def: LexXrpcProcedure | LexXrpcQuery | LexXrpcSubscription, value: unknown): Record<string, unknown> | undefined;
export declare function assertValidXrpcInput(lexicons: Lexicons, def: LexXrpcProcedure, value: unknown): unknown;
export declare function assertValidXrpcOutput(lexicons: Lexicons, def: LexXrpcProcedure | LexXrpcQuery, value: unknown): unknown;
export declare function assertValidXrpcMessage(lexicons: Lexicons, def: LexXrpcSubscription, value: unknown): unknown;
//# sourceMappingURL=validation.d.ts.map