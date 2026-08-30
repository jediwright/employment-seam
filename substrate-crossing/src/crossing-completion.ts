/**
 * PC#8 — Substrate-Crossing Seam — Item 1.3
 * crossing-completion record: schema, intent-linking, mint-once write,
 * document-legible crossing state derivation.
 *
 * Governing docs:
 *   pc08-build-plan-v0-1_2026-08-17.md (§2 Item 1.3; failure path)
 *   pattern-commons-08-substrate-crossing-seam-v0-1-3_2026-08-17.md
 *     (completion record posture; failure-state taxonomy; fail-closed
 *     legibility; Q6 lock — lineageAnchorType stays author-declared)
 *   session-record-pc08-phase1-item1-2_2026-08-18.md (window anchor:
 *     opening edge = intent-record-written; closing edge =
 *     completion-record-written; completion-mint-once discipline)
 *
 * WINDOW CLOSING EDGE:
 *   The completion record's document write is the `completion-record-written`
 *   event (COMPLETION_WRITTEN_EVENT, named at Item 1.2). writeCrossingCompletion()
 *   stamps that event into the CrossingLogEntry[] timing log and marks the
 *   CompletionHook at the SAME timestamp — one clock read serves the log
 *   event, the hook, and the record's own `completedAt`, so the window
 *   arithmetic (§H.3 intent_without_completion_window_ms) has a single
 *   unambiguous closing anchor.
 *
 * FAILURE PATH (build plan §2 Item 1.3):
 *   No completion record is ever minted for a failed publish. This module
 *   enforces that as a guard (missing uri/cid → throw before any document
 *   write). The intent record remains document-resident; the document reads
 *   crossing-intent-failed / crossing-unconfirmed per the taxonomy — the
 *   fail-closed legible state, derivable here via deriveDocumentCrossingState()
 *   without any external lookup.
 *
 * INTENT LINKING (crossingIntentRef):
 *   Automerge assigns no per-record CID, so the "CID or local document
 *   reference" the build plan requires is implemented as a content address
 *   of the intent record itself: sha256 over the intent record's canonical
 *   JSON (sorted keys), prefixed `intent-sha256:`. Deterministic, verifiable
 *   by any deferred party holding the document, and tamper-evident — a
 *   mutated intent record no longer matches the completion's ref.
 */
import { createHash } from 'node:crypto';
import type {
  CrossingIntentRecord,
  CrossingLogEntry,
  CrossingDocShape,
  Clock,
} from './crossing-intent.js';
import { COMPLETION_WRITTEN_EVENT, type CompletionHook } from './crossing-fire.js';
import { canonicalJson } from './canonical-json.js';

/** Re-exported for compatibility: canonicalJson() moved to canonical-json.ts
 *  at Item 3.1 so assembly.ts can share it without a module cycle. */
export { canonicalJson };

// ---------------------------------------------------------------------------
// Schema — build plan §2 Item 1.3 concrete interface, carrying the spec's
// record-triple framing (recordType / governanceEvent / boundType) and the
// chain posture (chainDepth increments from the intent record; Q6 lock:
// lineageAnchorType remains author-declared).
// ---------------------------------------------------------------------------

export interface CrossingCompletionRecord {
  recordType: 'crossing-completion';
  governanceEvent: 'substrate-crossing';
  boundType: 'exposure-unbounded';

  /** Content address of the intent record this completion closes
   *  (REQUIRED — KL-8b resolution / spec v0.1.3). */
  crossingIntentRef: string;
  /** Intent record is chain depth 0; its completion is depth 1. */
  chainDepth: 1;
  lineageAnchorType: 'author-declared';

  // Crossing target (post-crossing anchors)
  crossingTargetURI: string; // AT-URI returned by the PDS
  crossingTargetCID: string; // CID returned by the PDS

  // Timing
  completedAt: string;       // ISO; the completion-record-written moment
  pdsAcceptedAt: string;     // ISO; from Item 1.2 instrumentation
  relayIngestedAt?: string;  // ISO; from relay subscription (may lag / be absent)

  // Outcome
  crossingOutcome: 'completed';
}

const LITERALS: Partial<Record<keyof CrossingCompletionRecord, string | number>> = {
  recordType: 'crossing-completion',
  governanceEvent: 'substrate-crossing',
  boundType: 'exposure-unbounded',
  chainDepth: 1,
  lineageAnchorType: 'author-declared',
  crossingOutcome: 'completed',
};

