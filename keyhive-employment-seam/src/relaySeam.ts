// src/relaySeam.ts — Type 2 (relay) seam as a second boundary participant
//
// Implementation session, 2026-08-09 (Session Harness Mode 1).
// Governing docs:
//   form-c-item1-seam-type-composition-rules_2026-08-08.md
//     (Type 1/2 seam definitions §1.2; OI-1 resolution §1.3; CR-1–CR-5 §2;
//      finality-arbiter-free satisfaction §3)
//   form-c-item2-unified-crossing-record-schema_2026-08-08.md
//     (base shape §2; lineage anchoring group §2.3; relay gate-check
//      extension §3.1)
//   pattern-commons-07-employment-seam-v0-5_2026-08-08.md
//     (gateCheckRecord field set; assertCapabilityCurrent() discipline;
//      fail-closed revocation model)
//
// WHAT A RELAY SEAM IS (Item 1 §1.2, Type 2):
// A seam issued downstream of a principal seam, where the crossing party is
// a relay — any infrastructure intermediary that forwards, transforms, or
// routes local-first data (P14). A relay seam is NOT a passive delivery
// mechanism; it is a governed party with acceptance conditions, its own
// grant, its own revocation state model, and its own gate-check record.
// The test is structural: does a second boundary crossing occur? If yes,
// a relay seam is required.
//
// NOT A CLASS HIERARCHY (Item 1 §1.2 / CR-1 / C1):
// A Type 2 seam does not inherit the Type 1 grant. Grant scope is
// seam-local; no implicit cross-seam transfer occurs. This module therefore
// REUSES the principal gate machinery (createCapabilityGate) against the
// relay party's OWN capability state — same discipline, second instance —
// rather than subclassing or extending the principal seam's authority.
//
// GRANTOR ELIGIBILITY (OI-1 resolution, Item 1 §1.3):
// The relay grant is issued by the worker (Class A), a Class B/B′ role, or
// a Class C representative under the chain-of-authority condition. The
// relay party itself is NOT an eligible grantor — self-authorization would
// terminate the grant chain at a non-juridical party. In this prototype the
// relay party is modeled as an agent-class (Class G) contact holding an
// AgentCapabilityGrant, which structurally encodes grantee-only status
// (Principle 6) and reuses the existing grant/revocation machinery.
//
// SCOPE CONTAINMENT (CR-3(b)) — recorded, not certified:
// upstreamGrantReference establishes that the relay grant claims scope
// within the upstream grant. Per the prototype's existing Principle 4
// posture (cf. AgentCapabilityGrant.authorizationVCReference in types.ts:
// "field presence satisfies the conformance requirement; scope subsumption
// is not validated in this prototype"), containment is RECORDED in the
// relay record, not verified by the gate. CR-3 requires resolvability, not
// a specific verification mechanism.
//
// FINALITY-ARBITER-FREE (Item 1 §3):
// Nothing here requires a coordinating party. The relay gate checks
// locally-held relay-grant state; chainReference is a pointer written at
// crossing time by the crossing party, not a countersigned confirmation;
// chain traversal is a read against records already in hand.

import type {
  WorkerKnowledgeGraph,
  AccessTier,
  GateResult,
  GateCheckRecord,
} from './types'
import {
  createCapabilityGate,
  type GateDoc,
  type CapabilityGate,
} from './gate'
import {
  validateCrossingRecordBase,
  LINEAGE_ANCHOR_TYPES,
  type LineageAnchorType,
} from './crossingRecord'

// ---------------------------------------------------------------------------
// CR-5 controlled vocabulary — relayRole
// Canonical source: Item 1 §2 CR-5 field table. Declares the relay's
// function; scope of transformation must be within the upstream grant's
// scope (recorded, not certified — see header).
// ---------------------------------------------------------------------------

export const RELAY_ROLES = ['forward', 'transform', 'route'] as const
export type RelayRole = (typeof RELAY_ROLES)[number]

/**
 * ⚑ AMENDMENT FLAG CARRIED (SL-0039 Flag A, dispositioned SL-0040/SL-0042:
 * option (c) — stub with the gap formally named, survived narrowed):
 * The relay seam, like the principal seam, has no spec-defined owning-seam
 * DID. The relay stub parallels OWNING_SEAM_DID_STUB in gate.ts and is
 * overridable at relay-gate construction. The PC#7 v0.6/v0.7 owning-seam
 * DID resolution governs both seams when it lands; nothing new is decided
 * here.
 */
