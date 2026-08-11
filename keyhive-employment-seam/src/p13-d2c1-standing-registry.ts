/**
 * Form C — P13 D2-C1: StandingRegistry
 *
 * Session: P13 D2 build session (D2-C1/C3/C6/C5)
 * Date: 2026-08-10
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 *
 * Governing doc: form-c-p13-d2-schema-spec_2026-08-10.md §2
 *
 * D2-C1 is a REGISTRY STRUCTURE, not a new governance-event record type.
 * It is a set of StandingRegistryEntry records within the seam's record set —
 * same residency discipline as ResolutionCapabilityRegistry (SL-0057). The
 * derivation functions read it at derivation time against locally-held state.
 *
 * Type: StandingRegistryEntry
 * IRI:  https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#StandingRegistryEntry
 * Extends: seam:CrossingRecord (all base fields inherited)
 * recordType value: 'standing-registry-entry' (new CV value, additive —
 *   pending UFO Lexicon v1.5 addendum; see spec §6)
 *
 * New CV values required in UFO Lexicon v1.5 addendum:
 *   - recordType: standing-registry-entry
 *   - governanceEvent: standing-constitution, standing-amendment
 *
 * FAIL-SAFE DISCIPLINE (spec §2.4): Absent DID or only-superseded entries →
 * without-standing. Does not block any gate. Consistent with P11 act-time
 * discipline and SL-0057 residency discipline.
 *
 * DERIVATION-TIME, NOT ACT-TIME: hasStanding() reads locally-held registry
 * state. No network call; no act-time liveness dependency.
 *
 * MEMBERSHIP AMENDMENT RECURSION (spec §2.4): A record amending membership
 * is itself a SeamTermAmendmentRecord (termKey: 'standing-registry') subject
 * to the normal amendment governance cycle. The standing check at
 * amendment-derivation time uses the pre-amendment registry state. The
 * meta-rule recurses to formation-time consent per the T1rev regress finding
 * (D2 §5.2, SL-0059). Honest recursion, not a gap.
 *
 * KNOWN LIMITS (spec §2.8 — named, not solved):
 *   - SL-0058 adhesion bound on registry formation. The architecture records
 *     who has standing; it does not validate that the standing constitution
 *     was formed under conditions of genuine consent. Substantive validity
 *     relocates to institutional layer (T5/F2).
 *   - Membership amendment recursion is honest, not closed. If the founding
 *     standing set was adhesion-formed, the recursion does not escape the
 *     adhesion exposure.
 *
 * Q6 LOCK: In force. Nothing here touches or unlocks Q6.
 * NI-5: Local-first specific on current evidence.
 * Form C cluster PROPOSED per UFO Lexicon v1.5.
 */

import type { DID, URI, ISODateTime } from './p13-record-types';

// ---------------------------------------------------------------------------
// Controlled vocabularies (D2-C1 — additive; Lexicon addendum pending)
// ---------------------------------------------------------------------------

/** standingScope controlled vocabulary (spec §2.3).
 *  Governance surfaces this member has standing to author records on.
 *  'full' covers all four named surfaces. */
export const STANDING_SCOPES = [
  'amendment',
  'objection',
  'consent',
  'resolution',
  'full',
] as const;
export type StandingScope = (typeof STANDING_SCOPES)[number];

/** The four specific (non-'full') governance surfaces a standing check can
 *  be requested against. */
export type SpecificStandingScope = Exclude<StandingScope, 'full'>;

/** governanceEvent values for StandingRegistryEntry (spec §2.3).
 *  Formation entries: 'standing-constitution'. Amendment entries:
 *  'standing-amendment'. New CV values, additive (Lexicon addendum pending). */
export const STANDING_GOVERNANCE_EVENTS = [
  'standing-constitution',
  'standing-amendment',
] as const;
export type StandingGovernanceEvent = (typeof STANDING_GOVERNANCE_EVENTS)[number];

// ---------------------------------------------------------------------------
// StandingRegistryEntry — 13 fields per spec §2.3
// (9 inherited from seam:CrossingRecord as used here + 4 D2-C1-specific)
// ---------------------------------------------------------------------------

