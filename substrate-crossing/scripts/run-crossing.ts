/**
 * PC#8 — Operator-run instrumented governed crossing.
 * Phase 1 Items 1.2 + 1.3 + 1.4 (Runs 1–5); Phase 3 Item 3.1 (Run 6);
 * Phase 3 Item 3.2 (Run 7).
 *
 * OPERATOR-RUN: requires live network access to bsky.social and Jetstream,
 * which the authoring container does not have (same split as Item 0.2).
 *
 *   cp .env.example .env    # PDS_HANDLE + PDS_APP_PASSWORD (Item 0.2 creds)
 *   npm run run:crossing -- --run 6 --scenario public-subset
 *   npm run run:crossing -- --run 7 --scenario delayed-release
 *
 * Flags:
 *   --run N           Run number for the H.3 entry (default 1). Check the
 *                     canonical observation log's tail before choosing N.
 *   --scenario S      baseline | failed | public-subset | delayed-release
 *                     (default baseline).
 *                     `failed` fires against an invalid collection to force a
 *                     reject — the AC-1.5 simulated-failure posture. NOTE
 *                     (A7 ~): the reject is @atproto/api CLIENT-side NSID
 *                     validation; the request never reaches the PDS.
 *                     `public-subset` is Item 3.1 / Run 6 — three legs in one
 *                     invocation (see below). `delayed-release` is Item 3.2 /
 *                     Run 7 — three legs, one granted input (see below).
 *   --horizon-s N     crossingTimeoutHorizon = now + N seconds (default 120).
 *                     For `delayed-release`: = T1 + N (the window stays open
 *                     N seconds after the grant horizon).
 *   --grant-horizon-s N
 *                     `delayed-release` only: crossingGrantHorizon T1 = now +
 *                     N seconds (default 90; floor 60 — spec r2 Item 3.2
 *                     failure mode 2; the runner refuses lower).
 *   --read-wait-ms N  Bounded wait for the actor's repo to obtain each
 *                     granted input (default 15000), inclusive of the
 *                     membership-visible wait (spike D-4). Elapsed →
 *                     phase3_finding and abort; there is no fallback to the
 *                     author's handle (operator ruling S4, 2026-08-29).
 *   --ungranted-probe-ms N
 *                     Bounded actor-side find() on the un-granted section_c
 *                     (default 6000; spike D-5 — it never resolves). The
 *                     negative leg then presents section_c to the gate by ID.
 *
 * ITEM 3.1 (Run 6) — uniform assembly path (brief v0.1.3 §3; D-1 r2, D-4, D-5):
 *   The author and the crossing actor are TWO Keyhive individuals. The
 *   author creates the content documents and grants the actor read on the
 *   ones whose whole content is authorized to cross. The actor reads them
 *   through ITS OWN repo, creates the assembly document it owns (creator
 *   holds admin — confirmed at runtime, S4 spike), grants the author read on
 *   it, and presents the assembled content for crossing. The seam gates each
 *   input on `isReader` (evaluated on the ISSUER's hive — operator ruling 2:
 *   that is where the grant's causal history is authoritative; the actor's
 *   hive may lag), re-assembles independently, checks the presented digest
 *   by hash equality, writes the assembled output to the assembly document,
 *   and mints the intent there with `sourceLineage`. Every scenario,
 *   `baseline` and `failed` included, goes through this path with one input.
 *
 *   `public-subset` legs, run in this order (each logs before the next):
 *     negative    — actor presents [a, b, c]; step-1 access block on c
 *                   (issuer's hive: accessForDoc undefined); no assembly
 *                   write, no intent, no putRecord.
 *     adversarial — actor presents [a, b] with foreign bytes appended to the
 *                   presented content; step-3 digest block on hash
 *                   inequality; nothing written.
 *     positive    — actor presents [a, b]; fires; completion minted in the
 *                   assembly document.
 *   Order rationale: AC-3.1.3 requires the block event's timestamp to
 *   precede any intent-record timestamp IN THE RUN; running the blocking
 *   legs first makes that hold across the whole invocation, not only within
 *   a leg. (Ruling R-A, brief v0.1.3 §8, operator-confirmed 2026-08-29.)
 *
 * ITEM 3.2 (Run 7) — delayed-release (brief v0.1 §4; D-2, D-7, F-3.2-1):
 *   One granted input (`timed-release`), uniform path. T1 = now + G is the
 *   crossingGrantHorizon (not-before), hosted on the INTENT RECORD beside
 *   crossingTimeoutHorizon (D-2; Keyhive Access has no fields). The seam's
 *   horizon step (3h) reads the system clock fresh on every attempt and
 *   blocks before any assembly write. Three legs, in this order:
 *     before-horizon — attempt at T0 < T1 → horizon-not-reached; assembly
 *                      document untouched; no intent; no putRecord (AC-3.2.1).
 *     (wait)         — sleep until wall clock ≥ T1 + 1 s; both clock reads
 *                      logged (spec r2 FM2: wall clock confirmed).
 *     after-horizon  — same request → fires; intent carries BOTH horizons;
 *                      completion minted (AC-3.2.2, AC-3.2.3).
 *     replay         — immediately after the pass, a FRESH T1' = now + G on
 *                      the same input → horizon-not-reached: the pass was
 *                      not cached (spec r2 adversarial step). This leg's
 *                      block timestamp follows the positive intent BY
 *                      DESIGN; AC-3.2.1's ordering clause is read against
 *                      the before-horizon leg (operator ruling, 2026-08-30).
 *   KL-12: observation only. Run 7 shows a lower-bound gate on the seam's
 *   record; it does NOT exercise grant-authority lapse (the read grant
 *   persists across all legs — the seam, not the grant, refuses).
 *
 * TRANSPORT (D-6 r1; Item 3.1b spike, SL-0186): Run 6 runs on the ENCRYPTED
 *   transport — `initializeAutomergeRepoKeyhive` (subduction), two hives
 *   paired in-process over the PairNetworkAdapter supplied as
 *   `repo.subductionAdapters`, `syncServer: 'none'`, no sync server. On this
 *   transport a Keyhive read grant is enforced on sync: granted documents
 *   decrypt on the actor's repo; an un-granted document's ciphertext
 *   transits but never decrypts (find() pends to timeout, no error). The
 *   legacy transport used by Runs 1–5 does NOT enforce read grants on sync
 *   (F-P3-1, SL-0185) and is not used here.
 *   Fixture consequences (spike record r1 §2):
 *     D-4  a granted document is find()-able on the actor side only once the
 *          actor's hive has learned its membership (~2 s); the runner waits
 *          for actor.hive.accessForDoc(self, url) to be defined first.
 *     D-5  the un-granted document never resolves; the probe is bounded and
 *          the negative leg presents section_c to the gate by ID.
 *     D-6  addMemberToDoc triggers the GRANTER's membership nudge write
 *          (`__automerge-repo-keyhive__last-added-member-ts`) into the granted
 *          document. Content documents a/b and every assembly document
 *          (author granted read) carry it; c does not. The nudge is the
 *          author-hive's write, not the actor's, and is outside the digested
 *          content object; the nudge commit is visible in sourceLineage
 *          documentCIDs and in sourceDocumentCID — recorded as an
 *          observation, not a defect.
 *
 * NOTE: records published here ARE governed crossing artifacts — evidence
 * targets, never deleted, never retrofitted.
 */
