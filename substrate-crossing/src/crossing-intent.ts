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
 * Item 3.1 (Run 6, 2026-08-29) — uniform assembly path under D-1 r2 / D-5:
 *   every crossing assembles its content from ≥1 granted input document,
 *   gates each input on `access.isReader` (D-4), compares the presented
 *   payload's digest against the seam's own assembly by hash equality
 *   (D-3), writes the assembled output to the assembly document the
 *   crossing actor owns, and only then mints the intent there. A blocked
 *   access or digest check leaves no assembly write and no record. The
 *   intent record carries `sourceLineage` (one entry per input) and names
 *   the assembly document as its singular source. Brief v0.1.2 §3.
 *
 * Architectural invariant (record-before-crossing / write-before-fire):
 *   the intent record is written to the local Automerge document and
 *   confirmed readable BEFORE putRecord() fires. The crossing does not
 *   fire unless the intent record exists in the local document. A blocked
 *   gate check produces NO intent record. An expired crossingTimeoutHorizon
 *   rejects the crossing without firing.
 *
 * Item 3.2 (Run 7) — crossingGrantHorizon (D-2; brief v0.1 §2–3; D-7):
 *   an optional not-before horizon hosted on the intent record beside
 *   crossingTimeoutHorizon (seam-level; Keyhive Access carries no fields).
 *   Both horizons are checked in ONE horizon step, from ONE fresh clock
 *   read, after the digest check and BEFORE the assembly-document write,
 *   so any horizon block at mint leaves the assembly document untouched
 *   (F-3.2-1: at 6479fc7 the timeout check ran after the write). Nothing
 *   is retained between attempts. A request whose grant horizon is at or
 *   after its timeout horizon can never mint and is refused explicitly
 *   (D-7: horizon-inconsistent).
 */

import { createHash } from 'node:crypto';
import type { CrossingSourceContent } from './digest.js';
import {
  assembleCrossingContent,
  assembledContentDigest,
  buildSourceLineage,
  validateSourceLineage,
  type AssemblyInput,
  type SourceLineageEntry,
} from './assembly.js';

