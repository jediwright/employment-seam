/**
 * Form C — P13 v1 Evidence-Plane Record Types
 *
 * Session: OI-P13-1 — P13 v1 evidence-plane build session
 * Date: 2026-08-09
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 *
 * All four types extend seam:CrossingRecord base shape (Item 2).
 * Namespace: https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#
 *
 * Design constraints satisfied:
 *   - CR-1–CR-5 / C1–C5: record types are evidence-plane only; no gate reads
 *     contest state (enforced by containment canary test)
 *   - Finality-arbiter-free: all records author-declared anchored (Q6 default);
 *     no coordination required at emission time
 *   - Non-blocking: status fields are derived over the record set; ObjectionRecord
 *     does not block any gate
 *   - Set-union-mergeable: all records are append-only; union of any two record
 *     sets is deterministic
 *   - Q6 lock: lineageAnchorType = 'author-declared' throughout; witness variants
 *     named as locked (not implemented)
 *
 * NI-5: Local-first specific on current evidence.
 * Form C cluster PROPOSED per UFO Lexicon v1.4.
 *
 * D2-C6 EXTENSION (P13 D2 build session, 2026-08-10): deriveAmendmentStatus
 * accepts an optional delegationRecords parameter (spec §5.6). The
 * DelegationRecord type and hasDelegatedConsent() live in
 * p13-d2c6-delegation-record.ts; that module imports only TYPES from this
 * one, so the runtime import graph stays acyclic.
 */

import {
  hasDelegatedConsent,
  type DelegationRecord,
} from './p13-d2c6-delegation-record';
export type { DelegationRecord };

import {
  type ThresholdDerivationContext,
  CONSTITUTIONAL_TERM_KEYS,
  isThresholdMet,
} from './p13-d2c2-threshold-rules';

// ---------------------------------------------------------------------------
// Base types (re-exported from Item 2 base shape — not repeated, inherited)
// These are the Item 2 CrossingRecord base fields all four types carry.
// ---------------------------------------------------------------------------

/** DID string — author-declared identity per Q6 default. */
export type DID = string;

/** URI string — globally addressable IRI. */
export type URI = string;

/** ISO 8601 datetime string. */
export type ISODateTime = string;

/**
 * Base seam:CrossingRecord shape (Item 2 §2).
 * All four P13 record types extend this shape.
 * Fields match the Item 2 definition exactly; no amendments here.
 */
export interface CrossingRecordBase {
  // Identity group
  recordId: URI;
  recordType: CrossingRecordType;
  emittedAt: ISODateTime;
  emittedBy: DID;

  // Provenance linkage group
  provenanceStatus: ProvenanceStatus;
  provenanceStatusBasis?: string;       // Required when provenanceStatus ≠ 'asserted'
  supersededBy?: URI;                    // Required when provenanceStatus === 'superseded'

  // Lineage anchoring group (conditional — required when chainReference is present)
  chainReference?: URI;
  chainDepth?: number;
  lineageAnchorType?: LineageAnchorType;

  // Evidence scope group
  governanceEvent: GovernanceEvent;
  boundType: BoundType;
  evidenceDecay?: string;                // ISO 8601 date
}

// ---------------------------------------------------------------------------
// Controlled vocabularies (Item 2 + P13 extensions)
// ---------------------------------------------------------------------------

/** Existing recordType values (Item 2 §2.1) + P13 additions */
export type CrossingRecordType =
  | 'gate-check'      // existing
  | 'lineage'         // existing
  | 'provenance'      // existing
  | 'verification'    // existing
  | 'term-amendment'  // NEW — SeamTermAmendmentRecord
  | 'objection'       // NEW — ObjectionRecord
  | 'consent'         // NEW — ConsentRecord
  | 'resolution';     // NEW — ResolutionRecord

/** provenanceStatus (Item 2 §2.2) */
export type ProvenanceStatus =
  | 'asserted'
  | 'confirmed'
  | 'contested'
  | 'superseded';

/**
 * lineageAnchorType (Item 2 §2.3, Q6 default).
 * author-declared is the only currently permitted value.
 * witness-signed and timestamp-signed are LOCKED pending infrastructure.
 */
export type LineageAnchorType =
  | 'author-declared'
  | 'witness-signed'    // LOCKED — pending Q6 resolution
  | 'timestamp-signed'; // LOCKED — pending Q6 resolution

