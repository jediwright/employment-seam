// src/types.ts — full schema, declare all types here

export type WorkerKnowledgeGraph = {
  identity:  WorkerIdentity
  projects:  Record<string, Project>
  contacts:  Record<string, Contact>
  decisions: Decision[]
  artifacts: Record<string, Artifact>
  handoffs:  Record<string, HandoffRecord>
  accessLog: AccessEvent[]
}

export type WorkerIdentity = {
  displayName:           string
  publicKeyFingerprint:  string
  createdAt:             string
  lastModified:          string
}

export type Project = {
  projectId:     string
  title:         string
  employerName:  string
  startDate:     string
  endDate?:      string
  status:        ProjectStatus
  contextNotes:  string
  stakeholders:  string[]
  artifactRefs:  string[]
  decisionRefs:  string[]
  createdAt:     string
}

export type ProjectStatus = 'active' | 'complete' | 'handed-off' | 'pre-empted'

// ---------------------------------------------------------------------------
// Contact model — Item 3.1 (build plan v0.5, PC#7 v0.5, 2026-08-08)
//
// contactClass distinguishes human contacts from agent-class (automated
// system) contacts. Migration rule: existing contacts have no contactClass
// field and READ AS 'human' — resolve with `contact.contactClass ?? 'human'`.
//
// An agent-class contact's authority is structurally scoped to GRANTEE-ONLY
// at the type level (Principle 6: "Agents are governed parties, never authors
// of record"). It cannot be constructed as a holder of any Class A sub-role
// (A1–A6), cannot attest, cannot submit a worker- or employer-side account,
// cannot provide separation-cause input. This is a type-system constraint,
// not a UI-layer restriction: the record-speech authority path is typed
// `never` on AgentContact — unavailable, not merely unrendered.
//
// v0.5 additions (Item 3.1):
//   identityClass: 'Agent'           — seam:identityClass controlled vocab
//   AgentCapabilityGrant              — capability grant reference type
//   agentCapabilityGrant              — field linking AgentContact to grant
// ---------------------------------------------------------------------------

export type ContactClass = 'human' | 'agent'

/** Class A sub-roles per PC#7 v0.4.1. Held only by human contacts. */
export type ClassASubRole = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'

/**
 * Every code path by which a contact could "speak on the record":
 * attestation, account submission, separation-cause input, or any Class A
 * sub-role. If a future increment adds such a path to the contact model,
 * it must route through this type — which AgentContact types out.
 */
export type RecordSpeechAuthority =
  | 'attestation'
  | 'account-submission'
  | 'separation-cause-input'
  | ClassASubRole

/**
 * seam:agentCapabilityGrant — links an agent-class contact to the grant
 * that authorizes its access. Minimum fields per PC#7 v0.5 spec.
 *
 * When the granting party is a Class C representative (employer-side
 * authority acting on behalf of the operating organization), the optional
 * authorizationVCReference field is required — it carries a reference to
 * the grantor's worker-issued authorization VC, making the chain of
 * authority resolvable from the record itself (Class C chain-of-authority
 * condition, PC#7 v0.5 §3).
 *
 * Prototype note: field presence satisfies the conformance requirement.
 * Scope subsumption (verifying the VC's scope covers the granted capability)
 * is not validated in this prototype per Principle 4 (progressive
 * formalization).
 */
export type AgentCapabilityGrant = {
  /** DID of the party granting the capability (worker or Class C rep). */
  grantingPartyDID:       string
  /** DID of the agent being granted the capability. In this prototype:
   *  derived from the contact's keyhiveCapabilityRef at grant time, or
   *  stubbed as `did:key:agent-${contactId}` when no ref is present. */
  grantedAgentDID:        string
  /** The capability tier granted (maps to AccessTier). */
  capabilityName:         string
  /** ISO timestamp when the grant was issued. */
  grantTimestamp:         string
  /** Scope of the grant (e.g. document set, project ID). Prototype: the
   *  root document URL or 'worker-knowledge-graph'. */
  scope:                  string
  /** Signature of the scoping party (worker or Class C rep). Prototype:
   *  a deterministic stub derived from grantingPartyDID + grantTimestamp;
   *  not cryptographically valid but structurally present. */
  scopingPartySignature:  string
  /** Class C chain-of-authority condition: when the granting party is a
   *  Class C representative, this field carries the reference to the
   *  grantor's worker-issued authorization VC. Required for Class C grants;
   *  absent for direct worker grants. */
  authorizationVCReference?: string
}

type ContactCore = {
  contactId:             string
  displayName:           string
  role:                  string
  employerName:          string
  relationshipType:      RelationshipType
  accessTier:            AccessTier
  keyhiveCapabilityRef?: string
  notes:                 string
  createdAt:             string
}

export type HumanContact = ContactCore & {
  /** Absent on pre-3.1 contacts; absent reads as 'human'. */
  contactClass?: 'human'
  /** Record-speech authority is a human-contact surface only. Unused in
   *  this increment; declared so the constraint is structural now. */
  recordSpeechAuthority?: RecordSpeechAuthority[]
}

