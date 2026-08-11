/**
 * Form C — P13 D2-C6: DelegationRecord
 *
 * Session: P13 D2 build session (D2-C1/C3/C6/C5)
 * Date: 2026-08-10
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 *
 * Governing doc: form-c-p13-d2-schema-spec_2026-08-10.md §5
 *
 * D2-C6 is a NEW RECORD TYPE extending seam:CrossingRecord — the only new
 * record type among the four D2 build candidates. A party-authored record
 * assigning the party's own consent-authoring capability to a named delegate
 * DID. Revocable by supersession.
 *
 * Type: DelegationRecord
 * IRI:  https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#DelegationRecord
 * Extends: seam:CrossingRecord
 * recordType value: 'delegation' (new CV value, additive —
 *   pending UFO Lexicon v1.5 addendum; see spec §6)
 *
 * New CV values required in UFO Lexicon v1.5 addendum:
 *   - recordType: delegation
 *   - governanceEvent: delegation-grant
 *
 * FIVE D3 CONSTRAINTS CARRIED VERBATIM (D3 §2.4, spec §5):
 *   1. Party-authored: emittedBy MUST equal grantor (SL-0065). Enforced at
 *      the TypeScript layer at record creation (standard SHACL cannot
 *      cross-reference two field values cleanly) — see
 *      createDelegationRecord.
 *   2. Delegatee-DID-targeted: capability is assigned to a named delegatee
 *      DID (SL-0065).
 *   3. No act-time liveness dependency: lineageAnchorType 'author-declared'
 *      under the Q6 default; witness-signed locked (Q6).
 *   4. Revocable by supersession: structurally identical to ConsentRecord
 *      revocation (OI-P13-1). Revocability is structural; the architecture
 *      does not enforce that revocation faces no consequences in the
 *      relational or employment context (SL-0058 pattern on the delegation
 *      surface; Artifact B r2 §6 Item 3 Known Limit).
 *   5. No 'contested' derivation: the architecture does not derive a
 *      contested status for DelegationRecord. The record is either present
 *      (and the derivation checks it) or absent (and the derivation
 *      proceeds without the delegation's effects). SHACL-enforced via sh:in
 *      on provenanceStatus (asserted | superseded only). A party that
 *      believes their delegation was coerced must seek remedy at the
 *      institutional layer; the architecture carries the evidence for that
 *      proceeding.
 *
 * COMPOSITION (spec §5.7):
 *   - Composes with ConsentRecord derivation (OI-P13-1):
 *     hasDelegatedConsent() is called within the deriveAmendmentStatus()
 *     flow (signature extension in p13-record-types.ts, this session).
 *   - Does not require D2-C1 (StandingRegistry). If D2-C1 is deployed,
 *     hasStanding() applies to the delegatee as the acting party — a
 *     composition callers wire at the application layer; the derivation
 *     functions stay independent.
 *   - No composition dependency on D2-C3 or D2-C5.
 *
 * KNOWN LIMITS (spec §5.9 — named, not solved):
 *   - Anti-adhesion condition not expressible inside the architecture
 *     (D3 §2.4, SL-0065). An employer requiring delegation to a designated
 *     steward as a condition of seam formation is the SL-0058 adhesion
 *     pattern on a delegation surface. Substantive validity relocates to
 *     institutional layer (T5/F2). Named in Artifact B r2 §6 Item 3.
 *   - No 'contested' derivation for delegation (deliberate D3 decision).
 *   - emittedBy === grantor enforced at TypeScript layer only.
 *   - scope locked to 'consent'. Extension requires a governed vocabulary
 *     amendment.
 *
 * Q6 LOCK: In force. lineageAnchorType 'author-declared' only. Nothing here
 * touches or unlocks Q6.
 * NI-5: Local-first specific on current evidence.
 * Form C cluster PROPOSED per UFO Lexicon v1.5.
 */

import type { DID, URI, ISODateTime } from './p13-record-types';

// ---------------------------------------------------------------------------
// Controlled vocabularies (D2-C6 — additive; Lexicon addendum pending)
// ---------------------------------------------------------------------------

/** Delegable governance surfaces. Locked to 'consent' (spec §5.3).
 *  Extension requires a governed vocabulary amendment. */
export const DELEGATION_SCOPES = ['consent'] as const;
export type DelegationScope = (typeof DELEGATION_SCOPES)[number];

/** provenanceStatus values admissible on DelegationRecord — D3 constraint 5:
 *  NO 'contested' value. SHACL-enforced via sh:in. */
