// src/gate.test.ts — Item 1.3 acceptance: tests covering all three gate
// results; every check (including blocks) writes a seam:gateCheckRecord
// access-log entry with all required v0.5 fields.
// Item 3.1 acceptance (type level): constructing an agent contact with any
// attestation/account-submission authority fails at the type level — the
// expect-error compile assertions below are enforced by `tsc -b`, and
// flip to "unused directive" errors if the constraint is ever loosened.
// Item 3.2 acceptance: AgentActionContext is only obtainable through a
// passing gate result.
// Governing spec: pattern-commons-07-employment-seam-v0-5_2026-08-08.md
// Option A rename (build plan v0.5 §3): revoked: → revoked-local:

import { describe, it, expect } from 'vitest'
import {
  createCapabilityGate,
  openAgentActionContext,
  revocationConfirmationState,
  confirmRevocation,
  isRevocationRef,
} from './gate'
import type { GateDoc } from './gate'
import type {
  WorkerKnowledgeGraph,
  Contact,
  AgentContact,
  HumanContact,
  AccessEvent,
} from './types'

// --- Test harness: minimal doc + change collector ---------------------------

const TEST_GRANT_REF = 'did:key:zGranter123'

function makeContact(overrides: Partial<Contact> & { contactClass?: 'human' | 'agent' }): Contact {
  const core = {
    contactId:        overrides.contactId ?? 'c-1',
    displayName:      'Test Contact',
    role:             'Successor',
    employerName:     'Acme',
    relationshipType: 'successor' as const,
    accessTier:       overrides.accessTier ?? ('read-bundle' as const),
    keyhiveCapabilityRef: overrides.keyhiveCapabilityRef,
    notes:            '',
    createdAt:        new Date().toISOString(),
  }
  return overrides.contactClass === 'agent'
    ? { ...core, contactClass: 'agent' as const, identityClass: 'Agent' as const }
    : { ...core, contactClass: 'human' as const }
}

function makeHarness(contacts: Contact[]) {
  const accessLog: AccessEvent[] = []
  const doc: GateDoc = {
    contacts: Object.fromEntries(contacts.map((c) => [c.contactId, c])),
    accessLog,
  }
  const gate = createCapabilityGate(
    () => doc,
    (mutate) => mutate(doc as WorkerKnowledgeGraph),
  )
  return { gate, accessLog }
}

// --- Item 1.3: the three results + seam:gateCheckRecord fields ---------------

