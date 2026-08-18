import { InvalidLexiconError, LexiconDefNotFoundError, ValidationError, isObj, } from './types.js';
import { toLexUri } from './util.js';
import { assertValidRecord, assertValidXrpcInput, assertValidXrpcMessage, assertValidXrpcOutput, assertValidXrpcParams, } from './validation.js';
import { object as validateObject } from './validators/complex.js';
/**
 * A collection of compiled lexicons.
 */
export class Lexicons {
    constructor(docs) {
        this.docs = new Map();
        this.defs = new Map();
        if (docs) {
            for (const doc of docs) {
                this.add(doc);
            }
        }
    }
    /**
     * @example clone a lexicon:
     * ```ts
     * const clone = new Lexicons(originalLexicon)
     * ```
     *
     * @example get docs array:
     * ```ts
     * const docs = Array.from(lexicons)
     * ```
     */
    [Symbol.iterator]() {
        return this.docs.values();
    }
    /**
     * Add a lexicon doc.
     */
    add(doc) {
        const uri = toLexUri(doc.id);
        if (this.docs.has(uri)) {
            throw new Error(`${uri} has already been registered`);
        }
        // WARNING
        // mutates the object
        // -prf
        resolveRefUris(doc, uri);
        this.docs.set(uri, doc);
        for (const [defUri, def] of iterDefs(doc)) {
            this.defs.set(defUri, def);
        }
    }
    /**
     * Remove a lexicon doc.
     */
    remove(uri) {
        uri = toLexUri(uri);
        const doc = this.docs.get(uri);
        if (!doc) {
            throw new Error(`Unable to remove "${uri}": does not exist`);
        }
        for (const [defUri, _def] of iterDefs(doc)) {
            this.defs.delete(defUri);
        }
        this.docs.delete(uri);
    }
    /**
     * Get a lexicon doc.
     */
    get(uri) {
        uri = toLexUri(uri);
        return this.docs.get(uri);
    }
    /**
     * Get a definition.
     */
    getDef(uri) {
        uri = toLexUri(uri);
        return this.defs.get(uri);
    }
    getDefOrThrow(uri, types) {
        const def = this.getDef(uri);
        if (!def) {
            throw new LexiconDefNotFoundError(`Lexicon not found: ${uri}`);
        }
        if (types && !types.includes(def.type)) {
            throw new InvalidLexiconError(`Not a ${types.join(' or ')} lexicon: ${uri}`);
        }
        return def;
    }
    /**
     * Validate a record or object.
     */
    validate(lexUri, value) {
        if (!isObj(value)) {
            throw new ValidationError(`Value must be an object`);
        }
        const lexUriNormalized = toLexUri(lexUri);
        const def = this.getDefOrThrow(lexUriNormalized, ['record', 'object']);
        if (def.type === 'record') {
            return validateObject(this, 'Record', def.record, value);
        }
        else if (def.type === 'object') {
            return validateObject(this, 'Object', def, value);
        }
        else {
            // shouldn't happen
            throw new InvalidLexiconError('Definition must be a record or object');
        }
    }
    /**
     * Validate a record and throw on any error.
     */
    assertValidRecord(lexUri, value) {
        if (!isObj(value)) {
            throw new ValidationError(`Record must be an object`);
        }
        if (!('$type' in value)) {
            throw new ValidationError(`Record/$type must be a string`);
        }
        const { $type } = value;
        if (typeof $type !== 'string') {
            throw new ValidationError(`Record/$type must be a string`);
        }
        const lexUriNormalized = toLexUri(lexUri);
        if (toLexUri($type) !== lexUriNormalized) {
            throw new ValidationError(`Invalid $type: must be ${lexUriNormalized}, got ${$type}`);
        }
        const def = this.getDefOrThrow(lexUriNormalized, ['record']);
        return assertValidRecord(this, def, value);
    }
    /**
     * Validate xrpc query params and throw on any error.
     */
    assertValidXrpcParams(lexUri, value) {
        lexUri = toLexUri(lexUri);
        const def = this.getDefOrThrow(lexUri, [
            'query',
            'procedure',
            'subscription',
        ]);
        return assertValidXrpcParams(this, def, value);
    }
    /**
     * Validate xrpc input body and throw on any error.
     */
    assertValidXrpcInput(lexUri, value) {
        lexUri = toLexUri(lexUri);
        const def = this.getDefOrThrow(lexUri, ['procedure']);
        return assertValidXrpcInput(this, def, value);
    }
    /**
     * Validate xrpc output body and throw on any error.
     */
    assertValidXrpcOutput(lexUri, value) {
        lexUri = toLexUri(lexUri);
        const def = this.getDefOrThrow(lexUri, ['query', 'procedure']);
        return assertValidXrpcOutput(this, def, value);
    }
    /**
     * Validate xrpc subscription message and throw on any error.
     */
    assertValidXrpcMessage(lexUri, value) {
        lexUri = toLexUri(lexUri);
        const def = this.getDefOrThrow(lexUri, ['subscription']);
        return assertValidXrpcMessage(this, def, value);
    }
    /**
     * Resolve a lex uri given a ref
     */
    resolveLexUri(lexUri, ref) {
        lexUri = toLexUri(lexUri);
        return toLexUri(ref, lexUri);
    }
}
function* iterDefs(doc) {
    for (const defId in doc.defs) {
        yield [`lex:${doc.id}#${defId}`, doc.defs[defId]];
        if (defId === 'main') {
            yield [`lex:${doc.id}`, doc.defs[defId]];
        }
    }
}
// WARNING
// this method mutates objects
// -prf
function resolveRefUris(obj, baseUri) {
    for (const k in obj) {
        if (obj.type === 'ref') {
            obj.ref = toLexUri(obj.ref, baseUri);
        }
        else if (obj.type === 'union') {
            obj.refs = obj.refs.map((ref) => toLexUri(ref, baseUri));
        }
        else if (Array.isArray(obj[k])) {
            obj[k] = obj[k].map((item) => {
                if (typeof item === 'string') {
                    return item.startsWith('#') ? toLexUri(item, baseUri) : item;
                }
                else if (item && typeof item === 'object') {
                    return resolveRefUris(item, baseUri);
                }
                return item;
            });
        }
        else if (obj[k] && typeof obj[k] === 'object') {
            obj[k] = resolveRefUris(obj[k], baseUri);
        }
    }
    return obj;
}
//# sourceMappingURL=lexicons.js.map