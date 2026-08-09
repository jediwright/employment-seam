// src/gate.ts — assertCapabilityCurrent() gate implementation
// Items 1.3 and 3.2, keyhive-employment-seam build plan v0.5 (2026-08-08).
// Governing spec: pattern-commons-07-employment-seam-v0-5_2026-08-08.md
//
// WHY THIS FUNCTION EXISTS — the inference-flagging gap:
// This gate is the concrete instantiation of the Agentic Accountability
// Playbook's INFERENCE-FLAGGING GAP: an automated actor holding a
// previously-granted capability has no obligation, absent a gate, to
// re-derive whether that capability is still current before acting on it.
// The gate is that obligation, made structural.
//
// BINDING DESIGN CONSEQUENCE (build plan v0.3, Item 1.3 external anchor):
// There is a formal result (Parakhin 2026, surveyed in arXiv:2605.05440)
// that TTL/time-based token revocation fails at agent execution speeds —
// unauthorized operations scale with agent velocity under time-based
// schemes, while execution-state-checked approaches bound them
// independently of velocity. Therefore: this gate checks CURRENT CAPABILITY
// STATE PER INVOCATION. It must never be satisfied by an unexpired token,
// a TTL, or any cached prior result. There is deliberately no memoization
// and no validity window anywhere in this file.
//
// GATE/EVIDENCE RELATIONSHIP (PC#7 v0.5, Principle 6):
// assertCapabilityCurrent() (Governance/Boundary layer) and seam:aiProvenance
// (Evidence layer) are an adjacent pair — the gate does not read
// seam:aiProvenance; seam:aiProvenance carries no grant/revoke semantics.
// Gate-check records (seam:gateCheckRecord) are first-class evidence-layer
// material in the same evidentiary shape as seam:aiProvenance, without
// either depending on the other.
//
// SPEC REFERENCE:
// This gate implements the assertCapabilityCurrent() pattern specified in
// pattern-commons-07-employment-seam-v0-5_2026-08-08.md (Governance layer,
// per Principle 6: "Agents are governed parties, never authors of record").

import type {
  WorkerKnowledgeGraph,
  Contact,
  AccessTier,
  GateResult,
  GateCheckRecord,
  RevocationConfirmationState,
} from './types'
import { mintRecordId } from './crossingRecord'

/**
 * ⚑ AMENDMENT REQUIRED (PC#7 v0.6 candidate — surfaced 2026-08-09):
 * The base shape (Item 2 §2.1) defines `emittedBy` for gate-check records
 * as "the gate's owning seam" — a DID. PC#7 v0.5 defines no seam DID: the
 * worker identity carries a publicKeyFingerprint; the seam itself has no
 * addressable identity. Until an owning-seam DID model is ruled, the gate
 * emits this documented stub (overridable via createCapabilityGate's third
 * parameter). The stub follows the prototype's existing did:key stub
 * convention (cf. grantedAgentDID). It is structurally present and
 * honestly fake — evidence of the gap, not its resolution.
 */
export const OWNING_SEAM_DID_STUB = 'did:key:seam-principal-prototype'

/** The slice of the document the gate reads. */
export type GateDoc = Pick<WorkerKnowledgeGraph, 'contacts' | 'accessLog'>

/** Ordinal tier comparison. Requesting 'none' passes on any held grant. */
const TIER_ORDER: Record<AccessTier, number> = {
  'none':         0,
  'read-bundle':  1,
  'read-full':    2,
  'write-collab': 3,
}

/**
 * Revocation-confirmation state — Item 1.2 (two-state revocation), built
 * 2026-08-03; Option A rename applied 2026-08-08 (build plan v0.5 §3).
 *
 * Two revocation states, per build plan v0.3 Item 1.2, aligned to the
 * v0.5 spec's seam:agentRevocationState controlled vocabulary:
 *   - `revoked-local:<ref>`      → 'issued'    (seam fired, confirmation
 *                                  propagating; formerly prefix `revoked:`)
 *   - `revoked-confirmed:<ref>`  → 'confirmed' (acknowledgment signal
 *                                  received)
 *
 * Gate mapping (switch below): 'issued' → `blocked-unconfirmed` (the gate
 * refuses to act inside the propagation gap); 'confirmed' →
 * `blocked-revoked` (revocation final on this replica's knowledge).
 *
 * ITEM 1.1 FINDING, BINDING HERE: this transport (BroadcastChannel,
 * syncServer 'none') exposes NO per-peer acknowledgment signal, and the
 * measured exposure-beyond-physics is zero — the gate blocks on the first
 * invocation after a signal lands. Per the v0.3 risk-note fallback: a
 * capability therefore stays 'issued' indefinitely unless an explicit,
 * basis-stating confirmation event upgrades it (see confirmRevocation).
 * Nothing in this file — or anywhere — auto-upgrades issued → confirmed
 * from local success. "Issued — propagation unconfirmed on this
 * transport" is the honest resting state.
 */
