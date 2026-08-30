/**
 * PC#8 Phase 3 Item 3.1 — Run 6 in-container tests (brief v0.1.3 §4 Vitest
 * list). Two groups:
 *
 *   Unit (mem handles): per-document `isReader` gating incl. relay-level
 *   block; `sourceLineage` validation (empty rejected); deterministic
 *   assembly (same inputs → same bytes, twice); `createdAt` max rule;
 *   hash-not-length digest block; no-orphan-on-block. Transport-independent;
 *   unchanged from the S4 held code.
 *
 *   Substrate (real Keyhive, TWO individuals, ENCRYPTED transport — spike
 *   record r1 §2 D-1..D-6, SL-0186): initializeAutomergeRepoKeyhive +
 *   subduction, paired in-process over the PairNetworkAdapter via
 *   `repo.subductionAdapters`, no sync server. The three public-subset legs
 *   in the runner's order (ruling R-A) — negative (access-layer block on
 *   section_c presented by ID), adversarial (foreign bytes → digest block),
 *   positive (fires; intent names the assembly document; lineage names a
 *   and b, not c; completion minted in the assembly document). The
 *   un-granted probe asserts the capability property: section_c is NOT
 *   decryptable by the actor — ciphertext transits, plaintext does not.
 *   The full timing evidence is the spike test under test/spike/.
 */
import { describe, it, expect } from 'vitest';
import '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import { PairNetworkAdapter } from './helpers/pair-network-adapter.js';
import { DummyStorageAdapter } from '@automerge/automerge-repo/helpers/DummyStorageAdapter.js';
import {
  initializeAutomergeRepoKeyhive,
  Access,
} from '@automerge/automerge-repo-keyhive';
import {
  initiateCrossing,
  validateCrossingIntentRecord,
  REQUIRED_FIELDS,
  type CrossingIntentRecord,
  type CrossingLogEntry,
  type CrossingInputHandle,
  type GateCheckFn,
} from '../src/crossing-intent.js';
import {
  assembleCrossingContent,
  assembledContentDigest,
  buildSourceLineage,
  validateSourceLineage,
} from '../src/assembly.js';
import { canonicalJson } from '../src/canonical-json.js';
import { authorizedContentDigest } from '../src/digest.js';
import {
  writeCrossingCompletion,
  deriveDocumentCrossingState,
  type CompletionDocShape,
} from '../src/crossing-completion.js';
import { createCompletionHook } from '../src/crossing-fire.js';
import { buildSeamCrossingRef } from '../src/seam-crossing-ref.js';

const TEST_DID = 'did:plc:testoperator0000000000000';
const ACK = 'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request.';
const IDENTITY = { grantorDID: TEST_DID, targetDID: TEST_DID, identityCustodyClass: 'provider-custodied' as const };

function memInput(url: string, c: { title: string; content: string; createdAt?: string | null }): CrossingInputHandle {
  return { url, doc: () => ({ ...c }), heads: () => [`${url}-head`] };
}
function memAssembly(url = 'automerge:memasm') {
  const doc: CompletionDocShape = { title: '', content: '', createdAt: null };
  return {
    url,
    heads: () => ['asmhead'],
    change(fn: (d: CompletionDocShape) => void) { fn(doc); },
    doc() { return JSON.parse(JSON.stringify(doc)) as CompletionDocShape; },
  };
}
const A = { title: 'Section A', content: 'alpha', createdAt: '2026-08-29T10:00:00.000Z' };
const B = { title: 'Section B', content: 'beta', createdAt: '2026-08-29T11:00:00.000Z' };
const passAll: GateCheckFn = async ({ documentURI }) => ({
  result: 'pass', grantReference: 'keyhive:test:read', gateCheckedAt: new Date().toISOString(), access: 'Read', documentURI,
});
const neverFire = async () => { throw new Error('putRecord must not fire'); };
const horizon = () => new Date(Date.now() + 60_000).toISOString();

