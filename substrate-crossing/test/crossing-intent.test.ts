/**
 * PC#8 Item 1.1 acceptance tests (build plan §2 Item 1.1 acceptance block):
 *   1. Intent record written to the Automerge document before putRecord() fires.
 *   2. All required fields present and non-null (schema conformance).
 *   3. A blocked gate check produces no intent record (and no fire).
 *   4. An expired crossingTimeoutHorizon rejects the crossing without firing.
 *
 * Wiring mirrors Phase 0 Item 0.3: automerge-repo-keyhive over a
 * DummyNetworkAdapter pair, repo.create2() (A3-confirmed Keyhive create
 * path), addMemberToDoc + accessForDoc as the real gate substrate.
 *
 * Item 3.1 (Run 6) update: the seam now takes `inputs[]` + an assembly
 * document handle + `presentedContent`, and the gate is per document
 * (`isReader`). These tests keep their Item 1.1 assertions and run through
 * the uniform path with one granted input; `handle` below is the granted
 * content document and `asm` the actor-side assembly document.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import { PairNetworkAdapter } from './helpers/pair-network-adapter.js';
import { DummyStorageAdapter } from '@automerge/automerge-repo/helpers/DummyStorageAdapter.js';
import {
  initializeLegacyAutomergeRepoKeyhive,
  Access,
} from '@automerge/automerge-repo-keyhive';
import {
  initiateCrossing,
  validateCrossingIntentRecord,
  computeAuthorizedContentDigest,
  REQUIRED_FIELDS,
  type CrossingIntentRecord,
  type CrossingLogEntry,
  type CrossingDocShape,
  type GateCheckFn,
} from '../src/crossing-intent.js';
import { assembleCrossingContent } from '../src/assembly.js';

const TEST_DID = 'did:plc:testoperator0000000000000';
const TARGET_PDS = 'https://bsky.social';
const ACK =
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request.';

let handle: any;   // granted content document (author-created)
let asm: any;      // assembly document (D-5) — hosts the crossing records
let hiveOwner: any;
let actorId: any; // keyhive Identifier of the granted actor

async function makeHivePair() {
  const [a, b] = PairNetworkAdapter.createConnectedPair();
  const mk = (adapter: any, label: string) =>
    initializeLegacyAutomergeRepoKeyhive({
      storage: new DummyStorageAdapter(),
      peerIdSuffix: label,
      networkAdapter: adapter,
      syncServer: 'none',
      createRepo: (cfg: any) => new Repo(cfg),
    });
  const [owner, actor] = await Promise.all([mk(a, 'owner'), mk(b, 'actor')]);
  return { owner, actor };
}

async function makeKeyhiveDocWithGrant() {
  const { owner, actor } = await makeHivePair();
  // A3-confirmed Keyhive create path: repo.create2()
  const h = await (owner.repo as any).create2({
    title: 'PC#8 Item 1.1 baseline',
    content: 'crossing-intent record test content',
    createdAt: new Date().toISOString(),
  });
  const card = actor.hive.active.contactCard;
  const individual = await owner.hive.receiveContactCard(card);
  await owner.hive.addMemberToDoc(h.url, card, Access.read());
  // Item 3.1: the assembly document is created by the actor (D-5).
  const a = await (actor.repo as any).create2({ title: '', content: '', createdAt: null });
  return { handle: h, asm: a, ownerHive: owner.hive, actorId: individual!.id };
}

beforeAll(async () => {
  const built = await makeKeyhiveDocWithGrant();
  handle = built.handle;
  asm = built.asm;
  hiveOwner = built.ownerHive;
  actorId = built.actorId;
});

/** Real per-document gate check over the Keyhive grant (D-4): pass iff the
 *  actor holds `isReader` on that document at check time. */
function realGate(clockNow: () => Date): GateCheckFn {
  return async ({ documentURI }) => {
    const access = await hiveOwner.accessForDoc(actorId, documentURI as any);
    const at = clockNow().toISOString();
    if (access !== undefined && access !== null && access.isReader) {
      return {
        result: 'pass' as const,
        grantReference: `keyhive:${documentURI}#${String(access)}`,
        gateCheckedAt: at,
        access: String(access),
        documentURI,
      };
    }
    return { result: 'blocked' as const, grantReference: null, gateCheckedAt: at, reason: 'no grant for actor', documentURI };
  };
}

function wrapHandle(h: any) {
  return {
    change: (fn: (d: CrossingDocShape) => void) => h.change(fn),
    doc: () => h.doc(),
    heads: () => {
      try { return h.heads?.(); } catch { return undefined; }
    },
    url: h.url,
  };
}

