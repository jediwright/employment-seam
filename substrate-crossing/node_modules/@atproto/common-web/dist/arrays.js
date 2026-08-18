export function keyBy(arr, key) {
    return arr.reduce((acc, cur) => {
        acc.set(cur[key], cur);
        return acc;
    }, new Map());
}
export const mapDefined = (arr, fn) => {
    const output = [];
    for (const item of arr) {
        const val = fn(item);
        if (val !== undefined) {
            output.push(val);
        }
    }
    return output;
};
//# sourceMappingURL=arrays.js.map