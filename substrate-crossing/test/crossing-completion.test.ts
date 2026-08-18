/**
 * PC#8 — Item 1.3 acceptance tests (in-container half).
 *
 *   AC-h  Completion record written to the document after a successful
 *         publish, all required fields present, validator clean.
 *   AC-i  crossingIntentRef is the content address of the document-resident
 *         intent record (deterministic; tamper-evident).
 *   AC-j  crossingTargetURI / crossingTargetCID match the PDS response;
 *         crossingTargetCID carries Run 1's captured-CID role.
 *   AC-k  Closing edge: COMPLETION_WRITTEN_EVENT stamped into the timing
 *         log, hook marked, record.completedAt — all the same instant.
 *         Second completion write throws (completion-mint-once).
 *   AC-l  Failure path: failed publish mints NO completion record; the
 *         intent-without-completion state is legible from the document
 *         alone (crossing-intent-pending → crossing-unconfirmed at
 *         horizon elapse).
 *   AC-m  intent_without_completion_window_ms computable and populated in
 *         the §H.3 entry; completion_written_at populated; outcome
 *         `completed` (taxonomy: crossing-complete).
 *   AC-n  Validator rejects a completion record missing crossingIntentRef.
 *   AC-o  End-to-end over the real Keyhive substrate: gate → intent →
 *         timed publish → completion → document reads crossing-complete.
 *
 * Live-PDS acceptance (completion against a real bsky.social crossing —
 * Run 2/3) is operator-run, same split as Items 0.2 / 1.2.
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
  COMPLETION_WRITTEN_EVENT,
  type WhtwndEntryRecord,
} from '../src/crossing-fire.js';
import {
  writeCrossingCompletion,
  validateCrossingCompletionRecord,
  computeIntentRecordRef,
  deriveDocumentCrossingState,
  type CompletionDocShape,
  type CompletionHandle,
} from '../src/crossing-completion.js';
import { buildH3Entry, renderH3Entry } from '../src/observation-log.js';

const TEST_DID = 'did:plc:testoperator0000000000000';
const ACK =
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request.';
/** Run 1's captured CID — the operator baseline this item's live half
 *  carries into the completion record (kickoff §3). Used here as the mock
 *  PDS response so AC-j exercises the exact carry. */
const RUN1_CID =
  'bafyreify3v7no62eezhbcvfzpiqwe7a5dblyhkwbbffpy37h5eznp3btdq';

/** Deterministic clock: each call advances by stepMs. */
function steppingClock(startIso: string, stepMs: number): () => Date {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += stepMs;
    return d;
  };
}

/** Minimal in-memory handle matching the automerge-repo surface used. */
function memHandle(initial: CompletionDocShape): CompletionHandle & {
  heads?(): string[];
} {
  const doc: CompletionDocShape = JSON.parse(JSON.stringify(initial));
  return {
    url: 'automerge:memtest',
    heads: () => ['headA'],
    change(fn) {
      fn(doc);
    },
    doc() {
      return JSON.parse(JSON.stringify(doc));
    },
  };
}

const passGate: GateCheckFn = async () => ({
  result: 'pass',
  grantReference: 'keyhive:test:read',
  gateCheckedAt: new Date().toISOString(),
});

/** Runs a full fired crossing against the mem handle; returns everything
 *  the completion write needs. */
