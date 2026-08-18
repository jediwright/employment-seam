import { ensureValidAtIdentifier, isDidIdentifier } from './at-identifier.js';
import { InvalidDidError } from './did.js';
import { ensureValidNsid } from './nsid.js';
import { ensureValidRecordKey } from './recordkey.js';
export * from './aturi_validation.js';
export const ATP_URI_REGEX = 
// proto-    --did--------------   --name----------------   --path----   --query--   --hash--
/^(at:\/\/)?((?:did:[a-z0-9:%-]+)|(?:[a-z0-9][a-z0-9.:-]*))(\/[^?#\s]*)?(\?[^#\s]+)?(#[^\s]+)?$/i;
//                       --path-----   --query--  --hash--
const RELATIVE_REGEX = /^(\/[^?#\s]*)?(\?[^#\s]+)?(#[^\s]+)?$/i;
export class AtUri {
    constructor(uri, base) {
        const parsed = base !== undefined
            ? typeof base === 'string'
                ? Object.assign(parse(base), parseRelative(uri))
                : Object.assign({ host: base.host }, parseRelative(uri))
            : parse(uri);
        ensureValidAtIdentifier(parsed.host);
        this.hash = parsed.hash ?? '';
        this.host = parsed.host;
        this.pathname = parsed.pathname ?? '';
        this.searchParams = parsed.searchParams;
    }
    static make(handleOrDid, collection, rkey) {
        let str = handleOrDid;
        if (collection)
            str += '/' + collection;
        if (rkey)
            str += '/' + rkey;
        return new AtUri(str);
    }
    get protocol() {
        return 'at:';
    }
    get origin() {
        return `at://${this.host}`;
    }
    get did() {
        const { host } = this;
        if (isDidIdentifier(host))
            return host;
        throw new InvalidDidError(`AtUri "${this}" does not have a DID hostname`);
    }
    get hostname() {
        return this.host;
    }
    set hostname(v) {
        ensureValidAtIdentifier(v);
        this.host = v;
    }
    get search() {
        return this.searchParams.toString();
    }
    set search(v) {
        this.searchParams = new URLSearchParams(v);
    }
    get collection() {
        return this.pathname.split('/').filter(Boolean)[0] || '';
    }
    get collectionSafe() {
        const { collection } = this;
        ensureValidNsid(collection);
        return collection;
    }
    set collection(v) {
        ensureValidNsid(v);
        this.unsafelySetCollection(v);
    }
    unsafelySetCollection(v) {
        const parts = this.pathname.split('/').filter(Boolean);
        parts[0] = v;
        this.pathname = parts.join('/');
    }
    get rkey() {
        return this.pathname.split('/').filter(Boolean)[1] || '';
    }
    get rkeySafe() {
        const { rkey } = this;
        ensureValidRecordKey(rkey);
        return rkey;
    }
    set rkey(v) {
        ensureValidRecordKey(v);
        this.unsafelySetRkey(v);
    }
    unsafelySetRkey(v) {
        const parts = this.pathname.split('/').filter(Boolean);
        parts[0] ||= 'undefined';
        parts[1] = v;
        this.pathname = parts.join('/');
    }
    get href() {
        return this.toString();
    }
    toString() {
        let pathname = this.pathname;
        if (pathname && !pathname.startsWith('/')) {
            pathname = `/${pathname}`;
        }
        while (pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1);
        }
        let qs = '';
        if (this.searchParams.size) {
            qs = `?${this.searchParams.toString()}`;
        }
        // @NOTE We keep the hash as-is, even if it doesn't start with a '/'.
        let fragment = this.hash;
        if (fragment === '#') {
            fragment = '';
        }
        else if (fragment && !fragment.startsWith('#')) {
            fragment = `#${fragment}`;
        }
        return `at://${this.host}${pathname}${qs}${fragment}`;
    }
}
function parse(str) {
    const match = str.match(ATP_URI_REGEX);
    if (!match) {
        throw new Error(`Invalid AT uri: ${str}`);
    }
    return {
        host: match[2],
        hash: match[5],
        pathname: match[3],
        searchParams: new URLSearchParams(match[4]),
    };
}
function parseRelative(str) {
    const match = str.match(RELATIVE_REGEX);
    if (!match) {
        throw new Error(`Invalid path: ${str}`);
    }
    return {
        hash: match[3],
        pathname: match[1],
        searchParams: new URLSearchParams(match[2]),
    };
}
//# sourceMappingURL=aturi.js.map