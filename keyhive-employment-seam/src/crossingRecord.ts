// src/crossingRecord.ts — seam:CrossingRecord base shape + instance extensions
//
// Implementation session, 2026-08-09 (Session Harness Mode 1).
// Governing docs:
//   form-c-item2-unified-crossing-record-schema_2026-08-08.md  (base shape §2,
//     instance extensions §3, SHACL §5, carry-forward §7)
//   UFO_Lexicon_v1_3_2026-08-09.md  (controlled vocabularies — canonical)
//   pattern-commons-07-employment-seam-v0-5_2026-08-08.md  (gateCheckRecord +
//     aiProvenance instance field sets — authoritative for employment-seam
//     extensions per the Lexicon v1.3 cross-reference note)
//
// DESIGN PREMISE (Item 2 §1 — one shape, four instances):
// Every governed-event record in the Seam Stack instantiates one base shape,
// seam:CrossingRecord. The four instance types — gate-check records, GSEF
// lineage records, AI provenance records, GPRF verification tags — extend
// the base with domain-specific fields. The base is what any governed-event
// record must carry to participate in a traceable chain.
//
// This module defines:
//   - the base shape type (four required field groups, Item 2 §2)
//   - the controlled vocabularies (canonical source: UFO Lexicon v1.3)
//   - a runtime validator mirroring the base SHACL shape (Item 2 §5) plus
//     the conditional constraints SHACL defers to instance shapes
//   - the seam:aiProvenance instance extension (Item 2 §3.3; field set from
//     PC#7 v0.5), implemented in this increment
//   - carry-forward flags for the two instance types NOT implemented here
//     (GSEF lineage record, GPRF verification tag) — see bottom of file
//
// The seam:gateCheckRecord instance extension lives in types.ts (it predates
// the base shape); its composition with the base is declared there.
//
// Register note: seam:CrossingRecord and its controlled vocabularies are
// Form C sub-register terms, PROPOSED pending Form C cluster gate conditions
// (UFO Lexicon v1.3, Collision Prevention rule 7). Vocabulary registration
// is a governance action, not a promotion.

// ---------------------------------------------------------------------------
// Vocabulary namespace (live and resolving, verified 2026-08-09)
// ---------------------------------------------------------------------------

/** The Seam Stack crossing-record vocabulary IRI. Separate from the
 *  employment-seam v0.5 namespace by design (Item 2 §4): the base shape
 *  generalizes across seam types; it must not inherit the employment
 *  context's specificity. */
export const CROSSING_RECORD_VOCAB =
  'https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#' as const

// ---------------------------------------------------------------------------
// Controlled vocabularies — canonical source: UFO Lexicon v1.3 (2026-08-09),
// Form C sub-register. Do not extend without a governed amendment
// (Item 2 §2.1: recordType is "extensible by governed amendment").
// ---------------------------------------------------------------------------

export const RECORD_TYPES = ['gate-check', 'lineage', 'provenance', 'verification'] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export const GOVERNANCE_EVENTS = [
  'gate-check',
  'schema-change',
  'action-provenance',
  'code-change-verification',
] as const
export type GovernanceEvent = (typeof GOVERNANCE_EVENTS)[number]

export const BOUND_TYPES = ['exposure-upper-bound', 'confirmation', 'attestation'] as const
export type BoundType = (typeof BOUND_TYPES)[number]

/** Q6 default (trust-the-author-with-named-boundary): `author-declared` is
 *  the only currently AVAILABLE value. The signed variants are named in the
 *  schema and LOCKED until the relevant machinery exists (Item 2 §2.3 —
 *  finality-arbiter-free constraint; admitting them as locked future values
 *  is honest engineering; treating them as available would violate P9). */
export const LINEAGE_ANCHOR_TYPES = ['author-declared', 'witness-signed', 'timestamp-signed'] as const
export type LineageAnchorType = (typeof LINEAGE_ANCHOR_TYPES)[number]
export const AVAILABLE_LINEAGE_ANCHOR_TYPES = ['author-declared'] as const

export const PROVENANCE_STATUSES = ['asserted', 'confirmed', 'contested', 'superseded'] as const
export type ProvenanceStatus = (typeof PROVENANCE_STATUSES)[number]

// ---------------------------------------------------------------------------
// Base shape — Item 2 §2. Four required field groups, composed below.
// Conditional requirements are encoded as discriminated unions so the
// type system enforces what the base SHACL shape defers to instance shapes.
// ---------------------------------------------------------------------------

