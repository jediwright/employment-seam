/**
 * PC#8 Phase 1, Items 1.2 + 1.3 + 1.4 — Operator-run instrumented governed
 * crossing, completion-capable, back-pointer-carrying.
 *
 * OPERATOR-RUN: requires live network access to bsky.social and Jetstream,
 * which the authoring container does not have (same split as Item 0.2).
 *
 *   cp .env.example .env    # PDS_HANDLE + PDS_APP_PASSWORD (Item 0.2 creds)
 *   npm run run:crossing -- --run 4
 *
 * Flags:
 *   --run N           Run number for the H.3 entry (default 1). Check the
 *                     canonical observation log's tail before choosing N.
 *   --scenario S      baseline | failed (default baseline). `failed` fires
 *                     against an invalid collection to force a reject —
 *                     the AC-1.5 simulated-failure posture (intent present,
 *                     no completion, error logged). NOTE (A7 ~): the reject
 *                     is @atproto/api CLIENT-side NSID validation; the
 *                     request never reaches the PDS.
 *   --horizon-s N     crossingTimeoutHorizon = now + N seconds (default 120).
 *
 * What this run IS: a real governed crossing — Keyhive gate over a real
 * grant, intent record minted and confirmed document-resident, live
 * publish, PDS-accept + relay-ingest timing captured, §H.3 entry emitted
 * to docs/run-N-entry_<date>.md (NOT appended to the canonical log —
 * delivery-not-application holds for machine-emitted entries; paste it in
 * by hand).
 *
 * Item 1.4 (this session): the published com.whtwnd.blog.entry record
 * carries seamCrossingRef — the KL-2 back-pointer, derived at fire time
 * from the minted intent record (sourceDocumentURI, sourceDocumentCID
 * (heads), crossingIntentRef content address, authorizedContentDigest).
 * KL-8b: this is a FRESH governed crossing per run — new gate pass, new
 * intent, new published record. Run 2's record (3mteosxkzms27) is the
 * standing completion-arc evidence target: never deleted, never
 * retrofitted. After a successful publish, the record is fetched back via
 * com.atproto.repo.getRecord and the stored seamCrossingRef is checked
 * intact + digest-matched against the fired intent (build plan Item 1.4
 * acceptance). AppView surface/drop (whtwnd.com) is a manual operator
 * observation recorded in the KL-2 field of the H.3 entry; the deep
 * round-trip (firehose payload, AppView backing store) is Phase 2 Item 2.1.
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
import {
  verifySeamCrossingRefAgainstIntent,
  type SeamCrossingRef,
} from '../src/seam-crossing-ref.js';
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
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request. (Operator-authored, Item 1.4 back-pointer-carrying run.)';

async function main() {
  if (!HANDLE || !APP_PASSWORD) {
    console.error('[1.4] Missing PDS_HANDLE / PDS_APP_PASSWORD in .env');
    process.exit(1);
  }
  if (!Number.isInteger(RUN_N) || RUN_N < 1) {
    console.error('[1.4] --run must be a positive integer');
    process.exit(1);
  }

  // --- 0. Live session ---
  const agent = new AtpAgent({ service: PDS_SERVICE });
  await agent.login({ identifier: HANDLE, password: APP_PASSWORD });
  const did = agent.session!.did;
  console.log(`[1.4] createSession() OK did=${did}`);

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
      'This record carries a seamCrossingRef back-pointer (Item 1.4 /',
      'KL-2) referencing the governed Automerge source document.',
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
  console.log('[1.4] Keyhive doc + read grant established:', handle.url);

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
  console.log(`[1.4] relay subscription open: ${JETSTREAM} (client-side DID+collection filter)`);

  // --- 3. Timed live publish (the injected PutRecordFn seam) ---
  const record: WhtwndEntryRecord = {
    $type: 'com.whtwnd.blog.entry',
    title: content.title,
    content: content.content,
    createdAt: content.createdAt,
    visibility: 'public',
  };
  const timings = emptyTimings();
  // AC-1.5 simulated-failure posture on --scenario failed (A7 ~: the
  // invalid NSID is rejected CLIENT-side by @atproto/api validation).
  const collection =
    SCENARIO === 'failed' ? 'com.whtwnd.invalid.collection!' : 'com.whtwnd.blog.entry';
  let publishedPayload: WhtwndEntryRecord | null = null;
  const put = makeTimedPutRecord({
    publish: async (rec) => {
      publishedPayload = rec;
      const res = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection,
        record: { ...rec },
      });
      return { uri: res.data.uri, cid: res.data.cid };
    },
    record,
    timings,
    attachSeamCrossingRef: true,
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
      console.log(`[1.4] fired: uri=${outcome.put.uri} cid=${outcome.put.cid}`);
      const ref = (publishedPayload as WhtwndEntryRecord | null)?.seamCrossingRef;
      if (ref) {
        console.log(
          `[1.4] seamCrossingRef attached at fire: crossingIntentRef=${ref.crossingIntentRef.slice(0, 32)}… digest=${ref.authorizedContentDigest.slice(0, 16)}… sourceDoc=${ref.sourceDocumentURI}`,
        );
      }
    }
  } catch (e: any) {
    // Publish threw: intent record remains document-resident; no completion.
    outcomeStatus = 'fire-failed';
    fireError = String(e?.message ?? e);
    const doc = await handle.doc();
    intentEmittedAt = (doc.crossingRecords ?? []).at(-1)?.emittedAt ?? null;
    console.error(`[1.4] publish failed (crossing-intent-failed posture): ${fireError}`);
  }

  // --- 5. Relay observation (success path) ---
  let relayIngestedAt: string | null = null;
  if (outcomeStatus === 'fired') {
    const relay = await watcher.observed();
    relayIngestedAt = relay.relayIngestedAt;
    console.log(
      relay.timedOut
        ? `[1.4] relay event NOT observed within ${RELAY_TIMEOUT_MS}ms (H.3 null)`
        : `[1.4] relay ingested: ${relay.observedUri}`,
    );
  }
  watcher.close();

  // --- 6. Item 1.4 — getRecord() intact-check (build plan 1.4 acceptance) ---
  // The record is fetched back from the PDS and the STORED seamCrossingRef
  // is checked present + digest-matched against the fired intent record.
  // A stripped field would be a protocol observation (PDSes are required
  // to store unknown fields per the Lexicon spec) — recorded, not fatal.
  let kl2: string;
  if (outcomeStatus === 'fired' && timings.uri) {
    const rkey = timings.uri.split('/').at(-1)!;
    try {
      const got = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: 'com.whtwnd.blog.entry',
        rkey,
      });
      const stored = (got.data.value as any)?.seamCrossingRef as SeamCrossingRef | undefined;
      if (stored && firedIntent) {
        const verify = verifySeamCrossingRefAgainstIntent(stored, firedIntent);
        console.log(
          verify.valid
            ? '[1.4] getRecord(): seamCrossingRef INTACT in PDS-stored record; digest + intent-ref match the fired intent'
            : `[1.4] getRecord(): seamCrossingRef present but MISMATCHED: ${verify.errors.join('; ')}`,
        );
        kl2 = verify.valid
          ? `seamCrossingRef attached at publish and returned INTACT by getRecord() (crossingIntentRef + authorizedContentDigest + sourceDocumentURI/CID all match the fired intent record). Back-pointer survives PDS storage. AppView surface/drop (whtwnd.com): operator observation pending — record manually. Deep round-trip (firehose payload; AppView store) is Phase 2 Item 2.1.`
          : `seamCrossingRef returned by getRecord() but MISMATCHED against the fired intent: ${verify.errors.join('; ')} — investigate before Phase 2.`;
      } else if (firedIntent) {
        console.log('[1.4] getRecord(): seamCrossingRef ABSENT from PDS-stored record');
        kl2 =
          'seamCrossingRef attached at publish but ABSENT from the getRecord() response — the PDS stripped an unknown field (protocol violation per the Lexicon spec; notable KL-2 finding). Record verbatim.';
      } else {
        kl2 = 'getRecord() returned but no fired intent to verify against (unexpected).';
      }
    } catch (e: any) {
      console.error(`[1.4] getRecord() failed: ${String(e?.message ?? e)}`);
      kl2 = `getRecord() intact-check failed to execute (${String(e?.message ?? e)}); publish-side seamCrossingRef attachment stands; re-run the fetch before closing 1.4's live half.`;
    }
  } else {
    kl2 =
      'No publish accepted this run (failure-path scenario): no back-pointer crossed. seamCrossingRef attachment is fire-time payload content only — nothing published, nothing to check.';
  }

  // --- 7. Item 1.3 — write the crossing-completion record (success path) ---
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
        `[1.4] completion record written: crossingIntentRef=${completion.crossingIntentRef.slice(0, 32)}… targetCID=${completion.crossingTargetCID}`,
      );
      console.log(`[1.4] document-legible state (no external lookup): ${state}`);
      h3Outcome = 'completed';
      kl1 =
        `Fired; publish accepted; crossing-completion record written and confirmed document-resident (crossingIntentRef content-addresses the intent record; crossingTargetCID matches the PDS response). Document-legible state: ${state}. A deferred party reading the document sees intent AND ref-matched completion: crossing-complete — chain closed. The published record carries the Item 1.4 seamCrossingRef: the chain is now traversable from the AT Protocol side back to the governed document.`;
    } catch (e: any) {
      const mintErr = String(e?.message ?? e);
      console.error(`[1.4] completion mint FAILED (worst-case taxonomy state): ${mintErr}`);
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

  // --- 8. Emit the H.3 entry to its OWN file (never the canonical log) ---
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
    kl2Observation: kl2,
  });
  console.log('\n' + renderH3Entry(entry, `Item 1.4 back-pointer-carrying run (${SCENARIO})`));
  const outPath = writeH3EntryFile(entry, {
    runLabel: `Item 1.4 back-pointer-carrying run (${SCENARIO})`,
  });
  console.log(`[1.4] H.3 entry written to ${outPath}`);
  console.log('[1.4] Paste the block into the canonical observation log by hand (append-only).');

  // --- 9. Full crossing log ---
  console.log('[1.4] crossing log (ordered):');
  for (const l of log) console.log(`       ${l.at}  ${l.event}${l.detail ? `  (${l.detail})` : ''}`);
  if (timings.cid) console.log(`[1.4] captured CID (crossingTargetCID): ${timings.cid}`);

  console.log(`[1.4] ITEM 1.4 BACK-POINTER RUN: ${outcomeStatus.toUpperCase()}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[1.4] ITEM 1.4 RUN: FAIL', e);
  process.exit(1);
});