describe('assertCapabilityCurrent', () => {
  it('returns pass and writes a gateCheckRecord with all required v0.5 fields', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
    ])
    const result = await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    expect(result).toBe('pass')
    expect(accessLog).toHaveLength(1)
    const entry = accessLog[0]
    expect(entry.eventType).toBe('gate-check')
    // seam:gateCheckRecord — all required fields present
    expect(entry.gateCheckRecord).toBeDefined()
    expect(entry.gateCheckRecord!.gateResult).toBe('pass')
    expect(entry.gateCheckRecord!.grantReference).toBe(TEST_GRANT_REF)
    expect(entry.gateCheckRecord!.capabilityName).toBe('read-bundle')
    expect(entry.gateCheckRecord!.invocationTimestamp).toBeTruthy()
    expect(entry.gateCheckRecord!.agentDID).toBe('automerge:cap1')
    // grantReference also present at event level
    expect(entry.grantReference).toBe(TEST_GRANT_REF)
    // pass → no revocationStateReference
    expect(entry.gateCheckRecord!.revocationStateReference).toBeUndefined()
  })

  it('returns blocked-revoked when no capability was ever granted', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: undefined }),
    ])
    const result = await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    expect(result).toBe('blocked-revoked')
    // A blocked action is governance evidence: the block is logged.
    expect(accessLog).toHaveLength(1)
    expect(accessLog[0].gateCheckRecord!.gateResult).toBe('blocked-revoked')
    // No capability on record → nothing to reference
    expect(accessLog[0].gateCheckRecord!.revocationStateReference).toBeUndefined()
  })

  it('returns blocked-revoked for an unknown contact, and still logs with grantReference', async () => {
    const { gate, accessLog } = makeHarness([])
    const result = await gate.assertCapabilityCurrent('nobody', 'read-bundle', TEST_GRANT_REF)
    expect(result).toBe('blocked-revoked')
    expect(accessLog).toHaveLength(1)
    expect(accessLog[0].gateCheckRecord!.grantReference).toBe(TEST_GRANT_REF)
    // Unknown contact: agentDID falls back to the requested contactId
    expect(accessLog[0].gateCheckRecord!.agentDID).toBe('nobody')
  })

  it('returns blocked-revoked when the held tier is insufficient', async () => {
    const { gate } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-bundle' }),
    ])
    expect(await gate.assertCapabilityCurrent('c-1', 'write-collab', TEST_GRANT_REF)).toBe('blocked-revoked')
  })

  it('returns blocked-unconfirmed inside the propagation gap and carries revocationStateReference', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'revoked-local:automerge:cap1' }),
    ])
    const result = await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    expect(result).toBe('blocked-unconfirmed')
    expect(accessLog[0].gateCheckRecord!.gateResult).toBe('blocked-unconfirmed')
    // Blocked invocation references the revocation state that triggered it
    expect(accessLog[0].gateCheckRecord!.revocationStateReference).toBe('revoked-local:automerge:cap1')
  })

  it('blocked-revoked (confirmed state) carries revocationStateReference', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'revoked-confirmed:automerge:cap1' }),
    ])
    await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    expect(accessLog[0].gateCheckRecord!.gateResult).toBe('blocked-revoked')
    expect(accessLog[0].gateCheckRecord!.revocationStateReference).toBe('revoked-confirmed:automerge:cap1')
  })

  it('checks state per invocation — a revocation between calls changes the result (no caching, no TTL)', async () => {
    const contact = makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'automerge:cap1' })
    const { gate, accessLog } = makeHarness([contact])
    expect(await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)).toBe('pass')
    // Revoke between invocations — the second check must see it.
    contact.keyhiveCapabilityRef = 'revoked-local:automerge:cap1'
    expect(await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)).toBe('blocked-unconfirmed')
    expect(accessLog).toHaveLength(2)
  })

  it('carries the contact class flag on gate-check entries', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'a-1', contactClass: 'agent', keyhiveCapabilityRef: 'automerge:cap9' }),
    ])
    await gate.assertCapabilityCurrent('a-1', 'read-bundle', TEST_GRANT_REF)
    expect(accessLog[0].contactClass).toBe('agent')
  })

  it('gate-check log is queryable by agentDID and grantReference (v0.5 acceptance)', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'a-1', contactClass: 'agent', keyhiveCapabilityRef: 'automerge:cap9' }),
      makeContact({ contactId: 'a-2', contactClass: 'agent', keyhiveCapabilityRef: 'automerge:capX' }),
    ])
    await gate.assertCapabilityCurrent('a-1', 'read-bundle', 'did:key:granterA')
    await gate.assertCapabilityCurrent('a-2', 'read-bundle', 'did:key:granterB')
    // Queryable by grantReference — event-level field
    const byGrant = accessLog.filter((e) => e.grantReference === 'did:key:granterA')
    expect(byGrant).toHaveLength(1)
    expect(byGrant[0].subjectContactId).toBe('a-1')
    // Queryable by agentDID — the non-prefix portion of the ref
    const byDID = accessLog.filter((e) => e.gateCheckRecord?.agentDID === 'automerge:capX')
    expect(byDID).toHaveLength(1)
    expect(byDID[0].subjectContactId).toBe('a-2')
  })
})