/** §2.1 Identity group — required in every instance. */
export type CrossingRecordIdentity = {
  /** Globally addressable identifier for this record; target of
   *  `chainReference` pointers from downstream records. Prototype mints
   *  `urn:uuid:` URIs (see mintRecordId) — valid URIs, addressable in the
   *  URN sense; mesh-resolvable identifiers are a future-version concern. */
  recordId: string
  /** Structural discriminant across the four instance types. */
  recordType: RecordType
  /** Time of record emission. Under Q6 default: author-declared; the
   *  boundary is named (see lineageAnchorType). */
  emittedAt: string
  /** DID of the party responsible for emitting this record. Gate-check:
   *  the gate's owning seam. Provenance: the operating party. Lineage: the
   *  schema author. Verification: the reviewer. (Item 2 §2.1.) */
  emittedBy: string
}

/** §2.2 Provenance linkage group — required in every instance.
 *  Encoded as a union so `provenanceStatusBasis` is REQUIRED exactly when
 *  status ≠ 'asserted', and `supersededBy` exactly when 'superseded'
 *  (supersession-not-reinterpretation: a refined understanding is a NEW
 *  record referencing this one; the same record cannot be reread under a
 *  new interpretation). */
export type CrossingRecordProvenanceLinkage =
  | {
      provenanceStatus: 'asserted'
      provenanceStatusBasis?: never
      supersededBy?: never
    }
  | {
      provenanceStatus: 'confirmed' | 'contested'
      /** One-sentence basis for the non-asserted status. */
      provenanceStatusBasis: string
      supersededBy?: never
    }
  | {
      provenanceStatus: 'superseded'
      provenanceStatusBasis: string
      /** Reference to the superseding record. */
      supersededBy: string
    }

/** §2.3 Lineage anchoring group — required where chain participation is
 *  claimed. All three fields travel together: a `chainReference` without
 *  `chainDepth` makes chain assembly ambiguous; without `lineageAnchorType`
 *  it hides the anchoring stance. Principal-seam records (this prototype)
 *  legitimately omit the whole group. */
export type CrossingRecordLineageAnchoring =
  | {
      chainReference?: never
      chainDepth?: never
      lineageAnchorType?: never
    }
  | {
      /** The immediately upstream record's recordId. */
      chainReference: string
      /** Position in the chain. Principal seam / first lineage entry: 0;
       *  first relay / first successor: 1. */
      chainDepth: number
      /** How the link was established. Only 'author-declared' is currently
       *  available (Q6 default); signed variants are locked. */
      lineageAnchorType: LineageAnchorType
    }

/** §2.4 Evidence scope group — required in every instance. */
export type CrossingRecordEvidenceScope = {
  /** Governance-semantics discriminant (matches recordType structurally,
   *  but names the CLASS of governed event, not the record's shape). */
  governanceEvent: GovernanceEvent
  /** The exposure claim this record makes. Per P9 and the GSEF upper-bound
   *  principle: a record claiming more control than its architecture
   *  enforces is inadmissible. Gate-check and lineage records carry
   *  'exposure-upper-bound'; confirmed human review carries 'confirmation';
   *  GPRF verified merge carries 'attestation'. */
  boundType: BoundType
  /** Date after which this record's claims require re-verification.
   *  Optional in v0 (Item 2 §2.4). */
  evidenceDecay?: string
}

/** seam:CrossingRecord — the base shape all governed-event records
 *  instantiate (Item 2 §2). Instance extensions add domain fields;
 *  base fields are inherited, never repeated. */
export type CrossingRecordBase = CrossingRecordIdentity &
  CrossingRecordProvenanceLinkage &
  CrossingRecordLineageAnchoring &
  CrossingRecordEvidenceScope

// ---------------------------------------------------------------------------
// Record ID minting
// ---------------------------------------------------------------------------

/** Mints a globally unique `urn:uuid:` URI for a new crossing record. */
export function mintRecordId(): string {
  return `urn:uuid:${crypto.randomUUID()}`
}

// ---------------------------------------------------------------------------
// Runtime conformance validator — mirrors the base SHACL shape (Item 2 §5)
// plus the conditional constraints the SHACL base defers to instance shapes
// (§2.2 basis/supersededBy conditions, §2.3 anchoring-group coherence).
// Used by the conformance test suite; usable by any consumer that receives
// records across a trust boundary where the type system no longer holds.
// ---------------------------------------------------------------------------

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** Validates an unknown value against the seam:CrossingRecord base shape.
 *  Returns a list of violations; an empty list is conformance. Violation
 *  strings name the field group and constraint, SHACL-style. */