async function firedCrossing(opts?: {
  clock?: () => Date;
  horizonMs?: number;
  publishFails?: boolean;
}) {
  const clock = opts?.clock ?? steppingClock('2026-08-18T15:00:00.000Z', 100);
  const handle = memHandle({
    title: 't',
    content: 'c',
    createdAt: '2026-08-18T14:59:00.000Z',
  });
  const timings = emptyTimings();
  const record: WhtwndEntryRecord = {
    $type: 'com.whtwnd.blog.entry',
    title: 't',
    content: 'c',
    createdAt: '2026-08-18T14:59:00.000Z',
    visibility: 'public',
  };
  const put = makeTimedPutRecord({
    publish: async () => {
      if (opts?.publishFails) throw new Error('simulated PDS reject');
      return { uri: `at://${TEST_DID}/com.whtwnd.blog.entry/rkey13`, cid: RUN1_CID };
    },
    record,
    timings,
    clock,
  });
  const log: CrossingLogEntry[] = [];
  const horizon = new Date(
    Date.parse('2026-08-18T15:00:00.000Z') + (opts?.horizonMs ?? 60_000),
  ).toISOString();
  let intent: CrossingIntentRecord | null = null;
  let fireErr: string | null = null;
  try {
    const outcome = await initiateCrossing({
      handle,
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
    if (outcome.status === 'fired') intent = outcome.intent;
  } catch (e: any) {
    fireErr = String(e?.message ?? e);
    const doc = (await handle.doc()) as CompletionDocShape;
    const last = (doc.crossingRecords ?? []).at(-1);
    intent = (last as CrossingIntentRecord) ?? null;
  }
  return { handle, timings, log, intent, horizon, clock, fireErr };
}

// ---------------------------------------------------------------------------
// AC-h / AC-i / AC-j / AC-k — the completion write
// ---------------------------------------------------------------------------

describe('writeCrossingCompletion (AC-1.3 core)', () => {
  it('AC-h: writes a validator-clean completion record after a successful publish', async () => {
    const { handle, timings, log, intent, clock } = await firedCrossing();
    const hook = createCompletionHook(clock);
    const completion = await writeCrossingCompletion({
      handle,
      intent: intent!,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      hook,
      clock,
      log,
    });
    expect(validateCrossingCompletionRecord(completion).valid).toBe(true);
    const doc = (await handle.doc()) as CompletionDocShape;
    expect(doc.completionRecords).toHaveLength(1);
    expect(doc.completionRecords![0].crossingOutcome).toBe('completed');
    // relay unobserved in this run: field omitted, still valid (optional).
    expect('relayIngestedAt' in doc.completionRecords![0]).toBe(false);
  });

  it('AC-i: crossingIntentRef content-addresses the document-resident intent record', async () => {
    const { handle, timings, log, intent, clock } = await firedCrossing();
    const hook = createCompletionHook(clock);
    const completion = await writeCrossingCompletion({
      handle,
      intent: intent!,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      hook,
      clock,
      log,
    });
    // Deterministic: recompute from the record as read back from the doc.
    const doc = (await handle.doc()) as CompletionDocShape;
    const residentIntent = doc.crossingRecords![0] as CrossingIntentRecord;
    expect(completion.crossingIntentRef).toBe(computeIntentRecordRef(residentIntent));
    expect(completion.crossingIntentRef).toMatch(/^intent-sha256:[0-9a-f]{64}$/);
    // Tamper-evident: a mutated intent no longer matches the ref.
    const mutated = { ...residentIntent, regimeAcknowledgment: 'forged' };
    expect(computeIntentRecordRef(mutated)).not.toBe(completion.crossingIntentRef);
  });

  it('AC-j: crossingTargetURI/CID match the PDS response (Run 1 CID carry)', async () => {
    const { handle, timings, log, intent, clock } = await firedCrossing();
    const hook = createCompletionHook(clock);
    const completion = await writeCrossingCompletion({
      handle,
      intent: intent!,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      hook,
      clock,
      log,
    });
    expect(completion.crossingTargetCID).toBe(RUN1_CID);
    expect(completion.crossingTargetURI).toBe(
      `at://${TEST_DID}/com.whtwnd.blog.entry/rkey13`,
    );
    expect(completion.pdsAcceptedAt).toBe(timings.pdsAcceptedAt);
  });

  it('AC-k: closing edge stamped once — log event, hook, completedAt agree; second write throws', async () => {
    const { handle, timings, log, intent, clock } = await firedCrossing();
    const hook = createCompletionHook(clock);
    const completion = await writeCrossingCompletion({
      handle,
      intent: intent!,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      hook,
      clock,
      log,
    });
    const evt = log.find((l) => l.event === COMPLETION_WRITTEN_EVENT);
    expect(evt).toBeDefined();
    expect(evt!.at).toBe(hook.completionWrittenAt);
    expect(evt!.at).toBe(completion.completedAt);
    expect(evt!.detail).toBe(RUN1_CID);
    // completion-mint-once: the hook refuses a second mark.
    await expect(
      writeCrossingCompletion({
        handle,
        intent: intent!,
        put: { uri: timings.uri, cid: timings.cid },
        pdsAcceptedAt: timings.pdsAcceptedAt,
        hook,
        clock,
        log,
      }),
    ).rejects.toThrow(/minted once/);
  });
});

// ---------------------------------------------------------------------------
// AC-l — failure path + fail-closed legibility
// ---------------------------------------------------------------------------

describe('failure path and document legibility (AC-l)', () => {
  it('AC-l: failed publish mints no completion; state legible from the document alone', async () => {
    const { handle, timings, log, intent, fireErr, clock } = await firedCrossing({
      publishFails: true,
    });
    expect(fireErr).toMatch(/simulated PDS reject/);
    const hook = createCompletionHook(clock);
    // The guard refuses: no uri/cid from a failed publish.
    await expect(
      writeCrossingCompletion({
        handle,
        intent: intent!,
        put: { uri: timings.uri, cid: timings.cid },
        pdsAcceptedAt: timings.pdsAcceptedAt,
        hook,
        clock,
        log,
      }),
    ).rejects.toThrow(/intent-without-completion/);
    const doc = (await handle.doc()) as CompletionDocShape;
    expect(doc.completionRecords ?? []).toHaveLength(0);
    expect(doc.crossingRecords).toHaveLength(1); // intent remains resident
    expect(hook.completionWrittenAt).toBeNull();
    expect(log.some((l) => l.event === COMPLETION_WRITTEN_EVENT)).toBe(false);
    // Deferred-party read, no external lookup:
    const horizonIso = doc.crossingRecords![0].crossingTimeoutHorizon;
    const beforeHorizon = new Date(Date.parse(horizonIso) - 1000);
    const afterHorizon = new Date(Date.parse(horizonIso) + 1000);
    expect(deriveDocumentCrossingState(doc, beforeHorizon)).toBe(
      'crossing-intent-pending',
    );
    expect(deriveDocumentCrossingState(doc, afterHorizon)).toBe(
      'crossing-unconfirmed',
    );
  });

  it('AC-l: taxonomy walk — not-initiated / pending / complete', async () => {
    const empty: CompletionDocShape = { title: 't', content: 'c', createdAt: 'x' };
    expect(deriveDocumentCrossingState(empty)).toBe('not-initiated');
    const { handle, timings, log, intent, clock, horizon } = await firedCrossing();
    const preCompletion = (await handle.doc()) as CompletionDocShape;
    expect(
      deriveDocumentCrossingState(
        preCompletion,
        new Date(Date.parse(horizon) - 1000),
      ),
    ).toBe('crossing-intent-pending');
    const hook = createCompletionHook(clock);
    await writeCrossingCompletion({
      handle,
      intent: intent!,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      hook,
      clock,
      log,
    });
    const done = (await handle.doc()) as CompletionDocShape;
    // Completion closes the chain even past the horizon.
    expect(
      deriveDocumentCrossingState(done, new Date(Date.parse(horizon) + 1000)),
    ).toBe('crossing-complete');
  });
});

// ---------------------------------------------------------------------------
// AC-m — the window becomes computable
// ---------------------------------------------------------------------------

describe('§H.3 window population (AC-m)', () => {
  it('AC-m: window computable from the log; completion fields populated; outcome completed', async () => {
    const { handle, timings, log, intent, clock } = await firedCrossing();
    const hook = createCompletionHook(clock);
    await writeCrossingCompletion({
      handle,
      intent: intent!,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      hook,
      clock,
      log,
    });
    const entry = buildH3Entry({
      runNumber: 2,
      scenario: 'baseline',
      crossingLog: log,
      intentEmittedAt: intent!.emittedAt,
      putRecordCalledAt: timings.putRecordCalledAt,
      pdsAcceptedAt: timings.pdsAcceptedAt,
      relayIngestedAt: null,
      completionWrittenAt: hook.completionWrittenAt,
      crossingOutcome: 'completed',
      kl1Observation: 'test',
      kl2Observation: 'n/a',
    });
    const opened = log.find((l) => l.event === 'intent-record-written')!.at;
    const closed = log.find((l) => l.event === COMPLETION_WRITTEN_EVENT)!.at;
    expect(entry.completion_written_at).toBe(closed);
    expect(entry.intent_without_completion_window_ms).toBe(
      Date.parse(closed) - Date.parse(opened),
    );
    expect(entry.intent_without_completion_window_ms).toBeGreaterThan(0);
    expect(entry.crossing_outcome).toBe('completed');
    const rendered = renderH3Entry(entry);
    expect(rendered).toContain(`completion_written_at: ${closed}`);
    expect(rendered).toContain('crossing_outcome:    completed');
    expect(rendered).not.toContain('intent_without_completion_window_ms: null');
  });
});

// ---------------------------------------------------------------------------
// AC-n — validator
// ---------------------------------------------------------------------------

describe('completion record validator (AC-n)', () => {
  it('AC-n: rejects a record missing crossingIntentRef; flags bad literals', () => {
    const bad = validateCrossingCompletionRecord({
      recordType: 'crossing-completion',
      governanceEvent: 'substrate-crossing',
      boundType: 'exposure-unbounded',
      chainDepth: 1,
      lineageAnchorType: 'author-declared',
      crossingTargetURI: 'at://x/y/z',
      crossingTargetCID: 'bafyx',
      completedAt: '2026-08-18T15:00:01.000Z',
      pdsAcceptedAt: '2026-08-18T15:00:00.500Z',
      crossingOutcome: 'completed',
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/crossingIntentRef/);
    const badOutcome = validateCrossingCompletionRecord({
      crossingOutcome: 'partial' as any,
    });
    expect(badOutcome.errors.join(' ')).toMatch(/crossingOutcome/);
  });
});

// ---------------------------------------------------------------------------
// AC-o — end-to-end over the real Keyhive substrate
// ---------------------------------------------------------------------------

describe('end-to-end: gate → intent → publish → completion (AC-o)', () => {
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
      mk(ownerNet, 'pc08-13-owner'),
      mk(actorNet, 'pc08-13-actor'),
    ]);
    ownerNet.peerCandidate(actorNet.peerId!);
    actorNet.peerCandidate(ownerNet.peerId!);
  }, 30_000);

  afterAll(() => {
    ownerNet?.disconnect();
    actorNet?.disconnect();
  });

  it('AC-o: document over the real substrate reads crossing-complete', async () => {
    const content = {
      title: 'PC#8 Item 1.3 e2e',
      content: 'completion over real Keyhive substrate',
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

    const gate: GateCheckFn = async () => {
      const access = await owner.hive.accessForDoc(individual!.id, handle.url);
      return access !== undefined
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
    const put = makeTimedPutRecord({
      publish: async () => ({
        uri: `at://${TEST_DID}/com.whtwnd.blog.entry/e2e13`,
        cid: RUN1_CID,
      }),
      record: {
        $type: 'com.whtwnd.blog.entry',
        title: content.title,
        content: content.content,
        createdAt: content.createdAt,
        visibility: 'public',
      },
      timings,
    });
    const log: CrossingLogEntry[] = [];
    const hook = createCompletionHook();
    const outcome = await initiateCrossing({
      handle,
      gateCheck: gate,
      putRecord: put,
      identity: {
        grantorDID: TEST_DID,
        targetDID: TEST_DID,
        identityCustodyClass: 'provider-custodied',
      },
      targetPDS: 'https://bsky.social',
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: new Date(Date.now() + 60_000).toISOString(),
      log,
    });
    expect(outcome.status).toBe('fired');
    if (outcome.status !== 'fired') return;

    const completion = await writeCrossingCompletion({
      handle,
      intent: outcome.intent,
      put: { uri: timings.uri, cid: timings.cid },
      pdsAcceptedAt: timings.pdsAcceptedAt,
      hook,
      log,
    });
    expect(completion.crossingTargetCID).toBe(RUN1_CID);

    const doc = (await handle.doc()) as CompletionDocShape;
    expect(deriveDocumentCrossingState(doc)).toBe('crossing-complete');
    // Ordered discipline: closing edge is the final event, after
    // put-record-accepted.
    const events = log.map((l) => l.event);
    expect(events.indexOf(COMPLETION_WRITTEN_EVENT)).toBeGreaterThan(
      events.indexOf('put-record-accepted'),
    );
  }, 30_000);
});
