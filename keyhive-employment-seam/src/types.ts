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
// Contact model — Item 3.1 (build plan v0.4.1, Counter-Passed 2026-08-03)
//
// contactClass distinguishes human contacts from agent-class (automated
// system) contacts. Migration rule: existing contacts have no contactClass
// field and READ AS 'human' — resolve with `contact.contactClass ?? 'human'`.
//
// An agent-class contact's authority is structurally scoped to GRANTEE-ONLY
// at the type level. It cannot be constructed as a holder of any Class A
// sub-role (A1–A6), cannot attest, cannot submit a worker- or employer-side
// account, cannot provide separation-cause input. This is a type-system
// constraint, not a UI-layer restriction: the record-speech authority path
// is typed `never` on AgentContact — unavailable, not merely unrendered.
// (Spec grounding: PC#7 v0.4.1 identity-class pattern; the prototype's
// first-class-contact identity choice is provisional pending the queued
// PC#7 v0.5 attribution ruling — see build plan v0.4.1 §1.2.)
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
  /** Structurally grantee-only: no attestation, no account submission,
   *  no separation-cause input, no A1–A6. Typed unavailable. */
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
// ---------------------------------------------------------------------------

/** The three gate outcomes. `blocked-unconfirmed` is the gate refusing to
 *  act inside the revocation-propagation gap. */
export type GateResult = 'pass' | 'blocked-revoked' | 'blocked-unconfirmed'

/** Revocation-confirmation state, per build plan v0.3 Item 1.2's two-state
 *  model — built 2026-08-03. 'issued' = revoked-local (seam fired, signal
 *  propagating; ref prefix `revoked:`); 'confirmed' = acknowledgment
 *  received (ref prefix `revoked-confirmed:`; sole transition:
 *  gate.ts confirmRevocation, which requires a stated basis). */
export type RevocationConfirmationState = 'none' | 'issued' | 'confirmed'

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
  /** Item 1.3: gate-check entries carry the result as structured data. */
  gateResult?:       GateResult
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
