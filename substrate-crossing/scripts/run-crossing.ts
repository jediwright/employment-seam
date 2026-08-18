/**
 * PC#8 Phase 1, Items 1.2 + 1.3 — Operator-run instrumented governed
 * crossing, completion-capable.
 *
 * OPERATOR-RUN: requires live network access to bsky.social and Jetstream,
 * which the authoring container does not have (same split as Item 0.2).
 *
 *   cp .env.example .env    # PDS_HANDLE + PDS_APP_PASSWORD (Item 0.2 creds)
 *   npm run run:crossing -- --run 1
 *
 * Flags:
 *   --run N           Run number for the H.3 entry (default 1). Check the
 *                     canonical observation log's tail before choosing N.
 *   --scenario S      baseline | failed (default baseline). `failed` fires
 *                     against an invalid collection to force a PDS reject —
 *                     the AC-1.5 simulated-failure posture (intent present,
 *                     no completion, error logged).
 *   --horizon-s N     crossingTimeoutHorizon = now + N seconds (default 120).
 *
 * What this run IS: a real governed crossing — Keyhive gate over a real
 * grant, intent record minted and confirmed document-resident, live
 * publish, PDS-accept + relay-ingest timing captured, §H.3 entry emitted
 * to docs/run-N-entry_<date>.md (NOT appended to the canonical log —
 * delivery-not-application holds for machine-emitted entries; paste it in
 * by hand).
 *
 * Item 1.3 (this session): on a successful fire, the crossing-completion
 * record is written to the Automerge document (crossingIntentRef →
 * content address of the intent record; crossingTargetURI/CID from the
 * PDS response; relayIngestedAt when observed). The CompletionHook is
 * marked at the document write — the window's closing edge — so
 * completion_written_at and intent_without_completion_window_ms populate
 * in the §H.3 entry and the outcome converts to `completed`
 * (taxonomy: crossing-complete). The document-legible state is printed
 * from deriveDocumentCrossingState() — the fail-closed legibility check
 * run against the document alone. A failed publish (--scenario failed)
 * still mints NO completion record: intent-without-completion remains
 * the legible state. The three canonical KL-1 baseline runs (AC-1.1–1.4)
 * are now runnable.
 *
 * NOTE: unlike the Phase 0 probes, the record published here IS a governed
 * crossing artifact — leave it in place until the KL-1/KL-2 evidence
 * artifact is produced (it is the completion/back-pointer target).
 */
import 'dotenv/config';
import { AtpAgent } from '@atproto/api';
import WebSocket from 'ws';
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
import { buildH3Entry, renderH3Entry, writeH3EntryFile } from '../src/observation-log.js';
import {
  writeCrossingCompletion,
  deriveDocumentCrossingState,
  type CompletionDocShape,
} from '../src/crossing-completion.js';
// Real Keyhive substrate — same wiring as item-0-3-baseline / Item 1.1 tests.
import '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import { DummyStorageAdapter } from '@automerge/automerge-repo/helpers/DummyStorageAdapter.js';
import { PairNetworkAdapter } from '../test/helpers/pair-network-adapter.js';
import {
  initializeLegacyAutomergeRepoKeyhive,
  Access,
} from '@automerge/automerge-repo-keyhive';

const PDS_SERVICE = process.env.PDS_SERVICE ?? 'https://bsky.social';
const HANDLE = process.env.PDS_HANDLE;
const APP_PASSWORD = process.env.PDS_APP_PASSWORD;
// Item 1.2 default: jetstream1 (registered reliability finding). Overridable.
const JETSTREAM = process.env.JETSTREAM_ENDPOINT ?? DEFAULT_JETSTREAM;
const RELAY_TIMEOUT_MS = 60_000;

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_N = Number(flag('run', '1'));
const SCENARIO = flag('scenario', 'baseline') as 'baseline' | 'failed';
const HORIZON_S = Number(flag('horizon-s', '120'));

const ACK =
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request. (Operator-authored, Items 1.2+1.3 completion-capable run.)';

