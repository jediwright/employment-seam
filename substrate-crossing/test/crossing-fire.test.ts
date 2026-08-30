/**
 * PC#8 Item 1.2 acceptance tests (build plan §2 Item 1.2 acceptance block,
 * in-container half — the live-PDS half is operator-run via
 * scripts/run-crossing.ts):
 *
 *   AC-a  putRecord timing capture: call + accept timestamps and uri/cid
 *         land in LivePutTimings; latency computable. (AC-1.2 mechanism)
 *   AC-b  publish failure: call timestamp retained, accept stays null,
 *         error propagates; intent record remains document-resident and no
 *         completion exists (crossing-intent-failed posture).
 *   AC-c  JetstreamWatcher: matching DID+collection create event observed
 *         over a real WebSocket (local server); non-matching events
 *         ignored; timestamps captured. (AC-1.3 mechanism)
 *   AC-d  JetstreamWatcher timeout degrades to null relay fields, does not
 *         reject (H.3 applicable-but-unobserved semantics).
 *   AC-e  H.3 entry assembly: deltas computed; window anchored on the
 *         intent-record-written log event; window null while the
 *         completion hook is unmarked; marked hook closes the window.
 *   AC-f  Renderer emits the template's Run-N block field-for-field.
 *   AC-g  End-to-end in-container: full initiateCrossing() over the real
 *         Keyhive substrate with a mock PDS + local Jetstream simulator
 *         produces a complete H.3 entry with sane deltas.
 *
 * Live-PDS acceptance (putRecord succeeds against bsky.social; real
 * PDS-accept latency; real relay-ingest gap) is operator-run — same split
 * as Item 0.2.
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
import WebSocket, { WebSocketServer } from 'ws';
import {
  initiateCrossing,
  type CrossingLogEntry,
  type GateCheckFn,
} from '../src/crossing-intent.js';
import {
  makeTimedPutRecord,
  emptyTimings,
  JetstreamWatcher,
  createCompletionHook,
  DEFAULT_JETSTREAM,
  type WhtwndEntryRecord,
} from '../src/crossing-fire.js';
import { buildH3Entry, renderH3Entry } from '../src/observation-log.js';

const TEST_DID = 'did:plc:testoperator0000000000000';
const ACK =
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request.';

function makeRecord(): WhtwndEntryRecord {
  return {
    $type: 'com.whtwnd.blog.entry',
    title: 'PC#8 Item 1.2 test entry',
    content: 'timed publish test content',
    createdAt: new Date().toISOString(),
    visibility: 'public',
  };
}

/** Deterministic clock: each call advances by stepMs. */
function steppingClock(startIso: string, stepMs: number): () => Date {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += stepMs;
    return d;
  };
}

// ---------------------------------------------------------------------------
// AC-a / AC-b — timed publish wrapper
// ---------------------------------------------------------------------------