import 'dotenv/config';
import type { webcrypto } from 'node:crypto';
import { AtpAgent } from '@atproto/api';
import WebSocket from 'ws';
import {
  initiateCrossing,
  type CrossingLogEntry,
  type CrossingInputHandle,
  type CrossingIntentRecord,
  type GateCheckFn,
} from '../src/crossing-intent.js';
import { assembleCrossingContent, type AssembledContent } from '../src/assembly.js';
import type { CrossingSourceContent } from '../src/digest.js';
import {
  makeTimedPutRecord,
  emptyTimings,
  JetstreamWatcher,
  createCompletionHook,
  DEFAULT_JETSTREAM,
  type WhtwndEntryRecord,
} from '../src/crossing-fire.js';
import {
  buildH3Entry,
  renderH3Entry,
  writeH3EntryFile,
  type H3Scenario,
  type H3Phase3Fields,
} from '../src/observation-log.js';
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
import { next as Automerge } from '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import { DummyStorageAdapter } from '@automerge/automerge-repo/helpers/DummyStorageAdapter.js';
import { PairNetworkAdapter } from '../test/helpers/pair-network-adapter.js';
import {
  initializeAutomergeRepoKeyhive,
  Access,
} from '@automerge/automerge-repo-keyhive';

const PDS_SERVICE = process.env.PDS_SERVICE ?? 'https://bsky.social';
const HANDLE = process.env.PDS_HANDLE;
const APP_PASSWORD = process.env.PDS_APP_PASSWORD;
// Item 1.2 default: jetstream1 (registered reliability finding). Overridable.
const JETSTREAM = process.env.JETSTREAM_ENDPOINT ?? DEFAULT_JETSTREAM;
const RELAY_TIMEOUT_MS = 60_000;
const TAG = '[3.1]';

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

type Scenario = 'baseline' | 'failed' | 'public-subset' | 'delayed-release' | 'aggregated';
const RUN_N = Number(flag('run', '1'));
const SCENARIO = flag('scenario', 'baseline') as Scenario;
const HORIZON_S = Number(flag('horizon-s', '120'));
const GRANT_HORIZON_S = Number(flag('grant-horizon-s', '90'));
const GRANT_HORIZON_FLOOR_S = 60;
const READ_WAIT_MS = Number(flag('read-wait-ms', '15000'));
const UNGRANTED_PROBE_MS = Number(flag('ungranted-probe-ms', '6000'));

const ACK =
  'I acknowledge that this crossing terminates seam-stack enforcement at the AT Protocol boundary; recall is a propagated request. (Operator-authored; Item 3.1 uniform-assembly-path run.)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Item 3.2: wall-clock wait until `iso` (+ `slackMs`); returns both clock reads. */
async function sleepUntil(iso: string, slackMs: number): Promise<{ before: string; after: string }> {
  const before = new Date().toISOString();
  const until = Date.parse(iso) + slackMs;
  while (Date.now() < until) await sleep(Math.min(1_000, Math.max(50, until - Date.now())));
  return { before, after: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Keyhive fixture helpers
// ---------------------------------------------------------------------------

type Hive = Awaited<ReturnType<typeof initializeAutomergeRepoKeyhive>>;

type KeyPair = webcrypto.CryptoKeyPair;

const PAIR_CONNECT_MS = 10_000;
const SUBDUCTION_SERVICE = 'pc08-run6';

/** Spike D-2: each hive is an extractable Ed25519 key pair minted by the
 *  fixture so that both wire peer ids are known before either hive exists. */
async function ed25519Pair(): Promise<KeyPair> {
  return (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as unknown as KeyPair;
}

/** Keyhive peer id in wire form: base64 of the raw 32-byte public key, no
 *  suffix (codec.ts#peerIdToSubduction strips any suffix). */
async function wirePeerId(kp: KeyPair): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return Buffer.from(raw).toString('base64');
}

/** Spike D-1 / D-3: two subduction hives paired in-process over the
 *  PairNetworkAdapter via `repo.subductionAdapters` (roles accept/connect),
 *  no sync server. Returns only after both sides report the subduction
 *  connection. The actor's repo storage is returned so the un-granted probe
 *  can scan it for plaintext. */
async function makeHivePair(): Promise<{ author: Hive; actor: Hive; actorRepoStorage: DummyStorageAdapter }> {
  const [authorNet, actorNet] = PairNetworkAdapter.createConnectedPair();
  const [kpAuthor, kpActor] = await Promise.all([ed25519Pair(), ed25519Pair()]);
  const [pidAuthor, pidActor] = await Promise.all([wirePeerId(kpAuthor), wirePeerId(kpActor)]);
  const actorRepoStorage = new DummyStorageAdapter();
  const mk = (kp: KeyPair, remote: string, adapter: PairNetworkAdapter, label: string, role: 'accept' | 'connect', repoStorage: DummyStorageAdapter) =>
    initializeAutomergeRepoKeyhive({
      storage: new DummyStorageAdapter(),
      peerIdSuffix: label,
      keyPair: kp as any,
      syncServer: 'none',
      remotePeerId: remote as any,
      shareConfigDebounceMs: 0,
      createRepo: (cfg: any) => new Repo(cfg),
      repo: {
        storage: repoStorage,
        subductionAdapters: [{ adapter, serviceName: SUBDUCTION_SERVICE, role }],
      },
    });
  const [author, actor] = await Promise.all([
    mk(kpAuthor, pidActor, authorNet, 'pc08-run-author', 'accept', new DummyStorageAdapter()),
    mk(kpActor, pidAuthor, actorNet, 'pc08-run-actor', 'connect', actorRepoStorage),
  ]);
  authorNet.peerCandidate(actorNet.peerId!);
  actorNet.peerCandidate(authorNet.peerId!);
  const deadline = Date.now() + PAIR_CONNECT_MS;
  while (Date.now() < deadline) {
    if ((author.repo as any).isSubductionConnected() && (actor.repo as any).isSubductionConnected()) break;
    await sleep(100);
  }
  if (!(author.repo as any).isSubductionConnected() || !(actor.repo as any).isSubductionConnected()) {
    throw new Error(`subduction pairing did not connect within ${PAIR_CONNECT_MS}ms`);
  }
  console.log(`${TAG} transport: initializeAutomergeRepoKeyhive + subduction, in-process pair, syncServer=none; both sides connected`);
  return { author, actor, actorRepoStorage };
}

const NUDGE_FIELD = '__automerge-repo-keyhive__last-added-member-ts';

/** Spike D-6 observation input: whether a document carries the granter's
 *  membership nudge field. Read on whichever handle is given. */
async function hasNudge(h: any): Promise<boolean> {
  const d = await h.doc();
  return !!d && Object.prototype.hasOwnProperty.call(d, NUDGE_FIELD);
}


/** Item 0.3 poll pattern: doc protection registers asynchronously. */
async function grantWithPoll(hive: Hive, url: string, card: any, access: Access) {
  for (let i = 0; i < 20; i++) {
    try {
      await hive.hive.addMemberToDoc(url as any, card, access);
      return;
    } catch (e: any) {
      if (e?.name === 'UnprotectedDocError' || /unprotected/i.test(String(e))) {
        await sleep(250);
      } else throw e;
    }
  }
  throw new Error(`doc never became keyhive-protected: ${url}`);
}

function hex(id: any): string {
  return Buffer.from(id.toBytes()).toString('hex');
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms)),
  ]);
}

function resync(actor: Hive, url: string) {
  try { (actor.repo as any).resyncSubduction(url.replace(/^automerge:/, '') as any); } catch { /* best effort */ }
}

/** Spike D-4: on the encrypted transport, find() on a granted document
 *  before the actor's hive has learned its membership returns `unavailable`
 *  in ~25 ms. Wait until actor.hive.accessForDoc(self, url) is defined.
 *  Returns the elapsed ms (membership-lag observation) or throws. */
async function waitMembershipVisible(actor: Hive, url: string, waitMs: number): Promise<number> {
  const self = actor.hive.active.individual.id;
  const t0 = Date.now();
  const deadline = t0 + waitMs;
  while (Date.now() < deadline) {
    const seen = await actor.hive.accessForDoc(self, url as any);
    if (seen !== undefined && seen !== null) return Date.now() - t0;
    await sleep(200);
  }
  throw new Error(`actor hive did not see its membership on ${url} within ${waitMs}ms`);
}

/** Bounded wait for the actor's repo to obtain a GRANTED document. Waits
 *  for membership visibility first (D-4), then find() in resync rounds.
 *  Resolves the handle only once its content object is readable; throws on
 *  elapse. No fallback to the author's handle (operator ruling 1). */