/** governanceEvent (Item 2 §2.4) + P13 additions */
export type GovernanceEvent =
  | 'gate-check'                    // existing
  | 'schema-change'                 // existing
  | 'action-provenance'             // existing
  | 'code-change-verification'      // existing
  | 'term-amendment-proposal'       // NEW
  | 'term-amendment-objection'      // NEW
  | 'term-amendment-consent'        // NEW
  | 'term-amendment-resolution';    // NEW

/** boundType (Item 2 §2.4) — all four P13 types use exposure-upper-bound */
export type BoundType =
  | 'exposure-upper-bound'
  | 'confirmation'
  | 'attestation';

/**
 * AmendmentStatus — derived field on SeamTermAmendmentRecord.
 *
 * DESIGN NOTE: This enum describes the derived STATE of an amendment,
 * computed from the full record set. It is NOT stored in the record
 * itself as a mutable field. It is returned by derivation functions
 * (deriveAmendmentStatus) only.
 *
 * Gate containment: no gate may read this status. The canary test
 * enforces this structurally by verifying that the gate function
 * does not import or call any derivation function.
 *
 * Status derivation rules (all pure functions of the record set):
 *   - operative: all grant-chain parties have an unrevoked ConsentRecord
 *                for this amendmentId; no ObjectionRecord can change this
 *                (non-blocking objection model)
 *   - contested: ≥1 ObjectionRecord references this amendmentId
 *   - lapsed: no ConsentRecord or ObjectionRecord for a defined interval
 *             after proposal timestamp (inverted T4 — evidence-plane hygiene)
 *   - proposed: initial state; none of the above conditions met
 */
export type AmendmentStatus =
  | 'proposed'
  | 'operative'
  | 'contested'
  | 'lapsed';

// ---------------------------------------------------------------------------
// 1. SeamTermAmendmentRecord
// ---------------------------------------------------------------------------

/**
 * SeamTermAmendmentRecord — append-only, party-attributed, author-declared anchored.
 *
 * Proposes an amendment to a named term in the seam's governance vocabulary.
 * Status is DERIVED from the record set (see AmendmentStatus); it is not
 * stored in this record.
 *
 * D1 grounding:
 *   - Party-attributed + author-declared anchoring: same move as ObjectionRecord,
 *     clears Q6. No witness machinery required.
 *   - effectiveIfOperative boolean: gates the amendment's application on the
 *     derivation rule (all unrevoked ConsentsPresent); architecture specifies the
 *     interface, not the outcome.
 *   - chainReference: optional; links to the prior operative amendment for
 *     this termKey (amendment chain). Enables chain traversal for term history.
 */
export interface SeamTermAmendmentRecord extends CrossingRecordBase {
  recordType: 'term-amendment';
  governanceEvent: 'term-amendment-proposal';
  boundType: 'exposure-upper-bound';
  lineageAnchorType: 'author-declared';

  // P13-specific fields
  amendmentId: URI;          // Globally addressable amendment identifier
  proposedBy: DID;           // The party proposing this amendment
  termKey: string;           // The governed term being amended
  proposedValue: string;     // The proposed new value for the term
  effectiveIfOperative: boolean; // If true, amendment applies when status = operative
  chainReference?: URI;      // Prior operative amendment for this termKey (chain link)
}

// ---------------------------------------------------------------------------
// 2. ObjectionRecord
// ---------------------------------------------------------------------------

/**
 * ObjectionRecord — append-only, party-attributed, author-declared anchored.
 *
 * Records a party's objection to a proposed amendment.
 *
 * NON-BLOCKING DESIGN: The presence of an ObjectionRecord marks the referenced
 * amendment as 'contested' in the derived status. It does NOT block any gate.
 * Gates never read contest state. The canary test enforces this.
 *
 * D1 grounding:
 *   - provenanceStatus:contested on the referenced amendment is a DERIVED state;
 *     this record is the evidence that triggers the derivation.
 *   - objectorStanding: the party's declared basis for having standing to object.
 *     Author-declared per Q6. The architecture records the claim; dispute
 *     resolution evaluates it.
 *   - No chainReference required (objections are not chained to each other);
 *     amendmentRef provides the cross-record link.
 */
export interface ObjectionRecord extends CrossingRecordBase {
  recordType: 'objection';
  governanceEvent: 'term-amendment-objection';
  boundType: 'exposure-upper-bound';
  lineageAnchorType: 'author-declared';

  // P13-specific fields
  objectionId: URI;          // Globally addressable objection identifier
  objector: DID;             // The party recording the objection
  objectorStanding: string;  // Author-declared basis for standing (free-text)
  amendmentRef: URI;         // Reference to the SeamTermAmendmentRecord being objected to
  basis: string;             // Free-text description of the objection
}

