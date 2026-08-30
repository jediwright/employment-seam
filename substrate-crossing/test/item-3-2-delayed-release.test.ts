/**
 * PC#8 Phase 3 Item 3.2 — Run 7 in-container tests (brief v0.1 §8).
 *
 *   Unit (mem handles, injected clock): the horizon step (3h) — optional
 *   `crossingGrantHorizon` omitted when absent (crossingIntentRef
 *   byte-identical to a pre-3.2 record); before-horizon block writes
 *   nothing and mints nothing; after-horizon pass carries both horizons;
 *   fresh evaluation per attempt (block → pass → block as the clock moves,
 *   no state); grant ≥ timeout refused explicitly (D-7,
 *   `horizon-inconsistent`); unparseable grant horizon is a seam fault;
 *   the moved timeout check (F-3.2-1) no longer writes the assembly
 *   document; validator rules for the optional field.
 *
 *   Substrate (real Keyhive, TWO individuals, ENCRYPTED transport — the
 *   Item 3.1 fixture, SL-0186): Run 7's three legs in the runner's order
 *   with an injected clock so the wait is instant — before-horizon
 *   (negative, AC-3.2.1), after-horizon (positive, AC-3.2.2 / AC-3.2.3,
 *   completion minted in the assembly document), replay (adversarial: a
 *   fresh future horizon set after the pass blocks — no cached decision).
 *   Wall-clock evidence is Run 7 itself (operator-run).
 */
import { describe, it, expect } from 'vitest';
import '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import { PairNetworkAdapter } from './helpers/pair-network-adapter.js';
import { DummyStorageAdapter } from '@automerge/automerge-repo/helpers/DummyStorageAdapter.js';
import { initializeAutomergeRepoKeyhive, Access } from '@automerge/automerge-repo-keyhive';
import {
  initiateCrossing,
  validateCrossingIntentRecord,
  REQUIRED_FIELDS,
  type CrossingIntentRecord,
  type CrossingLogEntry,
  type CrossingInputHandle,
  type GateCheckFn,
} from '../src/crossing-intent.js';
import { assembleCrossingContent } from '../src/assembly.js';
import { canonicalJson } from '../src/canonical-json.js';
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
const A = { title: 'Timed release', content: 'embargoed until T1', createdAt: '2026-08-30T10:00:00.000Z' };

function memInput(url: string, c: { title: string; content: string; createdAt?: string | null }): CrossingInputHandle {
  return { url, doc: () => ({ ...c }), heads: () => [`${url}-head`] };
}
function memAssembly(url = 'automerge:memasm') {
  const doc: CompletionDocShape = { title: '', content: '', createdAt: null };
  let changes = 0;
  return {
    url,
    heads: () => ['asmhead'],
    change(fn: (d: CompletionDocShape) => void) { changes++; fn(doc); },
    doc() { return JSON.parse(JSON.stringify(doc)) as CompletionDocShape; },
    changeCount: () => changes,
  };
}
const passAll: GateCheckFn = async ({ documentURI }) => ({
  result: 'pass', grantReference: 'keyhive:test:read', gateCheckedAt: new Date().toISOString(), access: 'Read', documentURI,
});
const neverFire = async () => { throw new Error('putRecord must not fire'); };
const fire = async () => ({ uri: `at://${TEST_DID}/com.whtwnd.blog.entry/run7`, cid: 'bafyrun7' });

/** Fixed-clock injector: every read returns `at` (frozen). */
const frozen = (iso: string) => () => new Date(iso);
const T0 = '2026-08-30T12:00:00.000Z';
const T1 = '2026-08-30T12:01:30.000Z'; // T0 + 90 s
const TIMEOUT = '2026-08-30T12:03:30.000Z'; // T1 + 120 s

function base(asm: ReturnType<typeof memAssembly>, extra: Partial<Parameters<typeof initiateCrossing>[0]> = {}) {
  return {
    inputs: [memInput('automerge:timed', A)], handle: asm, presentedContent: assembleCrossingContent([A]),
    gateCheck: passAll, putRecord: neverFire, identity: IDENTITY, targetPDS: 'https://bsky.social',
    regimeAcknowledgment: ACK, crossingTimeoutHorizon: TIMEOUT, ...extra,
  };
}