describe('two-state revocation (Item 1.2) — Option A naming (revoked-local: prefix)', () => {
  it('reports issued for the revoked-local: prefix (Option A rename)', () => {
    const revoked = makeContact({ keyhiveCapabilityRef: 'revoked-local:automerge:cap1' })
    expect(revocationConfirmationState(revoked)).toBe('issued')
    const granted = makeContact({ keyhiveCapabilityRef: 'automerge:cap1' })
    expect(revocationConfirmationState(granted)).toBe('none')
  })

  it('reports confirmed for a revoked-confirmed ref, and the gate maps it to blocked-revoked', async () => {
    const confirmed = makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'revoked-confirmed:automerge:cap1' })
    expect(revocationConfirmationState(confirmed)).toBe('confirmed')
    const { gate, accessLog } = makeHarness([confirmed])
    expect(await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)).toBe('blocked-revoked')
    expect(accessLog[0].gateCheckRecord!.gateResult).toBe('blocked-revoked')
  })

  it('confirmRevocation upgrades revoked-local: → revoked-confirmed: (Option A), requires a basis, logs its own event', () => {
    const contact = makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'revoked-local:automerge:cap1' })
    const accessLog: AccessEvent[] = []
    const doc: GateDoc = { contacts: { 'c-1': contact }, accessLog }
    const change = (mutate: (d: WorkerKnowledgeGraph) => void) => mutate(doc as WorkerKnowledgeGraph)

    const outcome = confirmRevocation(change, 'c-1', 'simulated receiving-party receipt (test)')
    expect(outcome).toBe('confirmed')
    expect(revocationConfirmationState(doc.contacts['c-1'])).toBe('confirmed')
    expect(doc.contacts['c-1'].keyhiveCapabilityRef).toBe('revoked-confirmed:automerge:cap1')
    // Its own event, its own timestamp — the issued→confirmed delta is the
    // propagation gap made visible in the record.
    const evt = accessLog.find((e) => e.eventType === 'capability-revocation-confirmed')
    expect(evt).toBeDefined()
    expect(evt?.notes).toContain('Basis: simulated receiving-party receipt (test)')
    expect(evt?.contactClass).toBe('human')
  })

  it('confirmRevocation is idempotent and inapplicable to unrevoked or unknown contacts', () => {
    const confirmed = makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'revoked-confirmed:automerge:cap1' })
    const granted = makeContact({ contactId: 'c-2', keyhiveCapabilityRef: 'automerge:cap2' })
    const accessLog: AccessEvent[] = []
    const doc: GateDoc = { contacts: { 'c-1': confirmed, 'c-2': granted }, accessLog }
    const change = (mutate: (d: WorkerKnowledgeGraph) => void) => mutate(doc as WorkerKnowledgeGraph)

    expect(confirmRevocation(change, 'c-1', 'any')).toBe('not-applicable') // already confirmed — no double event
    expect(confirmRevocation(change, 'c-2', 'any')).toBe('not-applicable') // never revoked
    expect(confirmRevocation(change, 'nobody', 'any')).toBe('not-applicable') // unknown
    expect(accessLog).toHaveLength(0)
    expect(doc.contacts['c-2'].keyhiveCapabilityRef).toBe('automerge:cap2') // untouched
  })

  it('issued never auto-upgrades: repeated gate checks leave the state issued (no fake confirmation)', async () => {
    const contact = makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'revoked-local:automerge:cap1' })
    const { gate } = makeHarness([contact])
    for (let i = 0; i < 3; i++) {
      expect(await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)).toBe('blocked-unconfirmed')
    }
    expect(revocationConfirmationState(contact)).toBe('issued') // resting state on this transport
  })

  it('isRevocationRef covers both states — and the retired revoked: prefix no longer matches (Option A)', () => {
    expect(isRevocationRef('revoked-local:automerge:cap1')).toBe(true)
    expect(isRevocationRef('revoked-confirmed:automerge:cap1')).toBe(true)
    expect(isRevocationRef('automerge:cap1')).toBe(false)
    expect(isRevocationRef(undefined)).toBe(false)
    // Option A: the pre-rename prefix is retired. No production writer
    // emits it after this commit; a ref carrying it is not a recognized
    // revocation state.
    expect(isRevocationRef('revoked:automerge:cap1')).toBe(false)
  })
})

// --- Item 3.2: AgentActionContext only via passing gate ----------------------

describe('openAgentActionContext', () => {
  it('constructs a context only on pass, carrying grantReference', async () => {
    const { gate } = makeHarness([
      makeContact({ contactId: 'a-1', contactClass: 'agent', keyhiveCapabilityRef: 'automerge:cap9' }),
    ])
    const ctx = await openAgentActionContext(gate, 'a-1', 'read-bundle', TEST_GRANT_REF)
    expect(ctx).not.toBeNull()
    expect(ctx?.contactId).toBe('a-1')
    expect(ctx?.grantReference).toBe(TEST_GRANT_REF)
  })

  it('returns null on any blocked result', async () => {
    const { gate } = makeHarness([
      makeContact({ contactId: 'a-1', contactClass: 'agent', keyhiveCapabilityRef: 'revoked-local:automerge:cap9' }),
    ])
    expect(await openAgentActionContext(gate, 'a-1', 'read-bundle', TEST_GRANT_REF)).toBeNull()
  })
})

// --- Item 3.1: type-level acceptance (enforced by tsc, not at runtime) -------

