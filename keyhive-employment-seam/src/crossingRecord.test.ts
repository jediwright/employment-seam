// src/crossingRecord.test.ts — seam:CrossingRecord base-shape conformance
//
// Implementation session, 2026-08-09 (Session Harness Mode 1).
// Covers, in order:
//   1. Base-shape validator conformance (Item 2 §2 field groups, §5 SHACL
//      mirror, conditional constraints)
//   2. Gate emission conformance — every assertCapabilityCurrent() result
//      state emits a record conforming to the base shape
//   3. provenanceStatus behavior from the gate (SL-0034 UNDER TEST):
//      'asserted' on every result; no basis field; no retroactive mutation
//      by confirmRevocation (supersession-not-reinterpretation)
//   4. seam:aiProvenance instance (Item 2 §3.3, PC#7 v0.5 field set)

import { describe, it, expect } from 'vitest'
import {
  CROSSING_RECORD_VOCAB,
  RECORD_TYPES,
  PROVENANCE_STATUSES,
  mintRecordId,
  validateCrossingRecordBase,
  createAiProvenanceRecord,
  validateAiProvenanceRecord,
  isUngovernedAiOutput,
  type CrossingRecordBase,
} from './crossingRecord'
import { createCapabilityGate, confirmRevocation, OWNING_SEAM_DID_STUB } from './gate'
import type { GateDoc } from './gate'
import type { WorkerKnowledgeGraph, Contact, AccessEvent, GateCheckRecord } from './types'

const TEST_GRANT_REF = 'did:key:zGranter123'
const TEST_SEAM_DID = 'did:key:zSeamOwner456'

// --- Fixtures ---------------------------------------------------------------

function conformingBase(): CrossingRecordBase {
  return {
    recordId: mintRecordId(),
    recordType: 'gate-check',
    emittedAt: new Date().toISOString(),
    emittedBy: TEST_SEAM_DID,
    provenanceStatus: 'asserted',
    governanceEvent: 'gate-check',
    boundType: 'exposure-upper-bound',
  }
}

function makeContact(overrides: {
  contactId?: string
  keyhiveCapabilityRef?: string
  accessTier?: Contact['accessTier']
}): Contact {
  return {
    contactId: overrides.contactId ?? 'c-1',
    displayName: 'Test Contact',
    role: 'Successor',
    employerName: 'Acme',
    relationshipType: 'successor',
    accessTier: overrides.accessTier ?? 'read-bundle',
    keyhiveCapabilityRef: overrides.keyhiveCapabilityRef,
    notes: '',
    createdAt: new Date().toISOString(),
    contactClass: 'human',
  }
}

function makeHarness(contacts: Contact[], owningSeamDID?: string) {
  const accessLog: AccessEvent[] = []
  const doc: GateDoc = {
    contacts: Object.fromEntries(contacts.map((c) => [c.contactId, c])),
    accessLog,
  }
  const gate = createCapabilityGate(
    () => doc,
    (mutate) => mutate(doc as WorkerKnowledgeGraph),
    owningSeamDID,
  )
  return { gate, accessLog, doc }
}

// --- 1. Base-shape validator conformance ------------------------------------

