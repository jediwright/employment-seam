/**
 * PC#8 — Substrate-Crossing Seam — Item 1.1
 * crossing-intent record: schema, gate check, write-before-fire discipline.
 *
 * Governing docs:
 *   pc08-build-plan-v0-1_2026-08-17.md (§2 Item 1.1)
 *   pattern-commons-08-substrate-crossing-seam-v0-1-3_2026-08-17.md
 *     (two-record pattern; identity binding block; failure taxonomy)
 *   UFO_Lexicon_v2_0 (substrate-crossing PROPOSED cluster; C2 host-object
 *     correction queued — host = intent record per KL-8c / SL-0114)
 *
 * Architectural invariant (record-before-crossing / write-before-fire):
 *   the intent record is written to the local Automerge document and
 *   confirmed readable BEFORE putRecord() fires. The crossing does not
 *   fire unless the intent record exists in the local document. A blocked
 *   gate check produces NO intent record. An expired crossingTimeoutHorizon
 *   rejects the crossing without firing.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Schema — PC#8 spec v0.1.3, with identity binding block per spec
// (grantorDID / targetDID / identityCustodyClass; decision A5 — the build
// plan's `subjectDID` is treated as a compression of this block).
// ---------------------------------------------------------------------------

export type IdentityCustodyClass =
  | 'self-custodied'
  | 'mixed-custody'
  | 'provider-custodied';

export interface CrossingIntentRecord {
  recordType: 'crossing-intent';
  governanceEvent: 'substrate-crossing';
  boundType: 'exposure-unbounded';

  // Identity binding block (spec v0.1.3 conditional field group)
  grantorDID: string;
  targetDID: string;
  identityCustodyClass: IdentityCustodyClass;

  // Provenance linkage group
  sourceDocumentURI: string;
  /**
   * CID/heads of the authorized content snapshot. Backdating-detectability
   * anchor (Jacob et al. arXiv:2604.23560): emittedAt/gateCheckedAt are
   * self-asserted; binding to document heads is what makes a backdated
   * intent record detectable against the hash-linked history.
   * Legibility-observation angle only — no verification claim is made
   * by this field (Q6 lock: lineageAnchorType remains author-declared).
   */
  sourceDocumentCID: string;
  /** Content hash bound at grant time (CP-F11). */
  authorizedContentDigest: string;

  // Crossing fields
  targetLexicon: 'com.whtwnd.blog.entry';
  targetPDS: string;
  crossingType: 'publication';
  /** Declared acknowledgment; gate checks presence, not authorship
   *  (declared-acknowledgment ceiling; Lexicon v1.9 correction (c)). */
  regimeAcknowledgment: string;
  declaredBoundType: 'exposure-unbounded';
  recallSemantics: 'propagated-request';

  // Timeout discipline — host object: intent record (KL-8c / SL-0114;
  // Lexicon C2 correction queued, not yet applied)
  crossingTimeoutHorizon: string; // ISO timestamp

  // Lineage anchoring
  lineageAnchorType: 'author-declared';
  /**
   * Bounds the TOCTOU window for deferred parties (KL-10). Causal-history
   * semantics (Jacob et al.): the gate check at emittedAt attests that the
   * intent record's causal history contains an authorizing grant with no
   * authorized revocation of that grant in the same history. KL-8a's
   * act-time-current posture is the discipline that a new act requires a
   * new history evaluation.
   */
  emittedAt: string;

  // Gate fields
  /**
   * Keyhive grant identifier. Granted-present-revoke style (Jacob et al.):
   * the invocation PRESENTS the grant identifier; revocations reference it.
   */
  grantReference: string;
  gateResult: 'pass'; // a blocked gate check never mints a record
  gateCheckedAt: string;
}

/** Fixed-literal fields and their required values. */
const LITERALS: Partial<Record<keyof CrossingIntentRecord, string>> = {
  recordType: 'crossing-intent',
  governanceEvent: 'substrate-crossing',
  boundType: 'exposure-unbounded',
  targetLexicon: 'com.whtwnd.blog.entry',
  crossingType: 'publication',
  declaredBoundType: 'exposure-unbounded',
  recallSemantics: 'propagated-request',
  lineageAnchorType: 'author-declared',
  gateResult: 'pass',
};

export const REQUIRED_FIELDS: (keyof CrossingIntentRecord)[] = [
  'recordType', 'governanceEvent', 'boundType',
  'grantorDID', 'targetDID', 'identityCustodyClass',
  'sourceDocumentURI', 'sourceDocumentCID', 'authorizedContentDigest',
  'targetLexicon', 'targetPDS', 'crossingType',
  'regimeAcknowledgment', 'declaredBoundType', 'recallSemantics',
  'crossingTimeoutHorizon', 'lineageAnchorType', 'emittedAt',
  'grantReference', 'gateResult', 'gateCheckedAt',
];