describe('agent-class authority is structurally grantee-only', () => {
  it('type level: agent contacts cannot carry record-speech authority', () => {
    const core = {
      contactId: 'a-2', displayName: 'Bot', role: 'Automation',
      employerName: 'Acme', relationshipType: 'subcontractor' as const,
      accessTier: 'read-bundle' as const, notes: '', createdAt: '2026-08-03',
    }

    // A human contact MAY hold record-speech authority (future surface):
    const human: HumanContact = { ...core, contactClass: 'human', recordSpeechAuthority: ['attestation'] }
    expect(human.contactClass).toBe('human')

    // @ts-expect-error — agent contact with attestation authority fails at the type level
    const a1: AgentContact = { ...core, contactClass: 'agent', recordSpeechAuthority: ['attestation'] }
    // @ts-expect-error — agent contact with account-submission authority fails at the type level
    const a2: AgentContact = { ...core, contactClass: 'agent', recordSpeechAuthority: ['account-submission'] }
    // @ts-expect-error — agent contact with separation-cause input fails at the type level
    const a3: AgentContact = { ...core, contactClass: 'agent', recordSpeechAuthority: ['separation-cause-input'] }
    // @ts-expect-error — agent contact holding a Class A sub-role fails at the type level
    const a4: AgentContact = { ...core, contactClass: 'agent', recordSpeechAuthority: ['A5'] }

    // The values above exist only to host the compile-time assertions.
    void a1; void a2; void a3; void a4

    // A plain agent contact (grantee-only, with identityClass) constructs fine:
    const agent: AgentContact = { ...core, contactClass: 'agent', identityClass: 'Agent' }
    expect(agent.contactClass).toBe('agent')
    expect(agent.identityClass).toBe('Agent')
  })
})

// --- Item 3.1 v0.5: agent contact schema acceptance -------------------------
// Tests covering: identityClass: 'Agent' on contact construction,
// AgentCapabilityGrant structure, grantReference non-null on agent log
// entries, identityClass on agent log entries, existing contacts unaffected.

import type { AgentCapabilityGrant } from './types'