export function revocationConfirmationState(
  contact: Contact,
): RevocationConfirmationState {
  const ref = contact.keyhiveCapabilityRef
  if (!ref) return 'none'
  if (ref.startsWith('revoked-confirmed:')) return 'confirmed'
  if (ref.startsWith('revoked-local:')) return 'issued'
  return 'none'
}

/**
 * True for a ref in EITHER revocation state. Callers that previously
 * checked a bare revocation prefix must use this instead — a bare check
 * misses 'revoked-confirmed:' and would double-prefix an already-confirmed
 * revocation. Option A (2026-08-08): checks 'revoked-local:' (was
 * 'revoked:').
 */
export function isRevocationRef(ref: string | undefined): boolean {
  return !!ref && (ref.startsWith('revoked-confirmed:') || ref.startsWith('revoked-local:'))
}

/**
 * The sole issued → confirmed transition. Upgrades the ref and writes a
 * `capability-revocation-confirmed` access-log entry with its own
 * timestamp — the delta between the `capability-revoked` entry and this
 * one IS the propagation gap, made visible in the record (v0.3 Item 1.2;
 * the CSA time-to-revoke metric at individual-worker scale).
 *
 * `basis` is REQUIRED: confirmation must name the acknowledgment signal
 * it rests on (a future transport ack handler, a receiving-party receipt,
 * an out-of-band attestation). This is the structural form of the risk
 * note's rule — confirmation cannot be asserted without a stated source,
 * so it cannot be faked from local success. On the current transport
 * (Item 1.1 finding: no ack surface) no code path calls this; it is the
 * landing point for whichever acknowledgment signal arrives first.
 *
 * Returns 'confirmed' on transition; 'not-applicable' if the contact is
 * unknown, unrevoked, or already confirmed (idempotent — no double event).
 *
 * Option A (2026-08-08): checks and strips the `revoked-local:` prefix
 * (was `revoked:`).
 */
export function confirmRevocation(
  change: (mutate: (d: WorkerKnowledgeGraph) => void) => void,
  contactId: string,
  basis: string,
): 'confirmed' | 'not-applicable' {
  let outcome: 'confirmed' | 'not-applicable' = 'not-applicable'
  const now = new Date().toISOString()
  change((d) => {
    const contact = d.contacts[contactId]
    if (!contact) return
    const ref = contact.keyhiveCapabilityRef
    // Only an 'issued' (revoked-local:) revocation can be confirmed.
    // ('revoked-confirmed:' does not match — see state fn above.)
    if (!ref || !ref.startsWith('revoked-local:')) return
    const priorRef = ref.slice('revoked-local:'.length)
    contact.keyhiveCapabilityRef = `revoked-confirmed:${priorRef}`
    d.accessLog.push({
      eventId:          crypto.randomUUID(),
      timestamp:        now,
      eventType:        'capability-revocation-confirmed',
      subjectContactId: contactId,
      contactClass:     contact.contactClass ?? 'human',
      notes:            `Revocation confirmed: propagation acknowledged. Basis: ${basis}. Prior ref: ${priorRef}`,
    })
    outcome = 'confirmed'
  })
  return outcome
}

export type CapabilityGate = {
  /**
   * The mandatory checkpoint any automated actor must call before acting.
   * Checks capability state per invocation — never satisfied by a TTL or
   * an unexpired token (see header). Humans act through the tabs; no
   * human-driven UI path calls this in the current increment.
   *
   * Every invocation writes a seam:gateCheckRecord access-log entry,
   * INCLUDING BLOCKS (per PC#7 v0.5, Principle 6). `grantReference` is a
   * required argument — the record must resolve to the responsible legal
   * party without external lookup.
   */
  assertCapabilityCurrent: (
    contactId: string,
    capability: AccessTier,
    grantReference: string,
  ) => Promise<GateResult>

  /**
   * Identical check, additionally returning the emitted seam:gateCheckRecord.
   * Added for chained-crossing composition (Form C Item 1, CR-5): a relay
   * seam's record must carry `chainReference` to the upstream record's
   * `recordId`, so composed-crossing orchestration needs the record in hand,
   * not only the result. Non-breaking: assertCapabilityCurrent delegates
   * here and keeps its original signature. One invocation = one record =
   * one access-log entry, whichever entry point is used.
   */
  assertCapabilityCurrentWithRecord: (
    contactId: string,
    capability: AccessTier,
    grantReference: string,
  ) => Promise<{ result: GateResult; record: GateCheckRecord }>
}