export type AgentContact = ContactCore & {
  contactClass: 'agent'
  /** seam:identityClass: Agent — controlled-vocabulary value per PC#7 v0.5.
   *  Populated at agent-contact creation; present on all v0.5 agent contacts. */
  identityClass: 'Agent'
  /** Reference to the capability grant authorizing this agent. Populated at
   *  contact creation with minimum fields; updated at capability-grant time
   *  with the granting-party DID and derived agent DID. */
  agentCapabilityGrant?: AgentCapabilityGrant
  /** Structurally grantee-only: no attestation, no account submission,
   *  no separation-cause input, no A1–A6. Typed unavailable per Principle 6
   *  ("Agents are governed parties, never authors of record"). */
  recordSpeechAuthority?: never
}

export type Contact = HumanContact | AgentContact

export type RelationshipType =
  | 'employer'
  | 'colleague'
  | 'successor'
  | 'client'
  | 'subcontractor'

export type AccessTier =
  | 'none'
  | 'read-bundle'
  | 'read-full'
  | 'write-collab'

export type HandoffRecord = {
  handoffId:                   string
  projectId:                   string
  initiatedAt:                 string
  completedAt?:                string
  status:                      HandoffStatus
  receivingPartyContactId:     string
  bundleHash?:                 string
  relayDeliveryConfirmation?:  string
  failureState?:               HandoffFailureState
  legalRecordRef?:             string
}

export type HandoffStatus =
  | 'pending'
  | 'bundle-ready'
  | 'delivered'
  | 'failed'
  | 'pre-empted'

export type HandoffFailureState =
  | 'relay-unreachable'
  | 'receiving-party-unresponsive'
  | 'bundle-rejected'
  | 'account-pre-empted-before-bundle-ready'
  | 'account-pre-empted-after-bundle-ready'
  | 'partial-delivery'
  | 'contested'

export type Decision = {
  decisionId:   string
  projectId:    string
  title:        string
  context:      string
  outcome:      string
  rationale:    string
  madeAt:       string
  participants: string[]
  supersedes?:  string
  createdAt:    string
}

export type Artifact = {
  artifactId:  string
  projectId:   string
  title:       string
  type:        ArtifactType
  content:     string
  createdAt:   string
  tags:        string[]
}

export type ArtifactType = 'document' | 'diagram' | 'code' | 'meeting-notes' | 'other'

// ---------------------------------------------------------------------------
// Gate result — Item 1.3 (see src/gate.ts for the gate itself)
// Governing spec: pattern-commons-07-employment-seam-v0-5_2026-08-08.md
// ---------------------------------------------------------------------------

/** The three gate outcomes. `blocked-unconfirmed` is the gate refusing to
 *  act inside the revocation-propagation gap. */
export type GateResult = 'pass' | 'blocked-revoked' | 'blocked-unconfirmed'

/** Revocation-confirmation state, per build plan v0.3 Item 1.2's two-state
 *  model — built 2026-08-03. Option A rename applied 2026-08-08 (build plan
 *  v0.5 §3): 'issued' = revoked-local (seam fired, signal propagating; ref
 *  prefix `revoked-local:`); 'confirmed' = acknowledgment received (ref
 *  prefix `revoked-confirmed:`; sole transition: gate.ts confirmRevocation,
 *  which requires a stated basis). */
export type RevocationConfirmationState = 'none' | 'issued' | 'confirmed'

/**
 * seam:gateCheckRecord — first-class evidence artifact per PC#7 v0.5.
 *
 * Every assertCapabilityCurrent() invocation — pass or block — produces
 * one of these. Required fields per the v0.5 spec:
 *   agentDID            — the agent-class participant's DID
 *   grantReference      — granting-party DID or grant identifier (required;
 *                         makes the responsible legal party resolvable from
 *                         the record without external lookup)
 *   capabilityName      — the capability being checked
 *   invocationTimestamp — ISO timestamp of the invocation
 *   gateResult          — pass / blocked-revoked / blocked-unconfirmed
 *
 * revocationStateReference is present on blocked invocations: references
 * the revocation-state entry that triggered the block.
 *
 * GATE/EVIDENCE RELATIONSHIP (PC#7 v0.5, Principle 6):
 * assertCapabilityCurrent() (Governance/Boundary layer) and seam:aiProvenance
 * (Evidence layer) are an adjacent pair — the gate does not read
 * seam:aiProvenance; seam:aiProvenance carries no grant/revoke semantics.
 * Gate-check records are first-class evidence-layer material in the same
 * evidentiary shape as seam:aiProvenance, without either depending on the
 * other.
 */