export type { SourceLineageEntry } from './assembly.js';

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
  /** Content hash bound at grant time (CP-F11). From Run 6: computed over
   *  the assembly document's content object (D-3 / D-5). */
  authorizedContentDigest: string;
  /**
   * Item 3.1 (D-5): ordered lineage of the granted input documents the
   * assembled content was built from — one entry per input in fixed
   * aggregation order. Required, non-empty, from Run 6 (uniform path).
   * Lineage digests are informational; the binding digest is
   * `authorizedContentDigest` (D-3).
   */
  sourceLineage: SourceLineageEntry[];

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
  /**
   * Item 3.2 (D-2): earliest-authorized (not-before) horizon, ISO. Optional;
   * OMITTED (not null) when the request carries none, so Runs 1–6 records
   * and their crossingIntentRef are unchanged. Hosted on the intent record,
   * NOT the grant (Keyhive Access has no fields). Checked from the system
   * clock at mint, fresh on every attempt; a pre-horizon attempt mints no
   * record. Semantic distinction from crossingTimeoutHorizon:
   * earliest-authorized vs latest-before-unconfirmed — same host object.
   * The term is PROPOSED (KL-12); this field is an implementation decision,
   * not lexicon evidence.
   */
  crossingGrantHorizon?: string;

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
  'sourceLineage',
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
  if (rec.sourceLineage !== undefined && rec.sourceLineage !== null) {
    errors.push(...validateSourceLineage(rec.sourceLineage));
  }
  for (const f of ['crossingTimeoutHorizon', 'emittedAt', 'gateCheckedAt'] as const) {
    const v = rec[f];
    if (typeof v === 'string' && v !== '' && Number.isNaN(Date.parse(v))) {
      errors.push(`field ${f} is not a parseable ISO timestamp: ${v}`);
    }
  }
  // Item 3.2: optional field — absent is valid; present must be a non-empty
  // parseable ISO timestamp (the record never carries a null field).
  if ('crossingGrantHorizon' in rec) {
    const v = rec.crossingGrantHorizon;
    if (v === undefined || v === null || v === '') {
      errors.push('field crossingGrantHorizon present but null or empty (omit it instead)');
    } else if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
      errors.push(`field crossingGrantHorizon is not a parseable ISO timestamp: ${String(v)}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Content digest (CP-F11) — canonical serialization per Phase 0 Item 0.3
// ---------------------------------------------------------------------------

export function computeAuthorizedContentDigest(content: {
  title: string; content: string; createdAt: string | null | undefined;
}): string {
  const canonical = JSON.stringify([content.title, content.content, content.createdAt ?? null]);
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
  /** Item 3.1 (D-4): the access level actually held, as `Access.toString()`
   *  (`Read` | `Edit` | `Admin`), so `grantReference` names it. */
  access?: string;
  /** Item 3.1 (S2 B-7): the document the check was evaluated for — on a
   *  block, the document that failed, so the log names it without the
   *  runner reconstructing it. */
  documentURI?: string;
}

/** The input a per-document gate check is evaluated for. */
export interface GateCheckInput {
  documentURI: string;
}

/** Gate check function: evaluates the Keyhive grant at act time, per input
 *  document (Item 3.1 / D-4: pass iff `access.isReader`). Injected so tests
 *  wire the real accessForDoc() check and the runner reuses the seam.
 *  Called once per input in fixed order; the first block stops the gate. */
export type GateCheckFn = (input: GateCheckInput) => Promise<GateCheckResult>;

/** Injected publish call. Item 1.1 instruments ordering; Item 1.2 wires
 *  the live @atproto/api putRecord(). Item 1.4: the minted intent record
 *  is passed to the fire step so the published payload can carry a
 *  seamCrossingRef derived from the authorizing intent itself (the
 *  payload cannot disagree with the intent). Zero-argument
 *  implementations remain assignable — the parameter is optional to
 *  consume. */
export type PutRecordFn = (
  intent?: CrossingIntentRecord,
) => Promise<{ uri: string; cid: string }>;

export type Clock = () => Date;

// ---------------------------------------------------------------------------
// Instrumentation — ordered event log (KL-1: write-before-fire gap)
// ---------------------------------------------------------------------------

export type CrossingEvent =
  | 'gate-check-started'
  | 'gate-check-pass'
  | 'gate-check-blocked'
  // Item 3.1 — assembly and digest check precede any assembly-document write
  | 'assembly-completed'
  | 'digest-check-pass'
  | 'digest-check-blocked'
  | 'assembly-document-written'
  // Item 3.2 — horizon step (3h) blocks; both precede any assembly write
  | 'grant-horizon-not-reached'
  | 'horizon-inconsistent'
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
  /** Null when no input carried a createdAt (D-5 rule). */
  createdAt: string | null;
  crossingRecords?: CrossingIntentRecord[];
}

/** A granted input document as the seam reads it (read-only surface). */
export interface CrossingInputHandle {
  doc(): Promise<CrossingSourceContent> | CrossingSourceContent;
  heads?(): string[] | undefined;
  url: string;
}

export interface InitiateCrossingParams {
  /** Item 3.1: the granted input documents, in fixed aggregation order.
   *  Each is gated (step 1) before any of them is read (step 2). ≥1. */
  inputs: CrossingInputHandle[];
  /** The assembly document handle (D-5): created and owned by the crossing
   *  actor before this call; the seam writes the assembled output to it
   *  (step 4) and hosts the crossing records there. Must expose change()
   *  and doc() in the automerge-repo handle shape. */
  handle: {
    change(fn: (d: CrossingDocShape) => void): void;
    doc(): Promise<CrossingDocShape> | CrossingDocShape;
    heads?(): string[] | undefined;
    url: string;
  };
  /** The content the caller presents for crossing — what will be published.
   *  Step 3 compares its digest, by hash equality, against the seam's own
   *  assembly from `inputs`; mismatch blocks with nothing written. */
  presentedContent: CrossingSourceContent;
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
  /** Item 3.2 (D-2): optional not-before horizon, ISO. Omit for none. */
  crossingGrantHorizon?: string;
  clock?: Clock;
  log?: CrossingLogEntry[];
}

export type CrossingOutcome =
  | { status: 'fired'; intent: CrossingIntentRecord; put: { uri: string; cid: string }; log: CrossingLogEntry[] }
  | { status: 'gate-blocked'; reason: string; log: CrossingLogEntry[] }
  | { status: 'digest-blocked'; reason: string; log: CrossingLogEntry[] }
  | { status: 'horizon-expired'; reason: string; log: CrossingLogEntry[] }
  // Item 3.2
  | { status: 'horizon-not-reached'; reason: string; log: CrossingLogEntry[] }
  | { status: 'horizon-inconsistent'; reason: string; log: CrossingLogEntry[] };

/**
 * Executes one governed crossing attempt under the write-before-fire
 * discipline. Order (CONVENTIONS v0.2 §Gate; brief v0.1.2 §3):
 *
 *   1. Access check, per input document, fixed order (D-4: `isReader`).
 *      Blocked → stop; NO assembly write, NO intent record; the block
 *      names the document.
 *   2. Assemble the content object from the granted inputs (D-3 / D-5).
 *   3. Digest check: authorizedContentDigest over the assembly vs. over the
 *      presented content, hash equality only. Mismatch → stop; nothing
 *      written (no orphan assembly document).
 *   3h. HORIZON STEP (Item 3.2, brief v0.1 §3 option B) — one fresh clock
 *      read; nothing written on any block:
 *        a. crossingGrantHorizon present but unparseable → seam fault (throw);
 *        b. crossingGrantHorizon ≥ crossingTimeoutHorizon → horizon-inconsistent (D-7);
 *        c. now < crossingGrantHorizon → horizon-not-reached (no record; D-2);
 *        d. now ≥ crossingTimeoutHorizon → horizon-expired (KL-8a; moved here
 *           from after the write — F-3.2-1).
 *   4. Write the assembled output to the assembly document; recompute the
 *      digest over the document's content object — inequality is a seam
 *      fault (thrown), not a gate block.
 *   5. (moved into 3h.d)
 *   6. Mint the intent record into the assembly document's crossingRecords
 *      (sourceDocumentURI/CID = assembly document; sourceLineage = inputs;
 *      crossingGrantHorizon carried when present).
 *   7. Read back; confirm present.
 *   8. Re-check the timeout horizon at fire; expired → do not fire.
 *   9. Fire putRecord(intent).
 */
export async function initiateCrossing(
  p: InitiateCrossingParams,
): Promise<CrossingOutcome> {
  const clock = p.clock ?? (() => new Date());
  const log = p.log ?? [];
  const stamp = (event: CrossingEvent, detail?: string) =>
    log.push({ event, at: clock().toISOString(), detail });

  if (p.inputs.length === 0) {
    throw new Error('initiateCrossing requires at least one input document (uniform assembly path)');
  }

  // 1 — access check, per input, fixed order; first block stops
  stamp('gate-check-started', `${p.inputs.length} input(s)`);
  const gates: GateCheckResult[] = [];
  for (const input of p.inputs) {
    const gate = await p.gateCheck({ documentURI: input.url });
    if (gate.result !== 'pass' || !gate.grantReference) {
      const failed = gate.documentURI ?? input.url;
      const reason = `${gate.reason ?? 'gate blocked'} [${failed}]`;
      stamp('gate-check-blocked', reason);
      return { status: 'gate-blocked', reason, log };
    }
    stamp('gate-check-pass', `${input.url} ${gate.access ?? ''}`.trim());
    gates.push(gate);
  }
  // grantReference on the record is the first input's (fixed order); every
  // input's reference and level is in the log above.
  const firstGate = gates[0];

  // 2 — assemble from the granted inputs (read only after all gates pass)
  const assemblyInputs: AssemblyInput[] = [];
  for (const input of p.inputs) {
    const content = await input.doc();
    assemblyInputs.push({
      documentURI: input.url,
      documentCID: input.heads?.()?.join(',') ?? 'heads-unavailable',
      content: { title: content.title, content: content.content, createdAt: content.createdAt },
    });
  }
  const assembled = assembleCrossingContent(assemblyInputs.map((i) => i.content));
  const assembledDigest = assembledContentDigest(assembled);
  stamp('assembly-completed', assembledDigest);

  // 3 — digest check: presented payload vs. the seam's own assembly (hash equality only)
  const presentedDigest = assembledContentDigest(p.presentedContent);
  if (presentedDigest !== assembledDigest) {
    const reason = `presented content digest ${presentedDigest} != assembled authorized digest ${assembledDigest}; no assembly document written, no intent record`;
    stamp('digest-check-blocked', reason);
    return { status: 'digest-blocked', reason, log };
  }
  stamp('digest-check-pass', assembledDigest);

  // 3h — horizon step: ONE fresh clock read for both horizons; nothing
  // written on any block; nothing retained between attempts (Item 3.2).
  const horizonMs = Date.parse(p.crossingTimeoutHorizon);
  const grantHorizon = p.crossingGrantHorizon;
  const now = clock();
  const nowMs = now.getTime();
  if (grantHorizon !== undefined) {
    if (grantHorizon === null || grantHorizon === '') {
      throw new Error('seam fault: crossingGrantHorizon present but empty; omit it for no not-before horizon');
    }
    const grantMs = Date.parse(grantHorizon);
    if (Number.isNaN(grantMs)) {
      throw new Error(`seam fault: crossingGrantHorizon is not a parseable ISO timestamp: ${grantHorizon}`);
    }
    if (Number.isNaN(horizonMs) || grantMs >= horizonMs) {
      const reason = `crossingGrantHorizon=${grantHorizon} is not before crossingTimeoutHorizon=${p.crossingTimeoutHorizon}; the request can never mint (D-7); no assembly write, no intent record`;
      stamp('horizon-inconsistent', reason);
      return { status: 'horizon-inconsistent', reason, log };
    }
    if (nowMs < grantMs) {
      const reason = `now=${now.toISOString()} < crossingGrantHorizon=${grantHorizon}; not yet authorized (D-2); no assembly write, no intent record`;
      stamp('grant-horizon-not-reached', reason);
      return { status: 'horizon-not-reached', reason, log };
    }
  }
  if (Number.isNaN(horizonMs) || nowMs >= horizonMs) {
    stamp('timeout-horizon-expired', `now=${now.toISOString()} >= crossingTimeoutHorizon=${p.crossingTimeoutHorizon}; expired at mint time; no assembly write, no intent record`);
    return {
      status: 'horizon-expired',
      reason: 'crossingTimeoutHorizon expired before intent record mint; new gate pass required (KL-8a)',
      log,
    };
  }

  // 4 — write the assembled output to the assembly document; recompute
  p.handle.change((d) => {
    d.title = assembled.title;
    d.content = assembled.content;
    d.createdAt = assembled.createdAt;
  });
  const docNow = await p.handle.doc();
  const writtenDigest = computeAuthorizedContentDigest(docNow);
  if (writtenDigest !== assembledDigest) {
    throw new Error(
      `seam fault: assembly document content digest ${writtenDigest} != assembled digest ${assembledDigest} after write`,
    );
  }
  stamp('assembly-document-written', writtenDigest);

  // 5 — (moved into the horizon step 3h — Item 3.2 / F-3.2-1)

  // 6 — mint + write the intent record into the assembly document
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
    authorizedContentDigest: writtenDigest,
    sourceLineage: buildSourceLineage(assemblyInputs),
    targetLexicon: 'com.whtwnd.blog.entry',
    targetPDS: p.targetPDS,
    crossingType: 'publication',
    regimeAcknowledgment: p.regimeAcknowledgment,
    declaredBoundType: 'exposure-unbounded',
    recallSemantics: 'propagated-request',
    crossingTimeoutHorizon: p.crossingTimeoutHorizon,
    // Item 3.2: spread so the key is OMITTED (never undefined/null) when absent
    ...(grantHorizon !== undefined ? { crossingGrantHorizon: grantHorizon } : {}),
    lineageAnchorType: 'author-declared',
    emittedAt: clock().toISOString(),
    grantReference: firstGate.grantReference!,
    gateResult: 'pass',
    gateCheckedAt: firstGate.gateCheckedAt,
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

  // 7 — confirm readable
  const readBack = await p.handle.doc();
  const found = (readBack.crossingRecords ?? []).some(
    (r) => r.recordType === 'crossing-intent' && r.emittedAt === intent.emittedAt,
  );
  if (!found) {
    throw new Error('write-before-fire violated: intent record not readable after write');
  }
  stamp('intent-record-read-confirmed');

  // 8 — horizon re-check at fire time
  if (clock().getTime() >= horizonMs) {
    stamp('timeout-horizon-expired', 'expired between mint and fire; putRecord not fired');
    return {
      status: 'horizon-expired',
      reason: 'crossingTimeoutHorizon expired before putRecord(); crossing reads crossing-unconfirmed at horizon elapse',
      log,
    };
  }

  // 9 — fire (the minted intent travels with the fire — Item 1.4)
  stamp('put-record-fired');
  const put = await p.putRecord(intent);
  stamp('put-record-accepted', put.cid);

  return { status: 'fired', intent, put, log };
}