/**
 * Gate factory. `read` must return the CURRENT document state at call
 * time (never a snapshot captured at construction); `change` writes the
 * gate-check access-log entry through the same mutation path the tabs use.
 */
export function createCapabilityGate(
  read: () => GateDoc | undefined,
  change: (mutate: (d: WorkerKnowledgeGraph) => void) => void,
  /** The gate's owning seam, as a DID — becomes `emittedBy` on every
   *  gate-check record. Defaults to the documented stub; see the
   *  OWNING_SEAM_DID_STUB amendment flag above. */
  owningSeamDID: string = OWNING_SEAM_DID_STUB,
): CapabilityGate {
  const assertCapabilityCurrentWithRecord = async (
    contactId: string,
    capability: AccessTier,
    grantReference: string,
  ): Promise<{ result: GateResult; record: GateCheckRecord }> => {
    // Fresh read per invocation — execution-state check, not token check.
    const doc = read()
    const contact = doc?.contacts[contactId]

    let result: GateResult
    let revocationStateReference: string | undefined

    if (!contact || !contact.keyhiveCapabilityRef) {
      // No contact on record, or no capability ever granted: no current
      // capability exists. At this level this collapses into
      // `blocked-revoked` ("no current capability on record") rather than
      // adding a fourth result value beyond the spec's controlled
      // vocabulary. No revocationStateReference — nothing on record to
      // reference.
      result = 'blocked-revoked'
    } else {
      switch (revocationConfirmationState(contact)) {
        case 'issued':
          // Inside the propagation gap: revocation issued locally,
          // confirmation unavailable. The gate refuses to act here.
          result = 'blocked-unconfirmed'
          revocationStateReference = contact.keyhiveCapabilityRef
          break
        case 'confirmed':
          result = 'blocked-revoked'
          revocationStateReference = contact.keyhiveCapabilityRef
          break
        case 'none': {
          const held = TIER_ORDER[contact.accessTier] >= TIER_ORDER[capability]
          result = held ? 'pass' : 'blocked-revoked'
          break
        }
      }
    }

    // Evidence layer: every check is recorded, pass and block alike, as a
    // seam:gateCheckRecord with all required fields per PC#7 v0.5.
    const now = new Date().toISOString()
    const agentDID = contact?.keyhiveCapabilityRef
      ? contact.keyhiveCapabilityRef.replace(/^revoked-(local|confirmed):/, '')
      : contactId

    // seam:CrossingRecord base-shape emission (Item 2 §2, applied 2026-08-09).
    //
    // provenanceStatus BEHAVIOR (SL-0034 under test this session):
    // The gate emits 'asserted' on EVERY result — pass, blocked-revoked,
    // and blocked-unconfirmed alike. The two fields answer different
    // questions and must not conflate: `gateResult` is the gate's OUTCOME
    // ("what did the check return"); `provenanceStatus` is the RECORD's
    // epistemic status ("how do this record's claims stand"). A
    // blocked-unconfirmed result expresses uncertainty about revocation
    // PROPAGATION; the record's claim — "the gate returned
    // blocked-unconfirmed at T against this replica's state" — is directly
    // observed by the emitter and is therefore correctly 'asserted'
    // (Q6 trust-the-author: author-declared claims at emission).
    // No basis field is emitted (basis belongs to non-asserted statuses).
    // Status upgrades are SUPERSESSION events — a new record referencing
    // this one via supersededBy — never mutations of this record
    // (supersession-not-reinterpretation, Item 2 §2.2). Nothing in this
    // file, including confirmRevocation, rewrites an emitted record.
    //
    // Producer inventory (honest upper bound): this prototype emits ONLY
    // 'asserted'. The 'confirmed' / 'contested' / 'superseded' statuses
    // are schema-present, producer-absent — parallel to the locked
    // lineageAnchorType values. The vocabulary names them; no machinery
    // here produces them.
    //
    // `emittedAt` and `invocationTimestamp` are the same instant by
    // construction — dual emission per the Item 2 §3.1 transition rule
    // (`invocationTimestamp` is the v0.5 term, superseded by the base
    // term; both emitted for backward compatibility).
    const gateCheckRecord: GateCheckRecord = {
      // Base shape — identity group
      recordId:            mintRecordId(),
      recordType:          'gate-check',
      emittedAt:           now,
      emittedBy:           owningSeamDID,
      // Base shape — provenance linkage group
      provenanceStatus:    'asserted',
      // Base shape — lineage anchoring group: absent. Principal-seam
      // record; no chain participation claimed (Item 2 §2.3 — the group
      // is required for relay records only).
      // Base shape — evidence scope group
      governanceEvent:     'gate-check',
      boundType:           'exposure-upper-bound',
      // Instance extension — PC#7 v0.5 field set (authoritative)
      agentDID,
      grantReference,
      capabilityName:      capability,
      invocationTimestamp: now,
      gateResult:          result,
      // Optional field set conditionally, never assigned `undefined` —
      // Automerge rejects undefined property values.
      ...(revocationStateReference !== undefined
        ? { revocationStateReference }
        : {}),
    }

    change((d) => {
      d.accessLog.push({
        eventId:          crypto.randomUUID(),
        timestamp:        now,
        eventType:        'gate-check',
        subjectContactId: contactId,
        ...(contact ? { contactClass: contact.contactClass ?? 'human' } : {}),
        gateCheckRecord,
        grantReference,
        notes: `Gate check for capability '${capability}': ${result}. Grant: ${grantReference}.`,
      })
    })

    return { result, record: gateCheckRecord }
  }

  /** Original entry point — unchanged signature, delegates to the
   *  record-returning variant. */
  const assertCapabilityCurrent = async (
    contactId: string,
    capability: AccessTier,
    grantReference: string,
  ): Promise<GateResult> => {
    const { result } = await assertCapabilityCurrentWithRecord(
      contactId,
      capability,
      grantReference,
    )
    return result
  }

  return { assertCapabilityCurrent, assertCapabilityCurrentWithRecord }
}

