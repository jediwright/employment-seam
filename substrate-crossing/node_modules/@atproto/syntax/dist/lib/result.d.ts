export type Result<T> = Success<T> | Failure;
export type Success<T> = {
    success: true;
    value: T;
};
export declare function success<T>(value: T): Success<T>;
export type Failure = {
    success: false;
    message: string;
};
export declare function failure(message: string): Failure;
//# sourceMappingURL=result.d.ts.map