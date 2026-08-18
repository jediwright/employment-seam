export function toHexString(number) {
    return `0x${number.toString(16).padStart(2, '0')}`;
}
export function isUint8(val) {
    return Number.isInteger(val) && val >= 0 && val < 256;
}
//# sourceMappingURL=util.js.map