export type GateCheckRecord = {
  /** The agent-class participant's DID. In this prototype: the contact's
   *  keyhiveCapabilityRef base value (the non-prefix portion of the ref);
   *  falls back to the contactId when no ref exists on record. */
  agentDID:               string
  /** Granting-party DID or grant identifier. Required — makes the
   *  responsible legal party resolvable from the record itself (Principle 6,
   *  clause 3: "resolvable to a juridical person"). */
  grantReference:         string
  /** The capability tier being checked (maps to AccessTier). */
  capabilityName:         string
  /** ISO timestamp of this invocation. */
  invocationTimestamp:    string
  /** Gate outcome. */
  gateResult:             GateResult
  /** Present on blocked invocations: the keyhiveCapabilityRef value that
   *  triggered the block (e.g. `revoked-local:<ref>` or
   *  `revoked-confirmed:<ref>`). Absent on `pass` and on no-capability
   *  blocks (nothing on record to reference). */
  revocationStateReference?: string
}

// ---------------------------------------------------------------------------
// Exposure record — Phase 2 (build plan v0.4.1 Item 2.1)
//
// Captures per-revoked-contact exposure surface at the moment seam fires.
// Q1 source: revocation cannot reach copies already synced; this record is
// the worker-side evidence of what those copies can contain.
//
// FALLBACK PATH (confirmed by Item 1.1 findings): this adapter
// (BroadcastChannel, syncServer 'none') exposes NO per-peer sync state —
// there is no API surface to query what heads the remote side holds.
// The record therefore uses documentIds + WORKER-SIDE heads at revocation
// timestamp, explicitly labeled 'exposure-upper-bound': "at most this,
// as of this moment." This is honest and spec-aligned: the worker cannot
// know what the counterparty holds; it can only attest to the maximum.
//
// seam:exposureRecord candidate — flagged for Pattern Commons thread; out
// of scope here (build plan v0.4.1 Phase 2 spec note).
// ---------------------------------------------------------------------------

export type ExposureRecord = {
  /** 'exposure-upper-bound': worker-side heads used; per-peer heads
   *  unavailable on this transport. Label travels with the data so
   *  downstream readers understand the constraint. */
  boundType:    'exposure-upper-bound'
  /** IDs of documents the contact held a capability to at revocation time.
   *  In this prototype: the single root document. The list is the pattern;
   *  multi-document deployments populate it per-document. */
  documentIds:  string[]
  /** Worker-side Automerge document heads at revocation timestamp, per
   *  document. Array of opaque head strings (as returned by DocHandle.heads()
   *  — treated as strings in this layer; Automerge owns their semantics). */
  headsAtRevocation: Record<string, string[]>
  /** ISO timestamp of revocation — matches the capability-revoked event's
   *  timestamp so the two records can be correlated. */
  revokedAt:    string
}

export type AccessEvent = {
  eventId:           string
  timestamp:         string
  eventType:         AccessEventType
  subjectContactId?: string
  projectId?:        string
  handoffId?:        string
  /** Item 3.1: entries concerning a contact carry its class, so "every
   *  grant ever issued to an automated system" is a filter, not an
   *  investigation. Absent on pre-3.1 entries (all of which are human). */
  contactClass?:     ContactClass
  /** Item 3.1 (v0.5): agent access-log entries carry identityClass so the
   *  agent's governed-party status is legible in the log without opening
   *  the contact record. Present on agent-class events; absent on human. */
  identityClass?:    'Agent'
  /** Item 1.3 (v0.5): gate-check entries carry the full seam:gateCheckRecord
   *  structure. Replaces the prior sparse gateResult field — the structured
   *  record makes the log queryable by agentDID and grantReference per the
   *  v0.5 acceptance criteria. */
  gateCheckRecord?:  GateCheckRecord
  /** Item 3.1 (v0.5): agent access-log entries carry the grantReference at
   *  the event level so the responsible party is resolvable without opening
   *  the nested gateCheckRecord. On gate-check events this duplicates
   *  gateCheckRecord.grantReference; on capability-granted /
   *  capability-revoked entries for agent contacts it stands alone. */
  grantReference?:   string
  /** Phase 2 (Item 2.1): exposure-record events carry the structured
   *  snapshot. Attached to the handoff-completed entry's companion
   *  exposure-record event, one per revoked contact. */
  exposureRecord?:   ExposureRecord
  notes:             string
}

export type AccessEventType =
  | 'document-initialized'
  | 'handoff-initiated'
  | 'bundle-ready'
  | 'handoff-completed'
  | 'handoff-failed'
  | 'account-pre-empted'
  | 'capability-granted'
  | 'capability-revoked'
  /** Item 1.2: 'capability-revoked' records the ISSUED half (local
   *  operation complete, signal in flight); this event records the
   *  CONFIRMED half. The timestamp delta between the two entries is the
   *  propagation gap, made visible. */
  | 'capability-revocation-confirmed'
  | 'bundle-accessed'
  | 'gate-check'
  /** Phase 2 (Item 2.1): one event per revoked contact at seam-fire;
   *  carries the structured ExposureRecord snapshot. Emitted AFTER the
   *  capability-revoked event for that contact. The handoff-completed
   *  event's bundle hash incorporates the exposure records (via
   *  deriveBundleHash extension in HandoffsTab). */
  | 'exposure-record'