export function validateCrossingRecordBase(record: unknown): string[] {
  const v: string[] = []
  if (typeof record !== 'object' || record === null) {
    return ['record: not an object']
  }
  const r = record as Record<string, unknown>

  // Identity group
  if (typeof r.recordId !== 'string' || r.recordId.length === 0) {
    v.push('identity: recordId missing or empty (minCount 1, nodeKind IRI)')
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(r.recordId)) {
    v.push('identity: recordId is not a URI (nodeKind IRI)')
  }
  if (!RECORD_TYPES.includes(r.recordType as RecordType)) {
    v.push(`identity: recordType not in controlled vocabulary (${RECORD_TYPES.join(' / ')})`)
  }
  if (typeof r.emittedAt !== 'string' || !ISO_DATETIME.test(r.emittedAt)) {
    v.push('identity: emittedAt missing or not ISO 8601 dateTime')
  }
  if (typeof r.emittedBy !== 'string' || !r.emittedBy.startsWith('did:')) {
    v.push('identity: emittedBy missing or not a DID')
  }

  // Provenance linkage group
  const status = r.provenanceStatus as ProvenanceStatus
  if (!PROVENANCE_STATUSES.includes(status)) {
    v.push(`provenance-linkage: provenanceStatus not in controlled vocabulary (${PROVENANCE_STATUSES.join(' / ')})`)
  } else {
    if (status !== 'asserted' && (typeof r.provenanceStatusBasis !== 'string' || r.provenanceStatusBasis.length === 0)) {
      v.push('provenance-linkage: provenanceStatusBasis required when provenanceStatus ≠ asserted')
    }
    if (status === 'superseded' && (typeof r.supersededBy !== 'string' || r.supersededBy.length === 0)) {
      v.push('provenance-linkage: supersededBy required when provenanceStatus = superseded')
    }
    if (status === 'asserted' && r.provenanceStatusBasis !== undefined) {
      v.push('provenance-linkage: provenanceStatusBasis present on asserted status (basis belongs to non-asserted statuses only)')
    }
  }

  // Lineage anchoring group — all-or-nothing coherence
  const hasChainRef = r.chainReference !== undefined
  const hasDepth = r.chainDepth !== undefined
  const hasAnchor = r.lineageAnchorType !== undefined
  if (hasChainRef || hasDepth || hasAnchor) {
    if (!hasChainRef) v.push('lineage-anchoring: chainReference required when anchoring group is present')
    if (!hasDepth) v.push('lineage-anchoring: chainDepth required when chainReference is present')
    if (!hasAnchor) v.push('lineage-anchoring: lineageAnchorType required when chainReference is present')
    if (hasDepth && (typeof r.chainDepth !== 'number' || !Number.isInteger(r.chainDepth) || (r.chainDepth as number) < 0)) {
      v.push('lineage-anchoring: chainDepth must be a non-negative integer')
    }
    if (hasAnchor && !LINEAGE_ANCHOR_TYPES.includes(r.lineageAnchorType as LineageAnchorType)) {
      v.push(`lineage-anchoring: lineageAnchorType not in controlled vocabulary (${LINEAGE_ANCHOR_TYPES.join(' / ')})`)
    } else if (
      hasAnchor &&
      !AVAILABLE_LINEAGE_ANCHOR_TYPES.includes(r.lineageAnchorType as 'author-declared')
    ) {
      v.push('lineage-anchoring: signed lineageAnchorType values are LOCKED pending infrastructure (Q6 default: author-declared only)')
    }
  }

  // Evidence scope group
  if (!GOVERNANCE_EVENTS.includes(r.governanceEvent as GovernanceEvent)) {
    v.push(`evidence-scope: governanceEvent not in controlled vocabulary (${GOVERNANCE_EVENTS.join(' / ')})`)
  }
  if (!BOUND_TYPES.includes(r.boundType as BoundType)) {
    v.push(`evidence-scope: boundType not in controlled vocabulary (${BOUND_TYPES.join(' / ')})`)
  }
  if (r.evidenceDecay !== undefined && (typeof r.evidenceDecay !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(r.evidenceDecay))) {
    v.push('evidence-scope: evidenceDecay present but not an ISO 8601 date')
  }

  return v
}

