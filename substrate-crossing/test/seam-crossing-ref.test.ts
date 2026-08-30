/**
 * PC#8 — Item 1.4 acceptance tests (in-container half).
 *
 *   AC-p  buildSeamCrossingRef derives every field from the authorizing
 *         intent record; validator clean; crossingIntentRef recomputes.
 *   AC-q  Published payload carries seamCrossingRef when attachment is
 *         enabled: field present in what the publish call receives, shape
 *         valid, digest matches the intent (kickoff acceptance: presence,
 *         shape, digest match).
 *   AC-r  verifySeamCrossingRefAgainstIntent: passes for the authorizing
 *         intent; a mutated digest and a mutated intent both surface as
 *         mismatches (tamper-evident, both directions).
 *   AC-s  Attachment disabled (default): payload unchanged — the
 *         back-pointer is optional and never load-bearing; the Item 1.2
 *         payload shape is a strict regression surface.
 *   AC-t  End-to-end over the real Keyhive substrate: gate → intent →
 *         publish-with-ref → completion; the payload's seamCrossingRef
 *         verifies against the DOCUMENT-RESIDENT intent record (the KL-2
 *         traversal direction: from the published record back to the
 *         governed document), and the completion arc is undisturbed.
 *
 * Live-PDS acceptance (putRecord succeeds with seamCrossingRef included;
 * getRecord returns it intact; AppView surface/drop observation) is
 * operator-run — Run 4+, same split as Items 0.2 / 1.2 / 1.3.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  type CrossingIntentRecord,
  type CrossingLogEntry,
  type GateCheckFn,
} from '../src/crossing-intent.js';
import {
  makeTimedPutRecord,
  emptyTimings,
  createCompletionHook,
  type WhtwndEntryRecord,
} from '../src/crossing-fire.js';
import {
  writeCrossingCompletion,
  computeIntentRecordRef,
  deriveDocumentCrossingState,
  type CompletionDocShape,
  type CompletionHandle,
} from '../src/crossing-completion.js';
import {
  buildSeamCrossingRef,
  validateSeamCrossingRef,
  verifySeamCrossingRefAgainstIntent,
} from '../src/seam-crossing-ref.js';

const TEST_DID = 'did:plc:testoperator0000000000000';
const ACK =
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request.';
const MOCK_CID =
  'bafyreify3v7no62eezhbcvfzpiqwe7a5dblyhkwbbffpy37h5eznp3btdq';

function steppingClock(startIso: string, stepMs: number): () => Date {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += stepMs;
    return d;
  };
}

function memHandle(initial: CompletionDocShape): CompletionHandle & {
  heads?(): string[];
} {
  const doc: CompletionDocShape = JSON.parse(JSON.stringify(initial));
  return {
    url: 'automerge:memtest14',
    heads: () => ['headA'],
    change(fn) {
      fn(doc);
    },
    doc() {
      return JSON.parse(JSON.stringify(doc));
    },
  };
}

/** Item 3.1: per-document gate shape; always passes in these mem tests. */
const passGate: GateCheckFn = async ({ documentURI }) => ({
  result: 'pass',
  grantReference: 'keyhive:test:read',
  gateCheckedAt: new Date().toISOString(),
  access: 'Read',
  documentURI,
});

/** Fires a crossing against the mem handle with attachment configurable;
 *  captures the exact payload the publish call receives. */
async function firedWithRef(attach: boolean) {
  const clock = steppingClock('2026-08-18T16:00:00.000Z', 100);
  // Item 3.1 uniform path: one granted input; assembly document hosts records.
  const input = memHandle({
    title: 't14',
    content: 'c14',
    createdAt: '2026-08-18T15:59:00.000Z',
  });
  input.url = 'automerge:meminput14';
  const handle = memHandle({ title: '', content: '', createdAt: null });
  const timings = emptyTimings();
  const record: WhtwndEntryRecord = {
    $type: 'com.whtwnd.blog.entry',
    title: 't14',
    content: 'c14',
    createdAt: '2026-08-18T15:59:00.000Z',
    visibility: 'public',
  };
  let publishedPayload: WhtwndEntryRecord | null = null;
  const put = makeTimedPutRecord({
    publish: async (payload) => {
      publishedPayload = payload;
      return {
        uri: `at://${TEST_DID}/com.whtwnd.blog.entry/rkey14`,
        cid: MOCK_CID,
      };
    },
    record,
    timings,
    clock,
    attachSeamCrossingRef: attach,
  });
  const log: CrossingLogEntry[] = [];
  const horizon = new Date(
    Date.parse('2026-08-18T16:00:00.000Z') + 60_000,
  ).toISOString();
  const outcome = await initiateCrossing({
    inputs: [input],
    handle,
    presentedContent: { title: 't14', content: 'c14', createdAt: '2026-08-18T15:59:00.000Z' },
    gateCheck: passGate,
    putRecord: put,
    identity: {
      grantorDID: TEST_DID,
      targetDID: TEST_DID,
      identityCustodyClass: 'provider-custodied',
    },
    targetPDS: 'https://bsky.social',
    regimeAcknowledgment: ACK,
    crossingTimeoutHorizon: horizon,
    clock,
    log,
  });
  if (outcome.status !== 'fired') throw new Error(`expected fired, got ${outcome.status}`);
  return {
    handle,
    timings,
    log,
    intent: outcome.intent,
    payload: publishedPayload!,
    record,
    clock,
  };
}

