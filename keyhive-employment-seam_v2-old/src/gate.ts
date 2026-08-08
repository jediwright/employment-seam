// src/gate.ts — assertCapabilityCurrent() gate stub
// Items 1.3 and 3.2, keyhive-employment-seam build plan v0.4.1 (2026-08-03),
// item text Counter-Passed 2026-08-03 (R1 (b) / R2 (b) / R3 (a)).
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
// EVIDENCE-LAYER NOTE (build plan v0.4.1, §1.3 amendment):
// Gate-check events — pass and block alike — are evidence-layer material by
// the same logic as `seam:aiProvenance`: a descriptive record of what the
// gate did, not an extension of the gate's own authorization logic. A
// blocked action is governance evidence. Every invocation of this gate
// therefore writes an access-log entry, including blocks.
//
// ONE-DIRECTIONAL DEPENDENCY (build plan v0.4.1, §1.3 / Item 3.2):
// The gate does not inspect `seam:aiProvenance` (which is spec-layer and
// not modeled in this prototype). Even where provenance is modeled, the
// dependency stays one-directional: provenance and gate-checks are an
// adjacent evidence pair, neither consulting the other to decide anything.

import type {
  WorkerKnowledgeGraph,
  Contact,
  AccessTier,
  GateResult,
  RevocationConfirmationState,
} from './types'

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
 * Revocation-confirmation state — THE SINGLE EDIT POINT FOR ITEM 1.2.
 *
 * Item 1.2 (two-state revocation: `capability-revocation-issued` /
 * `capability-revocation-confirmed`) is unbuilt at 050067c; the present
 * schema records revocation as a single local `revoked:`-prefixed ref.
 * Per v0.3 Item 1.2's risk note — "do not fake confirmation from local
 * success" — a locally-revoked capability with no propagation-confirmation
 * signal is honestly ISSUED, not confirmed. When 1.2 lands its two-state
 * events, this function is the only place the gate needs to change.
 */
export function revocationConfirmationState(
  contact: Contact,
): RevocationConfirmationState {
  const ref = contact.keyhiveCapabilityRef
  if (!ref || !ref.startsWith('revoked:')) return 'none'
  // Pre-1.2: local revocation exists; no confirmation signal is modeled.
  return 'issued'
}

export type CapabilityGate = {
  /**
   * The mandatory checkpoint any automated actor must call before acting.
   * Checks capability state per invocation — never satisfied by a TTL or
   * an unexpired token (see header). Humans act through the tabs; no
   * human-driven UI path calls this in the current increment.
   *
   * Every invocation writes an access-log entry, INCLUDING BLOCKS.
   */
  assertCapabilityCurrent: (
    contactId: string,
    capability: AccessTier,
  ) => Promise<GateResult>
}

/**
 * Gate factory. `read` must return the CURRENT document state at call
 * time (never a snapshot captured at construction); `change` writes the
 * gate-check access-log entry through the same mutation path the tabs use.
 */
export function createCapabilityGate(
  read: () => GateDoc | undefined,
  change: (mutate: (d: WorkerKnowledgeGraph) => void) => void,
): CapabilityGate {
  const assertCapabilityCurrent = async (
    contactId: string,
    capability: AccessTier,
  ): Promise<GateResult> => {
    // Fresh read per invocation — execution-state check, not token check.
    const doc = read()
    const contact = doc?.contacts[contactId]

    let result: GateResult
    if (!contact || !contact.keyhiveCapabilityRef) {
      // No contact on record, or no capability ever granted: no current
      // capability exists. At stub level this collapses into
      // `blocked-revoked` ("no current capability on record") rather than
      // adding a fourth result value beyond the Counter-Passed item text.
      result = 'blocked-revoked'
    } else {
      switch (revocationConfirmationState(contact)) {
        case 'issued':
          // Inside the propagation gap: revocation issued locally,
          // confirmation unavailable. The gate refuses to act here.
          result = 'blocked-unconfirmed'
          break
        case 'confirmed':
          result = 'blocked-revoked'
          break
        case 'none': {
          const held = TIER_ORDER[contact.accessTier] >= TIER_ORDER[capability]
          result = held ? 'pass' : 'blocked-revoked'
          break
        }
      }
    }

    // Evidence layer: every check is recorded, pass and block alike.
    const now = new Date().toISOString()
    change((d) => {
      // Note: optional fields are set conditionally, never assigned
      // `undefined` — Automerge rejects undefined property values.
      d.accessLog.push({
        eventId:          crypto.randomUUID(),
        timestamp:        now,
        eventType:        'gate-check',
        subjectContactId: contactId,
        ...(contact ? { contactClass: contact.contactClass ?? 'human' } : {}),
        gateResult:       result,
        notes:            `Gate check for capability '${capability}': ${result}.`,
      })
    })

    return result
  }

  return { assertCapabilityCurrent }
}

// ---------------------------------------------------------------------------
// Item 3.2 — AgentActionContext (stub-level gate wiring)
//
// No agent ACTIONS exist in this increment — agents are grantees, not
// actors. The enforcement point, per v0.3 Item 3.2 option (b): any future
// code path that performs an action on behalf of an `agent`-class contact
// must hold an AgentActionContext, and an AgentActionContext CANNOT BE
// CONSTRUCTED without a passing GateResult. The brand symbol below is
// module-private, so the type is unconstructible outside this file; the
// only producer is openAgentActionContext, which gates on
// assertCapabilityCurrent() ONLY — one-directional, no aiProvenance
// inspection (see header).
//
// Convention (lint-comment level, stated for future increments): agent-side
// action code takes `ctx: AgentActionContext` as its first parameter.
// ---------------------------------------------------------------------------

const GATE_PASSED = Symbol('agent-action:gate-passed')

export type AgentActionContext = {
  readonly [GATE_PASSED]: true
  readonly contactId:     string
  readonly capability:    AccessTier
  /** When the gate check that authorized this context ran. Descriptive
   *  record only — NOT a validity window. A new action requires a new
   *  context (and therefore a new gate check). */
  readonly gateCheckedAt: string
}

/**
 * The sole constructor of AgentActionContext. Returns null on any blocked
 * result — callers cannot proceed to an agent action without a pass.
 */
export async function openAgentActionContext(
  gate: CapabilityGate,
  contactId: string,
  capability: AccessTier,
): Promise<AgentActionContext | null> {
  const result = await gate.assertCapabilityCurrent(contactId, capability)
  if (result !== 'pass') return null
  return {
    [GATE_PASSED]:  true,
    contactId,
    capability,
    gateCheckedAt:  new Date().toISOString(),
  }
}