describe('seam:CrossingRecord base shape — validator', () => {
  it('accepts a minimally conforming record (all four required groups)', () => {
    expect(validateCrossingRecordBase(conformingBase())).toEqual([])
  })

  it('vocabulary namespace constant matches the live registered IRI', () => {
    expect(CROSSING_RECORD_VOCAB).toBe(
      'https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#',
    )
  })

  it('rejects each missing required field with a group-named violation', () => {
    const required = [
      ['recordId', 'identity'],
      ['recordType', 'identity'],
      ['emittedAt', 'identity'],
      ['emittedBy', 'identity'],
      ['provenanceStatus', 'provenance-linkage'],
      ['governanceEvent', 'evidence-scope'],
      ['boundType', 'evidence-scope'],
    ] as const
    for (const [field, group] of required) {
      const record = { ...conformingBase() } as Record<string, unknown>
      delete record[field]
      const violations = validateCrossingRecordBase(record)
      expect(violations.length, `removing ${field} must violate`).toBeGreaterThan(0)
      expect(violations.some((x) => x.startsWith(`${group}:`))).toBe(true)
    }
  })

  it('rejects recordId that is not a URI', () => {
    const record = { ...conformingBase(), recordId: 'not a uri' }
    expect(validateCrossingRecordBase(record).some((x) => x.includes('nodeKind IRI'))).toBe(true)
  })

  it('mintRecordId produces unique urn:uuid URIs', () => {
    const a = mintRecordId()
    const b = mintRecordId()
    expect(a).toMatch(/^urn:uuid:[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
  })

  it('rejects controlled-vocabulary violations on all five vocabularies', () => {
    const bads: Array<Record<string, unknown>> = [
      { ...conformingBase(), recordType: 'audit' },
      { ...conformingBase(), governanceEvent: 'schema-migration' },
      { ...conformingBase(), boundType: 'guarantee' },
      { ...conformingBase(), provenanceStatus: 'verified' },
      {
        ...conformingBase(),
        chainReference: mintRecordId(),
        chainDepth: 1,
        lineageAnchorType: 'notarized',
      },
    ]
    for (const record of bads) {
      expect(
        validateCrossingRecordBase(record).some((x) => x.includes('controlled vocabulary')),
        JSON.stringify(record.recordType ?? record.lineageAnchorType),
      ).toBe(true)
    }
    // Sanity: the vocabularies carry exactly the Lexicon v1.3 values.
    expect(RECORD_TYPES).toEqual(['gate-check', 'lineage', 'provenance', 'verification'])
    expect(PROVENANCE_STATUSES).toEqual(['asserted', 'confirmed', 'contested', 'superseded'])
  })

  it('requires provenanceStatusBasis when status ≠ asserted', () => {
    const record = { ...conformingBase(), provenanceStatus: 'contested' }
    expect(
      validateCrossingRecordBase(record).some((x) =>
        x.includes('provenanceStatusBasis required'),
      ),
    ).toBe(true)
    const withBasis = {
      ...conformingBase(),
      provenanceStatus: 'contested',
      provenanceStatusBasis: 'Counterparty disputes the recorded capability tier.',
    }
    expect(validateCrossingRecordBase(withBasis)).toEqual([])
  })

  it('requires supersededBy when status = superseded (supersession-not-reinterpretation)', () => {
    const record = {
      ...conformingBase(),
      provenanceStatus: 'superseded',
      provenanceStatusBasis: 'Refined record issued after transport ack landed.',
    }
    expect(validateCrossingRecordBase(record).some((x) => x.includes('supersededBy required'))).toBe(true)
    const withRef = { ...record, supersededBy: mintRecordId() }
    expect(validateCrossingRecordBase(withRef)).toEqual([])
  })

  it('rejects a basis field on an asserted record', () => {
    const record = {
      ...conformingBase(),
      provenanceStatusBasis: 'should not be here',
    }
    expect(
      validateCrossingRecordBase(record).some((x) => x.includes('Basis present on asserted')),
    ).toBe(true)
  })

  it('lineage anchoring group is all-or-nothing and honors the Q6 lock', () => {
    // Partial group → violations for the missing members
    const partial = { ...conformingBase(), chainReference: mintRecordId() }
    const violations = validateCrossingRecordBase(partial)
    expect(violations.some((x) => x.includes('chainDepth required'))).toBe(true)
    expect(violations.some((x) => x.includes('lineageAnchorType required'))).toBe(true)
    // Complete group with the available anchor type → conforms
    const complete = {
      ...conformingBase(),
      chainReference: mintRecordId(),
      chainDepth: 1,
      lineageAnchorType: 'author-declared',
    }
    expect(validateCrossingRecordBase(complete)).toEqual([])
    // Signed variants are named in the vocabulary but LOCKED (Q6 default)
    const locked = { ...complete, lineageAnchorType: 'witness-signed' }
    expect(validateCrossingRecordBase(locked).some((x) => x.includes('LOCKED'))).toBe(true)
  })

  it('absent lineage anchoring group conforms (principal-seam records)', () => {
    expect(validateCrossingRecordBase(conformingBase())).toEqual([])
  })
})

// --- 2. Gate emission conformance -------------------------------------------

describe('assertCapabilityCurrent — base-shape conformance of emitted records', () => {
  async function emittedRecord(
    contact: Contact | null,
    capability: Contact['accessTier'] = 'read-bundle',
  ): Promise<GateCheckRecord> {
    const { gate, accessLog } = makeHarness(contact ? [contact] : [], TEST_SEAM_DID)
    await gate.assertCapabilityCurrent(contact?.contactId ?? 'ghost', capability, TEST_GRANT_REF)
    expect(accessLog).toHaveLength(1)
    return accessLog[0].gateCheckRecord!
  }

  it('pass result emits a conforming seam:CrossingRecord', async () => {
    const record = await emittedRecord(
      makeContact({ keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
    )
    expect(record.gateResult).toBe('pass')
    expect(validateCrossingRecordBase(record)).toEqual([])
    expect(record.recordType).toBe('gate-check')
    expect(record.governanceEvent).toBe('gate-check')
    expect(record.boundType).toBe('exposure-upper-bound')
  })

  it('blocked-unconfirmed result emits a conforming record', async () => {
    const record = await emittedRecord(
      makeContact({ keyhiveCapabilityRef: 'revoked-local:automerge:cap1' }),
    )
    expect(record.gateResult).toBe('blocked-unconfirmed')
    expect(validateCrossingRecordBase(record)).toEqual([])
  })

  it('blocked-revoked (confirmed revocation) emits a conforming record', async () => {
    const record = await emittedRecord(
      makeContact({ keyhiveCapabilityRef: 'revoked-confirmed:automerge:cap1' }),
    )
    expect(record.gateResult).toBe('blocked-revoked')
    expect(validateCrossingRecordBase(record)).toEqual([])
  })

  it('no-contact block emits a conforming record', async () => {
    const record = await emittedRecord(null)
    expect(record.gateResult).toBe('blocked-revoked')
    expect(validateCrossingRecordBase(record)).toEqual([])
  })

  it('emittedAt and invocationTimestamp are dual-emitted as the same instant (Item 2 §3.1 transition)', async () => {
    const record = await emittedRecord(
      makeContact({ keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
    )
    expect(record.emittedAt).toBe(record.invocationTimestamp)
  })

  it('emittedBy carries the owning-seam DID passed at construction', async () => {
    const record = await emittedRecord(
      makeContact({ keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
    )
    expect(record.emittedBy).toBe(TEST_SEAM_DID)
  })

  it('emittedBy defaults to the documented stub when no seam DID is supplied (amendment flag)', async () => {
    const { gate, accessLog } = makeHarness([
      makeContact({ keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
    ]) // no third argument
    await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    expect(accessLog[0].gateCheckRecord!.emittedBy).toBe(OWNING_SEAM_DID_STUB)
  })

  it('recordId is a unique URI per invocation', async () => {
    const { gate, accessLog } = makeHarness(
      [makeContact({ keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' })],
      TEST_SEAM_DID,
    )
    await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    const [a, b] = accessLog.map((e) => e.gateCheckRecord!.recordId)
    expect(a).toMatch(/^urn:uuid:/)
    expect(a).not.toBe(b)
  })

  it('lineage anchoring group is absent on principal-seam gate records', async () => {
    const record = await emittedRecord(
      makeContact({ keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
    )
    expect(record.chainReference).toBeUndefined()
    expect(record.chainDepth).toBeUndefined()
    expect(record.lineageAnchorType).toBeUndefined()
  })
})

// --- 3. provenanceStatus behavior (SL-0034 UNDER TEST) -----------------------

describe('provenanceStatus emission behavior — SL-0034', () => {
  it("emits 'asserted' on every gate result, with no basis field", async () => {
    const cases: Array<Contact | null> = [
      makeContact({ contactId: 'p', keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
      makeContact({ contactId: 'u', keyhiveCapabilityRef: 'revoked-local:automerge:cap1' }),
      makeContact({ contactId: 'r', keyhiveCapabilityRef: 'revoked-confirmed:automerge:cap1' }),
      null,
    ]
    for (const contact of cases) {
      const { gate, accessLog } = makeHarness(contact ? [contact] : [], TEST_SEAM_DID)
      await gate.assertCapabilityCurrent(contact?.contactId ?? 'ghost', 'read-bundle', TEST_GRANT_REF)
      const record = accessLog[0].gateCheckRecord!
      // gateResult and provenanceStatus must not conflate: the gate's
      // uncertainty about PROPAGATION (blocked-unconfirmed) does not make
      // the record's own claim less than directly observed.
      expect(record.provenanceStatus).toBe('asserted')
      expect(record.provenanceStatusBasis).toBeUndefined()
      expect(record.supersededBy).toBeUndefined()
    }
  })

  it('confirmRevocation does NOT retroactively mutate an emitted gate-check record (supersession-not-reinterpretation)', async () => {
    const contact = makeContact({ keyhiveCapabilityRef: 'revoked-local:automerge:cap1' })
    const { gate, accessLog, doc } = makeHarness([contact], TEST_SEAM_DID)

    // Gate check inside the propagation gap → blocked-unconfirmed, asserted.
    await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    const priorRecord = accessLog[0].gateCheckRecord!
    const frozen = JSON.parse(JSON.stringify(priorRecord))
    expect(priorRecord.gateResult).toBe('blocked-unconfirmed')

    // Propagation acknowledgment lands; revocation is confirmed.
    const outcome = confirmRevocation(
      (mutate) => mutate(doc as WorkerKnowledgeGraph),
      'c-1',
      'test: out-of-band attestation received',
    )
    expect(outcome).toBe('confirmed')

    // The refined understanding is a NEW state of the world — the prior
    // record's provenanceStatus, gateResult, and every other field are
    // untouched. The same record cannot be reread under a new
    // interpretation (Item 2 §2.2).
    expect(accessLog[0].gateCheckRecord).toEqual(frozen)
    expect(accessLog[0].gateCheckRecord!.provenanceStatus).toBe('asserted')

    // A subsequent gate check emits a NEW record reflecting the new state.
    await gate.assertCapabilityCurrent('c-1', 'read-bundle', TEST_GRANT_REF)
    const gateChecks = accessLog.filter((e) => e.eventType === 'gate-check')
    expect(gateChecks).toHaveLength(2)
    expect(gateChecks[1].gateCheckRecord!.gateResult).toBe('blocked-revoked')
    expect(gateChecks[1].gateCheckRecord!.recordId).not.toBe(frozen.recordId)
  })

  it("prototype emits only 'asserted' — non-asserted statuses have no producer (honest upper bound)", async () => {
    // Behavioral inventory, not a tautology: run every reachable gate path
    // and confirm the emitted-status set is exactly {'asserted'}. If a
    // future increment adds a non-asserted producer, this test names the
    // moment the inventory changed.
    const contacts = [
      makeContact({ contactId: 'a', keyhiveCapabilityRef: 'automerge:cap1', accessTier: 'read-full' }),
      makeContact({ contactId: 'b', keyhiveCapabilityRef: 'revoked-local:automerge:cap1' }),
      makeContact({ contactId: 'c', keyhiveCapabilityRef: 'revoked-confirmed:automerge:cap1' }),
      makeContact({ contactId: 'd' }), // no capability ever granted
    ]
    const { gate, accessLog } = makeHarness(contacts, TEST_SEAM_DID)
    for (const id of ['a', 'b', 'c', 'd', 'ghost']) {
      await gate.assertCapabilityCurrent(id, 'read-bundle', TEST_GRANT_REF)
    }
    const statuses = new Set(
      accessLog.filter((e) => e.gateCheckRecord).map((e) => e.gateCheckRecord!.provenanceStatus),
    )
    expect([...statuses]).toEqual(['asserted'])
  })
})

// --- 4. seam:aiProvenance instance (Item 2 §3.3) -----------------------------

describe('seam:aiProvenance — action-provenance instance', () => {
  const OPERATOR = 'did:key:zOperatingParty789'

  it('constructs a conforming record for AI-assisted, reviewed content', () => {
    const record = createAiProvenanceRecord({
      operatingPartyDID: OPERATOR,
      aiAssisted: true,
      aiModel: 'claude-fable-5',
      aiInputs: 'artifact:a-1 draft content + project context notes',
      humanReviewStatus: 'modified',
      reviewerIdentity: 'did:key:zReviewer001',
      reviewTimestamp: new Date().toISOString(),
    })
    expect(validateAiProvenanceRecord(record)).toEqual([])
    expect(record.recordType).toBe('provenance')
    expect(record.governanceEvent).toBe('action-provenance')
    expect(record.boundType).toBe('exposure-upper-bound')
    expect(record.provenanceStatus).toBe('asserted')
    // emittedBy is the operating party (human responsible for the record's
    // accuracy) — distinct from the acting agent's DID, which lives on the
    // gate-check record, not here (Item 2 §3.3).
    expect(record.emittedBy).toBe(OPERATOR)
    expect(isUngovernedAiOutput(record)).toBe(false)
  })

  it('constructs a conforming record for non-AI content (aiAssisted false, review none)', () => {
    const record = createAiProvenanceRecord({
      operatingPartyDID: OPERATOR,
      aiAssisted: false,
      humanReviewStatus: 'none',
    })
    expect(validateAiProvenanceRecord(record)).toEqual([])
    expect(record.aiModel).toBeUndefined()
    expect(record.reviewerIdentity).toBeUndefined()
    expect(isUngovernedAiOutput(record)).toBe(false)
  })

  it('flags aiAssisted + humanReviewStatus none as ungoverned-AI-output (PC#7 v0.5 schema-level flag)', () => {
    const record = createAiProvenanceRecord({
      operatingPartyDID: OPERATOR,
      aiAssisted: true,
      aiModel: 'claude-fable-5',
      aiInputs: 'unreviewed generation',
      humanReviewStatus: 'none',
    })
    expect(validateAiProvenanceRecord(record)).toEqual([])
    expect(isUngovernedAiOutput(record)).toBe(true)
  })

  it('constructor refuses aiAssisted without aiModel/aiInputs', () => {
    expect(() =>
      createAiProvenanceRecord({
        operatingPartyDID: OPERATOR,
        aiAssisted: true,
        humanReviewStatus: 'none',
      }),
    ).toThrow(/aiModel and aiInputs/)
  })

  it('constructor refuses a review status without reviewer identity + timestamp', () => {
    expect(() =>
      createAiProvenanceRecord({
        operatingPartyDID: OPERATOR,
        aiAssisted: false,
        humanReviewStatus: 'accepted',
      }),
    ).toThrow(/reviewerIdentity and reviewTimestamp/)
  })

  it('validator rejects conditional-field violations on records from outside the constructor', () => {
    const smuggled = {
      recordId: mintRecordId(),
      recordType: 'provenance',
      emittedAt: new Date().toISOString(),
      emittedBy: OPERATOR,
      provenanceStatus: 'asserted',
      governanceEvent: 'action-provenance',
      boundType: 'exposure-upper-bound',
      aiAssisted: true, // but no aiModel / aiInputs
      humanReviewStatus: 'reviewed', // but no reviewer fields
    }
    const violations = validateAiProvenanceRecord(smuggled)
    expect(violations.some((x) => x.includes('aiModel required'))).toBe(true)
    expect(violations.some((x) => x.includes('reviewerIdentity required'))).toBe(true)
  })

  it('validator rejects humanReviewStatus outside the PC#7 v0.5 vocabulary', () => {
    const record = {
      ...createAiProvenanceRecord({
        operatingPartyDID: OPERATOR,
        aiAssisted: false,
        humanReviewStatus: 'none',
      }),
      humanReviewStatus: 'approved',
    }
    expect(
      validateAiProvenanceRecord(record).some((x) => x.includes('controlled vocabulary')),
    ).toBe(true)
  })
})
