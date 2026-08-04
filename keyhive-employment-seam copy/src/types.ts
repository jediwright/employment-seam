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

export type Contact = {
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

export type AccessEvent = {
  eventId:           string
  timestamp:         string
  eventType:         AccessEventType
  subjectContactId?: string
  projectId?:        string
  handoffId?:        string
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
  | 'bundle-accessed'