// ---------------------------------------------------------------------------
// 3. ConsentRecord (T7 — new, confirmed by D1)
// ---------------------------------------------------------------------------

/**
 * ConsentRecord — append-only, party-attributed, author-declared anchored.
 * Structurally parallel to ObjectionRecord.
 *
 * Records a grant-chain party's consent to a proposed amendment.
 *
 * DERIVATION RULE: An amendment is operative iff all grant-chain parties
 * have an unrevoked ConsentRecord for that amendmentId. If any ConsentRecord
 * is absent (not yet emitted) or revoked (supersededBy set), the amendment
 * remains in status quo ante (not operative). This derivation is a pure
 * function of the record set; no coordinator is required.
 *
 * REVOCATION: A ConsentRecord is revoked by superseding it — emitting a new
 * CrossingRecord with provenanceStatus:'superseded' referencing the original
 * consentId. The derivation function checks for active (unrevoked) consents only.
 *
 * SET-UNION-MERGEABILITY: Two partitioned peers each holding different subsets
 * of ConsentRecords converge on the union when the partition heals. The
 * derivation over the union is deterministic.
 *
 * D1 grounding (T7): bilateral case — all grant-chain parties' unrevoked consent
 * present → operative; any absent or revoked → status quo ante.
 */
export interface ConsentRecord extends CrossingRecordBase {
  recordType: 'consent';
  governanceEvent: 'term-amendment-consent';
  boundType: 'exposure-upper-bound';
  lineageAnchorType: 'author-declared';

  // P13-specific fields
  consentId: URI;            // Globally addressable consent identifier
  consentingParty: DID;      // The grant-chain party consenting
  amendmentRef: URI;         // Reference to the SeamTermAmendmentRecord being consented to
  // chainReference (inherited from base): optional link to formation-time seam record
  //   establishing this party's grant-chain membership
}

// ---------------------------------------------------------------------------
// 4. ResolutionRecord (T5/T3/T10 — new, confirmed by D1)
// ---------------------------------------------------------------------------

/**
 * ResolutionRecord — append-only, author-declared anchored.
 *
 * Records the outcome of an external resolution process for a contested amendment.
 * The architecture specifies the INTERFACE (this shape + capability check);
 * it does not designate a particular forum or institution (Test 4 / NI-5 parallel).
 *
 * CAPABILITY REQUIREMENT (T5/T10): A ResolutionRecord is only valid if authored
 * by a party with formation-time-consented capability to issue resolutions for
 * this seam. Capability assignment must be consented by ALL grant-chain parties
 * at seam formation (not unilateral designation). This is the architecture's sole
 * residual obligation toward resolution; it prevents the employer's systems from
 * being the de facto arbiter.
 *
 * FOUR-TEST COMPLIANCE (T10):
 *   1. No crossing-time liveness dependency: arrives as ordinary propagated record
 *   2. Formation-time consent: issuer capability is formation-time-consented
 *   3. Fail-safe absence: absent ResolutionRecord → amendment stays contested;
 *      no gate blocked; architecture functions correctly without it
 *   4. Substitutability: architecture specifies record shape + capability check;
 *      does not designate a particular provider
 *
 * NOT IN SCOPE: Designation of a specific forum or institution.
 * NOT IN SCOPE: n≥3 multi-party derivation rules (E1 gated, D2/D3 program).
 */
export interface ResolutionRecord extends CrossingRecordBase {
  recordType: 'resolution';
  governanceEvent: 'term-amendment-resolution';
  boundType: 'exposure-upper-bound';
  lineageAnchorType: 'author-declared';

  // P13-specific fields
  resolutionId: URI;         // Globally addressable resolution identifier
  author: DID;               // The resolving party (must have formation-time-consented capability)
  amendmentRef: URI;         // Reference to the SeamTermAmendmentRecord being resolved
  outcome: ResolutionOutcome; // The resolution outcome
  // Note: the architecture does not store capability proof in this record;
  // capability verification is performed by the accepting gate at the architecture
  // layer. See ResolutionCapabilityRegistry below.
}

/** Outcome values for ResolutionRecord */
export type ResolutionOutcome =
  | 'accepted'   // Resolution declares the amendment should be operative
  | 'rejected'   // Resolution declares the amendment should not be operative
  | 'withdrawn'; // The proposing party withdraws the amendment