/**
 * StandingRegistryEntry — one active entry per memberDID.
 *
 * Field notes (spec §2.3):
 *   - emittedBy: Formation entries — seam formation parties. Amendment
 *     entries — the amending party (the amendment must itself be operative).
 *   - provenanceStatus: 'superseded' when replaced by a subsequent
 *     membership amendment.
 *   - chainReference: for amendment entries — references the prior entry
 *     for this memberDID in chain order.
 *   - boundType: 'confirmation' — registry entries confirm membership.
 *   - membershipBasis: author-declared (P9 upper bound — the architecture
 *     records the claim); evaluation relocates to dispute resolution.
 *   - effectiveFrom: recordId of the SeamTermAmendmentRecord whose
 *     operativity triggered this entry. REQUIRED for amendment-triggered
 *     entries (governanceEvent: 'standing-amendment'); optional for
 *     formation entries. SHACL cannot condition cleanly on the
 *     governanceEvent value — enforced at the TypeScript layer (see
 *     createStandingRegistryEntry and validateStandingRegistryEntryShape).
 */
export interface StandingRegistryEntry {
  // Identity group (inherited)
  recordId: URI;
  recordType: 'standing-registry-entry';
  emittedAt: ISODateTime;
  emittedBy: DID;

  // Provenance linkage group (inherited)
  provenanceStatus: 'asserted' | 'confirmed' | 'superseded';
  supersededBy?: URI; // Required when provenanceStatus === 'superseded'

  // Lineage anchoring group (inherited; optional)
  chainReference?: URI;

  // Evidence scope group (inherited)
  governanceEvent: StandingGovernanceEvent;
  boundType: 'confirmation';

  // D2-C1-specific fields
  memberDID: DID;
  standingScope: StandingScope;
  membershipBasis: string;
  effectiveFrom?: URI; // Required for amendment-triggered entries (TS-layer)
}

/** A StandingRegistry is a set of entries resident in the seam's record set
 *  (SL-0057 residency pattern). No external substrate; no act-time liveness
 *  dependency. */
export type StandingRegistry = StandingRegistryEntry[];

// ---------------------------------------------------------------------------
// Creation guard (TS-layer enforcement of the conditional effectiveFrom)
// ---------------------------------------------------------------------------

/**
 * Creates a StandingRegistryEntry, enforcing at creation time the
 * conditional constraint SHACL defers to the TypeScript layer (spec §2.5
 * note): amendment-triggered entries (governanceEvent:
 * 'standing-amendment') MUST carry effectiveFrom.
 *
 * Throws at record creation, not at derivation time.
 */