export const RELAY_SEAM_DID_STUB = 'did:key:seam-relay-prototype'

// ---------------------------------------------------------------------------
// Relay gate-check record — Item 2 §3.1 relay extension (CR-5 fields) on top
// of the principal gate-check instance, with the base lineage anchoring
// group PINNED PRESENT (Item 2 §2.3: conditionally required — mandatory for
// relay records; the base type's discriminated union permits absence, the
// relay type does not).
// ---------------------------------------------------------------------------

export type RelayGateCheckRecord = GateCheckRecord & {
  /** Required for relay records (base §2.3): the immediately upstream
   *  gate-check record's recordId — the Seam 1 record in a two-seam chain,
   *  or the next-upstream relay record in a multi-hop chain (CR-5). */
  chainReference: string
  /** Position in the chain. Principal seam: 0 (implicit — principal
   *  records omit the anchoring group). First relay: 1. */
  chainDepth: number
  /** Q6 default: 'author-declared' is the only available value; signed
   *  variants are locked (enforced by validateCrossingRecordBase). */
  lineageAnchorType: LineageAnchorType
  /** CR-5: the upstream seam's grant reference — establishes that this
   *  relay grant's scope is contained within the upstream grant
   *  (containment recorded, not certified — see header). */
  upstreamGrantReference: string
  /** CR-5 controlled vocabulary: forward / transform / route. */
  relayRole: RelayRole
}

/**
 * Runtime conformance validator for the relay gate-check instance.
 * Composes the base-shape validator (which enforces anchoring-group
 * coherence and the Q6 lock) with the relay-specific requirements: the
 * anchoring group must be PRESENT, and the two CR-5 instance fields must
 * be present and vocabulary-conformant. Violation strings follow the
 * base validator's `group: constraint` style.
 */
export function validateRelayGateCheckRecord(record: unknown): string[] {
  const v = validateCrossingRecordBase(record)
  if (typeof record !== 'object' || record === null) return v
  const r = record as Record<string, unknown>

  // Relay records may not omit the lineage anchoring group (base §2.3).
  if (r.chainReference === undefined) {
    v.push('relay-extension: chainReference required for relay seam records (base §2.3, CR-5)')
  }
  if (typeof r.upstreamGrantReference !== 'string' || r.upstreamGrantReference.length === 0) {
    v.push('relay-extension: upstreamGrantReference missing or empty (CR-5)')
  }
  if (!RELAY_ROLES.includes(r.relayRole as RelayRole)) {
    v.push(`relay-extension: relayRole not in controlled vocabulary (${RELAY_ROLES.join(' / ')})`)
  }
  // A relay is downstream by definition; depth 0 is the principal's slot.
  if (typeof r.chainDepth === 'number' && r.chainDepth < 1) {
    v.push('relay-extension: chainDepth must be ≥ 1 for relay records (principal seam holds depth 0)')
  }
  return v
}

// ---------------------------------------------------------------------------
// Relay seam gate
// ---------------------------------------------------------------------------

/** Reference to the immediately upstream crossing, supplied by the
 *  composed-crossing orchestration at relay invocation time. */
export type UpstreamCrossingRef = {
  /** The upstream seam's gate-check record (Seam 1's, or the previous
   *  relay's in a multi-hop chain). Its recordId becomes chainReference;
   *  its chainDepth (absent ⇒ 0) determines this record's depth. */
  upstreamRecord: GateCheckRecord
  /** The upstream seam's grant reference (CR-5). */
  upstreamGrantReference: string
}