/** relayIngestedAt is the only optional field (build plan: "may lag"). */
export const COMPLETION_REQUIRED_FIELDS: (keyof CrossingCompletionRecord)[] = [
  'recordType', 'governanceEvent', 'boundType',
  'crossingIntentRef', 'chainDepth', 'lineageAnchorType',
  'crossingTargetURI', 'crossingTargetCID',
  'completedAt', 'pdsAcceptedAt',
  'crossingOutcome',
];

export interface CompletionValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCrossingCompletionRecord(
  rec: Partial<CrossingCompletionRecord>,
): CompletionValidationResult {
  const errors: string[] = [];
  for (const f of COMPLETION_REQUIRED_FIELDS) {
    const v = rec[f];
    if (v === undefined || v === null || v === '') {
      errors.push(`missing or null required field: ${f}`);
    }
  }
  for (const [f, expected] of Object.entries(LITERALS)) {
    const v = rec[f as keyof CrossingCompletionRecord];
    if (v !== undefined && v !== expected) {
      errors.push(`field ${f} must be '${String(expected)}', got '${String(v)}'`);
    }
  }
  const timestamps: (keyof CrossingCompletionRecord)[] = rec.relayIngestedAt
    ? ['completedAt', 'pdsAcceptedAt', 'relayIngestedAt']
    : ['completedAt', 'pdsAcceptedAt'];
  for (const f of timestamps) {
    const v = rec[f];
    if (typeof v === 'string' && v !== '' && Number.isNaN(Date.parse(v))) {
      errors.push(`field ${f} is not a parseable ISO timestamp: ${v}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Intent-record content address
// ---------------------------------------------------------------------------

/** Deterministic local document reference to an intent record:
 *  sha256 over sorted-key canonical JSON, prefixed for legibility. */
export function computeIntentRecordRef(intent: CrossingIntentRecord): string {
  const hex = createHash('sha256')
    .update(canonicalJson(intent))
    .digest('hex');
  return `intent-sha256:${hex}`;
}

// ---------------------------------------------------------------------------
// Document shape extension — completion records live in their own array;
// the intent array from Item 1.1 is untouched.
// ---------------------------------------------------------------------------

export interface CompletionDocShape extends CrossingDocShape {
  completionRecords?: CrossingCompletionRecord[];
}

export interface CompletionHandle {
  change(fn: (d: CompletionDocShape) => void): void;
  doc(): Promise<CompletionDocShape> | CompletionDocShape;
  url: string;
}

// ---------------------------------------------------------------------------
// writeCrossingCompletion — the closing edge
// ---------------------------------------------------------------------------

export interface WriteCompletionParams {
  handle: CompletionHandle;
  /** The intent record this completion closes (from initiateCrossing()'s
   *  fired outcome). */
  intent: CrossingIntentRecord;
  /** PDS response from the fired publish. A failed publish has no uri/cid —
   *  the guard below is the "no completion record on failure" discipline. */
  put: { uri: string | null; cid: string | null };
  /** From LivePutTimings (Item 1.2). */
  pdsAcceptedAt: string | null;
  /** From JetstreamWatcher; omitted from the record when unobserved. */
  relayIngestedAt?: string | null;
  /** The Item 1.2 hook — marked exactly once, at the document write. */
  hook: CompletionHook;
  clock?: Clock;
  /** The run's ordered timing log; the closing-edge event is stamped here. */
  log?: CrossingLogEntry[];
}

/**
 * Writes the crossing-completion record under the same discipline as the
 * intent write:
 *
 *   1. Guard: publish must have succeeded (uri + cid + pdsAcceptedAt
 *      present). Failure → throw; NO completion record is minted; the
 *      intent record's completion-less state remains the legible outcome.
 *   2. Guard: the referenced intent record must be document-resident.
 *   3. Mint the completion record (crossingIntentRef = content address of
 *      the intent record); validate before writing.
 *   4. Write to the document; mark the hook and stamp
 *      `completion-record-written` at the SAME timestamp (mint-once: a
 *      second write against the same hook throws inside mark()).
 *   5. Read the document back and confirm the record is present. A failed
 *      read-back throws as completion-mint-failed — the taxonomy's
 *      worst-case state — rather than silently reporting success.
 */
export async function writeCrossingCompletion(
  p: WriteCompletionParams,
): Promise<CrossingCompletionRecord> {
  const clock = p.clock ?? (() => new Date());
  const log = p.log ?? [];

  // 1 — failed publish never mints a completion record
  if (!p.put.uri || !p.put.cid || !p.pdsAcceptedAt) {
    throw new Error(
      'no completion record for a failed or unaccepted publish: intent-without-completion is the legible state (crossing-intent-failed / crossing-unconfirmed)',
    );
  }

  // 2 — the intent record must be document-resident
  const docNow = await p.handle.doc();
  const intentResident = (docNow.crossingRecords ?? []).some(
    (r) => r.recordType === 'crossing-intent' && r.emittedAt === p.intent.emittedAt,
  );
  if (!intentResident) {
    throw new Error(
      'referenced intent record is not document-resident; a completion cannot close an intent the document does not carry',
    );
  }

  // 3 — mint + validate
  const at = clock();
  const completion: CrossingCompletionRecord = {
    recordType: 'crossing-completion',
    governanceEvent: 'substrate-crossing',
    boundType: 'exposure-unbounded',
    crossingIntentRef: computeIntentRecordRef(p.intent),
    chainDepth: 1,
    lineageAnchorType: 'author-declared',
    crossingTargetURI: p.put.uri,
    crossingTargetCID: p.put.cid,
    completedAt: at.toISOString(),
    pdsAcceptedAt: p.pdsAcceptedAt,
    ...(p.relayIngestedAt ? { relayIngestedAt: p.relayIngestedAt } : {}),
    crossingOutcome: 'completed',
  };
  const validation = validateCrossingCompletionRecord(completion);
  if (!validation.valid) {
    throw new Error(
      `completion record failed schema validation: ${validation.errors.join('; ')}`,
    );
  }

  // 4 — write; mark the hook and stamp the closing edge at the same instant
  p.handle.change((d) => {
    if (!d.completionRecords) d.completionRecords = [];
    d.completionRecords.push(completion);
  });
  p.hook.mark(at); // throws on second call — completion-mint-once
  log.push({
    event: COMPLETION_WRITTEN_EVENT,
    at: at.toISOString(),
    detail: completion.crossingTargetCID,
  });

  // 5 — confirmed-readable, not merely change()-called
  const readBack = await p.handle.doc();
  const found = (readBack.completionRecords ?? []).some(
    (r) =>
      r.recordType === 'crossing-completion' &&
      r.crossingIntentRef === completion.crossingIntentRef &&
      r.completedAt === completion.completedAt,
  );
  if (!found) {
    throw new Error(
      'completion-mint-failed: completion record not readable after write (worst-case taxonomy state — crossing happened; chain reads unconfirmed)',
    );
  }

  return completion;
}

// ---------------------------------------------------------------------------
// Document-legible crossing state (fail-closed legibility, spec v0.1.3)
// ---------------------------------------------------------------------------

export type DocumentCrossingState =
  | 'not-initiated'            // no intent record present
  | 'crossing-intent-pending'  // intent present; no completion; horizon not elapsed
  | 'crossing-unconfirmed'     // intent present; no completion; horizon elapsed
  | 'crossing-complete';       // completion present, ref-matched to the intent

/**
 * Derives the crossing state a deferred party reads from the document
 * ALONE — no PDS lookup, no relay, no external cooperation. This is the
 * spec's fail-closed legibility posture made executable: an intent record
 * with no ref-matched completion reads as not-confirmed-complete, and past
 * its crossingTimeoutHorizon that hardens to crossing-unconfirmed.
 *
 * (The taxonomy's crossing-intent-failed state is a superset condition of
 * intent-without-completion; from the document alone, pre-horizon, it is
 * indistinguishable from pending — which is exactly the point of the
 * horizon field.)
 */
export function deriveDocumentCrossingState(
  doc: CompletionDocShape,
  now: Date = new Date(),
): DocumentCrossingState {
  const intents = (doc.crossingRecords ?? []).filter(
    (r) => r.recordType === 'crossing-intent',
  );
  if (intents.length === 0) return 'not-initiated';
  const intent = intents[intents.length - 1];

  const ref = computeIntentRecordRef(intent);
  const completed = (doc.completionRecords ?? []).some(
    (c) => c.recordType === 'crossing-completion' && c.crossingIntentRef === ref,
  );
  if (completed) return 'crossing-complete';

  const horizon = Date.parse(intent.crossingTimeoutHorizon);
  if (!Number.isNaN(horizon) && now.getTime() >= horizon) {
    return 'crossing-unconfirmed';
  }
  return 'crossing-intent-pending';
}