/** What the caller presents: its own assembly of the granted input(s). */
async function presentedFrom(...hs: any[]) {
  const contents = [];
  for (const h of hs) {
    const d = await h.doc();
    contents.push({ title: d.title, content: d.content, createdAt: d.createdAt });
  }
  return assembleCrossingContent(contents);
}

describe('Item 1.1 — crossing-intent record', () => {
  it('AC-i: writes the intent record before putRecord() fires (log order + doc state at fire time)', async () => {
    const log: CrossingLogEntry[] = [];
    let docStateAtFire: CrossingDocShape | null = null;
    const putRecord = async () => {
      docStateAtFire = await asm.doc();
      return { uri: `at://${TEST_DID}/com.whtwnd.blog.entry/test`, cid: 'bafyreitestcid' };
    };
    const outcome = await initiateCrossing({
      inputs: [wrapHandle(handle)],
      handle: wrapHandle(asm),
      presentedContent: await presentedFrom(handle),
      gateCheck: realGate(() => new Date()),
      putRecord,
      identity: { grantorDID: TEST_DID, targetDID: TEST_DID, identityCustodyClass: 'provider-custodied' },
      targetPDS: TARGET_PDS,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: new Date(Date.now() + 60_000).toISOString(),
      log,
    });

    expect(outcome.status).toBe('fired');
    const order = log.map((e) => e.event);
    const iWritten = order.indexOf('intent-record-written');
    const iConfirmed = order.indexOf('intent-record-read-confirmed');
    const iFired = order.indexOf('put-record-fired');
    expect(iWritten).toBeGreaterThan(-1);
    expect(iConfirmed).toBeGreaterThan(iWritten);
    expect(iFired).toBeGreaterThan(iConfirmed);
    // Ground truth, not just log order: the doc as read INSIDE putRecord
    // already contains the intent record.
    expect(docStateAtFire).not.toBeNull();
    expect(
      (docStateAtFire!.crossingRecords ?? []).some((r) => r.recordType === 'crossing-intent'),
    ).toBe(true);
  });

  it('AC-ii: intent record carries all required fields, non-null, schema-valid', async () => {
    // Item 3.1: records live in the ASSEMBLY document; its content object is
    // the assembled output (one input → same content), so the digest binds it.
    const doc: CrossingDocShape = await asm.doc();
    const recs = (doc.crossingRecords ?? []) as CrossingIntentRecord[];
    expect(recs.length).toBeGreaterThan(0);
    const rec = recs[recs.length - 1];
    const result = validateCrossingIntentRecord(rec);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    for (const f of REQUIRED_FIELDS) {
      expect(rec[f], `field ${f}`).not.toBeNull();
      expect(rec[f], `field ${f}`).not.toBeUndefined();
      expect(rec[f], `field ${f}`).not.toBe('');
    }
    // Digest binds the authorized content (CP-F11)
    expect(rec.authorizedContentDigest).toBe(
      computeAuthorizedContentDigest({ title: doc.title, content: doc.content, createdAt: doc.createdAt }),
    );
    // Validator also rejects: missing field / bad literal / bad CV value
    expect(validateCrossingIntentRecord({ ...rec, grantorDID: '' }).valid).toBe(false);
    expect(validateCrossingIntentRecord({ ...rec, gateResult: 'blocked' as any }).valid).toBe(false);
    expect(validateCrossingIntentRecord({ ...rec, identityCustodyClass: 'sovereign' as any }).valid).toBe(false);
    // Item 3.1: sourceLineage names the granted input; the record names the assembly doc.
    expect(rec.sourceDocumentURI).toBe(asm.url);
    expect(rec.sourceLineage.map((l) => l.documentURI)).toEqual([handle.url]);
    expect(validateCrossingIntentRecord({ ...rec, sourceLineage: [] }).valid).toBe(false);
  });

  it('AC-iii: a blocked gate check produces no intent record and does not fire', async () => {
    // Fresh doc with NO grant for the actor — the real blocked path.
    const { owner, actor } = await makeHivePair();
    const h2 = await (owner.repo as any).create2({
      title: 'ungranted', content: 'x', createdAt: new Date().toISOString(),
    });
    const ind2 = await owner.hive.receiveContactCard(actor.hive.active.contactCard);
    const asm2 = await (actor.repo as any).create2({ title: '', content: '', createdAt: null });
    // NOTE: no addMemberToDoc call — actor holds no grant.
    const gate: GateCheckFn = async ({ documentURI }) => {
      const access = await owner.hive.accessForDoc(ind2!.id, documentURI as any);
      const at = new Date().toISOString();
      return access !== undefined && access !== null && access.isReader
        ? { result: 'pass', grantReference: 'unexpected', gateCheckedAt: at, documentURI }
        : { result: 'blocked', grantReference: null, gateCheckedAt: at, reason: 'no grant for actor', documentURI };
    };
    let fired = false;
    const log: CrossingLogEntry[] = [];
    const outcome = await initiateCrossing({
      inputs: [wrapHandle(h2)],
      handle: wrapHandle(asm2),
      presentedContent: { title: 'ungranted', content: 'x', createdAt: undefined },
      gateCheck: gate,
      putRecord: async () => { fired = true; return { uri: 'x', cid: 'x' }; },
      identity: { grantorDID: TEST_DID, targetDID: TEST_DID, identityCustodyClass: 'provider-custodied' },
      targetPDS: TARGET_PDS,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: new Date(Date.now() + 60_000).toISOString(),
      log,
    });
    expect(outcome.status).toBe('gate-blocked');
    if (outcome.status === 'gate-blocked') expect(outcome.reason).toContain(h2.url); // block names the document (S2 B-7)
    expect(fired).toBe(false);
    const d2: CrossingDocShape = await asm2.doc();
    expect(d2.crossingRecords ?? []).toHaveLength(0); // NO intent record minted
    expect(d2.title).toBe(''); // NO assembly write (no orphan)
    expect(log.map((e) => e.event)).not.toContain('intent-record-written');
    expect(log.map((e) => e.event)).not.toContain('assembly-document-written');
  });

  it('AC-iv: expired crossingTimeoutHorizon rejects without firing — both expiry positions', async () => {
    // (a) horizon already expired at mint time → no intent record, no fire
    let fired = false;
    const logA: CrossingLogEntry[] = [];
    const before = ((await asm.doc()).crossingRecords ?? []).length;
    const outA = await initiateCrossing({
      inputs: [wrapHandle(handle)],
      handle: wrapHandle(asm),
      presentedContent: await presentedFrom(handle),
      gateCheck: realGate(() => new Date()),
      putRecord: async () => { fired = true; return { uri: 'x', cid: 'x' }; },
      identity: { grantorDID: TEST_DID, targetDID: TEST_DID, identityCustodyClass: 'provider-custodied' },
      targetPDS: TARGET_PDS,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: new Date(Date.now() - 1_000).toISOString(),
      log: logA,
    });
    expect(outA.status).toBe('horizon-expired');
    expect(fired).toBe(false);
    expect(((await asm.doc()).crossingRecords ?? []).length).toBe(before);

    // (b) horizon expires between intent write and fire (injected clock
    // advances past the horizon after the read-confirm step) → intent
    // record present, putRecord NOT fired (crossing-unconfirmed posture)
    let t = Date.parse('2026-08-18T12:00:00.000Z');
    // Clock advances 3s per observation. Item 3.2 order (horizon step 3h
    // before the assembly write): gate-started, gate-pass,
    // assembly-completed, digest-check-pass (t0..t0+9s), horizon step's
    // single read (t0+12s), assembly-document-written (t0+15s), emittedAt,
    // written, read-confirmed (t0+18..24s), fire-time check (t0+27s).
    // Horizon at t0+16s → alive at mint, expired at fire.
    const horizon = new Date(t + 16_000).toISOString();
    const clock = () => {
      const d = new Date(t);
      t += 3_000; // each observation advances 3s; horizon passes mid-flow
      return d;
    };
    let firedB = false;
    const logB: CrossingLogEntry[] = [];
    const outB = await initiateCrossing({
      inputs: [wrapHandle(handle)],
      handle: wrapHandle(asm),
      presentedContent: await presentedFrom(handle),
      gateCheck: realGate(() => new Date(t)),
      putRecord: async () => { firedB = true; return { uri: 'x', cid: 'x' }; },
      identity: { grantorDID: TEST_DID, targetDID: TEST_DID, identityCustodyClass: 'provider-custodied' },
      targetPDS: TARGET_PDS,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizon,
      clock,
      log: logB,
    });
    expect(outB.status).toBe('horizon-expired');
    expect(firedB).toBe(false);
    expect(logB.map((e) => e.event)).toContain('intent-record-written');
    expect(logB.map((e) => e.event)).not.toContain('put-record-fired');
  });
});