// ---------------------------------------------------------------------------
// 5. Schema additions
// ---------------------------------------------------------------------------

/**
 * LAPSED STATUS DERIVATION (inverted T4)
 *
 * An amendment record with no ConsentRecord or ObjectionRecord after a
 * defined interval reads as `lapsed`. This is a pure derivation over the
 * record set — not a decision mechanism. No gate reads lapsed status.
 *
 * The interval is configurable per seam at formation time.
 */
export const DEFAULT_LAPSE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * MEET-OF-CANDIDATES (T12)
 *
 * For term types with a natural lattice, the operative value is the meet
 * (greatest lower bound) of all candidates with unrevoked consent.
 *
 * termOrder: a field that declares whether a term type supports lattice
 * ordering, and in what direction. Only applicable when the term domain
 * has a natural partial order (e.g., permission levels, access tiers).
 *
 * At prototype scale (bilateral, one term domain), the meet-of-candidates
 * derivation degenerates to: the operative value is the proposed value iff
 * all parties consent. The full lattice derivation requires n≥2 candidates
 * with a defined ordering — not present at current prototype scale.
 *
 * FEASIBILITY ASSESSMENT: The termOrder field is included in the schema as
 * a design placeholder. Full lattice derivation is gated on a richer term
 * structure than the current prototype demonstrates. The field is optional;
 * absence means the term does not support lattice ordering.
 */
export type TermOrderDirection = 'ascending' | 'descending' | 'none';

// ---------------------------------------------------------------------------
// Derivation functions (evidence-plane — no gate access)
// ---------------------------------------------------------------------------

/**
 * P13 record set — the full collection of P13 governance records for a seam.
 * Set-union-mergeable: merging two record sets is deterministic and commutative.
 */
export interface P13RecordSet {
  amendments: SeamTermAmendmentRecord[];
  objections: ObjectionRecord[];
  consents: ConsentRecord[];
  resolutions: ResolutionRecord[];
}

/**
 * Grant-chain party list for a seam.
 * At bilateral prototype scale: exactly two parties (worker DID + one counterparty DID).
 * At n≥3 scale: all parties with formation-time grant positions.
 */
export type GrantChain = DID[];

/**
 * Derive the current status of an amendment from the record set.
 *
 * PURE FUNCTION — no side effects. Takes the record set as input; returns
 * the derived status. Does not modify any record.
 *
 * STATUS DERIVATION ORDER (precedence):
 *   1. operative: all grant-chain parties have active (unrevoked) ConsentRecords
 *      for this amendmentId. Objections are non-blocking; operative overrides contested.
 *   2. lapsed: no consent AND no objection within the lapse interval
 *   3. contested: ≥1 active ObjectionRecord references this amendmentId
 *   4. proposed: none of the above
 *
 * NOTE ON CONTESTED + OPERATIVE: Under the non-blocking objection model,
 * an amendment can be both contested AND operative (all consents present, but
 * also ≥1 objection). The derivation returns 'operative' in this case — the
 * objection is recorded evidence, not a veto. This is the design intent from
 * the scoping note §3.2 and the D1 T7 confirmation.
 *
 * D2-C6 SIGNATURE EXTENSION (P13 D2 build session, 2026-08-10; spec §5.6):
 * The optional `delegationRecords` parameter (position 5 — additive;
 * existing call sites unchanged) composes DelegationRecord (D2-C6) with the
 * consent derivation. Before marking a grant-chain party's consent slot as
 * unfilled, the derivation calls hasDelegatedConsent(): a consent authored
 * by a party's active delegatee for this amendmentRef is treated as
 * equivalent to a consent authored by the party (the delegatee acts with
 * the grantor's authority on the consent surface). Default [] — the
 * derivation without delegations is byte-identical to the OI-P13-1
 * behavior. No 'contested' derivation for delegation (D3 constraint 5):
 * an absent or superseded delegation simply contributes no effect.
 *
 * D2-C2 SIGNATURE EXTENSION (P13 D2-C2 build session, 2026-08-10; spec §2.4.4):
 * The optional `thresholdContext` parameter (position 6 — additive; all
 * existing call sites unchanged) composes ThresholdRule (D2-C2) with the
 * operative-clause derivation. When present, it REPLACES the operative
 * predicate: operativity is derived by isThresholdMet() over the closed
 * standing set, not by T7 all-grant-chain unanimity.
 *
 * Constitutional carve-out (spec §2.4.7): amendments whose termKey is in
 * CONSTITUTIONAL_TERM_KEYS ('standing-registry', 'threshold-rule') ALWAYS
 * derive under T7 unanimity even when thresholdContext is supplied — the
 * closed set that legitimates counting must not itself be modifiable by
 * counting. The threshold path is skipped for these termKeys.
 *
 * All other branches (lapsed, contested, proposed) and the Lexicon-registered
 * AmendmentStatus precedence order are untouched.
 *
 * Default undefined → existing T7 derivation runs unchanged → 161-test base
 * intact by construction.
 *
 * DISSENT-VISIBLE OPERATIVITY (Known Limit 2): under any non-unanimous rule,
 * an amendment can derive 'operative' while an active ObjectionRecord exists.
 * Precedence checks 'operative' first (Lexicon-registered order). The
 * objection is carried as evidence for institutional-layer proceedings; it is
 * not erased and does not block. Parties consenting to a threshold rule at
 * formation consent to exactly this property.
 */
