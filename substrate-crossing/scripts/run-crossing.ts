/**
 * PC#8 Phase 1, Item 1.2 — Operator-run instrumented governed crossing.
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
 * What this run IS NOT yet: a completable crossing. Item 1.3 (completion
 * record) is out of this session's scope, so the CompletionHook stays
 * unmarked, completion_written_at is null, and the honest outcome for a
 * successful fire at this stage is `timeout` once the horizon elapses —
 * the crossing reads `crossing-unconfirmed` per the failure taxonomy. The
 * script waits out the horizon (bounded by --horizon-s) so the emitted
 * outcome is taxonomy-true rather than a placeholder. The three canonical
 * KL-1 baseline runs (AC-1.1–1.4) are therefore expected AFTER Item 1.3
 * lands; a run now still yields real PDS-accept / relay-ingest numbers and
 * a genuine crossing-unconfirmed legibility observation.
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
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request. (Operator-authored, Item 1.2 instrumented run.)';

async function main() {
  if (!HANDLE || !APP_PASSWORD) {
    console.error('[1.2] Missing PDS_HANDLE / PDS_APP_PASSWORD in .env');
    process.exit(1);
  }
  if (!Number.isInteger(RUN_N) || RUN_N < 1) {
    console.error('[1.2] --run must be a positive integer');
    process.exit(1);
  }

  // --- 0. Live session ---
  const agent = new AtpAgent({ service: PDS_SERVICE });
  await agent.login({ identifier: HANDLE, password: APP_PASSWORD });
  const did = agent.session!.did;
  console.log(`[1.2] createSession() OK did=${did}`);

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
  console.log('[1.2] Keyhive doc + read grant established:', handle.url);

  const gate: GateCheckFn = async () => {
    const access = await owner.hive.accessForDoc(individual!.id, handle.url);
    return access !== undefined
      ? {
          result: 'pass',
          grantReference: `keyhive:${String(individual!.id)}:read`,
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
  console.log(`[1.2] relay subscription open: ${JETSTREAM} (client-side DID+collection filter)`);

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
  const hook = createCompletionHook(); // Item 1.3 closes this edge; unmarked here.

  let outcomeStatus: string;
  let intentEmittedAt: string | null = null;
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
      console.log(`[1.2] fired: uri=${outcome.put.uri} cid=${outcome.put.cid}`);
    }
  } catch (e: any) {
    // Publish threw: intent record remains document-resident; no completion.
    outcomeStatus = 'fire-failed';
    fireError = String(e?.message ?? e);
    const doc = await handle.doc();
    intentEmittedAt = (doc.crossingRecords ?? []).at(-1)?.emittedAt ?? null;
    console.error(`[1.2] publish failed (crossing-intent-failed posture): ${fireError}`);
  }

  // --- 5. Relay observation (success path) ---
  let relayIngestedAt: string | null = null;
  if (outcomeStatus === 'fired') {
    const relay = await watcher.observed();
    relayIngestedAt = relay.relayIngestedAt;
    console.log(
      relay.timedOut
        ? `[1.2] relay event NOT observed within ${RELAY_TIMEOUT_MS}ms (H.3 null)`
        : `[1.2] relay ingested: ${relay.observedUri}`,
    );
  }
  watcher.close();

  // --- 6. Honest outcome for the H.3 entry ---
  // fired + no completion machinery (Item 1.3 pending): wait out the horizon
  // so the state is genuinely crossing-unconfirmed, then emit `timeout`.
  // fire-failed / gate-blocked / horizon-expired map per the taxonomy.
  let h3Outcome: 'completed' | 'failed' | 'timeout';
  let kl1: string;
  if (outcomeStatus === 'fired') {
    const remaining = Date.parse(horizon) - Date.now();
    if (remaining > 0) {
      console.log(
        `[1.2] completion machinery pending Item 1.3 — waiting ${Math.ceil(remaining / 1000)}s for horizon elapse so the emitted outcome is taxonomy-true (crossing-unconfirmed)…`,
      );
      await new Promise((r) => setTimeout(r, remaining + 50));
    }
    h3Outcome = 'timeout';
    kl1 =
      'Fired; publish accepted; completion record machinery not yet implemented (Item 1.3 pending). At horizon elapse a deferred party reading the document sees the intent record with no completion: state reads crossing-unconfirmed — distinguishable from not-yet-initiated (no intent record) and from completed (no completion record present).';
  } else if (outcomeStatus === 'fire-failed') {
    h3Outcome = 'failed';
    kl1 = `Publish failed (${fireError}). Intent record remains document-resident with no completion: crossing-intent-failed, legible without external lookup; retry requires a new gate pass (KL-8a).`;
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
    completionWrittenAt: hook.completionWrittenAt, // null until Item 1.3
    crossingOutcome: h3Outcome,
    kl1Observation: kl1,
    kl2Observation:
      'n/a at Item 1.2 (seamCrossingRef is Item 1.4; CID captured for the Item 1.3 completion record)',
  });
  console.log('\n' + renderH3Entry(entry, `Item 1.2 instrumented run (${SCENARIO})`));
  const outPath = writeH3EntryFile(entry, {
    runLabel: `Item 1.2 instrumented run (${SCENARIO})`,
  });
  console.log(`[1.2] H.3 entry written to ${outPath}`);
  console.log('[1.2] Paste the block into the canonical observation log by hand (append-only).');

  // --- 8. Full crossing log to stderr-adjacent file note ---
  console.log('[1.2] crossing log (ordered):');
  for (const l of log) console.log(`       ${l.at}  ${l.event}${l.detail ? `  (${l.detail})` : ''}`);
  if (timings.cid) console.log(`[1.2] captured CID (→ crossingTargetCID at Item 1.3): ${timings.cid}`);

  console.log(`[1.2] ITEM 1.2 INSTRUMENTED RUN: ${outcomeStatus.toUpperCase()}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[1.2] ITEM 1.2 RUN: FAIL', e);
  process.exit(1);
});