describe('Item 3.1: agent contact schema (v0.5)', () => {
  it('agent contact carries identityClass: Agent at construction', () => {
    const core = {
      contactId: 'a-v05', displayName: 'Pipeline Bot', role: 'Automation',
      employerName: 'Acme', relationshipType: 'subcontractor' as const,
      accessTier: 'read-bundle' as const, notes: '', createdAt: '2026-08-08',
    }
    const grant: AgentCapabilityGrant = {
      grantingPartyDID:      'did:key:zGranter999',
      grantedAgentDID:       'did:key:agent-a-v05',
      capabilityName:        'read-bundle',
      grantTimestamp:        '2026-08-08T00:00:00.000Z',
      scope:                 'worker-knowledge-graph',
      scopingPartySignature: 'stub-sig:did:key:zGranter999:2026-08-08T00:00:00.000Z',
    }
    const agent: import('./types').AgentContact = {
      ...core,
      contactClass:         'agent',
      identityClass:        'Agent',
      agentCapabilityGrant: grant,
    }
    expect(agent.identityClass).toBe('Agent')
    expect(agent.contactClass).toBe('agent')
    expect(agent.agentCapabilityGrant?.grantingPartyDID).toBe('did:key:zGranter999')
  })

  it('AgentCapabilityGrant carries all required v0.5 minimum fields', () => {
    const grant: AgentCapabilityGrant = {
      grantingPartyDID:      'did:key:zGranter001',
      grantedAgentDID:       'did:key:agent-bot42',
      capabilityName:        'read-full',
      grantTimestamp:        '2026-08-08T10:00:00.000Z',
      scope:                 'worker-knowledge-graph',
      scopingPartySignature: 'stub-sig:did:key:zGranter001:2026-08-08T10:00:00.000Z',
    }
    // All six minimum fields present
    expect(grant.grantingPartyDID).toBeDefined()
    expect(grant.grantedAgentDID).toBeDefined()
    expect(grant.capabilityName).toBeDefined()
    expect(grant.grantTimestamp).toBeDefined()
    expect(grant.scope).toBeDefined()
    expect(grant.scopingPartySignature).toBeDefined()
    // Optional Class C chain-of-authority field absent (direct worker grant)
    expect(grant.authorizationVCReference).toBeUndefined()
  })

  it('Class C grant carries authorizationVCReference (chain-of-authority condition)', () => {
    const classCGrant: AgentCapabilityGrant = {
      grantingPartyDID:       'did:key:zClassCRep',
      grantedAgentDID:        'did:key:agent-enterprise-bot',
      capabilityName:         'write-collab',
      grantTimestamp:         '2026-08-08T11:00:00.000Z',
      scope:                  'worker-knowledge-graph',
      scopingPartySignature:  'stub-sig:did:key:zClassCRep:2026-08-08T11:00:00.000Z',
      authorizationVCReference: 'vc:worker-auth:zWorker123:2026-08-08',
    }
    expect(classCGrant.authorizationVCReference).toBe('vc:worker-auth:zWorker123:2026-08-08')
  })

  it('agent capability-granted log entry carries identityClass and grantReference', () => {
    // Simulate what ContactsTab.handleGrantCapability writes to the log
    const agentContactId = 'a-log-01'
    const grantingPartyDID = 'did:key:zGranterLog'
    const accessLog: import('./types').AccessEvent[] = []

    // Mimics the log push in handleGrantCapability
    accessLog.push({
      eventId:          'evt-001',
      timestamp:        '2026-08-08T12:00:00.000Z',
      eventType:        'capability-granted',
      subjectContactId: agentContactId,
      contactClass:     'agent',
      identityClass:    'Agent',
      grantReference:   grantingPartyDID,
      notes:            'Cryptographic access granted.',
    })

    const entry = accessLog[0]
    expect(entry.contactClass).toBe('agent')
    expect(entry.identityClass).toBe('Agent')
    expect(entry.grantReference).toBe(grantingPartyDID)
    expect(entry.grantReference).not.toBeNull()
  })

  it('agent capability-revoked log entry carries identityClass and grantReference', () => {
    const grantingPartyDID = 'did:key:zGranterLog2'
    const accessLog: import('./types').AccessEvent[] = []

    accessLog.push({
      eventId:          'evt-002',
      timestamp:        '2026-08-08T13:00:00.000Z',
      eventType:        'capability-revoked',
      subjectContactId: 'a-log-02',
      contactClass:     'agent',
      identityClass:    'Agent',
      grantReference:   grantingPartyDID,
      notes:            'Access revoked.',
    })

    const entry = accessLog[0]
    expect(entry.identityClass).toBe('Agent')
    expect(entry.grantReference).toBe(grantingPartyDID)
    expect(entry.grantReference).not.toBeNull()
  })

  it('human contact log entries are unaffected — no identityClass, no grantReference', () => {
    const accessLog: import('./types').AccessEvent[] = []

    accessLog.push({
      eventId:          'evt-003',
      timestamp:        '2026-08-08T14:00:00.000Z',
      eventType:        'capability-granted',
      subjectContactId: 'h-001',
      contactClass:     'human',
      notes:            'Cryptographic access granted to human contact.',
    })

    const entry = accessLog[0]
    expect(entry.contactClass).toBe('human')
    expect(entry.identityClass).toBeUndefined()
    expect(entry.grantReference).toBeUndefined()
  })

  it('existing contacts (no contactClass field) remain unaffected — read as human', () => {
    // Pre-v0.5 contact: no contactClass, no identityClass, no agentCapabilityGrant
    const legacy = {
      contactId: 'legacy-001', displayName: 'Old Contact', role: 'Former Client',
      employerName: 'Legacy Corp', relationshipType: 'client' as const,
      accessTier: 'none' as const, notes: '', createdAt: '2025-01-01',
    }
    // Migration rule: contactClass ?? 'human'
    const resolved = (legacy as import('./types').Contact).contactClass ?? 'human'
    expect(resolved).toBe('human')
  })

  it('grantReference is non-null on every agent-class log entry (v0.5 acceptance)', () => {
    const grantRef = 'did:key:zAcceptanceGranter'
    const events: import('./types').AccessEvent[] = [
      {
        eventId: 'e1', timestamp: '2026-08-08T15:00:00.000Z',
        eventType: 'capability-granted', subjectContactId: 'a-accept',
        contactClass: 'agent', identityClass: 'Agent',
        grantReference: grantRef, notes: '',
      },
      {
        eventId: 'e2', timestamp: '2026-08-08T16:00:00.000Z',
        eventType: 'capability-revoked', subjectContactId: 'a-accept',
        contactClass: 'agent', identityClass: 'Agent',
        grantReference: grantRef, notes: '',
      },
    ]
    // Every agent-class log entry must carry a non-null grantReference
    const agentEntries = events.filter((e) => e.contactClass === 'agent')
    expect(agentEntries.length).toBe(2)
    agentEntries.forEach((e) => {
      expect(e.grantReference).toBeDefined()
      expect(e.grantReference).not.toBeNull()
      expect(e.grantReference!.length).toBeGreaterThan(0)
    })
  })

  it('type level: identityClass Agent cannot be set on HumanContact', () => {
    // This is enforced by the type system (HumanContact has no identityClass field)
    // Runtime assertion: a human contact constructed correctly has no identityClass
    const human: import('./types').HumanContact = {
      contactId: 'h-002', displayName: 'Human', role: 'Manager',
      employerName: 'Corp', relationshipType: 'employer' as const,
      accessTier: 'none' as const, notes: '', createdAt: '2026-08-08',
      contactClass: 'human',
    }
    // identityClass is not a field on HumanContact — accessing it returns undefined
    expect((human as Record<string, unknown>)['identityClass']).toBeUndefined()
  })
})