// ---------------------------------------------------------------------------
// seam:aiProvenance — action-provenance instance (Item 2 §3.3)
// Field set: PC#7 v0.5 (authoritative for the employment-seam extension).
//
// recordType: 'provenance' · governanceEvent: 'action-provenance' ·
// boundType: 'exposure-upper-bound' — the record DESCRIBES what an AI model
// did; it does not certify that the output is accurate or that no
// undisclosed model behavior occurred.
//
// emittedBy (base field) is the OPERATING PARTY under whose authority the
// provenance record is written — the human responsible for the record's
// accuracy. The agent that performed the action is identified by the
// gate-check record's agentDID. These are distinct parties (Item 2 §3.3);
// the distinctness is documented, not type-enforced (both are DIDs).
// ---------------------------------------------------------------------------

/** PC#7 v0.5 controlled vocabulary for human review of AI-assisted output. */
export const HUMAN_REVIEW_STATUSES = ['none', 'reviewed', 'accepted', 'modified'] as const
export type HumanReviewStatus = (typeof HUMAN_REVIEW_STATUSES)[number]

/** Instance-specific fields, conditionally required per PC#7 v0.5 /
 *  Item 2 §3.3. Encoded as unions so the conditions hold at the type level:
 *  aiModel + aiInputs required when aiAssisted; reviewerIdentity +
 *  reviewTimestamp required when humanReviewStatus ≠ none. */
type AiAssistanceFields =
  | { aiAssisted: false; aiModel?: never; aiInputs?: never }
  | {
      aiAssisted: true
      /** Model identifier (e.g. "claude-fable-5"). */
      aiModel: string
      /** References to the inputs the model received. */
      aiInputs: string
    }

type HumanReviewFields =
  | { humanReviewStatus: 'none'; reviewerIdentity?: never; reviewTimestamp?: never }
  | {
      humanReviewStatus: 'reviewed' | 'accepted' | 'modified'
      /** DID/WebID of the human reviewer. */
      reviewerIdentity: string
      /** Timestamp of human review. (PC#7 v0.5 specifies RFC 3161-stamped;
       *  prototype carries the ISO timestamp — the TSA stamp is legal-record
       *  machinery outside this increment, same posture as the signature
       *  stubs elsewhere in the prototype.) */
      reviewTimestamp: string
    }

export type AiProvenanceRecord = CrossingRecordBase & {
  recordType: 'provenance'
  governanceEvent: 'action-provenance'
  boundType: 'exposure-upper-bound'
} & AiAssistanceFields &
  HumanReviewFields

export type CreateAiProvenanceInput = {
  /** The operating party (human responsible) — becomes emittedBy. */
  operatingPartyDID: string
  aiAssisted: boolean
  aiModel?: string
  aiInputs?: string
  humanReviewStatus: HumanReviewStatus
  reviewerIdentity?: string
  reviewTimestamp?: string
}

/** Constructs a conforming seam:aiProvenance record. Emission is always
 *  provenanceStatus 'asserted' (Q6: author-declared claims at emission;
 *  status upgrades are supersession events producing NEW records, not
 *  mutations of this one). Throws on inputs that cannot form a conforming
 *  record — a provenance record with silently-dropped conditional fields
 *  would be worse than no record. */
export function createAiProvenanceRecord(input: CreateAiProvenanceInput): AiProvenanceRecord {
  if (input.aiAssisted && (!input.aiModel || !input.aiInputs)) {
    throw new Error('seam:aiProvenance: aiModel and aiInputs are required when aiAssisted is true')
  }
  if (input.humanReviewStatus !== 'none' && (!input.reviewerIdentity || !input.reviewTimestamp)) {
    throw new Error('seam:aiProvenance: reviewerIdentity and reviewTimestamp are required when humanReviewStatus ≠ none')
  }

  const base = {
    recordId: mintRecordId(),
    recordType: 'provenance' as const,
    emittedAt: new Date().toISOString(),
    emittedBy: input.operatingPartyDID,
    provenanceStatus: 'asserted' as const,
    governanceEvent: 'action-provenance' as const,
    boundType: 'exposure-upper-bound' as const,
  }

  const assistance: AiAssistanceFields = input.aiAssisted
    ? { aiAssisted: true, aiModel: input.aiModel!, aiInputs: input.aiInputs! }
    : { aiAssisted: false }

  const review: HumanReviewFields =
    input.humanReviewStatus === 'none'
      ? { humanReviewStatus: 'none' }
      : {
          humanReviewStatus: input.humanReviewStatus,
          reviewerIdentity: input.reviewerIdentity!,
          reviewTimestamp: input.reviewTimestamp!,
        }

  return { ...base, ...assistance, ...review }
}

/** PC#7 v0.5 schema-level flag: aiAssisted true + humanReviewStatus none →
 *  ungoverned-AI-output. This is the queryable condition EEOC investigators,
 *  EU AI Act auditors, and worker-side counsel filter on. */
