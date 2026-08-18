// Explicitly not using "zod" types here to avoid mismatching types due to
// version differences.
export const is = (obj, def) => {
    return def.safeParse(obj).success;
};
export const create = (def) => (v) => def.safeParse(v).success;
export const assure = (def, obj) => {
    return def.parse(obj);
};
export const isObject = (obj) => {
    return typeof obj === 'object' && obj !== null;
};
//# sourceMappingURL=check.js.map