export type RelaySeamGate = {
  /**
   * The relay-seam analogue of assertCapabilityCurrent(): checks the RELAY
   * party's own grant state per invocation (CR-1 — the Seam 1 grant confers
   * nothing here) and emits a RelayGateCheckRecord on every invocation,
   * pass or block (CR-2). The record carries the CR-5 chain fields.
   *
   * WHAT THIS GATE DOES NOT DO (CR-4, deliberately): it does not read the
   * upstream seam's revocation state. That would require cross-seam
   * propagation, which is a Known Limit (C2). The upstream record passed
   * in is a lineage pointer source, not a validity input — the gate does
   * not re-derive the upstream result from it. Enforcement of "every grant
   * in the chain is active" lives in the composed-crossing orchestration
   * (performChainedCrossing below), which fires the seams in order and
   * halts on the first block. Invoking this gate directly with a stale
   * upstream record reproduces exactly the enforcement gap CR-4 declares.
   */
  assertRelayCrossingCurrent: (
    relayContactId: string,
    capability: AccessTier,
    relayGrantReference: string,
    upstream: UpstreamCrossingRef,
    relayRole: RelayRole,
  ) => Promise<{ result: GateResult; record: RelayGateCheckRecord }>
}

/**
 * Relay seam gate factory. `read`/`change` operate on the RELAY SEAM'S OWN
 * document state — in tests and deployments this is a separate GateDoc from
 * the principal seam's, making C2 (no cross-seam revocation propagation)
 * structural rather than conventional: revoking the relay grant touches
 * nothing in the principal doc, and vice versa.
 *
 * Internally wraps createCapabilityGate: the relay's grant/revocation/gate
 * lifecycle is the SAME machinery as the principal's, applied to the relay
 * party's own state. CR-1 and CR-2 are satisfied by instantiation, not by
 * new authorization logic.
 */
export function createRelaySeamGate(
  read: () => GateDoc | undefined,
  change: (mutate: (d: WorkerKnowledgeGraph) => void) => void,
  relaySeamDID: string = RELAY_SEAM_DID_STUB,
): RelaySeamGate {
  // The inner principal-machinery gate writes the base + PC#7 instance
  // fields and the access-log entry; this wrapper adds the CR-5 chain
  // fields to the emitted record (both the returned copy and the logged
  // copy — one invocation, one record, chain fields included everywhere).
  const inner: CapabilityGate = createCapabilityGate(read, change, relaySeamDID)

  const assertRelayCrossingCurrent = async (
    relayContactId: string,
    capability: AccessTier,
    relayGrantReference: string,
    upstream: UpstreamCrossingRef,
    relayRole: RelayRole,
  ): Promise<{ result: GateResult; record: RelayGateCheckRecord }> => {
    const { result, record } = await inner.assertCapabilityCurrentWithRecord(
      relayContactId,
      capability,
      relayGrantReference,
    )

    // CR-5 / base §2.3 fields. chainDepth = upstream depth + 1; an
    // upstream record without the anchoring group is a principal record
    // at implicit depth 0 (Item 2 §2.3).
    const upstreamDepth =
      typeof upstream.upstreamRecord.chainDepth === 'number'
        ? upstream.upstreamRecord.chainDepth
        : 0

    const relayFields = {
      chainReference:         upstream.upstreamRecord.recordId,
      chainDepth:             upstreamDepth + 1,
      lineageAnchorType:      'author-declared' as const,
      upstreamGrantReference: upstream.upstreamGrantReference,
      relayRole,
    }

    const relayRecord: RelayGateCheckRecord = { ...record, ...relayFields }

    // The access-log entry written by the inner gate carries the record
    // WITHOUT the chain fields. Patch the logged copy in place so the
    // evidence layer holds the full relay record — the log is the record
    // surface (PC#7 v0.5: the access log, not a role-conditioned view, is
    // the agent's record surface), and a chain assembled from the log must
    // find the chainReference there, not only in the returned value.
    change((d) => {
      const entry = d.accessLog.find(
        (e) => e.gateCheckRecord?.recordId === record.recordId,
      )
      if (entry && entry.gateCheckRecord) {
        Object.assign(entry.gateCheckRecord, relayFields)
      }
    })

    return { result, record: relayRecord }
  }

  return { assertRelayCrossingCurrent }
}

// ---------------------------------------------------------------------------
// Composed crossing — the CR-4 enforcement point
// ---------------------------------------------------------------------------