export function createStandingRegistryEntry(
  entry: StandingRegistryEntry
): StandingRegistryEntry {
  if (entry.governanceEvent === 'standing-amendment' && !entry.effectiveFrom) {
    throw new Error(
      'StandingRegistryEntry: effectiveFrom is required for amendment-triggered ' +
        "entries (governanceEvent: 'standing-amendment') — spec §2.3/§2.5"
    );
  }
  if (entry.provenanceStatus === 'superseded' && !entry.supersededBy) {
    throw new Error(
      'StandingRegistryEntry: supersededBy is required when provenanceStatus ' +
        "is 'superseded' — CrossingRecord provenance linkage group"
    );
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Derivation logic — hasStanding() (spec §2.4)
// ---------------------------------------------------------------------------

/**
 * hasStanding — derivation-time standing check against locally-held
 * registry state. Pure function; no side effects; no network call.
 *
 * Derivation (spec §2.4):
 *   1. Filter registry to entries where entry.memberDID === memberDID and
 *      entry.provenanceStatus !== 'superseded'.
 *   2. If no non-superseded entry: return false (fail-safe; no gate blocked).
 *   3. From the surviving entry, check whether standingScope covers the
 *      requested scope ('full' covers all; specific values cover their
 *      named scope only).
 *   4. Return true if covered, false otherwise.
 */
export function hasStanding(
  memberDID: DID,
  scope: SpecificStandingScope,
  registry: StandingRegistry
): boolean {
  const surviving = registry.filter(
    (entry) =>
      entry.memberDID === memberDID && entry.provenanceStatus !== 'superseded'
  );

  if (surviving.length === 0) {
    return false; // Fail-safe: absent DID or only-superseded entries → without-standing
  }

  // One active entry per DID by design (spec §2.3). If multiple non-superseded
  // entries exist (a registry-hygiene defect, not a governance state), the
  // check covers the scope iff ANY surviving entry covers it — the derivation
  // stays fail-safe and deterministic over set union.
  return surviving.some(
    (entry) => entry.standingScope === 'full' || entry.standingScope === scope
  );
}

// ---------------------------------------------------------------------------
// SHACL shape (spec §2.5) — Turtle carried verbatim; runtime validator mirrors it
// ---------------------------------------------------------------------------

/** SHACL shape for StandingRegistryEntry (spec §2.5), carried verbatim.
 *  The runtime validator below mirrors this shape plus the conditional
 *  constraints SHACL defers to the TypeScript layer. */
export const STANDING_REGISTRY_ENTRY_SHAPE_TTL = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix seam: <https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

seam:StandingRegistryEntryShape
  a sh:NodeShape ;
  sh:targetClass seam:StandingRegistryEntry ;

  # Inherit base shape
  sh:node seam:CrossingRecordShape ;

  sh:property [
    sh:path seam:recordType ;
    sh:hasValue "standing-registry-entry" ;
  ] ;
  sh:property [
    sh:path seam:governanceEvent ;
    sh:in ( "standing-constitution" "standing-amendment" ) ;
  ] ;
  sh:property [
    sh:path seam:boundType ;
    sh:hasValue "confirmation" ;
  ] ;
  sh:property [
    sh:path seam:memberDID ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:nodeKind sh:IRI ;
  ] ;
  sh:property [
    sh:path seam:standingScope ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:in ( "amendment" "objection" "consent" "resolution" "full" ) ;
  ] ;
  sh:property [
    sh:path seam:membershipBasis ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:datatype xsd:string ;
  ] ;
  sh:property [
    sh:path seam:supersededBy ;
    sh:minCount 0 ; sh:maxCount 1 ;
    sh:nodeKind sh:IRI ;
  ] ;
  sh:property [
    sh:path seam:effectiveFrom ;
    sh:minCount 0 ; sh:maxCount 1 ;
    sh:nodeKind sh:IRI ;
  ] .
  # Note: effectiveFrom required for amendment-triggered entries is enforced
  # at TypeScript layer (SHACL cannot condition cleanly on governanceEvent value).
` as const;

const URI_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Runtime conformance validator mirroring seam:StandingRegistryEntryShape
 * (spec §2.5) plus the TS-layer conditional (effectiveFrom on amendment-
 * triggered entries). Returns a list of violations; an empty list is
 * conformance. Violation strings name the field and constraint, SHACL-style
 * (repo convention from validateCrossingRecordBase).
 */
export function validateStandingRegistryEntryShape(record: unknown): string[] {
  const v: string[] = [];
  if (typeof record !== 'object' || record === null) {
    return ['record: not an object'];
  }
  const r = record as Record<string, unknown>;

  if (r.recordType !== 'standing-registry-entry') {
    v.push("seam:recordType — sh:hasValue 'standing-registry-entry' violated");
  }
  if (
    !STANDING_GOVERNANCE_EVENTS.includes(r.governanceEvent as StandingGovernanceEvent)
  ) {
    v.push(
      'seam:governanceEvent — sh:in (standing-constitution standing-amendment) violated'
    );
  }
  if (r.boundType !== 'confirmation') {
    v.push("seam:boundType — sh:hasValue 'confirmation' violated");
  }
  if (typeof r.memberDID !== 'string' || r.memberDID.length === 0) {
    v.push('seam:memberDID — sh:minCount 1 violated (missing)');
  } else if (!r.memberDID.startsWith('did:')) {
    v.push('seam:memberDID — sh:nodeKind sh:IRI violated (not a DID)');
  }
  if (!STANDING_SCOPES.includes(r.standingScope as StandingScope)) {
    v.push(
      'seam:standingScope — sh:in (amendment objection consent resolution full) violated'
    );
  }
  if (typeof r.membershipBasis !== 'string' || r.membershipBasis.length === 0) {
    v.push('seam:membershipBasis — sh:minCount 1 / xsd:string violated');
  }
  if (r.supersededBy !== undefined) {
    if (typeof r.supersededBy !== 'string' || !URI_PATTERN.test(r.supersededBy)) {
      v.push('seam:supersededBy — sh:nodeKind sh:IRI violated');
    }
  }
  if (r.effectiveFrom !== undefined) {
    if (typeof r.effectiveFrom !== 'string' || !URI_PATTERN.test(r.effectiveFrom)) {
      v.push('seam:effectiveFrom — sh:nodeKind sh:IRI violated');
    }
  }
  // TS-layer conditional (spec §2.5 note)
  if (r.governanceEvent === 'standing-amendment' && r.effectiveFrom === undefined) {
    v.push(
      'seam:effectiveFrom — required for amendment-triggered entries (TS-layer conditional)'
    );
  }

  return v;
}
