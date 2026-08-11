/**
 * Form C — P13 D2-C5: Fork lineage record convention
 *
 * Session: P13 D2 build session (D2-C1/C3/C6/C5)
 * Date: 2026-08-10
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 *
 * Governing doc: form-c-p13-d2-schema-spec_2026-08-10.md §4
 *
 * D2-C5 is a USAGE CONVENTION on existing chainReference fields. It is NOT
 * a new record type, requires NO new IRI, adds NO new controlled vocabulary
 * values, and defines NO new SHACL shape. It specifies how a successor-seam
 * formation record links to its predecessor's record set when a party
 * exercises a fork:
 *
 *   - chainReference: URI of the prior seam's formation record (or last
 *     operative record). Existing lineage anchoring field; existing
 *     semantics.
 *   - chainDepth: incremented from the prior seam's chainDepth (or 1 if
 *     first fork). Existing field; existing semantics.
 *   - lineageAnchorType: 'author-declared' under the Q6 default. No new
 *     value.
 *
 * Successor-seam standing registry (D2-C1 in the successor seam): the
 * successor seam's first StandingRegistryEntry records SHOULD carry a
 * membershipBasis noting the fork origin (e.g., "successor seam formed by
 * fork from [prior seam IRI] — substitutable population"). This is a D2-C1
 * record in the successor seam, not a modification to D2-C5.
 *
 * HARD SCOPE CONDITION (SL-0060 — carried verbatim, spec §4.1):
 * D2-C5 is ADMISSIBLE for SUBSTITUTABLE POPULATIONS ONLY. The employment
 * seam is a locked-in seam; T11 is a confirmed non-answer for the
 * architecture's own worked example. D2-C5 MUST NOT be applied as a
 * governance mechanism in seams where parties cannot substitute their
 * counterparty at tolerable cost. This is a HARD DESIGN-TIME CONSTRAINT,
 * not a softened Known Limit. The architecture cannot enforce it at the
 * schema level; isForkLineageAdmissible() below is a design-time review
 * aid, not a runtime schema validation and not a gate.
 *
 * KNOWN LIMITS (spec §4.6 — named, not solved):
 *   - E1-class empirical validation required before publication-track use.
 *     The governance value of fork lineage (selection-by-crossing produces
 *     substitutable populations, SL-0060) is a structural theoretical claim
 *     without empirical backing. Do not use as evidence in governance
 *     proceedings without E1 validation.
 *   - Hard scope condition: locked-in seams. Employment seam explicitly
 *     outside D2-C5's reach. Any deployment must establish substitutability
 *     before applying D2-C5 as a governance mechanism.
 *
 * Q6 LOCK: In force. lineageAnchorType 'author-declared' only. Nothing here
 * touches or unlocks Q6.
 * NI-5: Local-first specific on current evidence.
 * Form C cluster PROPOSED per UFO Lexicon v1.5.
 */

import type { URI } from './p13-record-types';

// ---------------------------------------------------------------------------
// Scope condition (design-time review — SL-0060, carried verbatim)
// ---------------------------------------------------------------------------

/** The D2-C5 hard scope condition, exported for design-time review use and
 *  documentation surfaces. Carried verbatim from SL-0060 / spec §4.1. */
export const D2C5_SCOPE_CONDITION =
  'D2-C5 is ADMISSIBLE for substitutable populations only. The employment ' +
  'seam is a locked-in seam; T11 is a confirmed non-answer for the ' +
  "architecture's own worked example. D2-C5 MUST NOT be applied as a " +
  'governance mechanism in seams where parties cannot substitute their ' +
  'counterparty at tolerable cost. Hard design-time constraint (SL-0060).';

/** Design-time seam context for the scope review. The architecture cannot
 *  verify substitutability; the reviewing party declares it. */
export interface ForkLineageSeamContext {
  /** Whether parties in this seam can substitute their counterparty at
   *  tolerable cost. The employment seam: false (locked-in). */
  substitutablePopulation: boolean;
}

/**
 * Design-time review aid for the D2-C5 hard scope condition. Returns
 * whether applying D2-C5 AS A GOVERNANCE MECHANISM is in scope for the
 * declared seam context.
 *
 * NOT a runtime schema validation. NOT a gate. The chainReference fields
 * remain valid CrossingRecord fields regardless; what is out of scope for
 * locked-in seams is treating fork lineage as a governance mechanism.
 */
export function isForkLineageAdmissible(context: ForkLineageSeamContext): boolean {
  return context.substitutablePopulation === true;
}

// ---------------------------------------------------------------------------
// Derivation logic — traceLineage() (spec §4.3)
// ---------------------------------------------------------------------------

/** Minimal structural shape traceLineage() requires. Any record carrying
 *  the CrossingRecord identity + lineage anchoring fields (crossingRecord.ts
 *  base, p13-record-types.ts records, formation records) satisfies it. */
export interface LineageTraceable {
  recordId: URI;
  chainReference?: URI;
}

/**
 * traceLineage — convention utility, NOT a governance gate (spec §4.3).
 *
 * Walks chainReference links backward from the given record through the
 * locally-held record set, returning the chain in order (earliest first,
 * given record last).
 *
 * TERMINATES AT THE LOCALLY-HELD BOUNDARY: if a chainReference points to a
 * recordId not present in the record set, traversal stops without error.
 * No network call; no act-time liveness dependency. Cycle-safe: a repeated
 * recordId terminates traversal (defensive; well-formed chains are acyclic).
 */
export function traceLineage<T extends LineageTraceable>(
  record: T,
  recordSet: T[]
): T[] {
  const chain: T[] = [record];
  const seen = new Set<URI>([record.recordId]);
  let current: T = record;

  while (current.chainReference) {
    const ref: URI = current.chainReference;
    const prior = recordSet.find((r) => r.recordId === ref);
    if (!prior) break; // terminates at locally-held boundary
    if (seen.has(prior.recordId)) break; // cycle guard (defensive)
    seen.add(prior.recordId);
    chain.unshift(prior);
    current = prior;
  }

  return chain;
}