export function deriveAmendmentStatus(
  amendmentId: URI,
  grantChain: GrantChain,
  recordSet: P13RecordSet,
  lapseIntervalMs: number = DEFAULT_LAPSE_INTERVAL_MS,
  delegationRecords: DelegationRecord[] = [],
  thresholdContext?: ThresholdDerivationContext
): AmendmentStatus {
  const amendment = recordSet.amendments.find(a => a.amendmentId === amendmentId);
  if (!amendment) {
    throw new Error(`Amendment ${amendmentId} not found in record set`);
  }

  // D2-C2: Threshold operative branch — replaces the T7 all-grant-chain check
  // when a ThresholdDerivationContext is supplied AND the amendment's termKey
  // is not in CONSTITUTIONAL_TERM_KEYS.
  //
  // Constitutional carve-out (spec §2.4.7): 'standing-registry' and
  // 'threshold-rule' termKeys always derive under T7 unanimity — skipped here
  // and handled by the T7 block below.
  if (
    thresholdContext !== undefined &&
    !CONSTITUTIONAL_TERM_KEYS.includes(
      amendment.termKey as (typeof CONSTITUTIONAL_TERM_KEYS)[number]
    )
  ) {
    // D2-C2 threshold operative branch (spec §2.4.2, §2.4.4).
    //
    // isThresholdMet() is the canonical predicate, imported directly from
    // p13-d2c2-threshold-rules.ts. The runtime import graph remains acyclic:
    // that module imports only TYPES from this file (erased at compile), so
    // the runtime edges are record-types → threshold-rules → d2c6-delegation
    // with no cycle. (Confirmed empirically in the 2026-08-10 pre-push
    // review: direct import + call, 188/188 passing, tsc clean.)
    if (
      isThresholdMet(
        amendmentId,
        recordSet,
        thresholdContext.standingRegistry,
        thresholdContext.rule,
        delegationRecords
      )
    ) {
      return 'operative';
    }
    // Threshold not met (or empty counted set): fall through to
    // lapsed/contested/proposed. T7 unanimity below is intentionally
    // skipped — the threshold rule IS the operative predicate
    // (replacement, not layering; spec §2.4.4).
  } else {
    // T7 unanimity: all grant-chain parties have active (unrevoked) consent.
    // This branch runs when:
    //   (a) no thresholdContext supplied (default T7 behavior), OR
    //   (b) thresholdContext supplied but amendment.termKey is constitutional
    //       (carve-out: constitutional amendments always derive under T7).
    const activeConsentsForAmendment = recordSet.consents.filter(
      c => c.amendmentRef === amendmentId && c.provenanceStatus !== 'superseded'
    );
    const consentingParties = new Set(activeConsentsForAmendment.map(c => c.consentingParty));
    const allPartiesConsented = grantChain.every(
      party =>
        consentingParties.has(party) ||
        // D2-C6: a consent authored by the party's active delegatee fills the slot
        activeConsentsForAmendment.some(c =>
          hasDelegatedConsent(party, c.consentingParty, delegationRecords)
        )
    );

    if (allPartiesConsented && grantChain.length > 0) {
      return 'operative';
    }
  }

  // Check lapsed: no consent AND no objection within the lapse interval
  const proposalTime = new Date(amendment.emittedAt).getTime();
  const now = Date.now();
  const hasAnyConsent = recordSet.consents.some(c => c.amendmentRef === amendmentId);
  const hasAnyObjection = recordSet.objections.some(o => o.amendmentRef === amendmentId);

  if (!hasAnyConsent && !hasAnyObjection && (now - proposalTime) > lapseIntervalMs) {
    return 'lapsed';
  }

  // Check contested: ≥1 active objection references this amendmentId
  const hasActiveObjection = recordSet.objections.some(
    o => o.amendmentRef === amendmentId && o.provenanceStatus !== 'superseded'
  );

  if (hasActiveObjection) {
    return 'contested';
  }

  return 'proposed';
}