// ---------------------------------------------------------------------------
describe('Item 3.1 — assembly (D-3 / D-5)', () => {
  it('deterministic: same inputs → same bytes, twice; title from first; \\n\\n join in fixed order', () => {
    const one = assembleCrossingContent([A, B]);
    const two = assembleCrossingContent([A, B]);
    expect(canonicalJson(one)).toBe(canonicalJson(two));
    expect(assembledContentDigest(one)).toBe(assembledContentDigest(two));
    expect(one.title).toBe('Section A');
    expect(one.content).toBe('alpha\n\nbeta');
    // Order matters — [B, A] is a different assembly.
    expect(assembledContentDigest(assembleCrossingContent([B, A]))).not.toBe(assembledContentDigest(one));
    // No third digest implementation: assembledContentDigest == digest.ts on the same object.
    expect(assembledContentDigest(one)).toBe(authorizedContentDigest(one));
    expect(() => assembleCrossingContent([])).toThrow();
  });

  it('createdAt = maximum across inputs in fixed order, or null if none; never the assembly clock', () => {
    expect(assembleCrossingContent([A, B]).createdAt).toBe(B.createdAt);
    expect(assembleCrossingContent([B, A]).createdAt).toBe(B.createdAt);
    expect(assembleCrossingContent([{ ...A, createdAt: undefined }, { ...B, createdAt: null }]).createdAt).toBeNull();
    expect(assembleCrossingContent([{ ...A, createdAt: undefined }, B]).createdAt).toBe(B.createdAt);
    // Digest of a null-createdAt assembly equals the documented absent-as-null serialization.
    const n = assembleCrossingContent([{ title: 't', content: 'c' }]);
    expect(assembledContentDigest(n)).toBe(authorizedContentDigest({ title: 't', content: 'c' }));
  });

  it('sourceLineage: one entry per input in order; empty rejected by the validator and by the seam', async () => {
    const lineage = buildSourceLineage([
      { documentURI: 'automerge:a', documentCID: 'ha', content: A },
      { documentURI: 'automerge:b', documentCID: 'hb', content: B },
    ]);
    expect(lineage.map((l) => l.documentURI)).toEqual(['automerge:a', 'automerge:b']);
    expect(lineage[0].contentDigest).toBe(authorizedContentDigest(A));
    expect(validateSourceLineage(lineage)).toEqual([]);
    expect(validateSourceLineage([]).length).toBeGreaterThan(0);
    expect(validateSourceLineage([{ documentURI: 'x', documentCID: 'y', contentDigest: 'nothex' }]).length).toBeGreaterThan(0);
    expect(REQUIRED_FIELDS).toContain('sourceLineage');
    expect(REQUIRED_FIELDS).toHaveLength(22);
    await expect(initiateCrossing({
      inputs: [], handle: memAssembly(), presentedContent: A, gateCheck: passAll, putRecord: neverFire,
      identity: IDENTITY, targetPDS: 'https://bsky.social', regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(),
    })).rejects.toThrow(/at least one input/);
  });
});