export type ChainedCrossingOutcome = {
  /** 'valid' iff every seam's gate returned 'pass' (CR-4: no grant in the
   *  chain in a revoked state; achieved by checking each seam in order and
   *  halting on the first block). */
  composedResult: 'valid' | 'blocked'
  /** Which seam blocked, when blocked. */
  blockedAt?: 'principal' | 'relay'
  /** The principal seam's result and record (always present — Seam 1 is
   *  always checked first). */
  principal: { result: GateResult; record: GateCheckRecord }
  /** The relay seam's result and record. ABSENT when the principal seam
   *  blocked: no relay crossing was attempted, so no relay gate invocation
   *  occurred and no relay record exists. CR-2 requires a record from every
   *  seam IN a chained crossing; a crossing halted at Seam 1 never reached
   *  the relay boundary. */
  relay?: { result: GateResult; record: RelayGateCheckRecord }
}

/**
 * Fires a two-seam chained crossing in composition order: principal seam
 * first, relay seam only on a principal pass. This ordering — not any
 * cross-seam state read — is what enforces CR-4's valid-crossing condition:
 * a `revoked-local` (or any non-active) grant at Seam 1 blocks the composed
 * crossing because the relay boundary is never reached. Each gate still
 * checks only its own grant's state (C2; finality-arbiter-free §3).
 */
export async function performChainedCrossing(args: {
  principalGate: CapabilityGate
  relayGate: RelaySeamGate
  principal: {
    contactId: string
    capability: AccessTier
    grantReference: string
  }
  relay: {
    contactId: string
    capability: AccessTier
    grantReference: string
    relayRole: RelayRole
  }
}): Promise<ChainedCrossingOutcome> {
  const principal = await args.principalGate.assertCapabilityCurrentWithRecord(
    args.principal.contactId,
    args.principal.capability,
    args.principal.grantReference,
  )

  if (principal.result !== 'pass') {
    return { composedResult: 'blocked', blockedAt: 'principal', principal }
  }

  const relay = await args.relayGate.assertRelayCrossingCurrent(
    args.relay.contactId,
    args.relay.capability,
    args.relay.grantReference,
    {
      upstreamRecord: principal.record,
      upstreamGrantReference: args.principal.grantReference,
    },
    args.relay.relayRole,
  )

  return relay.result === 'pass'
    ? { composedResult: 'valid', principal, relay }
    : { composedResult: 'blocked', blockedAt: 'relay', principal, relay }
}

// ---------------------------------------------------------------------------
// Chain traversal — CR-3 resolvability, exercised from record
// ---------------------------------------------------------------------------

export type ChainTraversalResult = {
  /** Records from the starting record upward, ending at the chain root
   *  (a record with no chainReference — the principal record, depth 0). */
  chain: GateCheckRecord[]
  /** True iff traversal reached a root record and every link resolved. */
  resolved: boolean
  /** Populated when resolution failed. */
  failure?: string
}

/**
 * Traverses chainReference pointers upward from a starting record through
 * a supplied record set (e.g. the union of both seams' access-log records).
 * CR-3: given any relay seam's gate-check record, the full chain must be
 * traversable — a read against records in hand, no external lookup, no
 * coordination (finality-arbiter-free §3). Juridical resolvability
 * (CR-3(c)) then runs through the root record's required grantReference.
 */
export function traverseChain(
  records: GateCheckRecord[],
  startRecordId: string,
): ChainTraversalResult {
  const byId = new Map(records.map((r) => [r.recordId, r]))
  const chain: GateCheckRecord[] = []
  const visited = new Set<string>()

  let current = byId.get(startRecordId)
  if (!current) {
    return { chain, resolved: false, failure: `start record not in set: ${startRecordId}` }
  }

  while (current) {
    if (visited.has(current.recordId)) {
      return { chain, resolved: false, failure: `cycle detected at ${current.recordId}` }
    }
    visited.add(current.recordId)
    chain.push(current)

    const ref = current.chainReference
    if (ref === undefined) {
      // Root reached: a record with no chainReference is a principal-seam
      // record at implicit depth 0 (Item 2 §2.3).
      return { chain, resolved: true }
    }
    const next = byId.get(ref)
    if (!next) {
      return { chain, resolved: false, failure: `chainReference dangling: ${ref}` }
    }
    current = next
  }
  /* istanbul ignore next -- unreachable */
  return { chain, resolved: false, failure: 'unreachable' }
}

// Re-export for test ergonomics.
export { LINEAGE_ANCHOR_TYPES }
