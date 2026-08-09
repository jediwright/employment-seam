// src/relaySeam.test.ts — CR-1–CR-5 acceptance criteria against live
// prototype behavior (Form C relay-seam implementation session, 2026-08-09).
//
// Governing docs:
//   form-c-item1-seam-type-composition-rules_2026-08-08.md (CR-1–CR-5)
//   form-c-item2-unified-crossing-record-schema_2026-08-08.md (§2.3, §3.1)
//
// Evidence posture (session scope rule): prototype behavior is EVIDENCE.
// If behavior contradicts a composition rule, the rule is flagged for
// amendment — the test documents the behavior; it does not "fix" it to
// match the rule. The CR-4 enforcement-gap test below is the deliberate
// instance of this posture: it pins the gap CR-4 itself declares.

import { describe, it, expect } from 'vitest'
import { createCapabilityGate } from './gate'
import type { GateDoc } from './gate'
import {
  createRelaySeamGate,
  performChainedCrossing,
  traverseChain,
  validateRelayGateCheckRecord,
  RELAY_ROLES,
  RELAY_SEAM_DID_STUB,
} from './relaySeam'
import type {
  WorkerKnowledgeGraph,
  Contact,
  AccessEvent,
} from './types'
import { validateCrossingRecordBase } from './crossingRecord'

// --- Harness: two independent seam docs -------------------------------------
//
// The principal seam and the relay seam each get their OWN GateDoc. This is
// deliberate and load-bearing: C2 (revocation state does not propagate
// across seam boundaries) is structural in the test topology — mutating one
// doc cannot touch the other.

const PRINCIPAL_GRANT = 'did:key:zWorkerGrantor'
const RELAY_GRANT = 'did:key:zRelayGrantor'

function makeContact(overrides: {
  contactId: string
  accessTier?: Contact['accessTier']
  keyhiveCapabilityRef?: string
  agentClass?: boolean
}): Contact {
  const core = {
    contactId:        overrides.contactId,
    displayName:      'Test Party',
    role:             'Party',
    employerName:     'Acme',
    relationshipType: 'successor' as const,
    accessTier:       overrides.accessTier ?? ('read-bundle' as const),
    ...(overrides.keyhiveCapabilityRef !== undefined
      ? { keyhiveCapabilityRef: overrides.keyhiveCapabilityRef }
      : {}),
    notes:            '',
    createdAt:        new Date().toISOString(),
  }
  return overrides.agentClass
    ? { ...core, contactClass: 'agent' as const, identityClass: 'Agent' as const }
    : { ...core, contactClass: 'human' as const }
}

function makeSeamDoc(contacts: Contact[]) {
  const accessLog: AccessEvent[] = []
  const doc: GateDoc = {
    contacts: Object.fromEntries(contacts.map((c) => [c.contactId, c])),
    accessLog,
  }
  return {
    doc,
    accessLog,
    read: () => doc,
    change: (mutate: (d: WorkerKnowledgeGraph) => void) =>
      mutate(doc as WorkerKnowledgeGraph),
  }
}

/** Standard two-seam topology: principal agent granted at Seam 1; relay
 *  party (agent-class, Class G — grantee-only per OI-1/Principle 6)
 *  granted at Seam 2, in a separate doc. */
function makeChainedHarness(opts?: {
  principalRef?: string
  relayRef?: string
}) {
  const seam1 = makeSeamDoc([
    makeContact({
      contactId: 'agent-1',
      accessTier: 'read-bundle',
      keyhiveCapabilityRef: opts?.principalRef ?? 'cap-principal-1',
      agentClass: true,
    }),
  ])
  const seam2 = makeSeamDoc([
    makeContact({
      contactId: 'relay-1',
      accessTier: 'read-bundle',
      ...(opts && 'relayRef' in opts && opts.relayRef === undefined
        ? {}
        : { keyhiveCapabilityRef: opts?.relayRef ?? 'cap-relay-1' }),
      agentClass: true,
    }),
  ])
  const principalGate = createCapabilityGate(seam1.read, seam1.change)
  const relayGate = createRelaySeamGate(seam2.read, seam2.change)
  return { seam1, seam2, principalGate, relayGate }
}