// ---------------------------------------------------------------------------
describe('Item 3.2 — horizon step (D-2 / D-7 / F-3.2-1)', () => {
  it('absent crossingGrantHorizon: key omitted from the record; crossingIntentRef byte-identical to a pre-3.2 record', async () => {
    const asm = memAssembly();
    const out = await initiateCrossing(base(asm, { putRecord: fire, clock: frozen(T0) }));
    expect(out.status).toBe('fired');
    if (out.status !== 'fired') return;
    expect('crossingGrantHorizon' in out.intent).toBe(false);
    expect(Object.keys(out.intent)).toHaveLength(22);
    expect(REQUIRED_FIELDS).toHaveLength(22);
    expect(REQUIRED_FIELDS).not.toContain('crossingGrantHorizon');
    // Pre-3.2 shape: the same 22 fields. Equal canonical JSON ⇒ equal crossingIntentRef.
    const pre = { ...out.intent } as Record<string, unknown>;
    expect(canonicalJson(out.intent)).toBe(canonicalJson(pre));
    expect(buildSeamCrossingRef(out.intent)).toEqual(buildSeamCrossingRef(pre as unknown as CrossingIntentRecord));
    expect(validateCrossingIntentRecord(out.intent).valid).toBe(true);
  });

  it('before the horizon: horizon-not-reached; no assembly write, no intent record, putRecord never called; block logged after digest-check-pass', async () => {
    const asm = memAssembly();
    const log: CrossingLogEntry[] = [];
    const out = await initiateCrossing(base(asm, { crossingGrantHorizon: T1, clock: frozen(T0), log }));
    expect(out.status).toBe('horizon-not-reached');
    if (out.status === 'horizon-not-reached') {
      expect(out.reason).toContain(`now=${T0}`);
      expect(out.reason).toContain(`crossingGrantHorizon=${T1}`);
    }
    expect(asm.changeCount()).toBe(0);
    expect(asm.doc().title).toBe('');
    expect(asm.doc().crossingRecords ?? []).toHaveLength(0);
    const order = log.map((e) => e.event);
    expect(order).toEqual(['gate-check-started', 'gate-check-pass', 'assembly-completed', 'digest-check-pass', 'grant-horizon-not-reached']);
  });

  it('after the horizon: fires; the intent record carries both horizons on the same host object; validator accepts', async () => {
    const asm = memAssembly();
    const out = await initiateCrossing(base(asm, { crossingGrantHorizon: T1, putRecord: fire, clock: frozen('2026-08-30T12:01:31.000Z') }));
    expect(out.status).toBe('fired');
    if (out.status !== 'fired') return;
    expect(out.intent.crossingGrantHorizon).toBe(T1);
    expect(out.intent.crossingTimeoutHorizon).toBe(TIMEOUT);
    expect(Object.keys(out.intent)).toHaveLength(23);
    expect(validateCrossingIntentRecord(out.intent).valid).toBe(true);
    // The horizon is inside the canonical JSON and therefore bound by crossingIntentRef.
    expect(canonicalJson(out.intent)).toContain(`"crossingGrantHorizon":"${T1}"`);
    const mutated = { ...out.intent, crossingGrantHorizon: T0 };
    expect(buildSeamCrossingRef(mutated).crossingIntentRef).not.toBe(buildSeamCrossingRef(out.intent).crossingIntentRef);
    // seamCrossingRef stays four-field (unchanged surface).
    expect(Object.keys(buildSeamCrossingRef(out.intent))).toHaveLength(4);
  });

  it('fresh evaluation per attempt: block → pass → block as the injected clock moves; nothing retained', async () => {
    const p = { crossingGrantHorizon: T1 };
    const a1 = await initiateCrossing(base(memAssembly('automerge:a1'), { ...p, clock: frozen(T0) }));
    expect(a1.status).toBe('horizon-not-reached');
    const a2 = await initiateCrossing(base(memAssembly('automerge:a2'), { ...p, putRecord: fire, clock: frozen('2026-08-30T12:02:00.000Z') }));
    expect(a2.status).toBe('fired');
    // Clock "rewound" (a later attempt against a horizon not yet reached on its own read) blocks again.
    const a3 = await initiateCrossing(base(memAssembly('automerge:a3'), { ...p, clock: frozen(T0) }));
    expect(a3.status).toBe('horizon-not-reached');
    // Replay shape (Run 7 leg 3): after a pass, a fresh future horizon blocks.
    const a4 = await initiateCrossing(base(memAssembly('automerge:a4'), {
      crossingGrantHorizon: '2026-08-30T12:03:00.000Z', clock: frozen('2026-08-30T12:02:00.000Z'),
    }));
    expect(a4.status).toBe('horizon-not-reached');
  });

  it('grant horizon at or after the timeout horizon: horizon-inconsistent (D-7); nothing written', async () => {
    for (const grant of [TIMEOUT, '2026-08-30T12:05:00.000Z']) {
      const asm = memAssembly();
      const log: CrossingLogEntry[] = [];
      const out = await initiateCrossing(base(asm, { crossingGrantHorizon: grant, clock: frozen(T0), log }));
      expect(out.status).toBe('horizon-inconsistent');
      expect(asm.changeCount()).toBe(0);
      expect(log.map((e) => e.event).at(-1)).toBe('horizon-inconsistent');
    }
  });

  it('unparseable or empty grant horizon is a seam fault (throws); nothing written', async () => {
    for (const bad of ['not-a-date', '']) {
      const asm = memAssembly();
      await expect(initiateCrossing(base(asm, { crossingGrantHorizon: bad, clock: frozen(T0) }))).rejects.toThrow(/seam fault: crossingGrantHorizon/);
      expect(asm.changeCount()).toBe(0);
    }
  });

  it('F-3.2-1: a timeout horizon already expired at mint no longer writes the assembly document', async () => {
    const asm = memAssembly();
    const log: CrossingLogEntry[] = [];
    const out = await initiateCrossing(base(asm, { crossingTimeoutHorizon: T0, clock: frozen('2026-08-30T12:00:01.000Z'), log }));
    expect(out.status).toBe('horizon-expired');
    expect(asm.changeCount()).toBe(0); // at 6479fc7 this was 1 (written, then expired)
    expect(asm.doc().title).toBe('');
    expect(log.map((e) => e.event)).not.toContain('assembly-document-written');
    expect(log.map((e) => e.event).at(-1)).toBe('timeout-horizon-expired');
  });

  it('validator: optional field — absent valid; present must be a non-empty parseable ISO; null/empty rejected', async () => {
    const asm = memAssembly();
    const out = await initiateCrossing(base(asm, { crossingGrantHorizon: T1, putRecord: fire, clock: frozen('2026-08-30T12:02:00.000Z') }));
    if (out.status !== 'fired') throw new Error('fixture');
    const rec = out.intent;
    const { crossingGrantHorizon: _drop, ...without } = rec;
    expect(validateCrossingIntentRecord(without).valid).toBe(true);
    expect(validateCrossingIntentRecord(rec).valid).toBe(true);
    expect(validateCrossingIntentRecord({ ...rec, crossingGrantHorizon: '' }).valid).toBe(false);
    expect(validateCrossingIntentRecord({ ...rec, crossingGrantHorizon: null as any }).valid).toBe(false);
    expect(validateCrossingIntentRecord({ ...rec, crossingGrantHorizon: 'yesterday' }).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Encrypted-transport fixture (Item 3.1 test / spike record r1 §2).
type KeyPair = { publicKey: CryptoKey; privateKey: CryptoKey };
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

describe('Item 3.2 — delayed-release over the real substrate, two individuals (encrypted transport)', () => {
  it('before-horizon → after-horizon → replay; blocked legs leave the assembly document untouched; completion minted on the pass', async () => {
    const [aNet, bNet] = PairNetworkAdapter.createConnectedPair();
    const [kpA, kpB] = await Promise.all([ed25519Pair(), ed25519Pair()]);
    const [pidA, pidB] = await Promise.all([wirePeerId(kpA), wirePeerId(kpB)]);
    const mk = (kp: KeyPair, remote: string, adapter: PairNetworkAdapter, label: string, role: 'accept' | 'connect') =>
      initializeAutomergeRepoKeyhive({
        storage: new DummyStorageAdapter(), peerIdSuffix: label, keyPair: kp as any, syncServer: 'none',
        remotePeerId: remote as any, shareConfigDebounceMs: 0, createRepo: (cfg: any) => new Repo(cfg),
        repo: { storage: new DummyStorageAdapter(), subductionAdapters: [{ adapter, serviceName: 'item-3-2', role }] },
      });
    const [author, actor] = await Promise.all([
      mk(kpA, pidB, aNet, 'author32', 'accept'),
      mk(kpB, pidA, bNet, 'actor32', 'connect'),
    ]);
    aNet.peerCandidate(bNet.peerId!); bNet.peerCandidate(aNet.peerId!);
    try {
      const connectBy = Date.now() + 10_000;
      while (Date.now() < connectBy && !((author.repo as any).isSubductionConnected() && (actor.repo as any).isSubductionConnected())) await sleep(100);
      expect((author.repo as any).isSubductionConnected()).toBe(true);

      const timed = await (author.repo as any).create2({ title: 'Run 7 timed-release', content: '# timed', createdAt: '2026-08-30T10:00:00.000Z' });
      const actorCard = actor.hive.active.contactCard;
      const actorInd = await author.hive.receiveContactCard(actorCard);
      for (let i = 0; i < 40; i++) {
        try { await author.hive.addMemberToDoc(timed.url as any, actorCard, Access.read()); break; }
        catch (e: any) { if (/unprotected/i.test(String(e))) await sleep(250); else throw e; }
      }
      const gate: GateCheckFn = async ({ documentURI }) => {
        const access = await author.hive.accessForDoc(actorInd!.id, documentURI as any);
        const at = new Date().toISOString();
        return access && access.isReader
          ? { result: 'pass', grantReference: `keyhive:${Buffer.from(actorInd!.id.toBytes()).toString('hex')}:${String(access).toLowerCase()}`, gateCheckedAt: at, access: String(access), documentURI }
          : { result: 'blocked', grantReference: null, gateCheckedAt: at, reason: 'no authorizing grant present in causal history', documentURI };
      };
      const actorSelf = actor.hive.active.individual.id;
      const by = Date.now() + 15_000;
      while (Date.now() < by && (await actor.hive.accessForDoc(actorSelf, timed.url as any)) === undefined) await sleep(200);
      let actorTimed: any = null; let last = '';
      for (let i = 0; i < 10 && !actorTimed; i++) {
        try {
          const h: any = await withTimeout((actor.repo as any).find(timed.url), 3_000, 'find');
          const d: any = await withTimeout(h.doc(), 3_000, 'doc');
          if (d && typeof d.title === 'string') actorTimed = h;
        } catch (e: any) {
          last = String(e?.message ?? e);
          try { (actor.repo as any).resyncSubduction(timed.url.replace(/^automerge:/, '')); } catch {}
          await sleep(500);
        }
      }
      if (!actorTimed) throw new Error(`granted input not readable on the actor side: ${last}`);
      const wrap = (h: any): CrossingInputHandle => ({ url: h.url, doc: () => h.doc(), heads: () => h.heads?.() });
      const presented = assembleCrossingContent([await actorTimed.doc()]);
      const mkAsm = async () => (actor.repo as any).create2({ title: '', content: '', createdAt: null });
      const untouched = async (h: any) => { const d = await h.doc(); return d.title === '' && d.content === '' && (d.crossingRecords ?? []).length === 0; };
      const common = { inputs: [wrap(actorTimed)], presentedContent: presented, gateCheck: gate, identity: IDENTITY, targetPDS: 'https://bsky.social', regimeAcknowledgment: ACK, crossingTimeoutHorizon: TIMEOUT };

      // Leg 1 — before-horizon (negative; AC-3.2.1)
      const asm1 = await mkAsm(); const log1: CrossingLogEntry[] = [];
      const leg1 = await initiateCrossing({ ...common, handle: asm1, crossingGrantHorizon: T1, putRecord: neverFire, clock: frozen(T0), log: log1 });
      expect(leg1.status).toBe('horizon-not-reached');
      expect(await untouched(asm1)).toBe(true);
      const blockedAt = Date.parse(log1.find((e) => e.event === 'grant-horizon-not-reached')!.at);

      // Leg 2 — after-horizon (positive; AC-3.2.2 / AC-3.2.3)
      const asm2 = await mkAsm(); const log2: CrossingLogEntry[] = []; const hook = createCompletionHook();
      const leg2 = await initiateCrossing({ ...common, handle: asm2, crossingGrantHorizon: T1, putRecord: fire, clock: frozen('2026-08-30T12:01:31.000Z'), log: log2 });
      expect(leg2.status).toBe('fired');
      if (leg2.status !== 'fired') return;
      const intent: CrossingIntentRecord = leg2.intent;
      expect(intent.crossingGrantHorizon).toBe(T1);
      expect(intent.crossingTimeoutHorizon).toBe(TIMEOUT);
      expect(intent.sourceDocumentURI).toBe(asm2.url);
      expect(blockedAt).toBeLessThanOrEqual(Date.parse(intent.emittedAt)); // AC-3.2.1 ordering across the run
      await writeCrossingCompletion({ handle: asm2, intent, put: { uri: leg2.put.uri, cid: leg2.put.cid }, pdsAcceptedAt: new Date().toISOString(), hook, log: log2 });
      expect(deriveDocumentCrossingState((await asm2.doc()) as CompletionDocShape)).toBe('crossing-complete');

      // Leg 3 — replay (adversarial): fresh future horizon set after the pass must block.
      const asm3 = await mkAsm(); const log3: CrossingLogEntry[] = [];
      const leg3 = await initiateCrossing({ ...common, handle: asm3, crossingGrantHorizon: '2026-08-30T12:03:00.000Z', putRecord: neverFire, clock: frozen('2026-08-30T12:02:00.000Z'), log: log3 });
      expect(leg3.status).toBe('horizon-not-reached');
      expect(await untouched(asm3)).toBe(true);

      // The content document receives no crossing records (D-5).
      const td = await timed.doc();
      expect(td.crossingRecords ?? []).toHaveLength(0);
    } finally {
      aNet.disconnect(); bNet.disconnect();
    }
  }, 120_000);
});