export const DELEGATION_PROVENANCE_STATUSES = ['asserted', 'superseded'] as const;
export type DelegationProvenanceStatus =
  (typeof DELEGATION_PROVENANCE_STATUSES)[number];

// ---------------------------------------------------------------------------
// DelegationRecord — 12 fields per spec §5.3
// ---------------------------------------------------------------------------

/**
 * DelegationRecord — party-authored assignment of the grantor's own
 * consent-authoring capability to a named delegatee DID.
 *
 * Field notes (spec §5.3):
 *   - emittedBy: MUST equal grantor (D3 constraint 1; TS-layer guard).
 *   - provenanceStatus: 'superseded' when revoked by a later
 *     DelegationRecord from the same grantor. No 'contested' value.
 *   - supersededBy: required when 'superseded'; references the superseding
 *     DelegationRecord's recordId.
 *   - chainReference: optional; references a prior DelegationRecord from
 *     this grantor in chain order (amendment/revision tracking).
 *   - lineageAnchorType: 'author-declared' under the Q6 default;
 *     witness-signed locked (Q6); no act-time liveness dependency
 *     (D3 constraint 3).
 */
export interface DelegationRecord {
  // Identity group (inherited)
  recordId: URI;
  recordType: 'delegation';
  emittedAt: ISODateTime;
  emittedBy: DID;

  // Provenance linkage group (inherited; narrowed — no 'contested')
  provenanceStatus: DelegationProvenanceStatus;
  supersededBy?: URI; // Required when provenanceStatus === 'superseded'

  // Lineage anchoring group (inherited; chainReference optional)
  chainReference?: URI;

  // Evidence scope group (inherited)
  governanceEvent: 'delegation-grant';
  boundType: 'confirmation';
  lineageAnchorType: 'author-declared';

  // D2-C6-specific fields
  grantor: DID;   // Must equal emittedBy (D3 constraint 1)
  delegatee: DID; // D3 constraint 2: delegatee-DID-targeted
  scope: DelegationScope;
}

// ---------------------------------------------------------------------------
// Creation guard — emittedBy === grantor (spec §5.6, TS-layer enforcement)
// ---------------------------------------------------------------------------

/**
 * Creates a DelegationRecord, enforcing D3 constraint 1 at record creation:
 * the party issuing the delegation must be the record's author
 * (emittedBy === grantor). Failure THROWS at record creation, not at
 * derivation time (spec §5.6). Standard SHACL cannot cross-reference two
 * field values; this guard is the enforcement point.
 */
export function createDelegationRecord(record: DelegationRecord): DelegationRecord {
  if (record.emittedBy !== record.grantor) {
    throw new Error(
      'DelegationRecord: emittedBy must equal grantor — the party issuing the ' +
        'delegation must be the record author (D3 constraint 1, SL-0065; spec §5.6)'
    );
  }
  if (record.provenanceStatus === 'superseded' && !record.supersededBy) {
    throw new Error(
      'DelegationRecord: supersededBy is required when provenanceStatus is ' +
        "'superseded' — CrossingRecord provenance linkage group"
    );
  }
  return record;
}

// ---------------------------------------------------------------------------
// Derivation logic — hasDelegatedConsent() (spec §5.4)
// ---------------------------------------------------------------------------

/**
 * hasDelegatedConsent — derivation-time delegation check against
 * locally-held records. Pure function; no side effects.
 *
 * Derivation (spec §5.4):
 *   1. Filter delegationRecords to entries where entry.grantor === grantor
 *      and entry.provenanceStatus !== 'superseded'.
 *   2. If no non-superseded entry for this grantor: return false (no active
 *      delegation; derivation proceeds without delegation effects —
 *      D3 constraint 5).
 *   3. From the surviving entry, check whether entry.delegatee === delegatee.
 *   4. Return true if match, false otherwise.
 *
 * EFFECT ON CONSENT DERIVATION: When hasDelegatedConsent(grantor, delegatee)
 * returns true, deriveAmendmentStatus() (p13-record-types.ts, extended this
 * session) treats a consent authored by the delegatee for a given
 * amendmentRef as equivalent to a consent authored by the grantor. The
 * delegatee acts with the grantor's authority on that surface.
 */