function chainedArgs(relayRole: 'forward' | 'transform' | 'route' = 'forward') {
  return {
    principal: {
      contactId: 'agent-1',
      capability: 'read-bundle' as const,
      grantReference: PRINCIPAL_GRANT,
    },
    relay: {
      contactId: 'relay-1',
      capability: 'read-bundle' as const,
      grantReference: RELAY_GRANT,
      relayRole,
    },
  }
}

// ============================================================================
// CR-1 — Independent grant per seam
// ============================================================================

describe('CR-1: relay crossing requires its own grant', () => {
  it('blocks the relay crossing when the relay party holds no grant, even though Seam 1 passed', async () => {
    const { principalGate, relayGate } = makeChainedHarness({ relayRef: undefined })
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    // Seam 1 passed on its own grant…
    expect(outcome.principal.result).toBe('pass')
    // …and conferred NOTHING at Seam 2: no relay grant → no current
    // capability on record → blocked (same no-capability collapse as the
    // principal gate — C1: no implicit cross-seam transfer).
    expect(outcome.composedResult).toBe('blocked')
    expect(outcome.blockedAt).toBe('relay')
    expect(outcome.relay?.result).toBe('blocked-revoked')
  })

  it('passes the relay crossing only on the relay party\u2019s own grant state', async () => {
    const { principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.composedResult).toBe('valid')
    expect(outcome.relay?.result).toBe('pass')
    // The relay record's own grantReference is the RELAY grant, not the
    // principal grant — the grants are distinct fields on distinct records.
    expect(outcome.relay?.record.grantReference).toBe(RELAY_GRANT)
    expect(outcome.principal.record.grantReference).toBe(PRINCIPAL_GRANT)
    expect(outcome.relay?.record.grantReference).not.toBe(
      outcome.principal.record.grantReference,
    )
  })

  it('relay revocation is seam-local: revoking the relay grant does not touch Seam 1 state (C2 structural)', async () => {
    const { seam1, seam2, principalGate, relayGate } = makeChainedHarness({
      relayRef: 'revoked-local:cap-relay-1',
    })
    const before = JSON.stringify(seam1.doc.contacts)
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.composedResult).toBe('blocked')
    expect(outcome.blockedAt).toBe('relay')
    // Seam 1 contact state untouched by anything at Seam 2.
    expect(JSON.stringify(seam1.doc.contacts)).toBe(before)
    // And the relay's revocation lives only in the relay doc.
    expect(seam2.doc.contacts['relay-1'].keyhiveCapabilityRef).toMatch(/^revoked-local:/)
    expect(seam1.doc.contacts['agent-1'].keyhiveCapabilityRef).toBe('cap-principal-1')
  })
})

// ============================================================================
// CR-2 — Independent gate check and record per seam
// ============================================================================

describe('CR-2: relay emits its own gate-check record independently', () => {
  it('a valid composed crossing produces two records with distinct recordIds, one per seam log', async () => {
    const { seam1, seam2, principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.composedResult).toBe('valid')

    const seam1Records = seam1.accessLog.filter((e) => e.eventType === 'gate-check')
    const seam2Records = seam2.accessLog.filter((e) => e.eventType === 'gate-check')
    expect(seam1Records).toHaveLength(1)
    expect(seam2Records).toHaveLength(1)
    expect(seam1Records[0].gateCheckRecord!.recordId).not.toBe(
      seam2Records[0].gateCheckRecord!.recordId,
    )
  })

  it('the relay record is emitted by the relay seam, not the principal seam', async () => {
    const { principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.relay?.record.emittedBy).toBe(RELAY_SEAM_DID_STUB)
    expect(outcome.principal.record.emittedBy).not.toBe(RELAY_SEAM_DID_STUB)
  })

  it('the relay gate emits a record on its own BLOCKS too (a silent seam is not a governed seam)', async () => {
    const { seam2, principalGate, relayGate } = makeChainedHarness({
      relayRef: 'revoked-confirmed:cap-relay-1',
    })
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.composedResult).toBe('blocked')
    expect(outcome.relay?.result).toBe('blocked-revoked')
    // The blocked relay invocation still wrote its record, chain fields
    // included, to the relay seam's log.
    const logged = seam2.accessLog.find((e) => e.eventType === 'gate-check')
    expect(logged?.gateCheckRecord?.gateResult).toBe('blocked-revoked')
    expect(logged?.gateCheckRecord?.chainReference).toBe(
      outcome.principal.record.recordId,
    )
    expect(logged?.gateCheckRecord?.revocationStateReference).toBe(
      'revoked-confirmed:cap-relay-1',
    )
  })

  it('the logged relay record and the returned relay record are the same record (one invocation, one record)', async () => {
    const { seam2, principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    const logged = seam2.accessLog.find((e) => e.eventType === 'gate-check')
    expect(logged?.gateCheckRecord).toEqual(outcome.relay?.record)
  })
})