describe('makeTimedPutRecord (AC-1.2 mechanism)', () => {
  it('AC-a: captures call/accept timestamps and uri/cid; latency computable', async () => {
    const timings = emptyTimings();
    const clock = steppingClock('2026-08-18T12:00:00.000Z', 250);
    const put = makeTimedPutRecord({
      publish: async () => ({ uri: 'at://did/x/rkey1', cid: 'bafytestcid' }),
      record: makeRecord(),
      timings,
      clock,
    });
    const res = await put();
    expect(res).toEqual({ uri: 'at://did/x/rkey1', cid: 'bafytestcid' });
    expect(timings.putRecordCalledAt).toBe('2026-08-18T12:00:00.000Z');
    expect(timings.pdsAcceptedAt).toBe('2026-08-18T12:00:00.250Z');
    expect(timings.uri).toBe('at://did/x/rkey1');
    expect(timings.cid).toBe('bafytestcid');
    expect(
      Date.parse(timings.pdsAcceptedAt!) - Date.parse(timings.putRecordCalledAt!),
    ).toBe(250);
  });

  it('AC-b: publish failure retains call timestamp, accept stays null, error propagates', async () => {
    const timings = emptyTimings();
    const put = makeTimedPutRecord({
      publish: async () => {
        throw new Error('simulated PDS 5xx');
      },
      record: makeRecord(),
      timings,
    });
    await expect(put()).rejects.toThrow('simulated PDS 5xx');
    expect(timings.putRecordCalledAt).not.toBeNull();
    expect(timings.pdsAcceptedAt).toBeNull();
    expect(timings.cid).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-c / AC-d — Jetstream watcher over a real local WebSocket server
// ---------------------------------------------------------------------------

describe('JetstreamWatcher (AC-1.3 mechanism)', () => {
  let server: WebSocketServer;
  let endpoint: string;
  const sockets = new Set<WebSocket>();

  beforeAll(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((res) => server.on('listening', () => res()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    endpoint = `ws://127.0.0.1:${port}`;
    server.on('connection', (ws) => sockets.add(ws));
  });

  afterAll(async () => {
    for (const s of sockets) s.terminate();
    await new Promise<void>((res) => server.close(() => res()));
  });

  function broadcast(obj: unknown) {
    const payload = JSON.stringify(obj);
    for (const s of sockets) if (s.readyState === WebSocket.OPEN) s.send(payload);
  }

  it('AC-c: observes matching DID+collection create; ignores non-matching', async () => {
    const watcher = new JetstreamWatcher({
      endpoint,
      did: TEST_DID,
      timeoutMs: 5_000,
      wsFactory: (url) => new WebSocket(url),
    });
    await watcher.start();

    // Non-matching noise first: wrong DID, wrong collection, wrong op.
    broadcast({ did: 'did:plc:someoneelse', commit: { collection: 'com.whtwnd.blog.entry', operation: 'create', rkey: 'nope1' } });
    broadcast({ did: TEST_DID, commit: { collection: 'app.bsky.feed.post', operation: 'create', rkey: 'nope2' } });
    broadcast({ did: TEST_DID, commit: { collection: 'com.whtwnd.blog.entry', operation: 'delete', rkey: 'nope3' } });
    // Matching event.
    broadcast({ did: TEST_DID, commit: { collection: 'com.whtwnd.blog.entry', operation: 'create', rkey: 'yes1' } });

    const obs = await watcher.observed();
    watcher.close();
    expect(obs.timedOut).toBe(false);
    expect(obs.rkey).toBe('yes1');
    expect(obs.observedUri).toBe(`at://${TEST_DID}/com.whtwnd.blog.entry/yes1`);
    expect(obs.relayIngestedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(obs.relayIngestedAt!))).toBe(false);
  });

  it('AC-d: timeout degrades to null relay fields without rejecting', async () => {
    const watcher = new JetstreamWatcher({
      endpoint,
      did: TEST_DID,
      timeoutMs: 200,
      wsFactory: (url) => new WebSocket(url),
    });
    await watcher.start();
    const obs = await watcher.observed(); // no matching event sent
    watcher.close();
    expect(obs.timedOut).toBe(true);
    expect(obs.relayIngestedAt).toBeNull();
    expect(obs.observedUri).toBeNull();
  });

  it('defaults to the registered jetstream1 endpoint', () => {
    expect(DEFAULT_JETSTREAM).toBe(
      'wss://jetstream1.us-east.bsky.network/subscribe',
    );
  });
});

// ---------------------------------------------------------------------------
// AC-e / AC-f — H.3 assembly and rendering
// ---------------------------------------------------------------------------

describe('H.3 entry assembly (AC-1.4/1.7 mechanism)', () => {
  const log: CrossingLogEntry[] = [
    { event: 'gate-check-started', at: '2026-08-18T12:00:00.000Z' },
    { event: 'gate-check-pass', at: '2026-08-18T12:00:00.010Z' },
    { event: 'intent-record-written', at: '2026-08-18T12:00:00.050Z' },
    { event: 'intent-record-read-confirmed', at: '2026-08-18T12:00:00.060Z' },
    { event: 'put-record-fired', at: '2026-08-18T12:00:00.100Z' },
    { event: 'put-record-accepted', at: '2026-08-18T12:00:00.400Z' },
  ];

  it('AC-e: deltas computed; window null while completion hook unmarked', () => {
    const entry = buildH3Entry({
      runNumber: 1,
      scenario: 'baseline',
      crossingLog: log,
      intentEmittedAt: '2026-08-18T12:00:00.045Z',
      putRecordCalledAt: '2026-08-18T12:00:00.100Z',
      pdsAcceptedAt: '2026-08-18T12:00:00.400Z',
      relayIngestedAt: '2026-08-18T12:00:01.400Z',
      completionWrittenAt: null,
      crossingOutcome: 'timeout',
      kl1Observation: 'intent present, completion machinery pending Item 1.3',
      kl2Observation: 'n/a at Item 1.2 (seamCrossingRef is Item 1.4)',
    });
    expect(entry.pds_accept_latency_ms).toBe(300);
    expect(entry.relay_ingest_gap_ms).toBe(1000);
    expect(entry.intent_without_completion_window_ms).toBeNull();
    expect(entry.completion_written_at).toBeNull();
  });

  it('AC-e: marked completion hook closes the window, anchored on intent-record-written', () => {
    const hook = createCompletionHook(
      steppingClock('2026-08-18T12:00:02.050Z', 0),
    );
    hook.mark();
    expect(hook.completionWrittenAt).toBe('2026-08-18T12:00:02.050Z');
    // Second mint must throw — a completion record is minted once.
    expect(() => hook.mark()).toThrow(/already marked/);

    const entry = buildH3Entry({
      runNumber: 2,
      scenario: 'baseline',
      crossingLog: log,
      intentEmittedAt: '2026-08-18T12:00:00.045Z',
      putRecordCalledAt: '2026-08-18T12:00:00.100Z',
      pdsAcceptedAt: '2026-08-18T12:00:00.400Z',
      relayIngestedAt: '2026-08-18T12:00:01.400Z',
      completionWrittenAt: hook.completionWrittenAt,
      crossingOutcome: 'completed',
      kl1Observation: 'window closed by completion record',
      kl2Observation: 'n/a at Item 1.2',
    });
    // Window opens at intent-record-written (12:00:00.050), NOT at
    // intent_emitted_at (12:00:00.045) — the session's anchor decision.
    expect(entry.intent_without_completion_window_ms).toBe(2000);
  });

  it('AC-f: renderer matches the template Run-N block field-for-field', () => {
    const entry = buildH3Entry({
      runNumber: 1,
      scenario: 'baseline',
      crossingLog: log,
      intentEmittedAt: '2026-08-18T12:00:00.045Z',
      putRecordCalledAt: '2026-08-18T12:00:00.100Z',
      pdsAcceptedAt: '2026-08-18T12:00:00.400Z',
      relayIngestedAt: null,
      completionWrittenAt: null,
      crossingOutcome: 'timeout',
      kl1Observation: 'obs text',
      kl2Observation: 'obs text 2',
    });
    const rendered = renderH3Entry(entry, 'first Phase 1 governed crossing');
    const expectedFieldOrder = [
      'crossing_run:',
      'scenario:',
      'intent_emitted_at:',
      'putrecord_called_at:',
      'pds_accepted_at:',
      'relay_ingested_at:',
      'completion_written_at:',
      'crossing_outcome:',
      'pds_accept_latency_ms:',
      'relay_ingest_gap_ms:',
      'intent_without_completion_window_ms:',
      'kl1_legibility_observation:',
      'kl2_back_pointer_observation:',
      'phase3_pattern:',
      'phase3_gate_observation:',
      'phase3_finding:',
    ];
    const fieldLines = rendered
      .split('\n')
      .filter((l) => /^[a-z0-9_]+:/.test(l))
      .map((l) => l.split(/\s+/)[0]);
    expect(fieldLines).toEqual(expectedFieldOrder);
    expect(rendered).toContain('### Run 1 — first Phase 1 governed crossing');
    expect(rendered).toContain('relay_ingested_at:   null');
    expect(rendered).toContain('relay_ingest_gap_ms: null');
    expect(rendered).toContain('intent_without_completion_window_ms: null');
    // Item 3.1: pre-Run-6 entries render the phase3_* fields as n/a.
    expect(rendered).toContain('phase3_pattern:      n/a');
  });
});

// ---------------------------------------------------------------------------
// AC-g — end-to-end over the real Keyhive substrate (in-container half)
// ---------------------------------------------------------------------------

describe('end-to-end: governed crossing with timed publish + relay sim (AC-g)', () => {
  let server: WebSocketServer;
  let endpoint: string;
  const sockets = new Set<WebSocket>();

  beforeAll(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((res) => server.on('listening', () => res()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    endpoint = `ws://127.0.0.1:${port}`;
    server.on('connection', (ws) => sockets.add(ws));
  });

  afterAll(async () => {
    for (const s of sockets) s.terminate();
    await new Promise<void>((res) => server.close(() => res()));
  });

  it('produces a complete H.3 entry with ordered timings', async () => {
    // Real Keyhive substrate — same wiring as Item 1.1 tests.
    const [a, b] = PairNetworkAdapter.createConnectedPair();
    const mk = (adapter: any, label: string) =>
      initializeLegacyAutomergeRepoKeyhive({
        storage: new DummyStorageAdapter(),
        peerIdSuffix: label,
        networkAdapter: adapter,
        syncServer: 'none',
        createRepo: (cfg: any) => new Repo(cfg),
      });
    const [owner, actor] = await Promise.all([mk(a, 'owner12'), mk(b, 'actor12')]);
    const e2eContent = {
      title: 'PC#8 Item 1.2 e2e',
      content: 'end-to-end governed crossing (mock PDS, local relay sim)',
      createdAt: new Date().toISOString(),
    };
    const handle = await (owner.repo as any).create2(e2eContent);
    const card = actor.hive.active.contactCard;
    const individual = await owner.hive.receiveContactCard(card);
    await owner.hive.addMemberToDoc(handle.url, card, Access.read());

    const gate: GateCheckFn = async ({ documentURI }) => {
      const access = await owner.hive.accessForDoc(individual!.id, documentURI as any);
      return access !== undefined && access.isReader
        ? {
            result: 'pass',
            grantReference: `keyhive:${String(individual!.id)}:read`,
            gateCheckedAt: new Date().toISOString(),
          }
        : {
            result: 'blocked',
            grantReference: null,
            gateCheckedAt: new Date().toISOString(),
            reason: 'no authorizing grant',
          };
    };

    // Relay watcher opens BEFORE the fire (ordering discipline).
    const watcher = new JetstreamWatcher({
      endpoint,
      did: TEST_DID,
      timeoutMs: 5_000,
      wsFactory: (url) => new WebSocket(url),
    });
    await watcher.start();

    // Mock PDS publish: resolves after a short real delay, then the relay
    // sim broadcasts the commit event (accept precedes ingest).
    const timings = emptyTimings();
    const put = makeTimedPutRecord({
      publish: async (rec) => {
        await new Promise((r) => setTimeout(r, 25));
        setTimeout(() => {
          const payload = JSON.stringify({
            did: TEST_DID,
            commit: {
              collection: 'com.whtwnd.blog.entry',
              operation: 'create',
              rkey: 'e2erkey1',
            },
          });
          for (const s of sockets)
            if (s.readyState === WebSocket.OPEN) s.send(payload);
        }, 25);
        return { uri: `at://${TEST_DID}/com.whtwnd.blog.entry/e2erkey1`, cid: 'bafye2ecid' };
      },
      record: makeRecord(),
      timings,
    });

    const log: CrossingLogEntry[] = [];
    // Item 3.1: actor-owned assembly document (D-5) hosts the records.
    const asm = await (actor.repo as any).create2({ title: '', content: '', createdAt: null });
    const outcome = await initiateCrossing({
      inputs: [handle],
      handle: asm,
      presentedContent: e2eContent,
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

    const relay = await watcher.observed();
    watcher.close();
    expect(relay.timedOut).toBe(false);

    const hook = createCompletionHook(); // unwired at Item 1.2 — stays null

    const entry = buildH3Entry({
      runNumber: 99,
      scenario: 'baseline',
      crossingLog: log,
      intentEmittedAt: outcome.intent.emittedAt,
      putRecordCalledAt: timings.putRecordCalledAt,
      pdsAcceptedAt: timings.pdsAcceptedAt,
      relayIngestedAt: relay.relayIngestedAt,
      completionWrittenAt: hook.completionWrittenAt,
      crossingOutcome: 'timeout',
      kl1Observation:
        'e2e in-container: intent document-resident before fire; completion pending Item 1.3',
      kl2Observation: 'n/a at Item 1.2',
      // Item 3.1: runNumber ≥ 6 requires the phase3_* fields.
      phase3: { pattern: 'public-subset', gateObservation: 'e2e: single granted input passed isReader', finding: 'none' },
    });

    // Ordering: written < fired <= called <= accepted <= relay-ingested.
    const writtenAt = Date.parse(
      log.find((l) => l.event === 'intent-record-written')!.at,
    );
    expect(writtenAt).toBeLessThanOrEqual(Date.parse(entry.putrecord_called_at!));
    expect(Date.parse(entry.putrecord_called_at!)).toBeLessThanOrEqual(
      Date.parse(entry.pds_accepted_at!),
    );
    expect(Date.parse(entry.pds_accepted_at!)).toBeLessThanOrEqual(
      Date.parse(entry.relay_ingested_at!),
    );
    expect(entry.pds_accept_latency_ms).toBeGreaterThanOrEqual(20);
    expect(entry.relay_ingest_gap_ms).toBeGreaterThanOrEqual(0);
    expect(entry.intent_without_completion_window_ms).toBeNull();
    // CID captured for the Item 1.3 completion record's crossingTargetCID.
    expect(timings.cid).toBe('bafye2ecid');
    // Intent record remains document-resident (deferred-party legibility).
    const doc = await asm.doc();
    expect((doc.crossingRecords ?? []).length).toBe(1);
  });
});