// ---------------------------------------------------------------------------
describe('Item 3.1 — gate order and blocks (D-4 / D-1 r2 / D-3)', () => {
  it('per-document isReader gate: a relay-level grant on one input blocks, names the document, writes nothing', async () => {
    const gate: GateCheckFn = async ({ documentURI }) =>
      documentURI === 'automerge:b'
        ? { result: 'blocked', grantReference: null, gateCheckedAt: new Date().toISOString(), access: 'Relay', documentURI, reason: 'access level Relay is below read' }
        : { result: 'pass', grantReference: 'keyhive:test:read', gateCheckedAt: new Date().toISOString(), access: 'Read', documentURI };
    const asm = memAssembly();
    const log: CrossingLogEntry[] = [];
    const bRead = { called: false };
    const inputB: CrossingInputHandle = { url: 'automerge:b', doc: () => { bRead.called = true; return B; } };
    const out = await initiateCrossing({
      inputs: [memInput('automerge:a', A), inputB], handle: asm, presentedContent: assembleCrossingContent([A, B]),
      gateCheck: gate, putRecord: neverFire, identity: IDENTITY, targetPDS: 'https://bsky.social',
      regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(), log,
    });
    expect(out.status).toBe('gate-blocked');
    if (out.status === 'gate-blocked') expect(out.reason).toContain('automerge:b');
    expect(bRead.called).toBe(false); // no input is read before every gate passes
    const events = log.map((l) => l.event);
    expect(events).toContain('gate-check-blocked');
    expect(events).not.toContain('assembly-completed');
    expect(events).not.toContain('assembly-document-written');
    expect(events).not.toContain('intent-record-written');
    const d = asm.doc();
    expect(d.title).toBe(''); expect(d.crossingRecords ?? []).toHaveLength(0);
  });

  it('digest check blocks on hash inequality, not length: a same-length foreign payload is blocked; nothing written', async () => {
    const assembled = assembleCrossingContent([A, B]);
    // Same length, different bytes — a length check would pass this.
    const tampered = { ...assembled, content: assembled.content.replace('alpha', 'alphb') };
    expect(tampered.content.length).toBe(assembled.content.length);
    const asm = memAssembly();
    const log: CrossingLogEntry[] = [];
    const out = await initiateCrossing({
      inputs: [memInput('automerge:a', A), memInput('automerge:b', B)], handle: asm, presentedContent: tampered,
      gateCheck: passAll, putRecord: neverFire, identity: IDENTITY, targetPDS: 'https://bsky.social',
      regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(), log,
    });
    expect(out.status).toBe('digest-blocked');
    const events = log.map((l) => l.event);
    expect(events).toContain('gate-check-pass');
    expect(events).toContain('assembly-completed');
    expect(events).toContain('digest-check-blocked');
    expect(events).not.toContain('assembly-document-written');
    expect(events).not.toContain('intent-record-written');
    // No orphan: the assembly document is untouched after a digest block.
    const d = asm.doc();
    expect(d.title).toBe(''); expect(d.content).toBe(''); expect(d.crossingRecords ?? []).toHaveLength(0);
    // Appended bytes (the runner's adversarial leg) block the same way.
    const appended = { ...assembled, content: assembled.content + 'X' };
    const out2 = await initiateCrossing({
      inputs: [memInput('automerge:a', A), memInput('automerge:b', B)], handle: memAssembly(), presentedContent: appended,
      gateCheck: passAll, putRecord: neverFire, identity: IDENTITY, targetPDS: 'https://bsky.social',
      regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(),
    });
    expect(out2.status).toBe('digest-blocked');
  });

  it('positive path: order access → assemble → digest → write assembly doc → mint; intent names the assembly doc and carries lineage', async () => {
    const asm = memAssembly('automerge:asm-positive');
    const log: CrossingLogEntry[] = [];
    let docAtFire: CompletionDocShape | null = null;
    const out = await initiateCrossing({
      inputs: [memInput('automerge:a', A), memInput('automerge:b', B)], handle: asm, presentedContent: assembleCrossingContent([A, B]),
      gateCheck: passAll,
      putRecord: async () => { docAtFire = asm.doc(); return { uri: 'at://x/y/z', cid: 'bafycid' }; },
      identity: IDENTITY, targetPDS: 'https://bsky.social', regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(), log,
    });
    expect(out.status).toBe('fired');
    if (out.status !== 'fired') return;
    const order = log.map((l) => l.event);
    const idx = (e: string) => order.indexOf(e as any);
    expect(idx('gate-check-pass')).toBeLessThan(idx('assembly-completed'));
    expect(idx('assembly-completed')).toBeLessThan(idx('digest-check-pass'));
    expect(idx('digest-check-pass')).toBeLessThan(idx('assembly-document-written'));
    expect(idx('assembly-document-written')).toBeLessThan(idx('intent-record-written'));
    expect(idx('intent-record-written')).toBeLessThan(idx('put-record-fired'));
    expect(out.intent.sourceDocumentURI).toBe('automerge:asm-positive');
    expect(out.intent.sourceLineage.map((l) => l.documentURI)).toEqual(['automerge:a', 'automerge:b']);
    expect(out.intent.authorizedContentDigest).toBe(assembledContentDigest(assembleCrossingContent([A, B])));
    expect(validateCrossingIntentRecord(out.intent).valid).toBe(true);
    expect(docAtFire!.content).toBe('alpha\n\nbeta');
    expect(docAtFire!.createdAt).toBe(B.createdAt);
    // seamCrossingRef stays four-field singular and points at the assembly document.
    const ref = buildSeamCrossingRef(out.intent);
    expect(Object.keys(ref)).toHaveLength(4);
    expect(ref.sourceDocumentURI).toBe('automerge:asm-positive');
  });
});