async function main() {
  if (!HANDLE || !APP_PASSWORD) {
    console.error('[1.3] Missing PDS_HANDLE / PDS_APP_PASSWORD in .env');
    process.exit(1);
  }
  if (!Number.isInteger(RUN_N) || RUN_N < 1) {
    console.error('[1.3] --run must be a positive integer');
    process.exit(1);
  }

  // --- 0. Live session ---
  const agent = new AtpAgent({ service: PDS_SERVICE });
  await agent.login({ identifier: HANDLE, password: APP_PASSWORD });
  const did = agent.session!.did;
  console.log(`[1.3] createSession() OK did=${did}`);

  // --- 1. Local Keyhive substrate: doc + real grant (Item 0.3 pattern) ---
  const [ownerNet, actorNet] = PairNetworkAdapter.createConnectedPair();
  const mk = (adapter: any, label: string) =>
    initializeLegacyAutomergeRepoKeyhive({
      storage: new DummyStorageAdapter(),
      peerIdSuffix: label,
      networkAdapter: adapter,
      syncServer: 'none',
      createRepo: (cfg: any) => new Repo(cfg),
    });
  const [owner, actor] = await Promise.all([
    mk(ownerNet, 'pc08-run-owner'),
    mk(actorNet, 'pc08-run-actor'),
  ]);
  ownerNet.peerCandidate(actorNet.peerId!);
  actorNet.peerCandidate(ownerNet.peerId!);

  const content = {
    title: `PC#8 governed crossing — Run ${RUN_N}`,
    content: [
      '# Substrate-crossing seam — instrumented governed crossing',
      '',
      `Run ${RUN_N} (${SCENARIO}). Published under a Keyhive-gated`,
      'crossing-intent record per PC#8 v0.1.3 (write-before-fire).',
      'This record is a KL-1/KL-2 evidence target — do not delete until',
      'the closing-evidence artifact is produced.',
    ].join('\n'),
    createdAt: new Date().toISOString(),
  };
  const handle = await (owner.repo as any).create2(content);
  const card = actor.hive.active.contactCard;
  const individual = await owner.hive.receiveContactCard(card);
  // Item 0.3 poll pattern: doc protection registers asynchronously.
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
  if (!granted) throw new Error('doc never became keyhive-protected');
  console.log('[1.3] Keyhive doc + read grant established:', handle.url);

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
          reason: 'no authorizing grant present in causal history',
        };
  };

  // --- 2. Relay watcher open BEFORE the fire ---
  const watcher = new JetstreamWatcher({
    endpoint: JETSTREAM,
    did,
    timeoutMs: RELAY_TIMEOUT_MS,
    wsFactory: (url) => new WebSocket(url) as any,
  });
  await watcher.start();
  console.log(`[1.3] relay subscription open: ${JETSTREAM} (client-side DID+collection filter)`);

  // --- 3. Timed live publish (the injected PutRecordFn seam) ---
  const record: WhtwndEntryRecord = {
    $type: 'com.whtwnd.blog.entry',
    title: content.title,
    content: content.content,
    createdAt: content.createdAt,
    visibility: 'public',
  };
  const timings = emptyTimings();
  // AC-1.5 simulated-failure posture: force a PDS reject on --scenario failed.
  const collection =
    SCENARIO === 'failed' ? 'com.whtwnd.invalid.collection!' : 'com.whtwnd.blog.entry';
  const put = makeTimedPutRecord({
    publish: async (rec) => {
      const res = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection,
        record: { ...rec },
      });
      return { uri: res.data.uri, cid: res.data.cid };
    },
    record,
    timings,
  });

  // --- 4. The governed crossing ---
  const horizon = new Date(Date.now() + HORIZON_S * 1000).toISOString();
  const log: CrossingLogEntry[] = [];
  const hook = createCompletionHook(); // marked by writeCrossingCompletion() — the closing edge

  let outcomeStatus: string;
  let intentEmittedAt: string | null = null;
  let firedIntent: import('../src/crossing-intent.js').CrossingIntentRecord | null = null;
  let fireError: string | null = null;
  try {
    const outcome = await initiateCrossing({
      handle,
      gateCheck: gate,
      putRecord: put,
      identity: { grantorDID: did, targetDID: did, identityCustodyClass: 'provider-custodied' },
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizon,
      log,
    });
    outcomeStatus = outcome.status;
    if (outcome.status === 'fired') {
      intentEmittedAt = outcome.intent.emittedAt;
      firedIntent = outcome.intent;
      console.log(`[1.3] fired: uri=${outcome.put.uri} cid=${outcome.put.cid}`);
    }
  } catch (e: any) {
    // Publish threw: intent record remains document-resident; no completion.
    outcomeStatus = 'fire-failed';
    fireError = String(e?.message ?? e);
    const doc = await handle.doc();
    intentEmittedAt = (doc.crossingRecords ?? []).at(-1)?.emittedAt ?? null;
    console.error(`[1.3] publish failed (crossing-intent-failed posture): ${fireError}`);
  }

  // --- 5. Relay observation (success path) ---
  let relayIngestedAt: string | null = null;
  if (outcomeStatus === 'fired') {
    const relay = await watcher.observed();
    relayIngestedAt = relay.relayIngestedAt;
    console.log(
      relay.timedOut
        ? `[1.3] relay event NOT observed within ${RELAY_TIMEOUT_MS}ms (H.3 null)`
        : `[1.3] relay ingested: ${relay.observedUri}`,
    );
  }
  watcher.close();

  // --- 6. Item 1.3 — write the crossing-completion record (success path) ---
  // On a successful fire the completion record closes the intent: hook is
  // marked at the document write (the window's closing edge), the outcome
  // converts to `completed` (taxonomy: crossing-complete), and the window
  // becomes computable. A failed publish never reaches this block — no
  // completion record is minted; intent-without-completion stays legible.
  let h3Outcome: 'completed' | 'failed' | 'timeout';
  let kl1: string;
  if (outcomeStatus === 'fired') {
    try {
      const completion = await writeCrossingCompletion({
        handle,
        intent: firedIntent!,
        put: { uri: timings.uri, cid: timings.cid },
        pdsAcceptedAt: timings.pdsAcceptedAt,
        relayIngestedAt,
        hook,
        log,
      });
      const doc = (await handle.doc()) as CompletionDocShape;
      const state = deriveDocumentCrossingState(doc);
      console.log(
        `[1.3] completion record written: crossingIntentRef=${completion.crossingIntentRef.slice(0, 32)}… targetCID=${completion.crossingTargetCID}`,
      );
      console.log(`[1.3] document-legible state (no external lookup): ${state}`);
      h3Outcome = 'completed';
      kl1 =
        `Fired; publish accepted; crossing-completion record written and confirmed document-resident (crossingIntentRef content-addresses the intent record; crossingTargetCID matches the PDS response). Document-legible state: ${state}. A deferred party reading the document sees intent AND ref-matched completion: crossing-complete — chain closed.`;
    } catch (e: any) {
      // completion-mint-failed: crossing happened; chain reads unconfirmed.
      const mintErr = String(e?.message ?? e);
      console.error(`[1.3] completion mint FAILED (worst-case taxonomy state): ${mintErr}`);
      const remaining = Date.parse(horizon) - Date.now();
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining + 50));
      h3Outcome = 'timeout';
      kl1 = `Publish accepted but completion record minting failed (${mintErr}): completion-mint-failed — crossing happened; the chain reads crossing-unconfirmed unless a completion is retroactively minted (author-declared; KL-8).`;
    }
  } else if (outcomeStatus === 'fire-failed') {
    h3Outcome = 'failed';
    kl1 = `Publish failed (${fireError}). Intent record remains document-resident with no completion: crossing-intent-failed, legible without external lookup (deriveDocumentCrossingState reads crossing-intent-pending → crossing-unconfirmed at horizon elapse); retry requires a new gate pass (KL-8a).`;
  } else {
    h3Outcome = 'failed';
    kl1 = `Crossing did not fire (${outcomeStatus}). See crossing log for the blocking event.`;
  }

  // --- 7. Emit the H.3 entry to its OWN file (never the canonical log) ---
  const entry = buildH3Entry({
    runNumber: RUN_N,
    scenario: SCENARIO,
    crossingLog: log,
    intentEmittedAt,
    putRecordCalledAt: timings.putRecordCalledAt,
    pdsAcceptedAt: timings.pdsAcceptedAt,
    relayIngestedAt,
    completionWrittenAt: hook.completionWrittenAt, // closing edge (null on failed runs)
    crossingOutcome: h3Outcome,
    kl1Observation: kl1,
    kl2Observation:
      'n/a until Item 1.4 (seamCrossingRef back-pointer); crossingTargetCID carried into the completion record',
  });
  console.log('\n' + renderH3Entry(entry, `Item 1.3 completion-capable run (${SCENARIO})`));
  const outPath = writeH3EntryFile(entry, {
    runLabel: `Item 1.3 completion-capable run (${SCENARIO})`,
  });
  console.log(`[1.3] H.3 entry written to ${outPath}`);
  console.log('[1.3] Paste the block into the canonical observation log by hand (append-only).');

  // --- 8. Full crossing log to stderr-adjacent file note ---
  console.log('[1.3] crossing log (ordered):');
  for (const l of log) console.log(`       ${l.at}  ${l.event}${l.detail ? `  (${l.detail})` : ''}`);
  if (timings.cid) console.log(`[1.3] captured CID (→ crossingTargetCID at Item 1.3): ${timings.cid}`);

  console.log(`[1.3] ITEM 1.3 COMPLETION-CAPABLE RUN: ${outcomeStatus.toUpperCase()}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[1.3] ITEM 1.3 RUN: FAIL', e);
  process.exit(1);
});