// ============================================================================
// CR-3 — Resolvable grant chain
// ============================================================================

describe('CR-3: the grant chain is traversable from the relay record', () => {
  it('traverses from the relay record to the principal (root) record across the union of seam logs', async () => {
    const { seam1, seam2, principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    const allRecords = [...seam1.accessLog, ...seam2.accessLog]
      .filter((e) => e.gateCheckRecord)
      .map((e) => e.gateCheckRecord!)

    const traversal = traverseChain(allRecords, outcome.relay!.record.recordId)
    expect(traversal.resolved).toBe(true)
    expect(traversal.chain).toHaveLength(2)
    expect(traversal.chain[0].recordId).toBe(outcome.relay!.record.recordId)
    expect(traversal.chain[1].recordId).toBe(outcome.principal.record.recordId)
    // Root is a principal record: no anchoring group (implicit depth 0).
    expect(traversal.chain[1].chainReference).toBeUndefined()
  })

  it('CR-3(a)+(c): every record in the chain carries a grantReference, and the root\u2019s resolves the juridical party', async () => {
    const { seam1, seam2, principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    const allRecords = [...seam1.accessLog, ...seam2.accessLog]
      .filter((e) => e.gateCheckRecord)
      .map((e) => e.gateCheckRecord!)
    const { chain } = traverseChain(allRecords, outcome.relay!.record.recordId)

    for (const record of chain) {
      expect(typeof record.grantReference).toBe('string')
      expect(record.grantReference.length).toBeGreaterThan(0)
    }
    // Juridical resolvability in-record: the root's grantReference is the
    // granting party's DID — no external lookup performed or required.
    expect(chain[chain.length - 1].grantReference).toBe(PRINCIPAL_GRANT)
  })

  it('CR-3(b): the relay record\u2019s upstreamGrantReference matches the principal grant (containment recorded, not certified)', async () => {
    const { principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.relay?.record.upstreamGrantReference).toBe(PRINCIPAL_GRANT)
  })

  it('reports a dangling chainReference instead of silently resolving (traversal is honest about failure)', () => {
    const result = traverseChain([], 'urn:uuid:nonexistent')
    expect(result.resolved).toBe(false)
    expect(result.failure).toContain('start record not in set')
  })

  it('multi-hop: a second relay chains to the first relay\u2019s record at depth 2, and the full chain traverses to root', async () => {
    const { seam1, seam2, principalGate, relayGate } = makeChainedHarness()
    const first = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(first.composedResult).toBe('valid')

    // Second relay seam (its own doc, own grant), downstream of the first.
    const seam3 = makeSeamDoc([
      makeContact({
        contactId: 'relay-2',
        accessTier: 'read-bundle',
        keyhiveCapabilityRef: 'cap-relay-2',
        agentClass: true,
      }),
    ])
    const secondRelayGate = createRelaySeamGate(
      seam3.read,
      seam3.change,
      'did:key:seam-relay-2-prototype',
    )
    const second = await secondRelayGate.assertRelayCrossingCurrent(
      'relay-2',
      'read-bundle',
      'did:key:zRelay2Grantor',
      {
        upstreamRecord: first.relay!.record,
        upstreamGrantReference: RELAY_GRANT,
      },
      'route',
    )
    expect(second.result).toBe('pass')
    expect(second.record.chainDepth).toBe(2)
    expect(second.record.chainReference).toBe(first.relay!.record.recordId)

    const allRecords = [...seam1.accessLog, ...seam2.accessLog, ...seam3.accessLog]
      .filter((e) => e.gateCheckRecord)
      .map((e) => e.gateCheckRecord!)
    const traversal = traverseChain(allRecords, second.record.recordId)
    expect(traversal.resolved).toBe(true)
    expect(traversal.chain.map((r) => r.chainDepth ?? 0)).toEqual([2, 1, 0])
  })
})

// ============================================================================
// CR-4 — Cross-seam revocation composition
// ============================================================================

describe('CR-4: a revoked-local grant at Seam 1 blocks the relay crossing', () => {
  it('revoked-local at Seam 1 \u2192 composed crossing blocked at the principal; the relay boundary is never reached', async () => {
    const { seam2, principalGate, relayGate } = makeChainedHarness({
      principalRef: 'revoked-local:cap-principal-1',
    })
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    // Fail-closed inside the propagation gap: revoked-local → 'issued'
    // state → blocked-unconfirmed at the principal gate.
    expect(outcome.principal.result).toBe('blocked-unconfirmed')
    expect(outcome.composedResult).toBe('blocked')
    expect(outcome.blockedAt).toBe('principal')
    // No relay invocation occurred: no relay result, no relay record,
    // nothing in the relay seam's log. (CR-2 requires a record from every
    // seam IN a chained crossing; a crossing halted at Seam 1 never
    // reached the relay boundary.)
    expect(outcome.relay).toBeUndefined()
    expect(seam2.accessLog.filter((e) => e.eventType === 'gate-check')).toHaveLength(0)
  })

  it('revoked-confirmed at Seam 1 blocks identically (no grant in the chain may be in any revoked state)', async () => {
    const { principalGate, relayGate } = makeChainedHarness({
      principalRef: 'revoked-confirmed:cap-principal-1',
    })
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.principal.result).toBe('blocked-revoked')
    expect(outcome.composedResult).toBe('blocked')
    expect(outcome.blockedAt).toBe('principal')
    expect(outcome.relay).toBeUndefined()
  })

  it('EVIDENCE — the enforcement gap CR-4 declares: a directly-invoked relay gate passes on a stale upstream record while Seam 1 is revoked', async () => {
    // CR-4 (Item 1 §2): "A relay seam that passes while the principal seam
    // is in revoked-local state is not caught by the relay gate — this is
    // the enforcement gap named in the observation log. CR-4 is the rule
    // that declares this gap, not the mechanism that closes it."
    // This test PINS that declared behavior as prototype evidence: the
    // relay gate reads no cross-seam state (C2), so bypassing the
    // composed-crossing orchestration reproduces the gap exactly as the
    // rule describes. If this test ever fails because the relay gate
    // started blocking here, the PROTOTYPE has grown a cross-seam
    // propagation mechanism and CR-4's text needs amendment — flag it;
    // do not adjust this test to hide the divergence.
    const { seam1, principalGate, relayGate } = makeChainedHarness()

    // A valid crossing first, capturing a then-valid Seam 1 record.
    const valid = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    const staleUpstreamRecord = valid.principal.record

    // Seam 1 grant is then revoked locally.
    seam1.doc.contacts['agent-1'].keyhiveCapabilityRef =
      'revoked-local:cap-principal-1'

    // Direct relay invocation with the stale record: the relay gate checks
    // ONLY its own grant state, and passes.
    const bypass = await relayGate.assertRelayCrossingCurrent(
      'relay-1',
      'read-bundle',
      RELAY_GRANT,
      { upstreamRecord: staleUpstreamRecord, upstreamGrantReference: PRINCIPAL_GRANT },
      'forward',
    )
    expect(bypass.result).toBe('pass')

    // The orchestrated path, meanwhile, correctly blocks — the ordering
    // discipline, not the relay gate, is CR-4's enforcement surface.
    const orchestrated = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(orchestrated.composedResult).toBe('blocked')
    expect(orchestrated.blockedAt).toBe('principal')
  })
})

// ============================================================================
// CR-5 — chainReference linkage
// ============================================================================

describe('CR-5: chainReference correctly references the Seam 1 record', () => {
  it('the relay record\u2019s chainReference is the principal record\u2019s recordId (pointer-reference, not inline duplication)', async () => {
    const { principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.relay?.record.chainReference).toBe(
      outcome.principal.record.recordId,
    )
    // Pointer, not duplication: the relay record does not embed the
    // upstream record's fields, only the reference.
    expect(outcome.relay?.record).not.toHaveProperty('upstreamRecord')
  })

  it('carries the full CR-5 field set plus the base anchoring group: chainDepth 1, author-declared anchor, relayRole in vocabulary', async () => {
    const { principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs('transform'),
    })
    const r = outcome.relay!.record
    expect(r.chainDepth).toBe(1)
    expect(r.lineageAnchorType).toBe('author-declared')
    expect(r.upstreamGrantReference).toBe(PRINCIPAL_GRANT)
    expect(r.relayRole).toBe('transform')
    expect(RELAY_ROLES).toContain(r.relayRole)
  })

  it('the relay record conforms to the base shape (validator-clean) and the relay instance shape', async () => {
    const { principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs('route'),
    })
    expect(validateCrossingRecordBase(outcome.relay!.record)).toEqual([])
    expect(validateRelayGateCheckRecord(outcome.relay!.record)).toEqual([])
  })

  it('the relay instance validator rejects a record missing the CR-5 fields', async () => {
    const { principalGate } = makeChainedHarness()
    // A principal record is base-conformant but NOT relay-conformant:
    // no anchoring group, no CR-5 fields.
    const { record } = await principalGate.assertCapabilityCurrentWithRecord(
      'agent-1',
      'read-bundle',
      PRINCIPAL_GRANT,
    )
    expect(validateCrossingRecordBase(record)).toEqual([])
    const violations = validateRelayGateCheckRecord(record)
    expect(violations.some((v) => v.includes('chainReference required'))).toBe(true)
    expect(violations.some((v) => v.includes('upstreamGrantReference'))).toBe(true)
    expect(violations.some((v) => v.includes('relayRole'))).toBe(true)
  })

  it('the relay instance validator rejects chainDepth 0 (the principal\u2019s slot) and inherits the Q6 lock from the base', () => {
    const bad = {
      recordId: 'urn:uuid:test-relay',
      recordType: 'gate-check',
      emittedAt: new Date().toISOString(),
      emittedBy: RELAY_SEAM_DID_STUB,
      provenanceStatus: 'asserted',
      chainReference: 'urn:uuid:upstream',
      chainDepth: 0,
      lineageAnchorType: 'witness-signed',
      governanceEvent: 'gate-check',
      boundType: 'exposure-upper-bound',
      agentDID: 'did:key:agent',
      grantReference: RELAY_GRANT,
      capabilityName: 'read-bundle',
      invocationTimestamp: new Date().toISOString(),
      gateResult: 'pass',
      upstreamGrantReference: PRINCIPAL_GRANT,
      relayRole: 'forward',
    }
    const violations = validateRelayGateCheckRecord(bad)
    expect(violations.some((v) => v.includes('chainDepth must be ≥ 1'))).toBe(true)
    expect(violations.some((v) => v.includes('LOCKED'))).toBe(true)
  })

  it('dual-emits emittedAt/invocationTimestamp on the relay record per the \u00a73.1 transition rule (same instant)', async () => {
    const { principalGate, relayGate } = makeChainedHarness()
    const outcome = await performChainedCrossing({
      principalGate,
      relayGate,
      ...chainedArgs(),
    })
    expect(outcome.relay?.record.emittedAt).toBe(
      outcome.relay?.record.invocationTimestamp,
    )
  })
})
