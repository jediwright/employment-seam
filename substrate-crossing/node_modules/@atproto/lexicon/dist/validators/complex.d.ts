import type { Lexicons } from '../lexicons.js';
import type { LexArray, LexRefVariant, LexUserType, ValidationResult } from '../types.js';
export declare function validate(lexicons: Lexicons, path: string, def: LexUserType, value: unknown): ValidationResult;
export declare function array(lexicons: Lexicons, path: string, def: LexArray, value: unknown): ValidationResult;
export declare function object(lexicons: Lexicons, path: string, def: LexUserType, value: unknown): ValidationResult;
export declare function validateOneOf(lexicons: Lexicons, path: string, def: LexRefVariant | LexUserType, value: unknown, mustBeObj?: boolean): ValidationResult;
//# sourceMappingURL=complex.d.ts.map