export function hasDelegatedConsent(
  grantor: DID,
  delegatee: DID,
  delegationRecords: DelegationRecord[]
): boolean {
  const surviving = delegationRecords.filter(
    (entry) => entry.grantor === grantor && entry.provenanceStatus !== 'superseded'
  );

  if (surviving.length === 0) {
    return false; // No active delegation; derivation proceeds without effects
  }

  // One active delegation per grantor by design (revocation by supersession).
  // If multiple non-superseded entries exist (record-hygiene defect), the
  // check matches iff ANY surviving entry names this delegatee — fail-safe
  // and deterministic over set union.
  return surviving.some((entry) => entry.delegatee === delegatee);
}

// ---------------------------------------------------------------------------
// SHACL shape (spec §5.5) — Turtle carried verbatim; runtime validator mirrors it
// ---------------------------------------------------------------------------

/** SHACL shape for DelegationRecord (spec §5.5), carried verbatim. The
 *  no-'contested' discipline (D3 constraint 5) is SHACL-enforced via sh:in
 *  on provenanceStatus. emittedBy === grantor is enforced at the TypeScript
 *  layer (createDelegationRecord) — standard SHACL cannot cross-reference
 *  two field values. */
export const DELEGATION_RECORD_SHAPE_TTL = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix seam: <https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

seam:DelegationRecordShape
  a sh:NodeShape ;
  sh:targetClass seam:DelegationRecord ;

  # Inherit base shape
  sh:node seam:CrossingRecordShape ;

  sh:property [
    sh:path seam:recordType ;
    sh:hasValue "delegation" ;
  ] ;
  sh:property [
    sh:path seam:governanceEvent ;
    sh:hasValue "delegation-grant" ;
  ] ;
  sh:property [
    sh:path seam:boundType ;
    sh:hasValue "confirmation" ;
  ] ;

  # provenanceStatus: no "contested" value (D3 constraint 5 — SHACL-enforced)
  sh:property [
    sh:path seam:provenanceStatus ;
    sh:in ( "asserted" "superseded" ) ;
  ] ;

  # lineageAnchorType: author-declared only (Q6 lock)
  sh:property [
    sh:path seam:lineageAnchorType ;
    sh:hasValue "author-declared" ;
  ] ;

  sh:property [
    sh:path seam:grantor ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:nodeKind sh:IRI ;
  ] ;
  sh:property [
    sh:path seam:delegatee ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:nodeKind sh:IRI ;
  ] ;
  sh:property [
    sh:path seam:scope ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:hasValue "consent" ;
  ] .

  # emittedBy === grantor enforced at TypeScript layer (see spec §5.6).
  # Standard SHACL cannot cross-reference two field values.
` as const;

/**
 * Runtime conformance validator mirroring seam:DelegationRecordShape
 * (spec §5.5). Returns a list of violations; an empty list is conformance.
 * The sh:in constraint on provenanceStatus EXCLUDES 'contested'
 * (D3 constraint 5).
 */
export function validateDelegationRecordShape(record: unknown): string[] {
  const v: string[] = [];
  if (typeof record !== 'object' || record === null) {
    return ['record: not an object'];
  }
  const r = record as Record<string, unknown>;

  if (r.recordType !== 'delegation') {
    v.push("seam:recordType — sh:hasValue 'delegation' violated");
  }
  if (r.governanceEvent !== 'delegation-grant') {
    v.push("seam:governanceEvent — sh:hasValue 'delegation-grant' violated");
  }
  if (r.boundType !== 'confirmation') {
    v.push("seam:boundType — sh:hasValue 'confirmation' violated");
  }
  if (
    !DELEGATION_PROVENANCE_STATUSES.includes(
      r.provenanceStatus as DelegationProvenanceStatus
    )
  ) {
    v.push(
      'seam:provenanceStatus — sh:in (asserted superseded) violated ' +
        "('contested' excluded by design — D3 constraint 5)"
    );
  }
  if (r.lineageAnchorType !== 'author-declared') {
    v.push(
      "seam:lineageAnchorType — sh:hasValue 'author-declared' violated (Q6 lock)"
    );
  }
  if (typeof r.grantor !== 'string' || !r.grantor.startsWith('did:')) {
    v.push('seam:grantor — sh:minCount 1 / sh:nodeKind sh:IRI violated');
  }
  if (typeof r.delegatee !== 'string' || !r.delegatee.startsWith('did:')) {
    v.push('seam:delegatee — sh:minCount 1 / sh:nodeKind sh:IRI violated');
  }
  if (r.scope !== 'consent') {
    v.push("seam:scope — sh:hasValue 'consent' violated");
  }

  return v;
}