export function isUngovernedAiOutput(record: Pick<AiProvenanceRecord, 'aiAssisted' | 'humanReviewStatus'>): boolean {
  return record.aiAssisted === true && record.humanReviewStatus === 'none'
}

/** Instance-level validator: base conformance + §3.3 conditional fields. */
export function validateAiProvenanceRecord(record: unknown): string[] {
  const v = validateCrossingRecordBase(record)
  if (typeof record !== 'object' || record === null) return v
  const r = record as Record<string, unknown>

  if (r.recordType !== 'provenance') v.push("aiProvenance: recordType must be 'provenance'")
  if (r.governanceEvent !== 'action-provenance') v.push("aiProvenance: governanceEvent must be 'action-provenance'")
  if (r.boundType !== 'exposure-upper-bound') v.push("aiProvenance: boundType must be 'exposure-upper-bound'")

  if (typeof r.aiAssisted !== 'boolean') {
    v.push('aiProvenance: aiAssisted (boolean) is required')
  } else if (r.aiAssisted === true) {
    if (typeof r.aiModel !== 'string' || r.aiModel.length === 0) v.push('aiProvenance: aiModel required when aiAssisted')
    if (typeof r.aiInputs !== 'string' || r.aiInputs.length === 0) v.push('aiProvenance: aiInputs required when aiAssisted')
  }

  const hrs = r.humanReviewStatus as HumanReviewStatus
  if (!HUMAN_REVIEW_STATUSES.includes(hrs)) {
    v.push(`aiProvenance: humanReviewStatus not in controlled vocabulary (${HUMAN_REVIEW_STATUSES.join(' / ')})`)
  } else if (hrs !== 'none') {
    if (typeof r.reviewerIdentity !== 'string' || r.reviewerIdentity.length === 0) {
      v.push('aiProvenance: reviewerIdentity required when humanReviewStatus ≠ none')
    }
    if (typeof r.reviewTimestamp !== 'string' || r.reviewTimestamp.length === 0) {
      v.push('aiProvenance: reviewTimestamp required when humanReviewStatus ≠ none')
    }
  }

  return v
}

// ---------------------------------------------------------------------------
// CARRY-FORWARD — NOT IMPLEMENTED THIS INCREMENT (session scope, 2026-08-09)
//
// The two remaining instance types are flagged here against the base shape
// for future sessions. Do not implement in this repository without the
// gating sessions named below.
//
// 1. GSEF lineage record (Item 2 §3.2)
//    recordType 'lineage' · governanceEvent 'schema-change' ·
//    boundType 'exposure-upper-bound'.
//    Instance fields: schemaVersion (semver), changeClass (A–E),
//    changeDriver (endogenous/exogenous), compatibilityBound,
//    deprecationHorizon (required unless Class A), blastRadiusClassification.
//    FIELD-SHAPE CHECK vs base: no collisions; chainReference maps cleanly
//    to prior-lineage-entry linkage (chainDepth 0 = first entry).
//    GATES: (a) GSEF vocabulary namespace
//    (…/seam-stack/vocab/gsef/0.1#) is NOT declared — Item 2 §7 names the
//    anticipated IRI without declaring it; (b) Q3 resolution places the
//    record repo-level (LINEAGE.md-equivalent), i.e. its implementation
//    home is the GSEF artifact set, not this prototype's type system.
//
// 2. GPRF verification tag (Item 2 §3.4)
//    recordType 'verification' · governanceEvent 'code-change-verification' ·
//    boundType 'attestation' (the one instance type carrying an explicit
//    human attestation rather than an exposure upper bound).
//    Instance fields: prReference, blastRadiusClass, reviewerDID,
//    verificationTimestamp (superseded by emittedAt — same dual-emission
//    transition note as invocationTimestamp), verificationOutcome
//    (approved / approved-with-conditions / blocked).
//    FIELD-SHAPE CHECK vs base: reviewerDID vs emittedBy — Item 2 §2.1 says
//    emittedBy for verification tags IS the reviewer, so reviewerDID
//    duplicates emittedBy; the alias mapping must decide whether reviewerDID
//    survives as a legacy field or collapses into emittedBy.
//    GATE: the GPRF v0.3 → base-shape alias mapping requires a GPRF v0.4
//    amendment session (Item 2 §7); the tag's fields live at the GPRF
//    namespace (governedpr.org/vocab/gprf/0.3#), not this vocabulary.
// ---------------------------------------------------------------------------
