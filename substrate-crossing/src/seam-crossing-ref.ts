/**
 * PC#8 — Substrate-Crossing Seam — Item 1.4
 * seamCrossingRef: the back-pointer carried on the published
 * com.whtwnd.blog.entry record, referencing the governed Automerge
 * document from the AT Protocol side (KL-2 setup).
 *
 * Governing docs:
 *   pc08-build-plan-v0-1_2026-08-17.md (§2 Item 1.4)
 *   pattern-commons-08-substrate-crossing-seam-v0-1-3_2026-08-17.md
 *     (asymmetric bridge: "optional if the target app schema supports it,
 *      and never load-bearing"; KL-2; KL-8b no-supersession)
 *   session-record-pc08-phase1-item1-3_2026-08-18.md (decision 1:
 *     intent records are content-addressed, not CID'd)
 *
 * Field mapping vs. the build-plan sketch (design judgment, recorded at
 * the Item 1.4 session):
 *   sourceDocumentURI  — carried verbatim from the intent record.
 *   sourceDocumentCID  — carried verbatim (document heads at mint; the
 *                        backdating-detectability anchor).
 *   crossingIntentRef  — implements the sketch's "crossingIntentCID":
 *                        Automerge assigns no per-record CID, so this is
 *                        the intent record's `intent-sha256:` content
 *                        address (Item 1.3 decision 1), under the SAME
 *                        field name the completion record uses — a party
 *                        holding both the published record and the
 *                        document can match them by name and value.
 *   authorizedContentDigest — carried verbatim (CP-F11 content binding):
 *                        what the grant authorized, checkable against
 *                        what crossed.
 *
 * Architectural posture: the back-pointer is derived ONLY from the
 * authorizing intent record — it cannot disagree with the intent. It is
 * optional and never load-bearing: no governance claim rides on its
 * presence, no crossing-log event is minted for it, and its absence
 * (target schema refuses unknown fields; AppView drops it) degrades
 * nothing on the governed side. Whether it survives PDS storage and
 * AppView consumption is precisely the KL-2 question (Phase 2 Item 2.1).
 */

import type { CrossingIntentRecord } from './crossing-intent.js';
import { computeIntentRecordRef } from './crossing-completion.js';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface SeamCrossingRef {
  /** automerge: URL of the governed source document. */
  sourceDocumentURI: string;
  /** Document heads at intent mint (comma-joined), or 'heads-unavailable'. */
  sourceDocumentCID: string;
  /** Content address of the authorizing intent record
   *  (`intent-sha256:<hex>`; recomputable by any party holding the
   *  document — tamper-evident). */
  crossingIntentRef: string;
  /** SHA-256 of the authorized content snapshot (CP-F11). */
  authorizedContentDigest: string;
}

export const SEAM_CROSSING_REF_FIELDS: (keyof SeamCrossingRef)[] = [
  'sourceDocumentURI',
  'sourceDocumentCID',
  'crossingIntentRef',
  'authorizedContentDigest',
];

// ---------------------------------------------------------------------------
// Build — single provenance source: the intent record
// ---------------------------------------------------------------------------

/** Derives the back-pointer from the authorizing intent record. Every
 *  field is a verbatim carry or a deterministic recomputation — there is
 *  no second source the ref could disagree with. */
export function buildSeamCrossingRef(
  intent: CrossingIntentRecord,
): SeamCrossingRef {
  return {
    sourceDocumentURI: intent.sourceDocumentURI,
    sourceDocumentCID: intent.sourceDocumentCID,
    crossingIntentRef: computeIntentRecordRef(intent),
    authorizedContentDigest: intent.authorizedContentDigest,
  };
}

// ---------------------------------------------------------------------------
// Validation — shape/presence (schema conformance)
// ---------------------------------------------------------------------------

export interface SeamRefValidationResult {
  valid: boolean;
  errors: string[];
}

const HEX64 = /^[0-9a-f]{64}$/;

export function validateSeamCrossingRef(
  ref: Partial<SeamCrossingRef>,
): SeamRefValidationResult {
  const errors: string[] = [];
  for (const f of SEAM_CROSSING_REF_FIELDS) {
    const v = ref[f];
    if (v === undefined || v === null || v === '') {
      errors.push(`missing or null required field: ${f}`);
    }
  }
  if (
    typeof ref.sourceDocumentURI === 'string' &&
    ref.sourceDocumentURI !== '' &&
    !ref.sourceDocumentURI.startsWith('automerge:')
  ) {
    errors.push(
      `sourceDocumentURI must be an automerge: URL, got '${ref.sourceDocumentURI}'`,
    );
  }
  if (typeof ref.crossingIntentRef === 'string' && ref.crossingIntentRef !== '') {
    const m = ref.crossingIntentRef.match(/^intent-sha256:([0-9a-f]+)$/);
    if (!m || !HEX64.test(m[1])) {
      errors.push(
        `crossingIntentRef must be 'intent-sha256:<64 hex>', got '${ref.crossingIntentRef}'`,
      );
    }
  }
  if (
    typeof ref.authorizedContentDigest === 'string' &&
    ref.authorizedContentDigest !== '' &&
    !HEX64.test(ref.authorizedContentDigest)
  ) {
    errors.push(
      `authorizedContentDigest must be 64 hex chars (sha256), got '${ref.authorizedContentDigest}'`,
    );
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Verification — the digest-match / tamper-evidence check
// ---------------------------------------------------------------------------

/** Checks a seamCrossingRef against the intent record it claims to point
 *  to: the content address must recompute and the carried fields must
 *  match verbatim. This is the deferred-party check run from the AT
 *  Protocol side back toward the governed document (KL-2 traversal
 *  direction) — no verification claim beyond field agreement is made
 *  (Q6 lock: lineage anchoring remains author-declared). */
export function verifySeamCrossingRefAgainstIntent(
  ref: SeamCrossingRef,
  intent: CrossingIntentRecord,
): SeamRefValidationResult {
  const errors: string[] = [];
  const expectedRef = computeIntentRecordRef(intent);
  if (ref.crossingIntentRef !== expectedRef) {
    errors.push(
      `crossingIntentRef does not recompute from the intent record: ref carries ${ref.crossingIntentRef}, intent computes ${expectedRef}`,
    );
  }
  if (ref.sourceDocumentURI !== intent.sourceDocumentURI) {
    errors.push('sourceDocumentURI does not match the intent record');
  }
  if (ref.sourceDocumentCID !== intent.sourceDocumentCID) {
    errors.push('sourceDocumentCID does not match the intent record');
  }
  if (ref.authorizedContentDigest !== intent.authorizedContentDigest) {
    errors.push(
      'authorizedContentDigest does not match the intent record (content-binding mismatch: what crossed is not what was authorized)',
    );
  }
  return { valid: errors.length === 0, errors };
}