// ---------------------------------------------------------------------------
// Item 3.2 — AgentActionContext (gate wiring, stub-level)
//
// Spec reference: pattern-commons-07-employment-seam-v0-5_2026-08-08.md,
// Principle 6: "Agents are governed parties, never authors of record."
//
// Every agent action context passes through assertCapabilityCurrent(); the
// result is logged as a seam:gateCheckRecord; this is the spec's "agents
// are governed parties" commitment expressed at the code level. The gate
// does not inspect seam:aiProvenance in either direction — the gate/
// evidence pair is adjacent, not dependent (see header).
//
// No agent ACTIONS exist in this increment — agents are grantees, not
// actors. The enforcement point, per v0.3 Item 3.2 option (b): any future
// code path that performs an action on behalf of an `agent`-class contact
// must hold an AgentActionContext, and an AgentActionContext CANNOT BE
// CONSTRUCTED without a passing GateResult. The brand symbol below is
// module-private, so the type is unconstructible outside this file; the
// only producer is openAgentActionContext, which gates on
// assertCapabilityCurrent() ONLY — one-directional, no aiProvenance
// inspection.
//
// Convention (lint-comment level, stated for future increments): agent-side
// action code takes `ctx: AgentActionContext` as its first parameter.
// ---------------------------------------------------------------------------

const GATE_PASSED = Symbol('agent-action:gate-passed')

export type AgentActionContext = {
  readonly [GATE_PASSED]: true
  readonly contactId:      string
  readonly capability:     AccessTier
  /** The grant this context was opened under — flows into every
   *  seam:gateCheckRecord the context's gate check produced, so the
   *  responsible legal party travels with the authorization. */
  readonly grantReference: string
  /** When the gate check that authorized this context ran. Descriptive
   *  record only — NOT a validity window. A new action requires a new
   *  context (and therefore a new gate check). */
  readonly gateCheckedAt:  string
}

/**
 * The sole constructor of AgentActionContext. Returns null on any blocked
 * result — callers cannot proceed to an agent action without a pass.
 */
export async function openAgentActionContext(
  gate: CapabilityGate,
  contactId: string,
  capability: AccessTier,
  grantReference: string,
): Promise<AgentActionContext | null> {
  const result = await gate.assertCapabilityCurrent(contactId, capability, grantReference)
  if (result !== 'pass') return null
  return {
    [GATE_PASSED]:  true,
    contactId,
    capability,
    grantReference,
    gateCheckedAt:  new Date().toISOString(),
  }
}