/**
 * Compute the meet-of-candidates for amendments with an ordered term type.
 *
 * Returns the most restrictive value among all operative amendments for the
 * given termKey, according to the provided ordering function.
 *
 * FEASIBILITY NOTE: At bilateral prototype scale, this degenerates to: the
 * operative value is the proposed value of the single operative amendment.
 * This function is included for completeness; full lattice behavior requires
 * multiple candidates.
 */
export function meetOfCandidates(
  termKey: string,
  grantChain: GrantChain,
  recordSet: P13RecordSet,
  compareValues: (a: string, b: string) => number,
  lapseIntervalMs: number = DEFAULT_LAPSE_INTERVAL_MS
): string | null {
  const operativeAmendments = recordSet.amendments
    .filter(a => a.termKey === termKey)
    .filter(a =>
      deriveAmendmentStatus(a.amendmentId, grantChain, recordSet, lapseIntervalMs) === 'operative'
    );

  if (operativeAmendments.length === 0) return null;

  // Meet = most restrictive (minimum under the ordering)
  return operativeAmendments.reduce((meet, a) =>
    compareValues(a.proposedValue, meet.proposedValue) < 0 ? a : meet
  ).proposedValue;
}

// ---------------------------------------------------------------------------
// Capability registry (ResolutionRecord admissibility)
// ---------------------------------------------------------------------------

/**
 * ResolutionCapabilityRegistry — formation-time-consented resolution capability.
 *
 * Records which parties have formation-time-consented capability to issue
 * ResolutionRecords for a seam. This registry is populated at seam formation
 * and requires ALL grant-chain parties' consent for any entry.
 *
 * The registry is the architecture's enforcement point for the T10 Test 2
 * requirement (formation-time consent). It does not designate a particular
 * institution; it records the parties' own formation-time agreement.
 *
 * In the current prototype (bilateral, no formation-time ritual implemented),
 * this registry may be empty. The ResolutionRecord capability test in the
 * test suite validates the admissibility check itself; the formation ritual
 * is out of scope for this build session.
 */
export interface ResolutionCapabilityEntry {
  authorDID: DID;              // The party with resolution capability
  grantedAt: ISODateTime;      // Formation time of the capability grant
  grantedBy: GrantChain;       // All grant-chain parties who consented to this capability
  scope: string;               // Description of the seam(s) this capability covers
}

export interface ResolutionCapabilityRegistry {
  entries: ResolutionCapabilityEntry[];
}

/**
 * Check whether a DID has formation-time-consented capability to issue
 * ResolutionRecords for a seam.
 *
 * Returns true iff:
 *   1. An entry exists for authorDID in the registry
 *   2. ALL grant-chain parties appear in the entry's grantedBy list
 *      (T5/T10 Test 2: formation-time consent by all parties)
 */
export function hasResolutionCapability(
  authorDID: DID,
  grantChain: GrantChain,
  registry: ResolutionCapabilityRegistry
): boolean {
  const entry = registry.entries.find(e => e.authorDID === authorDID);
  if (!entry) return false;

  // All grant-chain parties must have consented to this capability
  return grantChain.every(party => entry.grantedBy.includes(party));
}

// ---------------------------------------------------------------------------
// Union merge helper (partition test support)
// ---------------------------------------------------------------------------

/**
 * Merge two P13 record sets as a set union.
 * Records are deduplicated by their primary ID field.
 * This is the set-union-mergeability operation the partition test validates.
 */
export function mergeRecordSets(a: P13RecordSet, b: P13RecordSet): P13RecordSet {
  const dedupeById = <T extends { recordId: URI }>(arr: T[]): T[] => {
    const seen = new Set<string>();
    return arr.filter(item => {
      if (seen.has(item.recordId)) return false;
      seen.add(item.recordId);
      return true;
    });
  };

  return {
    amendments: dedupeById([...a.amendments, ...b.amendments]),
    objections: dedupeById([...a.objections, ...b.objections]),
    consents:   dedupeById([...a.consents,   ...b.consents]),
    resolutions: dedupeById([...a.resolutions, ...b.resolutions]),
  };
}
