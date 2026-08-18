import { s32decode, s32encode } from './util.js';
const TID_LEN = 13;
let lastTimestamp = 0;
let timestampCount = 0;
let clockid = null;
function dedash(str) {
    return str.replaceAll('-', '');
}
export class TID {
    constructor(str) {
        const noDashes = dedash(str);
        if (noDashes.length !== TID_LEN) {
            throw new Error(`Poorly formatted TID: ${noDashes.length} length`);
        }
        this.str = noDashes;
    }
    static next(prev) {
        // javascript does not have microsecond precision
        // instead, we append a counter to the timestamp to indicate if multiple timestamps were created within the same millisecond
        // take max of current time & last timestamp to prevent tids moving backwards if system clock drifts backwards
        const time = Math.max(Date.now(), lastTimestamp);
        if (time === lastTimestamp) {
            timestampCount++;
        }
        lastTimestamp = time;
        const timestamp = time * 1000 + timestampCount;
        // the bottom 32 clock ids can be randomized & are not guaranteed to be collision resistant
        // we use the same clockid for all tids coming from this machine
        if (clockid === null) {
            clockid = Math.floor(Math.random() * 32);
        }
        const tid = TID.fromTime(timestamp, clockid);
        if (!prev || tid.newerThan(prev)) {
            return tid;
        }
        return TID.fromTime(prev.timestamp() + 1, clockid);
    }
    static nextStr(prev) {
        return TID.next(prev ? new TID(prev) : undefined).toString();
    }
    static fromTime(timestamp, clockid) {
        // base32 encode with encoding variant sort (s32)
        const str = `${s32encode(timestamp)}${s32encode(clockid).padStart(2, '2')}`;
        return new TID(str);
    }
    static fromStr(str) {
        return new TID(str);
    }
    static oldestFirst(a, b) {
        return a.compareTo(b);
    }
    static newestFirst(a, b) {
        return b.compareTo(a);
    }
    static is(str) {
        return dedash(str).length === TID_LEN;
    }
    timestamp() {
        return s32decode(this.str.slice(0, 11));
    }
    clockid() {
        return s32decode(this.str.slice(11, 13));
    }
    formatted() {
        const str = this.toString();
        return `${str.slice(0, 4)}-${str.slice(4, 7)}-${str.slice(7, 11)}-${str.slice(11, 13)}`;
    }
    toString() {
        return this.str;
    }
    // newer > older
    compareTo(other) {
        if (this.str > other.str)
            return 1;
        if (this.str < other.str)
            return -1;
        return 0;
    }
    equals(other) {
        return this.str === other.str;
    }
    newerThan(other) {
        return this.compareTo(other) > 0;
    }
    olderThan(other) {
        return this.compareTo(other) < 0;
    }
}
//# sourceMappingURL=tid.js.map