async function loadOnActor(actor: Hive, url: string, waitMs: number): Promise<{ handle: any; membershipLagMs: number }> {
  const deadline = Date.now() + waitMs;
  const membershipLagMs = await waitMembershipVisible(actor, url, waitMs);
  let last = '';
  while (Date.now() < deadline) {
    const roundMs = Math.max(500, Math.min(3_000, deadline - Date.now()));
    try {
      const h: any = await withTimeout((actor.repo as any).find(url), roundMs, `find:${url}`);
      const d: any = await withTimeout(h.doc(), roundMs, `doc:${url}`);
      if (d && typeof d.title === 'string' && typeof d.content === 'string') return { handle: h, membershipLagMs };
      last = 'content object not readable';
    } catch (e: any) {
      last = String(e?.message ?? e);
      resync(actor, url);
    }
    await sleep(300);
  }
  throw new Error(`actor repo did not obtain readable ${url} within ${waitMs}ms (last: ${last})`);
}

/** Spike D-5: an actor-side find() on an UN-GRANTED document never resolves
 *  on the encrypted transport — ciphertext transits, plaintext never
 *  materialises. Bounded probe in resync rounds, then a scan of the actor's
 *  repo storage for the document's plaintext with a granted document as the
 *  positive control. Records; does not throw. */
async function probeUngranted(
  actor: Hive, actorRepoStorage: DummyStorageAdapter, url: string, plaintextMarkers: RegExp, controlMarkers: RegExp, waitMs: number,
): Promise<{ obtained: boolean; decrypted: boolean; behaviour: string; storage: string }> {
  const deadline = Date.now() + waitMs;
  let obtained = false;
  let decrypted = false;
  let last = '';
  let rounds = 0;
  while (Date.now() < deadline) {
    rounds++;
    const roundMs = Math.max(500, Math.min(3_000, deadline - Date.now()));
    try {
      const h: any = await withTimeout((actor.repo as any).find(url), roundMs, `find:section_c`);
      obtained = true;
      const d: any = await withTimeout(h.doc(), roundMs, `doc:section_c`);
      decrypted = !!d && typeof d.title === 'string';
      last = `find resolved; doc() ${decrypted ? 'RETURNED PLAINTEXT' : 'returned no content object'}`;
      break;
    } catch (e: any) {
      last = String(e?.message ?? e);
      resync(actor, url);
    }
    await sleep(300);
  }
  const chunks = await actorRepoStorage.loadRange([]);
  const dec = new TextDecoder('utf8', { fatal: false });
  const docKey = url.replace(/^automerge:/, '');
  let bytesUnderC = 0; let plainHits = 0; let controlHits = 0;
  let plainHitsDecoded = 0; let controlHitsDecoded = 0; let loadable = 0;
  for (const ch of chunks) {
    if (!ch.data) continue;
    const txt = dec.decode(ch.data);
    if (plaintextMarkers.test(txt)) plainHits++;
    if (controlMarkers.test(txt)) controlHits++;
    try {
      const decoded = JSON.stringify(Automerge.load(ch.data));
      loadable++;
      if (plaintextMarkers.test(decoded)) plainHitsDecoded++;
      if (controlMarkers.test(decoded)) controlHitsDecoded++;
    } catch {
      /* not a loadable document chunk (incremental fragment, metadata, or ciphertext) */
    }
    if (ch.key.join('/').includes(docKey)) bytesUnderC += ch.data.byteLength;
  }
  return {
    obtained,
    decrypted: decrypted || plainHits > 0 || plainHitsDecoded > 0,
    behaviour: `${rounds} round(s) over ${waitMs}ms: ${last}`,
    storage: `actor repo storage: chunks=${chunks.length} (loadable=${loadable}), bytes under section_c=${bytesUnderC}, section_c plaintext hits raw/decoded=${plainHits}/${plainHitsDecoded}, control (section_a) plaintext hits raw/decoded=${controlHits}/${controlHitsDecoded} (raw scan cannot see deflated snapshot columns ≥256 B; decoded scan is the control of record)`,
  };
}

function inputHandle(h: any): CrossingInputHandle {
  return {
    url: h.url,
    doc: () => h.doc(),
    heads: () => {
      try { return h.heads?.(); } catch { return undefined; }
    },
  };
}

/** An input the actor could not load. The seam's step-1 gate is evaluated
 *  on the URL before any doc() call, so the block site is accessForDoc(),
 *  not handle load (brief §4 negative leg). */
function unloadableInput(url: string, why: string): CrossingInputHandle {
  return {
    url,
    doc: () => {
      throw new Error(`doc() called on an input that should have been gated first: ${why}`);
    },
    heads: () => undefined,
  };
}

/** Per-document gate on the ISSUER's hive (operator ruling 2): pass iff
 *  the actor's individual holds `isReader` on that document (D-4).
 *  `grantReference` names the level actually held. */
function makeGate(author: Hive, actorIndividualId: any): GateCheckFn {
  const actorHex = hex(actorIndividualId);
  return async ({ documentURI }) => {
    const access = await author.hive.accessForDoc(actorIndividualId, documentURI as any);
    const at = new Date().toISOString();
    if (access !== undefined && access !== null && access.isReader) {
      const level = access.toString();
      return {
        result: 'pass',
        grantReference: `keyhive:${actorHex}:${level.toLowerCase()}`,
        gateCheckedAt: at,
        access: level,
        documentURI,
      };
    }
    return {
      result: 'blocked',
      grantReference: null,
      gateCheckedAt: at,
      documentURI,
      access: access ? access.toString() : undefined,
      reason: access
        ? `access level ${access.toString()} is below read (relay-level grant does not pass; D-4)`
        : 'no authorizing grant present in causal history',
    };
  };
}

/** Creates the actor-owned assembly document and grants the author read on
 *  it (D-5). Returns the handle and the membership read used as the
 *  creator-admin confirmation input (operator ruling; S4 spike ✓). */
async function makeAssemblyDoc(actor: Hive, author: Hive, label: string) {
  const h = await (actor.repo as any).create2({ title: '', content: '', createdAt: null });
  await grantWithPoll(actor, h.url, author.hive.active.contactCard, Access.read());
  const selfAccess = await actor.hive.accessForDoc(actor.hive.active.individual.id, h.url);
  const members = await actor.hive.listMembers(h.url);
  const membership = members
    .map((m: any) => `${m.id.slice(0, 12)}…:${m.access.toString()}${m.isSelf ? ' (self)' : ''}`)
    .join(', ');
  console.log(
    `${TAG} assembly document (${label}) ${h.url}: creator accessForDoc=${selfAccess ? selfAccess.toString() : 'undefined'}; members: ${membership}`,
  );
  return { handle: h, creatorAccess: selfAccess ? selfAccess.toString() : 'undefined', membership };
}

/** "Untouched" is a test of the CONTENT OBJECT and the record arrays, not
 *  of field absence. The author's read grant on the assembly document
 *  (makeAssemblyDoc, before any leg) triggers the granter's membership
 *  nudge write (`__automerge-repo-keyhive__last-added-member-ts`, spike
 *  D-6) into the assembly document; that field is transport residue, not a
 *  seam write, and must not be read as an orphan write. (Operator, S6 Unit B.) */
function assemblyDocIsUntouched(doc: CompletionDocShape): boolean {
  return (
    doc.title === '' && doc.content === '' &&
    (doc.crossingRecords ?? []).length === 0 &&
    (doc.completionRecords ?? []).length === 0
  );
}

function fmtLog(log: CrossingLogEntry[]): string[] {
  return log.map((l) => `       ${l.at}  ${l.event}${l.detail ? `  (${l.detail})` : ''}`);
}

/** phase3_* fields: required from Run 6 (buildH3Entry enforces); for earlier
 *  run numbers on baseline/failed they are omitted → n/a. */