const CUSTODY_VALUES: IdentityCustodyClass[] = [
  'self-custodied', 'mixed-custody', 'provider-custodied',
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Schema conformance: all required fields present, non-null, non-empty;
 *  fixed literals correct; CV values admissible; timestamps parseable. */
export function validateCrossingIntentRecord(
  rec: Partial<CrossingIntentRecord>,
): ValidationResult {
  const errors: string[] = [];
  for (const f of REQUIRED_FIELDS) {
    const v = rec[f];
    if (v === undefined || v === null || v === '') {
      errors.push(`missing or null required field: ${f}`);
    }
  }
  for (const [f, expected] of Object.entries(LITERALS)) {
    const v = rec[f as keyof CrossingIntentRecord];
    if (v !== undefined && v !== expected) {
      errors.push(`field ${f} must be '${expected}', got '${String(v)}'`);
    }
  }
  if (
    rec.identityCustodyClass !== undefined &&
    !CUSTODY_VALUES.includes(rec.identityCustodyClass)
  ) {
    errors.push(`identityCustodyClass not in CV: ${rec.identityCustodyClass}`);
  }
  for (const f of ['crossingTimeoutHorizon', 'emittedAt', 'gateCheckedAt'] as const) {
    const v = rec[f];
    if (typeof v === 'string' && v !== '' && Number.isNaN(Date.parse(v))) {
      errors.push(`field ${f} is not a parseable ISO timestamp: ${v}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Content digest (CP-F11) — canonical serialization per Phase 0 Item 0.3
// ---------------------------------------------------------------------------

export function computeAuthorizedContentDigest(content: {
  title: string; content: string; createdAt: string;
}): string {
  const canonical = JSON.stringify([content.title, content.content, content.createdAt]);
  return createHash('sha256').update(canonical).digest('hex');
}

// ---------------------------------------------------------------------------
// Gate check
// ---------------------------------------------------------------------------

export interface GateCheckResult {
  result: 'pass' | 'blocked';
  grantReference: string | null;
  gateCheckedAt: string;
  reason?: string;
}

/** Gate check function: evaluates the Keyhive grant at act time.
 *  Injected so Item 1.1 tests wire the real accessForDoc() check and
 *  Item 1.2+ reuses the same seam. */
export type GateCheckFn = () => Promise<GateCheckResult>;

/** Injected publish call. Item 1.1 instruments ordering; Item 1.2 wires
 *  the live @atproto/api putRecord(). */
export type PutRecordFn = () => Promise<{ uri: string; cid: string }>;

export type Clock = () => Date;

// ---------------------------------------------------------------------------
// Instrumentation — ordered event log (KL-1: write-before-fire gap)
// ---------------------------------------------------------------------------

export type CrossingEvent =
  | 'gate-check-started'
  | 'gate-check-pass'
  | 'gate-check-blocked'
  | 'intent-record-written'
  | 'intent-record-read-confirmed'
  | 'timeout-horizon-expired'
  | 'put-record-fired'
  | 'put-record-accepted'
  // Item 1.3 — the intent-without-completion window's closing edge
  // (COMPLETION_WRITTEN_EVENT in crossing-fire.ts; stamped by
  // writeCrossingCompletion() at the completion record's document write).
  | 'completion-record-written';

export interface CrossingLogEntry {
  event: CrossingEvent;
  at: string; // ISO timestamp
  detail?: string;
}

// ---------------------------------------------------------------------------
// initiateCrossing — the ordering discipline
// ---------------------------------------------------------------------------

export interface CrossingDocShape {
  title: string;
  content: string;
  createdAt: string;
  crossingRecords?: CrossingIntentRecord[];
}

export interface InitiateCrossingParams {
  /** Automerge document handle (from repo.create2 / repo.find). Must expose
   *  change() and doc() in the automerge-repo handle shape. */
  handle: {
    change(fn: (d: CrossingDocShape) => void): void;
    doc(): Promise<CrossingDocShape> | CrossingDocShape;
    heads?(): string[] | undefined;
    url: string;
  };
  gateCheck: GateCheckFn;
  putRecord: PutRecordFn;
  identity: {
    grantorDID: string;
    targetDID: string;
    identityCustodyClass: IdentityCustodyClass;
  };
  targetPDS: string;
  regimeAcknowledgment: string;
  crossingTimeoutHorizon: string; // ISO
  clock?: Clock;
  log?: CrossingLogEntry[];
}

export type CrossingOutcome =
  | { status: 'fired'; intent: CrossingIntentRecord; put: { uri: string; cid: string }; log: CrossingLogEntry[] }
  | { status: 'gate-blocked'; reason: string; log: CrossingLogEntry[] }
  | { status: 'horizon-expired'; reason: string; log: CrossingLogEntry[] };

/**
 * Executes one governed crossing attempt under the write-before-fire
 * discipline:
 *
 *   1. Gate check (act-time-current; KL-8a). Blocked → stop; NO intent
 *      record is minted.
 *   2. crossingTimeoutHorizon check. Already expired → stop; no intent
 *      record, no fire (a record born expired would be born-dead; KL-8a
 *      requires a fresh gate pass with a fresh horizon).
 *   3. Mint the intent record; write it to the Automerge document.
 *   4. Read the document back and confirm the record is present
 *      (the invariant is confirmed-readable, not merely change()-called).
 *   5. Re-check the horizon at fire time; expired → do not fire
 *      (intent record remains; state reads crossing-unconfirmed at
 *      horizon elapse per the failure taxonomy).
 *   6. Fire putRecord().
 */
export async function initiateCrossing(
  p: InitiateCrossingParams,
): Promise<CrossingOutcome> {
  const clock = p.clock ?? (() => new Date());
  const log = p.log ?? [];
  const stamp = (event: CrossingEvent, detail?: string) =>
    log.push({ event, at: clock().toISOString(), detail });

  // 1 — gate check
  stamp('gate-check-started');
  const gate = await p.gateCheck();
  if (gate.result !== 'pass' || !gate.grantReference) {
    stamp('gate-check-blocked', gate.reason ?? 'gate blocked');
    return { status: 'gate-blocked', reason: gate.reason ?? 'gate blocked', log };
  }
  stamp('gate-check-pass', gate.grantReference);

  // 2 — horizon must be in the future at mint time
  const horizonMs = Date.parse(p.crossingTimeoutHorizon);
  if (Number.isNaN(horizonMs) || clock().getTime() >= horizonMs) {
    stamp('timeout-horizon-expired', 'expired at mint time; no intent record minted');
    return {
      status: 'horizon-expired',
      reason: 'crossingTimeoutHorizon expired before intent record mint; new gate pass required (KL-8a)',
      log,
    };
  }

  // 3 — mint + write the intent record
  const docNow = await p.handle.doc();
  const heads = p.handle.heads?.();
  const intent: CrossingIntentRecord = {
    recordType: 'crossing-intent',
    governanceEvent: 'substrate-crossing',
    boundType: 'exposure-unbounded',
    grantorDID: p.identity.grantorDID,
    targetDID: p.identity.targetDID,
    identityCustodyClass: p.identity.identityCustodyClass,
    sourceDocumentURI: p.handle.url,
    sourceDocumentCID: heads?.join(',') ?? 'heads-unavailable',
    authorizedContentDigest: computeAuthorizedContentDigest(docNow),
    targetLexicon: 'com.whtwnd.blog.entry',
    targetPDS: p.targetPDS,
    crossingType: 'publication',
    regimeAcknowledgment: p.regimeAcknowledgment,
    declaredBoundType: 'exposure-unbounded',
    recallSemantics: 'propagated-request',
    crossingTimeoutHorizon: p.crossingTimeoutHorizon,
    lineageAnchorType: 'author-declared',
    emittedAt: clock().toISOString(),
    grantReference: gate.grantReference,
    gateResult: 'pass',
    gateCheckedAt: gate.gateCheckedAt,
  };

  const validation = validateCrossingIntentRecord(intent);
  if (!validation.valid) {
    // Defensive: an invalid record must never be written.
    throw new Error(`intent record failed schema validation: ${validation.errors.join('; ')}`);
  }

  p.handle.change((d) => {
    if (!d.crossingRecords) d.crossingRecords = [];
    d.crossingRecords.push(intent);
  });
  stamp('intent-record-written');

  // 4 — confirm readable
  const readBack = await p.handle.doc();
  const found = (readBack.crossingRecords ?? []).some(
    (r) => r.recordType === 'crossing-intent' && r.emittedAt === intent.emittedAt,
  );
  if (!found) {
    throw new Error('write-before-fire violated: intent record not readable after write');
  }
  stamp('intent-record-read-confirmed');

  // 5 — horizon re-check at fire time
  if (clock().getTime() >= horizonMs) {
    stamp('timeout-horizon-expired', 'expired between mint and fire; putRecord not fired');
    return {
      status: 'horizon-expired',
      reason: 'crossingTimeoutHorizon expired before putRecord(); crossing reads crossing-unconfirmed at horizon elapse',
      log,
    };
  }

  // 6 — fire
  stamp('put-record-fired');
  const put = await p.putRecord();
  stamp('put-record-accepted', put.cid);

  return { status: 'fired', intent, put, log };
}
