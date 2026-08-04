// src/gate.test.ts — Item 1.3 acceptance: tests covering all three gate
// results; every check (including blocks) writes an access-log entry.
// Item 3.1 acceptance (type level): constructing an agent contact with any
// attestation/account-submission authority fails at the type level — the
// expect-error compile assertions below are enforced by `tsc -b`, and
// flip to "unused directive" errors if the constraint is ever loosened.
// Item 3.2 acceptance: AgentActionContext is only obtainable through a
// passing gate result.

import { describe, it, expect } from 'vitest'
import {
  createCapabilityGate,
  openAgentActionContext,
  revocationConfirmationState,
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
    ? { ...core, contactClass: 'agent' }
    : { ...core, contactClass: 'human' }
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

// --- Item 1.3: the three results --------------------------------------------

describe('assertCapabilityCurrent', () => {
  it('returns pass for a current, sufficient capability', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
    ])
    const result = await gate.assertCapabilityCurrent('c-1', 'read-bundle')
    expect(result).toBe('pass')
    expect(accessLog).toHaveLength(1)
    expect(accessLog[0].eventType).toBe('gate-check')
    expect(accessLog[0].gateResult).toBe('pass')
  })

  it('returns blocked-revoked when no capability was ever granted', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: undefined }),
    ])
    const result = await gate.assertCapabilityCurrent('c-1', 'read-bundle')
    expect(result).toBe('blocked-revoked')
    // A blocked action is governance evidence: the block is logged.
    expect(accessLog).toHaveLength(1)
    expect(accessLog[0].gateResult).toBe('blocked-revoked')
  })

  it('returns blocked-revoked for an unknown contact, and still logs', async () => {
    const { gate, accessLog } = makeHarness([])
    const result = await gate.assertCapabilityCurrent('nobody', 'read-bundle')
    expect(result).toBe('blocked-revoked')
    expect(accessLog).toHaveLength(1)
  })

  it('returns blocked-revoked when the held tier is insufficient', async () => {
    const { gate } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-bundle' }),
    ])
    expect(await gate.assertCapabilityCurrent('c-1', 'write-collab')).toBe('blocked-revoked')
  })

  it('returns blocked-unconfirmed inside the propagation gap (revocation issued, unconfirmed)', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'revoked:automerge:cap1' }),
    ])
    const result = await gate.assertCapabilityCurrent('c-1', 'read-bundle')
    expect(result).toBe('blocked-unconfirmed')
    expect(accessLog[0].gateResult).toBe('blocked-unconfirmed')
  })

  it('checks state per invocation — a revocation between calls changes the result (no caching, no TTL)', async () => {
    const contact = makeContact({ contactId: 'c-1', keyhiveCapabilityRef: 'automerge:cap1' })
    const { gate, accessLog } = makeHarness([contact])
    expect(await gate.assertCapabilityCurrent('c-1', 'read-bundle')).toBe('pass')
    // Revoke between invocations — the second check must see it.
    contact.keyhiveCapabilityRef = 'revoked:automerge:cap1'
    expect(await gate.assertCapabilityCurrent('c-1', 'read-bundle')).toBe('blocked-unconfirmed')
    expect(accessLog).toHaveLength(2)
  })

  it('carries the contact class flag on gate-check entries', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ contactId: 'a-1', contactClass: 'agent', keyhiveCapabilityRef: 'automerge:cap9' }),
    ])
    await gate.assertCapabilityCurrent('a-1', 'read-bundle')
    expect(accessLog[0].contactClass).toBe('agent')
  })
})

describe('revocationConfirmationState (Item 1.2 seam)', () => {
  it('reports issued — never confirmed — for local single-state revocation', () => {
    // v0.3 Item 1.2 risk note: do not fake confirmation from local success.
    const revoked = makeContact({ keyhiveCapabilityRef: 'revoked:automerge:cap1' })
    expect(revocationConfirmationState(revoked)).toBe('issued')
    const granted = makeContact({ keyhiveCapabilityRef: 'automerge:cap1' })
    expect(revocationConfirmationState(granted)).toBe('none')
  })
})

// --- Item 3.2: AgentActionContext only via passing gate ----------------------

describe('openAgentActionContext', () => {
  it('constructs a context only on pass', async () => {
    const { gate } = makeHarness([
      makeContact({ contactId: 'a-1', contactClass: 'agent', keyhiveCapabilityRef: 'automerge:cap9' }),
    ])
    const ctx = await openAgentActionContext(gate, 'a-1', 'read-bundle')
    expect(ctx).not.toBeNull()
    expect(ctx?.contactId).toBe('a-1')
  })

  it('returns null on any blocked result', async () => {
    const { gate } = makeHarness([
      makeContact({ contactId: 'a-1', contactClass: 'agent', keyhiveCapabilityRef: 'revoked:automerge:cap9' }),
    ])
    expect(await openAgentActionContext(gate, 'a-1', 'read-bundle')).toBeNull()
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

    // A plain agent contact (grantee-only) constructs fine:
    const agent: AgentContact = { ...core, contactClass: 'agent' }
    expect(agent.contactClass).toBe('agent')
  })
})