// ---------------------------------------------------------------------------
// AC-p — derivation and shape
// ---------------------------------------------------------------------------

describe('buildSeamCrossingRef (AC-p)', () => {
  it('AC-p: derives every field from the intent record; validator clean; ref recomputes', async () => {
    const { intent } = await firedWithRef(false);
    const ref = buildSeamCrossingRef(intent);

    expect(ref.sourceDocumentURI).toBe(intent.sourceDocumentURI);
    expect(ref.sourceDocumentCID).toBe(intent.sourceDocumentCID);
    expect(ref.authorizedContentDigest).toBe(intent.authorizedContentDigest);
    expect(ref.crossingIntentRef).toBe(computeIntentRecordRef(intent));
    expect(ref.crossingIntentRef).toMatch(/^intent-sha256:[0-9a-f]{64}$/);

    const v = validateSeamCrossingRef(ref);
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-q — presence, shape, digest match in the published payload
// ---------------------------------------------------------------------------

describe('published payload carries the back-pointer (AC-q)', () => {
  it('AC-q: payload received by the publish call contains a valid, digest-matched seamCrossingRef', async () => {
    const { intent, payload } = await firedWithRef(true);

    expect(payload.seamCrossingRef).toBeDefined();
    const ref = payload.seamCrossingRef!;
    const shape = validateSeamCrossingRef(ref);
    expect(shape.errors).toEqual([]);

    expect(ref.authorizedContentDigest).toBe(intent.authorizedContentDigest);
    const verify = verifySeamCrossingRefAgainstIntent(ref, intent);
    expect(verify.errors).toEqual([]);
    expect(verify.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-r — tamper evidence, both directions
// ---------------------------------------------------------------------------

describe('verifySeamCrossingRefAgainstIntent (AC-r)', () => {
  it('AC-r: passes for the authorizing intent; mutated digest and mutated intent both surface', async () => {
    const { intent } = await firedWithRef(false);
    const ref = buildSeamCrossingRef(intent);

    expect(verifySeamCrossingRefAgainstIntent(ref, intent).valid).toBe(true);

    const tamperedRef = { ...ref, authorizedContentDigest: 'f'.repeat(64) };
    const r1 = verifySeamCrossingRefAgainstIntent(tamperedRef, intent);
    expect(r1.valid).toBe(false);
    expect(r1.errors.some((e) => e.includes('authorizedContentDigest'))).toBe(true);

    const mutatedIntent: CrossingIntentRecord = {
      ...intent,
      regimeAcknowledgment: 'a different acknowledgment',
    };
    const r2 = verifySeamCrossingRefAgainstIntent(ref, mutatedIntent);
    expect(r2.valid).toBe(false);
    expect(r2.errors.some((e) => e.includes('crossingIntentRef'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-s — optional, never load-bearing: default payload unchanged
// ---------------------------------------------------------------------------

describe('attachment disabled leaves the payload unchanged (AC-s)', () => {
  it('AC-s: without attachSeamCrossingRef the publish call receives the Item 1.2 shape verbatim', async () => {
    const { payload, record } = await firedWithRef(false);
    expect(payload.seamCrossingRef).toBeUndefined();
    expect(payload).toEqual(record);
  });
});

// ---------------------------------------------------------------------------
// AC-t — end-to-end over the real Keyhive substrate
// ---------------------------------------------------------------------------

describe('end-to-end: payload ref verifies against the document-resident intent (AC-t)', () => {
  let owner: any;
  let actor: any;
  let ownerNet: PairNetworkAdapter;
  let actorNet: PairNetworkAdapter;

  beforeAll(async () => {
    [ownerNet, actorNet] = PairNetworkAdapter.createConnectedPair();
    const mk = (adapter: any, label: string) =>
      initializeLegacyAutomergeRepoKeyhive({
        storage: new DummyStorageAdapter(),
        peerIdSuffix: label,
        networkAdapter: adapter,
        syncServer: 'none',
        createRepo: (cfg: any) => new Repo(cfg),
      });
    [owner, actor] = await Promise.all([
      mk(ownerNet, 'pc08-14-owner'),
      mk(actorNet, 'pc08-14-actor'),
    ]);
    ownerNet.peerCandidate(actorNet.peerId!);
    actorNet.peerCandidate(ownerNet.peerId!);
  }, 30_000);

  afterAll(() => {
    ownerNet?.disconnect();
    actorNet?.disconnect();
  });

  it('AC-t: KL-2 traversal direction holds over the real substrate; completion arc undisturbed', async () => {
    const content = {
      title: 'PC#8 Item 1.4 e2e',
      content: 'seamCrossingRef over real Keyhive substrate',
      createdAt: new Date().toISOString(),
    };
    const handle = await (owner.repo as any).create2(content);
    const card = actor.hive.active.contactCard;
    const individual = await owner.hive.receiveContactCard(card);
    let granted = false;
    for (let i = 0; i < 20 && !granted; i++) {
      try {
        await owner.hive.addMemberToDoc(handle.url, card, Access.read());
        granted = true;
      } catch (e: any) {
        if (e?.name === 'UnprotectedDocError' || /unprotected/i.test(String(e))) {
          await new Promise((r) => setTimeout(r, 250));
        } else throw e;
      }
    }
    expect(granted).toBe(true);

    const gate: GateCheckFn = async ({ documentURI }) => {
      const access = await owner.hive.accessForDoc(individual!.id, documentURI as any);
      return access !== undefined && access.isReader
        ? {
            result: 'pass',
            grantReference: `keyhive:${Buffer.from(individual!.id.toBytes()).toString('hex')}:read`,
            gateCheckedAt: new Date().toISOString(),
          }
        : {
            result: 'blocked',
            grantReference: null,
            gateCheckedAt: new Date().toISOString(),
            reason: 'no grant',
          };
    };

    const timings = emptyTimings();
    const record: WhtwndEntryRecord = {
      $type: 'com.whtwnd.blog.entry',
      title: content.title,
      content: content.content,
      createdAt: content.createdAt,
      visibility: 'public',
    };
    let publishedPayload: WhtwndEntryRecord | null = null;
    const put = makeTimedPutRecord({
      publish: async (payload) => {
        publishedPayload = payload;
        return {
          uri: `at://${TEST_DID}/com.whtwnd.blog.entry/rkey14e2e`,
          cid: MOCK_CID,
        };
      },
      record,
      timings,
      attachSeamCrossingRef: true,
    });

    const log: CrossingLogEntry[] = [];
    const horizon = new Date(Date.now() + 60_000).toISOString();
    // Item 3.1: actor-owned assembly document (D-5) hosts the records.
    const asm = await (actor.repo as any).create2({ title: '', content: '', createdAt: null });
    const outcome = await initiateCrossing({
      inputs: [handle],
      handle: asm,
      presentedContent: content,
      gateCheck: gate,
      putRecord: put,
      identity: {
        grantorDID: TEST_DID,
        targetDID: TEST_DID,
        identityCustodyClass: 'provider-custodied',
      },
      targetPDS: 'https://bsky.social',
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizon,
      log,
    });
    expect(outcome.status).toBe('fired');
    if (outcome.status !== 'fired') return;

    // KL-2 traversal direction: start from the published payload's ref and
    // verify against the intent record read back FROM THE DOCUMENT — not
    // from the in-memory outcome object.
    const doc = (await asm.doc()) as CompletionDocShape;
    const residentIntent = (doc.crossingRecords ?? []).at(-1) as CrossingIntentRecord;
    expect(residentIntent).toBeDefined();
    const ref = publishedPayload!.seamCrossingRef!;
    expect(ref).toBeDefined();
    const verify = verifySeamCrossingRefAgainstIntent(
      ref,
      JSON.parse(JSON.stringify(residentIntent)),
    );
    expect(verify.errors).toEqual([]);
    expect(verify.valid).toBe(true);

    // Completion arc undisturbed by the widened fire step.
    const hook = createCompletionHook();
    await writeCrossingCompletion({
      handle: asm,
      intent: outcome.intent,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      relayIngestedAt: null,
      hook,
      log,
    });
    const after = (await asm.doc()) as CompletionDocShape;
    expect(deriveDocumentCrossingState(after)).toBe('crossing-complete');
  }, 30_000);
});