// ---------------------------------------------------------------------------
// Encrypted-transport fixture helpers (spike record r1 §2 D-1..D-5).
type KeyPair = { publicKey: CryptoKey; privateKey: CryptoKey };
const NUDGE_FIELD = '__automerge-repo-keyhive__last-added-member-ts';

async function ed25519Pair(): Promise<KeyPair> {
  return (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as unknown as KeyPair;
}
async function wirePeerId(kp: KeyPair): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return Buffer.from(raw).toString('base64');
}
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms))]);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Item 3.1 — public-subset over the real substrate, two individuals (encrypted transport)', () => {
  it('negative → adversarial → positive; section_c never named; section_c not decryptable by the actor', async () => {
    // D-1 / D-2 / D-3: two subduction hives, supplied key pairs, in-process pairing.
    const [aNet, bNet] = PairNetworkAdapter.createConnectedPair();
    const [kpA, kpB] = await Promise.all([ed25519Pair(), ed25519Pair()]);
    const [pidA, pidB] = await Promise.all([wirePeerId(kpA), wirePeerId(kpB)]);
    const actorRepoStorage = new DummyStorageAdapter();
    const mk = (kp: KeyPair, remote: string, adapter: PairNetworkAdapter, label: string, role: 'accept' | 'connect', repoStorage: DummyStorageAdapter) =>
      initializeAutomergeRepoKeyhive({
        storage: new DummyStorageAdapter(), peerIdSuffix: label, keyPair: kp as any, syncServer: 'none',
        remotePeerId: remote as any, shareConfigDebounceMs: 0, createRepo: (cfg: any) => new Repo(cfg),
        repo: { storage: repoStorage, subductionAdapters: [{ adapter, serviceName: 'item-3-1', role }] },
      });
    const [author, actor] = await Promise.all([
      mk(kpA, pidB, aNet, 'author31', 'accept', new DummyStorageAdapter()),
      mk(kpB, pidA, bNet, 'actor31', 'connect', actorRepoStorage),
    ]);
    aNet.peerCandidate(bNet.peerId!); bNet.peerCandidate(aNet.peerId!);
    try {
      const connectBy = Date.now() + 10_000;
      while (Date.now() < connectBy && !((author.repo as any).isSubductionConnected() && (actor.repo as any).isSubductionConnected())) await sleep(100);
      expect((author.repo as any).isSubductionConnected()).toBe(true);
      expect((actor.repo as any).isSubductionConnected()).toBe(true);

      const mkSec = (n: string) => ({ title: `Run 6 ${n}`, content: `# ${n}`, createdAt: `2026-08-29T1${n.length}:00:00.000Z` });
      const secA = await (author.repo as any).create2(mkSec('a'));
      const secB = await (author.repo as any).create2(mkSec('bb'));
      const secC = await (author.repo as any).create2(mkSec('ccc'));
      const actorCard = actor.hive.active.contactCard;
      const actorInd = await author.hive.receiveContactCard(actorCard);
      const grant = async (url: string) => {
        for (let i = 0; i < 40; i++) {
          try { await author.hive.addMemberToDoc(url as any, actorCard, Access.read()); return; }
          catch (e: any) { if (/unprotected/i.test(String(e))) await sleep(250); else throw e; }
        }
        throw new Error('never protected');
      };
      await grant(secA.url); await grant(secB.url); // section_c: no grant

      // Issuer's-hive per-document gate (ruling 2 stands — spike §7.1), isReader (D-4).
      const gate: GateCheckFn = async ({ documentURI }) => {
        const access = await author.hive.accessForDoc(actorInd!.id, documentURI as any);
        const at = new Date().toISOString();
        return access && access.isReader
          ? { result: 'pass', grantReference: `keyhive:${Buffer.from(actorInd!.id.toBytes()).toString('hex')}:${String(access).toLowerCase()}`, gateCheckedAt: at, access: String(access), documentURI }
          : { result: 'blocked', grantReference: null, gateCheckedAt: at, reason: 'no authorizing grant present in causal history', documentURI };
      };

      // D-4: wait until the actor's own hive sees its membership before find().
      const actorSelf = actor.hive.active.individual.id;
      const waitMembership = async (url: string) => {
        const by = Date.now() + 15_000;
        while (Date.now() < by) {
          if ((await actor.hive.accessForDoc(actorSelf, url as any)) !== undefined) return;
          await sleep(200);
        }
        throw new Error(`actor hive never saw membership on ${url}`);
      };
      const findGranted = async (url: string) => {
        await waitMembership(url);
        let last = '';
        for (let i = 0; i < 10; i++) {
          try {
            const h: any = await withTimeout((actor.repo as any).find(url), 3_000, `find:${url}`);
            const d: any = await withTimeout(h.doc(), 3_000, `doc:${url}`);
            if (d && typeof d.title === 'string') return h;
          } catch (e: any) {
            last = String(e?.message ?? e);
            try { (actor.repo as any).resyncSubduction(url.replace(/^automerge:/, '')); } catch {}
            await sleep(500);
          }
        }
        throw new Error(`granted ${url} not readable on the actor side: ${last}`);
      };

      // Actor reads the granted inputs through ITS OWN repo (operator ruling 1).
      const actorA = await findGranted(secA.url);
      const actorB = await findGranted(secB.url);
      expect((await actorA.doc()).title).toBe('Run 6 a');
      expect((await actorB.doc()).title).toBe('Run 6 bb');
      const wrap = (h: any): CrossingInputHandle => ({ url: h.url, doc: () => h.doc(), heads: () => h.heads?.() });
      const presented = assembleCrossingContent([await actorA.doc(), await actorB.doc()]);
      const mkAsm = async () => {
        const h = await (actor.repo as any).create2({ title: '', content: '', createdAt: null });
        // Creator holds admin (confirmed at runtime on both transports).
        const self = await actor.hive.accessForDoc(actorSelf, h.url);
        expect(String(self)).toBe('Admin');
        return h;
      };

      // D-5 / AC-3.1.2 capability half: section_c is NOT decryptable by the actor.
      // Bounded find() in resync rounds — it must not return a content object —
      // then a plaintext scan of the actor's repo storage with section_a as the
      // positive control. (Registry: issuer's hive shows no grant.)
      expect(await author.hive.accessForDoc(actorInd!.id, secC.url)).toBeUndefined();
      let cPlain: any = null; let cBehaviour = '';
      for (let i = 0; i < 2; i++) {
        try {
          const h: any = await withTimeout((actor.repo as any).find(secC.url), 3_000, 'find:c');
          cPlain = await withTimeout(h.doc(), 3_000, 'doc:c');
          cBehaviour = `round ${i}: find resolved; doc()=${JSON.stringify(cPlain)}`;
          break;
        } catch (e: any) {
          cBehaviour = `round ${i}: ${String(e?.message ?? e)}`;
          try { (actor.repo as any).resyncSubduction(secC.url.replace(/^automerge:/, '')); } catch {}
          await sleep(300);
        }
      }
      const cDecrypted = !!cPlain && (cPlain.title === 'Run 6 ccc' || cPlain.content === '# ccc');
      const chunks = await actorRepoStorage.loadRange([]);
      const dec = new TextDecoder('utf8', { fatal: false });
      let cHits = 0; let aHits = 0;
      for (const ch of chunks) {
        if (!ch.data) continue;
        const txt = dec.decode(ch.data);
        if (/Run 6 ccc|# ccc/.test(txt)) cHits++;
        if (/Run 6 a\b/.test(txt)) aHits++;
      }
      console.log(`[3.1 test] un-granted probe: ${cBehaviour}; actor storage chunks=${chunks.length} section_c plaintext hits=${cHits} control section_a hits=${aHits}`);
      expect(cDecrypted).toBe(false);   // AC-3.1.2: not decryptable by the actor
      expect(cHits).toBe(0);            // no section_c plaintext in the actor's storage
      expect(aHits).toBeGreaterThan(0); // positive control: the scan can see plaintext

      // D-6 observation: the granter's membership nudge write lands on a/b, not c.
      const nudge = async (h: any) => Object.prototype.hasOwnProperty.call(await h.doc(), NUDGE_FIELD);
      console.log(`[3.1 test] nudge field on a/b/c = ${await nudge(secA)}/${await nudge(secB)}/${await nudge(secC)} (author-hive write, outside the content object)`);

      // NEGATIVE leg — section_c presented to the gate BY ID (the actor holds ciphertext only).
      const asmNeg = await mkAsm();
      const cById: CrossingInputHandle = {
        url: secC.url,
        doc: () => { throw new Error('doc() called on an un-granted input that should have been gated first'); },
        heads: () => undefined,
      };
      const logNeg: CrossingLogEntry[] = [];
      const neg = await initiateCrossing({
        inputs: [wrap(actorA), wrap(actorB), cById], handle: asmNeg, presentedContent: presented, gateCheck: gate,
        putRecord: neverFire, identity: IDENTITY, targetPDS: 'https://bsky.social', regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(), log: logNeg,
      });
      expect(neg.status).toBe('gate-blocked');
      if (neg.status === 'gate-blocked') expect(neg.reason).toContain(secC.url);
      expect(logNeg.map((l) => l.event)).not.toContain('assembly-document-written');
      const negDoc = await asmNeg.doc();
      // Untouched = content object + record arrays; the nudge field is not an orphan write.
      expect(negDoc.title).toBe(''); expect(negDoc.content).toBe(''); expect(negDoc.crossingRecords ?? []).toHaveLength(0);
      const blockedAt = Date.parse(logNeg.find((l) => l.event === 'gate-check-blocked')!.at);

      // ADVERSARIAL leg
      const asmAdv = await mkAsm();
      const adv = await initiateCrossing({
        inputs: [wrap(actorA), wrap(actorB)], handle: asmAdv, presentedContent: { ...presented, content: presented.content + '\n<!-- injected -->' },
        gateCheck: gate, putRecord: neverFire, identity: IDENTITY, targetPDS: 'https://bsky.social', regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(),
      });
      expect(adv.status).toBe('digest-blocked');
      expect((await asmAdv.doc()).title).toBe('');

      // POSITIVE leg
      const asm = await mkAsm();
      const log: CrossingLogEntry[] = [];
      const hook = createCompletionHook();
      const pos = await initiateCrossing({
        inputs: [wrap(actorA), wrap(actorB)], handle: asm, presentedContent: presented, gateCheck: gate,
        putRecord: async () => ({ uri: `at://${TEST_DID}/com.whtwnd.blog.entry/run6`, cid: 'bafyrun6' }),
        identity: IDENTITY, targetPDS: 'https://bsky.social', regimeAcknowledgment: ACK, crossingTimeoutHorizon: horizon(), log,
      });
      expect(pos.status).toBe('fired');
      if (pos.status !== 'fired') return;
      const intent: CrossingIntentRecord = pos.intent;
      expect(intent.sourceDocumentURI).toBe(asm.url);
      expect(intent.sourceLineage.map((l) => l.documentURI)).toEqual([secA.url, secB.url]);
      expect(JSON.stringify(intent)).not.toContain(secC.url);            // AC-3.1.2 (structural half)
      expect(JSON.stringify(buildSeamCrossingRef(intent))).not.toContain(secC.url); // B-5
      expect(intent.grantReference.endsWith(':read')).toBe(true);        // level actually held (D-4); first input's (R-B)
      expect(blockedAt).toBeLessThanOrEqual(Date.parse(intent.emittedAt)); // AC-3.1.3 ordering across the run
      console.log(`[3.1 test] sourceDocumentCID=${intent.sourceDocumentCID}; lineage CIDs=${intent.sourceLineage.map((l) => l.documentCID).join(',')} (include the nudge commit on granted inputs — observation)`);
      await writeCrossingCompletion({
        handle: asm, intent, put: { uri: pos.put.uri, cid: pos.put.cid }, pdsAcceptedAt: new Date().toISOString(), hook, log,
      });
      const asmDoc = (await asm.doc()) as CompletionDocShape;
      expect(deriveDocumentCrossingState(asmDoc)).toBe('crossing-complete');
      expect(asmDoc.content).toBe('# a\n\n# bb');
      // Content documents receive no crossing records (D-5).
      for (const h of [secA, secB, secC]) {
        const d = await h.doc();
        expect(d.crossingRecords ?? []).toHaveLength(0);
        expect(d.completionRecords ?? []).toHaveLength(0);
      }
    } finally {
      aNet.disconnect(); bNet.disconnect();
    }
  }, 120_000);
});