function phase3Fields(scenario: Scenario, gateObs: string[], findings: string[]): H3Phase3Fields | undefined {
  if (RUN_N < 6 && scenario !== 'public-subset' && scenario !== 'delayed-release' && scenario !== 'aggregated') return undefined;
  return {
    pattern: scenario === 'delayed-release' ? 'delayed-release' : scenario === 'aggregated' ? 'aggregated' : 'public-subset',
    gateObservation: gateObs.join(' | '),
    finding: findings.join(' | '),
  };
}

async function emitEntry(p: {
  outcome: 'completed' | 'failed' | 'timeout'; scenario: Scenario; log: CrossingLogEntry[];
  intentEmittedAt: string | null; timings: ReturnType<typeof emptyTimings>;
  relayIngestedAt: string | null; completionWrittenAt: string | null;
  kl1: string; kl2: string; phase3: H3Phase3Fields | undefined;
}) {
  const entry = buildH3Entry({
    runNumber: RUN_N,
    scenario: p.scenario as H3Scenario,
    crossingLog: p.log,
    intentEmittedAt: p.intentEmittedAt,
    putRecordCalledAt: p.timings.putRecordCalledAt,
    pdsAcceptedAt: p.timings.pdsAcceptedAt,
    relayIngestedAt: p.relayIngestedAt,
    completionWrittenAt: p.completionWrittenAt,
    crossingOutcome: p.outcome,
    kl1Observation: p.kl1,
    kl2Observation: p.kl2,
    phase3: p.phase3,
  });
  const label = p.scenario === 'public-subset'
    ? 'Item 3.1 public-subset crossing (negative → adversarial → positive)'
    : p.scenario === 'delayed-release'
      ? 'Item 3.2 delayed-release crossing (before-horizon → after-horizon → replay)'
      : p.scenario === 'aggregated'
        ? 'Item 3.3 aggregated crossing (determinism → negative → TOCTOU → positive)'
        : `Item 3.1 uniform-assembly-path run (${p.scenario})`;
  console.log('\n' + renderH3Entry(entry, label));
  const outPath = writeH3EntryFile(entry, { runLabel: label });
  console.log(`${TAG} H.3 entry written to ${outPath}`);
  console.log(`${TAG} Paste the block into docs/observation-log-pc08.md by hand (append-only).`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  if (!HANDLE || !APP_PASSWORD) {
    console.error(`${TAG} Missing PDS_HANDLE / PDS_APP_PASSWORD in .env`);
    process.exit(1);
  }
  if (!Number.isInteger(RUN_N) || RUN_N < 1) {
    console.error(`${TAG} --run must be a positive integer`);
    process.exit(1);
  }
  if (!['baseline', 'failed', 'public-subset', 'delayed-release', 'aggregated'].includes(SCENARIO)) {
    console.error(`${TAG} --scenario must be baseline | failed | public-subset | delayed-release | aggregated`);
    process.exit(1);
  }
  if (SCENARIO === 'delayed-release' && (!Number.isFinite(GRANT_HORIZON_S) || GRANT_HORIZON_S < GRANT_HORIZON_FLOOR_S)) {
    console.error(`${TAG} --grant-horizon-s must be ≥ ${GRANT_HORIZON_FLOOR_S} for delayed-release (spec r2 Item 3.2 FM2); got ${GRANT_HORIZON_S}`);
    process.exit(1);
  }

  // --- 0. Live session ---
  const agent = new AtpAgent({ service: PDS_SERVICE });
  await agent.login({ identifier: HANDLE, password: APP_PASSWORD });
  const did = agent.session!.did;
  console.log(`${TAG} createSession() OK did=${did}`);

  // --- 1. Two Keyhive individuals: author and crossing actor ---
  const { author, actor, actorRepoStorage } = await makeHivePair();
  const actorCard = actor.hive.active.contactCard;
  const actorIndividual = await author.hive.receiveContactCard(actorCard);
  if (!actorIndividual) throw new Error('author could not resolve the actor individual from its contact card');
  const actorId = actorIndividual.id;
  console.log(`${TAG} author individual ${hex(author.hive.active.individual.id).slice(0, 12)}…; actor individual ${hex(actorId).slice(0, 12)}…`);
  const gate = makeGate(author, actorId);

  // Content documents: the author creates them; grants are per document.
  const stamp = new Date().toISOString();
  const mkSection = (name: string, authorized: boolean) => ({
    title: `PC#8 governed crossing — Run ${RUN_N} — ${name}`,
    content: [
      `# ${name}`,
      '',
      `Run ${RUN_N} (${SCENARIO}). ${authorized ? 'Authorized to cross.' : 'NOT authorized to cross; no grant to the crossing actor.'}`,
      'Published under a Keyhive-gated crossing-intent record per PC#8 v0.1.3',
      '(write-before-fire), assembled by the crossing actor from granted',
      'input documents (Item 3.1, D-1 r2 / D-5). Evidence target — do not delete.',
    ].join('\n'),
    createdAt: stamp,
  });

  const findings: string[] = [];
  const gateObservations: string[] = [];
  const allLogs: { leg: string; log: CrossingLogEntry[] }[] = [];

  let sectionA: any, sectionB: any = null, sectionC: any = null;
  if (SCENARIO === 'public-subset') {
    sectionA = await (author.repo as any).create2(mkSection('section_a', true));
    sectionB = await (author.repo as any).create2(mkSection('section_b', true));
    sectionC = await (author.repo as any).create2(mkSection('section_c', false));
    await grantWithPoll(author, sectionA.url, actorCard, Access.read());
    await grantWithPoll(author, sectionB.url, actorCard, Access.read());
    // section_c: NO grant.
    for (const [n, h] of [['section_a', sectionA], ['section_b', sectionB], ['section_c', sectionC]] as const) {
      const a = await author.hive.accessForDoc(actorId, h.url);
      console.log(`${TAG} issuer accessForDoc(actor, ${n}) = ${a ? a.toString() : 'undefined'}  ${h.url}`);
    }
  } else if (SCENARIO === 'aggregated') {
    // Item 3.3 fixture: doc_a (employment subset) + doc_b (project subset),
    // independent grants, no un-granted control document (spec r2 §Item 3.3
    // design; the capability half was evidenced at Runs 6/spike).
    sectionA = await (author.repo as any).create2(mkSection('doc_a', true));
    sectionB = await (author.repo as any).create2(mkSection('doc_b', true));
    await grantWithPoll(author, sectionA.url, actorCard, Access.read());
    await grantWithPoll(author, sectionB.url, actorCard, Access.read());
    for (const [n, h] of [['doc_a', sectionA], ['doc_b', sectionB]] as const) {
      const a = await author.hive.accessForDoc(actorId, h.url);
      console.log(`${TAG} issuer accessForDoc(actor, ${n}) = ${a ? a.toString() : 'undefined'}  ${h.url}`);
    }
  } else {
    const name = SCENARIO === 'delayed-release' ? 'timed-release' : 'single-source';
    sectionA = await (author.repo as any).create2(mkSection(name, true));
    await grantWithPoll(author, sectionA.url, actorCard, Access.read());
    console.log(`${TAG} single input granted read (${name}): ${sectionA.url}`);
  }

  // --- 2. Actor-side reads of the granted inputs (bounded; no fallback) ---
  let actorA: any, actorB: any = null;
  try {
    const rA = await loadOnActor(actor, sectionA.url, READ_WAIT_MS);
    actorA = rA.handle;
    let lag = `section_a ${rA.membershipLagMs}ms`;
    if (sectionB) {
      const rB = await loadOnActor(actor, sectionB.url, READ_WAIT_MS);
      actorB = rB.handle;
      lag += `, section_b ${rB.membershipLagMs}ms`;
    }
    findings.push(`Membership lag (spike D-4; fixture timing, not a gate): actor's hive saw its read grant after ${lag}; actor-side find() succeeded after the wait.`);
    console.log(`${TAG} membership lag: ${lag}`);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error(`${TAG} ABORT — actor could not obtain a granted input: ${msg}`);
    findings.push(`Actor-side read of a GRANTED input failed (${msg}); run aborted without fallback to the author's handle (operator ruling 1). S2 B-1 territory.`);
    await emitEntry({
      outcome: 'failed', scenario: SCENARIO, log: [], intentEmittedAt: null, timings: emptyTimings(),
      relayIngestedAt: null, completionWrittenAt: null,
      kl1: 'Run aborted before any crossing attempt: actor could not obtain a granted input document.',
      kl2: 'n/a — nothing crossed.',
      phase3: phase3Fields(SCENARIO, gateObservations, findings),
    });
    process.exit(1);
  }
  console.log(`${TAG} actor obtained granted input(s) through its own repo`);

  // Un-granted probe (spike D-5; AC-3.1.2 capability half): section_c must
  // not be decryptable by the actor on this transport. Ciphertext may
  // transit; plaintext must not materialise. Recorded verbatim either way.
  let cProbeBehaviour = 'n/a';
  if (sectionC) {
    const p = await probeUngranted(
      actor, actorRepoStorage, sectionC.url,
      /section_c|NOT authorized to cross/,
      /section_a/,
      UNGRANTED_PROBE_MS,
    );
    cProbeBehaviour = p.behaviour;
    const probe = p.decrypted
      ? `section_c (no grant) DECRYPTED on the actor's repo (${p.behaviour}; ${p.storage}) — contradicts SL-0186 on this transport; AC-3.1.2 capability half NOT met; investigate before closing Item 3.1.`
      : `section_c (no grant) not decryptable by the actor: ${p.obtained ? 'handle obtained but no content object' : 'handle pending at timeout'} (${p.behaviour}); ${p.storage}. Ciphertext transits; plaintext does not (spike Q2, SL-0186). Evidence file: substrate-crossing/test/spike/spike-3-1b-encrypted-transport.test.ts.`;
    console.log(`${TAG} un-granted probe: ${probe}`);
    findings.push(probe);
    if (p.decrypted) console.error(`${TAG} AC-3.1.2 capability half NOT met — see finding`);
  }

  // Spike D-6 observation: the granter's membership nudge write on granted documents.
  if (sectionC) {
    const nA = await hasNudge(sectionA); const nB = await hasNudge(sectionB); const nC = await hasNudge(sectionC);
    const obs = `Membership nudge (spike D-6, author-hive write, not a seam write): ${NUDGE_FIELD} present on section_a=${nA}, section_b=${nB}, section_c=${nC} (expected true/true/false). Content object {title, content, createdAt} unaffected; nudge commit is included in the lineage documentCIDs read post-grant — observation, not defect.`;
    console.log(`${TAG} ${obs}`);
    findings.push(obs);
  }

  // --- 3. Relay watcher: constructed here, OPENED immediately before the
  // first fireable leg (section 5) — F-3.2-5 fix. The prior placement
  // opened the subscription before the scenario legs, so on delayed-release
  // the watcher idled across the embargo wait (~92 s at Run 7) and
  // relay_ingested_at read null. Uniform rule for all scenarios: open
  // immediately before the leg that can fire; blocked legs never fire and
  // need no subscription. Scoped verification (Q1 ruling): the reorder is
  // verified by inspection for delayed-release — any future delayed-release
  // run validates it incidentally (the named lift event).
  const grantedInputs: CrossingInputHandle[] = sectionB
    ? [inputHandle(actorA), inputHandle(actorB)]
    : [inputHandle(actorA)];
  const grantedContents: CrossingSourceContent[] = [];
  for (const h of grantedInputs) {
    const d = await h.doc();
    grantedContents.push({ title: d.title, content: d.content, createdAt: d.createdAt });
  }
  // The actor's own assembly — what it PRESENTS. The seam re-assembles
  // independently and compares by hash (operator ruling 4).
  const assembled: AssembledContent = assembleCrossingContent(grantedContents);
  if (assembled.createdAt === null) {
    throw new Error('fixture inputs carry createdAt; a null assembled createdAt is unexpected here');
  }
  const presented = { title: assembled.title, content: assembled.content, createdAt: assembled.createdAt };

  const identity = { grantorDID: did, targetDID: did, identityCustodyClass: 'provider-custodied' as const };
  const horizonFor = () => new Date(Date.now() + HORIZON_S * 1000).toISOString();
  const neverFire = async () => {
    throw new Error('putRecord must not be called on a blocked leg');
  };

  // Item 3.2: T1 (crossingGrantHorizon) and the timeout horizon (T1 + HORIZON_S)
  // are fixed once here, at fixture time, and printed. Undefined otherwise.
  let grantHorizon: string | undefined;
  let delayedTimeoutHorizon: string | undefined;
  if (SCENARIO === 'delayed-release') {
    const t1 = Date.now() + GRANT_HORIZON_S * 1000;
    grantHorizon = new Date(t1).toISOString();
    delayedTimeoutHorizon = new Date(t1 + HORIZON_S * 1000).toISOString();
    console.log(`${TAG} Item 3.2 horizons: crossingGrantHorizon T1=${grantHorizon} (now + ${GRANT_HORIZON_S}s); crossingTimeoutHorizon=${delayedTimeoutHorizon} (T1 + ${HORIZON_S}s); now=${new Date().toISOString()}`);
  }

  // --- 4d. delayed-release: BEFORE-HORIZON leg (negative; AC-3.2.1) then the wait ---
  if (SCENARIO === 'delayed-release') {
    const asmPre = await makeAssemblyDoc(actor, author, 'before-horizon leg');
    findings.push(`Assembly document creator access (before-horizon leg): accessForDoc(self)=${asmPre.creatorAccess}; members: ${asmPre.membership}.`);
    const log: CrossingLogEntry[] = [];
    const attemptAt = new Date().toISOString();
    const outcome = await initiateCrossing({
      inputs: grantedInputs,
      handle: asmPre.handle,
      presentedContent: presented,
      gateCheck: gate,
      putRecord: neverFire,
      identity,
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: delayedTimeoutHorizon!,
      crossingGrantHorizon: grantHorizon!,
      log,
    });
    allLogs.push({ leg: 'before-horizon', log });
    const asmDoc = (await asmPre.handle.doc()) as CompletionDocShape;
    const untouched = assemblyDocIsUntouched(asmDoc);
    const blockedAt = log.find((l) => l.event === 'grant-horizon-not-reached');
    const obs = `BEFORE-HORIZON leg: attempt at ${attemptAt} with crossingGrantHorizon=${grantHorizon} → ${outcome.status}${outcome.status === 'horizon-not-reached' ? ` (horizon step 3h, fresh clock read; ${outcome.reason})` : ' (UNEXPECTED)'}; block logged ${blockedAt?.at ?? 'n/a'}; assembly document untouched=${untouched}; intent records=${(asmDoc.crossingRecords ?? []).length}; putRecord not called.`;
    console.log(`${TAG} ${obs}`);
    gateObservations.push(obs);
    if (outcome.status !== 'horizon-not-reached' || !untouched) {
      findings.push('BEFORE-HORIZON leg did not block as horizon-not-reached with nothing written — AC-3.2.1 not met; investigate before closing Item 3.2.');
    }
    const waited = await sleepUntil(grantHorizon!, 1_000);
    const wobs = `Wait: wall clock before sleep ${waited.before}; after sleep ${waited.after}; T1=${grantHorizon} (spec r2 FM2 — real wall clock at both crossings, no injected clock).`;
    console.log(`${TAG} ${wobs}`);
    gateObservations.push(wobs);
  }

  // --- 4a. public-subset: NEGATIVE leg (access-layer block on section_c) ---
  if (SCENARIO === 'public-subset') {
    const asmNeg = await makeAssemblyDoc(actor, author, 'negative leg');
    findings.push(`Assembly document creator access (negative leg): accessForDoc(self)=${asmNeg.creatorAccess}; members: ${asmNeg.membership}.`);
    // The actor presents c BY ID (spike D-5: on this transport the actor
    // holds ciphertext only; find() never resolves). The gate sees the URL —
    // the block site is accessForDoc() at step 1, not handle load. Expected
    // behaviour, not a load defect (brief v0.1.3 §4).
    const cInput: CrossingInputHandle = unloadableInput(
      sectionC.url,
      `un-granted document not decryptable by the actor: handle pending at timeout (${cProbeBehaviour})`,
    );
    findings.push(`Negative leg: section_c presented to the gate by document ID; actor-side handle pending at timeout (un-granted, not decryptable — spike D-5); gate exercised on the ID at step 1.`);
    const log: CrossingLogEntry[] = [];
    const outcome = await initiateCrossing({
      inputs: [...grantedInputs, cInput],
      handle: asmNeg.handle,
      presentedContent: presented,
      gateCheck: gate,
      putRecord: neverFire,
      identity,
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizonFor(),
      log,
    });
    allLogs.push({ leg: 'negative', log });
    const asmDoc = (await asmNeg.handle.doc()) as CompletionDocShape;
    const untouched = assemblyDocIsUntouched(asmDoc);
    const blockedAt = log.find((l) => l.event === 'gate-check-blocked');
    const obs = `NEGATIVE leg: presented [section_a, section_b, section_c] → ${outcome.status}${outcome.status === 'gate-blocked' ? ` at accessForDoc(section_c) on the issuer's hive: ${outcome.reason}` : ' (UNEXPECTED)'}; block logged ${blockedAt?.at ?? 'n/a'}; assembly document untouched=${untouched}; intent records=${(asmDoc.crossingRecords ?? []).length}; putRecord not called.`;
    console.log(`${TAG} ${obs}`);
    gateObservations.push(obs);
    if (outcome.status !== 'gate-blocked' || !untouched) {
      findings.push('NEGATIVE leg did not block as an access-layer block with nothing written — AC-3.1.3 not met; investigate before closing Item 3.1.');
    }
  }

  // --- 4b. public-subset: ADVERSARIAL leg (foreign bytes between assembly and digest check) ---
  if (SCENARIO === 'public-subset') {
    const asmAdv = await makeAssemblyDoc(actor, author, 'adversarial leg');
    const injected: CrossingSourceContent = {
      ...presented,
      content: presented.content + '\n\n<!-- foreign bytes injected after assembly, before the digest check -->',
    };
    const log: CrossingLogEntry[] = [];
    const outcome = await initiateCrossing({
      inputs: grantedInputs,
      handle: asmAdv.handle,
      presentedContent: injected,
      gateCheck: gate,
      putRecord: neverFire,
      identity,
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizonFor(),
      log,
    });
    allLogs.push({ leg: 'adversarial', log });
    const asmDoc = (await asmAdv.handle.doc()) as CompletionDocShape;
    const untouched = assemblyDocIsUntouched(asmDoc);
    const obs = `ADVERSARIAL leg: presented [section_a, section_b] + appended foreign bytes → ${outcome.status}${outcome.status === 'digest-blocked' ? ' on hash inequality at step 3 (both gates passed)' : ' (UNEXPECTED)'}; assembly document untouched=${untouched}; no intent; putRecord not called.`;
    console.log(`${TAG} ${obs}`);
    gateObservations.push(obs);
    if (outcome.status !== 'digest-blocked' || !untouched) {
      findings.push('ADVERSARIAL leg did not block on digest mismatch with nothing written — investigate before closing Item 3.1.');
    }
  }

  // --- 4e. aggregated: DETERMINISM pre-check (spec r2 failure mode 1) ---
  if (SCENARIO === 'aggregated') {
    const once = assembleCrossingContent(grantedContents);
    const twice = assembleCrossingContent(grantedContents);
    const identical = JSON.stringify(once) === JSON.stringify(twice);
    const dobs = `DETERMINISM pre-check: assembleCrossingContent([doc_a, doc_b]) run twice on identical inputs → byte-identical=${identical} (fixed input order, canonical serialization, no timestamp/random injection — D-3). ${identical ? 'Digest binding cannot fail spuriously on the positive case from aggregation drift.' : 'NOT DETERMINISTIC — abort before the gate test (spec r2 FM1).'}`;
    console.log(`${TAG} ${dobs}`);
    gateObservations.push(dobs);
    if (!identical) {
      findings.push('Aggregation non-determinism detected at the pre-check; run aborted (spec r2 Item 3.3 failure mode 1).');
      process.exit(1);
    }
  }

  // --- 4f. aggregated: NEGATIVE leg (pre-mint tamper; AC-3.3.3, FM3) ---
  if (SCENARIO === 'aggregated') {
    const asmNeg = await makeAssemblyDoc(actor, author, 'aggregated negative leg');
    // Byte-append tamper: changes BOTH length and hash; the gate blocks on
    // hash inequality only (never length or field presence) — stated per
    // spec r2 failure mode 3.
    const tampered: CrossingSourceContent = {
      ...presented,
      content: presented.content + '\n\n<!-- TOCTOU-class tamper: bytes appended to the aggregate between digest computation and the gate check -->',
    };
    const log: CrossingLogEntry[] = [];
    const outcome = await initiateCrossing({
      inputs: grantedInputs,
      handle: asmNeg.handle,
      presentedContent: tampered,
      gateCheck: gate,
      putRecord: neverFire,
      identity,
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizonFor(),
      log,
    });
    allLogs.push({ leg: 'aggregated-negative', log });
    const asmDoc = (await asmNeg.handle.doc()) as CompletionDocShape;
    const untouched = assemblyDocIsUntouched(asmDoc);
    const blockedAt = log.find((l) => l.event === 'digest-check-blocked');
    const obs = `AGGREGATED NEGATIVE leg (pre-mint tamper): modified aggregate presented → ${outcome.status}${outcome.status === 'digest-blocked' ? ' on HASH inequality at step 3 (not length, not field presence — FM3)' : ' (UNEXPECTED)'}; block logged ${blockedAt?.at ?? 'n/a'} — precedes any intent-record timestamp (no intent exists); assembly document untouched=${untouched}; intent records=${(asmDoc.crossingRecords ?? []).length}; putRecord not called (AC-3.3.3).`;
    console.log(`${TAG} ${obs}`);
    gateObservations.push(obs);
    if (outcome.status !== 'digest-blocked' || !untouched) {
      findings.push('AGGREGATED NEGATIVE leg did not block on digest mismatch with nothing written — AC-3.3.3 not met; investigate before closing Item 3.3.');
    }
  }

  // --- 4g. aggregated: TOCTOU leg (mutation between mint and fire; Item 3.3 core) ---
  if (SCENARIO === 'aggregated') {
    const asmT = await makeAssemblyDoc(actor, author, 'aggregated TOCTOU leg');
    const log: CrossingLogEntry[] = [];
    // Named deviation (Q4 ruling, spike-D discipline): the test-only hook
    // opens the mint-to-fire window deterministically; on the production
    // path the parameter is OMITTED (omitted-never-null). The mutation is
    // an actor-side Automerge change to the assembly document's content —
    // the exact Surface A the re-verification exists to detect.
    const outcome = await initiateCrossing({
      inputs: grantedInputs,
      handle: asmT.handle,
      presentedContent: presented,
      gateCheck: gate,
      putRecord: neverFire,
      identity,
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizonFor(),
      log,
      __testOnlyBetweenMintAndFire: () => {
        asmT.handle.change((d: any) => {
          d.content = d.content + '\n\n<!-- assembly mutated AFTER intent mint, BEFORE fire (TOCTOU) -->';
        });
      },
    });
    allLogs.push({ leg: 'aggregated-toctou', log });
    const asmDoc = (await asmT.handle.doc()) as CompletionDocShape;
    const intents = (asmDoc.crossingRecords ?? []).filter((r: any) => r.recordType === 'crossing-intent').length;
    const blockedAt = log.find((l) => l.event === 'fire-verification-blocked');
    const mintAt = log.find((l) => l.event === 'intent-record-written');
    const windowMs = blockedAt && mintAt ? Date.parse(blockedAt.at) - Date.parse(mintAt.at) : null;
    const obs = `AGGREGATED TOCTOU leg: assembly document mutated between mint and fire (test-hook injection, named deviation) → ${outcome.status}${outcome.status === 'fire-verification-blocked' ? ' at step 8v on hash inequality against the MINTED authorizedContentDigest' : ' (UNEXPECTED)'}; fire-verification-blocked logged ${blockedAt?.at ?? 'n/a'}; no put-record-fired event exists in this log (ordering statement); intent records document-resident=${intents} (not retracted — append-only holds inside the document); crossing reads crossing-unconfirmed; retry requires a fresh gate pass (steps 1–3h). Mint→block window ${windowMs ?? 'n/a'}ms.`;
    console.log(`${TAG} ${obs}`);
    gateObservations.push(obs);
    if (outcome.status !== 'fire-verification-blocked' || intents !== 1) {
      findings.push('AGGREGATED TOCTOU leg did not block at fire-time re-verification with a document-resident intent — Item 3.3 core behaviour not met; investigate before closing.');
    }
  }

  // --- 5w. Relay watcher OPEN (F-3.2-5: after all waits and blocked legs,
  // immediately before the fireable leg) ---
  const watcher = new JetstreamWatcher({
    endpoint: JETSTREAM,
    did,
    timeoutMs: RELAY_TIMEOUT_MS,
    wsFactory: (url) => new WebSocket(url) as any,
  });
  await watcher.start();
  console.log(`${TAG} relay subscription open: ${JETSTREAM} (client-side DID+collection filter; opened immediately before the fireable leg — F-3.2-5)`);

  // --- 5. POSITIVE leg (all scenarios): the governed crossing ---
  const legLabel = SCENARIO === 'public-subset' ? 'positive leg' : SCENARIO === 'delayed-release' ? 'after-horizon leg' : SCENARIO === 'aggregated' ? 'aggregated positive leg' : SCENARIO;
  const asm = await makeAssemblyDoc(actor, author, legLabel);
  findings.push(`Assembly document creator access (${legLabel}): accessForDoc(self)=${asm.creatorAccess}; members: ${asm.membership}.`);
  const record: WhtwndEntryRecord = {
    $type: 'com.whtwnd.blog.entry',
    title: presented.title,
    content: presented.content,
    createdAt: presented.createdAt,
    visibility: 'public',
  };
  const timings = emptyTimings();
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

  const horizon = delayedTimeoutHorizon ?? horizonFor();
  const log: CrossingLogEntry[] = [];
  const hook = createCompletionHook();

  let outcomeStatus: string;
  let intentEmittedAt: string | null = null;
  let firedIntent: CrossingIntentRecord | null = null;
  let fireError: string | null = null;
  // F-3.2-6 fix: the attempt timestamp is captured BEFORE the leg runs;
  // the crossing log remains authoritative for event times.
  const fireAttemptAt = new Date().toISOString();
  try {
    const outcome = await initiateCrossing({
      inputs: grantedInputs,
      handle: asm.handle,
      presentedContent: presented,
      gateCheck: gate,
      putRecord: put,
      identity,
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: horizon,
      ...(grantHorizon !== undefined ? { crossingGrantHorizon: grantHorizon } : {}),
      log,
    });
    outcomeStatus = outcome.status;
    if (outcome.status === 'fired') {
      intentEmittedAt = outcome.intent.emittedAt;
      firedIntent = outcome.intent;
      console.log(`${TAG} fired: uri=${outcome.put.uri} cid=${outcome.put.cid}`);
      if (SCENARIO === 'delayed-release') {
        // AC-3.2.3: both horizons on the intent record (same host object).
        console.log(`${TAG} intent horizons: crossingGrantHorizon=${outcome.intent.crossingGrantHorizon} crossingTimeoutHorizon=${outcome.intent.crossingTimeoutHorizon} emittedAt=${outcome.intent.emittedAt}`);
      }
      console.log(`${TAG} intent sourceDocumentURI=${outcome.intent.sourceDocumentURI} (assembly document); sourceLineage=${outcome.intent.sourceLineage.map((l) => l.documentURI).join(', ')}; grantReference=${outcome.intent.grantReference}`);
      // Spike D-6 / operator (S6 Unit B): the nudge commit is part of the
      // heads named by sourceDocumentCID (author holds read on the assembly
      // document) and by each lineage documentCID (a/b granted). Observation.
      const asmNudge = await hasNudge(asm.handle);
      const cidObs = `CID observation (spike D-6): sourceDocumentCID=${outcome.intent.sourceDocumentCID} names the assembly document's heads including the author's membership nudge commit (nudge field present on assembly document=${asmNudge}); sourceLineage documentCIDs ${outcome.intent.sourceLineage.map((l) => `${l.documentURI}@${l.documentCID}`).join(', ')} each include the nudge commit on the granted input. Content object and digests unaffected (step-4 recompute equal).`;
      console.log(`${TAG} ${cidObs}`);
      findings.push(cidObs);
      const ref = (publishedPayload as WhtwndEntryRecord | null)?.seamCrossingRef;
      if (ref) {
        console.log(`${TAG} seamCrossingRef attached at fire: crossingIntentRef=${ref.crossingIntentRef.slice(0, 32)}… digest=${ref.authorizedContentDigest.slice(0, 16)}… sourceDoc=${ref.sourceDocumentURI}`);
      }
    } else {
      console.log(`${TAG} positive leg did not fire: ${outcome.status} — ${(outcome as any).reason ?? ''}`);
    }
  } catch (e: any) {
    outcomeStatus = 'fire-failed';
    fireError = String(e?.message ?? e);
    const doc = await asm.handle.doc();
    intentEmittedAt = (doc.crossingRecords ?? []).at(-1)?.emittedAt ?? null;
    console.error(`${TAG} publish failed (crossing-intent-failed posture): ${fireError}`);
  }
  allLogs.push({ leg: SCENARIO === 'delayed-release' ? 'after-horizon' : 'positive', log });
  gateObservations.push(
    SCENARIO === 'delayed-release'
      ? `AFTER-HORIZON leg: attempt at ${fireAttemptAt} with crossingGrantHorizon=${grantHorizon} (T1 passed) → gate passed on isReader (issuer's hive) → assembled → digest matched → horizon step passed (fresh clock read) → assembly document written → ${outcomeStatus}; intent carries crossingGrantHorizon=${firedIntent?.crossingGrantHorizon ?? 'n/a'} and crossingTimeoutHorizon=${firedIntent?.crossingTimeoutHorizon ?? 'n/a'} (AC-3.2.3).`
      : SCENARIO === 'aggregated'
        ? `AGGREGATED POSITIVE leg (retest, post-block by design — spec r2 adversarial step): attempt at ${fireAttemptAt}; presented the original unmodified aggregate of [doc_a, doc_b] → gate passed on isReader for each (issuer's hive) → assembled (deterministic, fixed order) → digest matched → horizon step passed → assembly document written → fire-time re-verification passed (step 8v) → ${outcomeStatus}; the gate did not latch on the earlier blocks (AC via retest).`
        : `POSITIVE leg: presented ${grantedInputs.length} granted input(s) → gate passed on isReader for each (issuer's hive) → assembled → digest matched → assembly document written → ${outcomeStatus}.`,
  );

  // --- 5r. delayed-release: REPLAY leg (adversarial; spec r2 Item 3.2 step) ---
  // Immediately after the pass: a FRESH future T1' on the same input must block.
  // Block timestamp follows the positive intent by design (operator ruling).
  if (SCENARIO === 'delayed-release') {
    const t1r = new Date(Date.now() + GRANT_HORIZON_S * 1000).toISOString();
    const asmRe = await makeAssemblyDoc(actor, author, 'replay leg');
    const rlog: CrossingLogEntry[] = [];
    const attemptAt = new Date().toISOString();
    const re = await initiateCrossing({
      inputs: grantedInputs,
      handle: asmRe.handle,
      presentedContent: presented,
      gateCheck: gate,
      putRecord: neverFire,
      identity,
      targetPDS: PDS_SERVICE,
      regimeAcknowledgment: ACK,
      crossingTimeoutHorizon: new Date(Date.parse(t1r) + HORIZON_S * 1000).toISOString(),
      crossingGrantHorizon: t1r,
      log: rlog,
    });
    allLogs.push({ leg: 'replay', log: rlog });
    const reDoc = (await asmRe.handle.doc()) as CompletionDocShape;
    const reUntouched = assemblyDocIsUntouched(reDoc);
    const robs = `REPLAY leg (adversarial, post-pass by design): attempt at ${attemptAt} with a fresh crossingGrantHorizon=${t1r} set after the pass → ${re.status}${re.status === 'horizon-not-reached' ? ' — the pass was not cached; fresh clock read each attempt' : ' (UNEXPECTED)'}; assembly document untouched=${reUntouched}; no intent; putRecord not called. Its block timestamp follows the after-horizon intent; AC-3.2.1's ordering clause is the before-horizon leg's.`;
    console.log(`${TAG} ${robs}`);
    gateObservations.push(robs);
    if (re.status !== 'horizon-not-reached' || !reUntouched) {
      findings.push('REPLAY leg did not block on the fresh horizon — cached-decision suspicion; investigate before closing Item 3.2.');
    }
    findings.push('F-3.2-1: at 6479fc7 the timeout check ran after the assembly write; from this diff both horizon checks run in one step (3h) before any write — no assembly content on any horizon block at mint. KL-12: observation only — lower-bound gate on the intent record shown; grant-authority lapse NOT exercised (read grant persisted across all legs; the seam refused, not the grant); recallSemantics staleness n/a (no external protocol change); mid-horizon drift n/a on this stack. F-3.2-2 (AC-3.2.5): term says "grant", host is the intent record; distinction from crossingTimeoutHorizon is semantic (earliest-authorized vs latest-before-unconfirmed); name-follows-host queued to the KL-12 evidence session.');
  }

  // --- 6. Relay observation (success path) ---
  let relayIngestedAt: string | null = null;
  if (outcomeStatus === 'fired') {
    const relay = await watcher.observed();
    relayIngestedAt = relay.relayIngestedAt;
    console.log(
      relay.timedOut
        ? `${TAG} relay event NOT observed within ${RELAY_TIMEOUT_MS}ms (H.3 null)`
        : `${TAG} relay ingested: ${relay.observedUri}`,
    );
  }
  watcher.close();

  // --- 7. getRecord() intact-check + B-5 check (published record names no non-granted document) ---
  let kl2: string;
  if (outcomeStatus === 'fired' && timings.uri) {
    const rkey = timings.uri.split('/').at(-1)!;
    try {
      const got = await agent.com.atproto.repo.getRecord({ repo: did, collection: 'com.whtwnd.blog.entry', rkey });
      const stored = (got.data.value as any)?.seamCrossingRef as SeamCrossingRef | undefined;
      if (stored && firedIntent) {
        const verify = verifySeamCrossingRefAgainstIntent(stored, firedIntent);
        const namesC = sectionC
          ? JSON.stringify(stored).includes(sectionC.url) || JSON.stringify(firedIntent.sourceLineage).includes(sectionC.url)
          : false;
        kl2 = verify.valid
          ? `seamCrossingRef (four-field singular shape) returned INTACT by getRecord(); it points at the ASSEMBLY document ${stored.sourceDocumentURI} (D-5), not an input.${sectionC ? ` B-5: published record or sourceLineage names section_c = ${namesC} (expected false).` : ''} AppView surface/drop (whtwnd.com): operator observation — expected unchanged from Runs 4–5 (dropped at AppView); record manually.`
          : `seamCrossingRef returned but MISMATCHED against the fired intent: ${verify.errors.join('; ')} — investigate.`;
      } else if (firedIntent) {
        kl2 = 'seamCrossingRef attached at publish but ABSENT from the getRecord() response — record verbatim (differs from Runs 4–5).';
      } else {
        kl2 = 'getRecord() returned but no fired intent to verify against (unexpected).';
      }
    } catch (e: any) {
      kl2 = `getRecord() intact-check failed to execute (${String(e?.message ?? e)}); publish-side seamCrossingRef attachment stands; re-run the fetch.`;
    }
  } else {
    kl2 = 'No publish accepted this run: no back-pointer crossed. seamCrossingRef attachment is fire-time payload content only.';
  }
  console.log(`${TAG} KL-2: ${kl2}`);

  // --- 8. Completion record (success path) — into the ASSEMBLY document ---
  let h3Outcome: 'completed' | 'failed' | 'timeout';
  let kl1: string;
  if (outcomeStatus === 'fired') {
    try {
      const completion = await writeCrossingCompletion({
        handle: asm.handle,
        intent: firedIntent!,
        put: { uri: timings.uri, cid: timings.cid },
        pdsAcceptedAt: timings.pdsAcceptedAt,
        relayIngestedAt,
        hook,
        log,
      });
      const doc = (await asm.handle.doc()) as CompletionDocShape;
      const state = deriveDocumentCrossingState(doc);
      console.log(`${TAG} completion record written into the assembly document: crossingIntentRef=${completion.crossingIntentRef.slice(0, 32)}… targetCID=${completion.crossingTargetCID}`);
      console.log(`${TAG} assembly document-legible state (no external lookup): ${state}`);
      h3Outcome = 'completed';
      kl1 = `Fired; publish accepted; crossing-completion minted in the ASSEMBLY document (actor-owned; author holds read) and confirmed document-resident. Document-legible state: ${state}. KL-1 (D-5 cost, not a defect): a deferred party following sourceDocumentURI lands on the actor's assembly document ${asm.handle.url}, not the author's content documents; the author's documents are reachable only via the intent's sourceLineage (${firedIntent!.sourceLineage.length} entries) and carry no crossing records. Gate evaluated on the issuer's hive, not the presenting party's (ruling 2) — legibility note.`;
    } catch (e: any) {
      const mintErr = String(e?.message ?? e);
      console.error(`${TAG} completion mint FAILED (worst-case taxonomy state): ${mintErr}`);
      const remaining = Date.parse(horizon) - Date.now();
      if (remaining > 0) await sleep(remaining + 50);
      h3Outcome = 'timeout';
      kl1 = `Publish accepted but completion record minting failed (${mintErr}): completion-mint-failed — crossing happened; the assembly document reads crossing-unconfirmed.`;
    }
  } else if (outcomeStatus === 'fire-failed') {
    h3Outcome = 'failed';
    kl1 = `Publish failed (${fireError}). Intent record remains resident in the assembly document with no completion: crossing-intent-failed, legible without external lookup; retry requires a new gate pass (KL-8a).`;
  } else {
    h3Outcome = 'failed';
    kl1 = `Positive leg did not fire (${outcomeStatus}). See crossing log for the blocking event.`;
  }

  // --- 9. Emit the H.3 entry to its OWN file (never the canonical log) ---
  await emitEntry({
    outcome: h3Outcome,
    scenario: SCENARIO,
    log,
    intentEmittedAt,
    timings,
    relayIngestedAt,
    completionWrittenAt: hook.completionWrittenAt,
    kl1,
    kl2,
    phase3: phase3Fields(SCENARIO, gateObservations, findings),
  });

  // --- 10. Full crossing logs, per leg ---
  for (const { leg, log: l } of allLogs) {
    console.log(`${TAG} crossing log — ${leg} leg (ordered):`);
    for (const line of fmtLog(l)) console.log(line);
  }
  if (timings.cid) console.log(`${TAG} captured CID (crossingTargetCID): ${timings.cid}`);
  console.log(`${TAG} RUN ${RUN_N} (${SCENARIO}): ${outcomeStatus.toUpperCase()} — operator confirms acceptance criteria against the entry; this runner does not self-report completion.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`${TAG} RUN: FAIL`, e);
  process.exit(1);
});
