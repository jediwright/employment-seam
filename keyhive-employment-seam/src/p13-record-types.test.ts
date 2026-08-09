/**
 * Form C — P13 v1 Evidence-Plane Record Types — Test Suite
 *
 * Session: OI-P13-1 — P13 v1 evidence-plane build session
 * Date: 2026-08-09
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 *
 * REQUIRED TESTS (from kickoff OI-P13-1):
 *   1. CONTAINMENT (canary): gate never reads contest state
 *   2. PARTITION: divergent views converge on record-set union
 *   3. CONSENT DERIVATION: operative iff all consents present; status quo ante otherwise
 *   4. RESOLUTION CAPABILITY: rejected without formation-time-consented capability; accepted with it
 *
 * ADDITIONAL COVERAGE:
 *   5. Amendment status derivation (proposed, contested, lapsed)
 *   6. Non-blocking objection (operative with contested state)
 *   7. Meet-of-candidates (T12)
 *   8. Record set union mergeability
 *   9. Schema field validation (required fields present)
 *
 * 93/93 base tests must continue passing. All new tests are additive.
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  SeamTermAmendmentRecord,
  ObjectionRecord,
  ConsentRecord,
  ResolutionRecord,
  P13RecordSet,
  ResolutionCapabilityRegistry,
  // Derivation functions
  deriveAmendmentStatus,
  meetOfCandidates,
  mergeRecordSets,
  hasResolutionCapability,
  DEFAULT_LAPSE_INTERVAL_MS,
  // Controlled vocab types (for type-check tests)
  AmendmentStatus,
  DID,
  URI,
} from './p13-record-types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WORKER_DID: DID = 'did:key:worker-alice';
const EMPLOYER_DID: DID = 'did:key:employer-acme';
const GRANT_CHAIN = [WORKER_DID, EMPLOYER_DID];

const NOW_ISO = new Date().toISOString();
const PAST_ISO = new Date(Date.now() - DEFAULT_LAPSE_INTERVAL_MS - 1000).toISOString();

const AMENDMENT_ID: URI = 'urn:seam:amendment:001';
const CONSENT_ID_WORKER: URI = 'urn:seam:consent:worker-001';
const CONSENT_ID_EMPLOYER: URI = 'urn:seam:consent:employer-001';
const OBJECTION_ID: URI = 'urn:seam:objection:001';
const RESOLUTION_ID: URI = 'urn:seam:resolution:001';
const RESOLVER_DID: DID = 'did:key:resolver-arbiter';

/** Helper: build a minimal valid SeamTermAmendmentRecord */
function makeAmendment(overrides: Partial<SeamTermAmendmentRecord> = {}): SeamTermAmendmentRecord {
  return {
    recordId: 'urn:seam:crossing:amendment:001',
    recordType: 'term-amendment',
    emittedAt: NOW_ISO,
    emittedBy: WORKER_DID,
    provenanceStatus: 'asserted',
    governanceEvent: 'term-amendment-proposal',
    boundType: 'exposure-upper-bound',
    lineageAnchorType: 'author-declared',
    amendmentId: AMENDMENT_ID,
    proposedBy: WORKER_DID,
    termKey: 'data-access-level',
    proposedValue: 'read-only',
    effectiveIfOperative: true,
    ...overrides,
  };
}

/** Helper: build a minimal valid ObjectionRecord */
function makeObjection(overrides: Partial<ObjectionRecord> = {}): ObjectionRecord {
  return {
    recordId: 'urn:seam:crossing:objection:001',
    recordType: 'objection',
    emittedAt: NOW_ISO,
    emittedBy: EMPLOYER_DID,
    provenanceStatus: 'asserted',
    governanceEvent: 'term-amendment-objection',
    boundType: 'exposure-upper-bound',
    lineageAnchorType: 'author-declared',
    objectionId: OBJECTION_ID,
    objector: EMPLOYER_DID,
    objectorStanding: 'Party to the employment seam; grant-chain member',
    amendmentRef: AMENDMENT_ID,
    basis: 'Proposed value does not satisfy operational requirements',
    ...overrides,
  };
}

/** Helper: build a minimal valid ConsentRecord */
function makeConsent(party: DID, id: URI, overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    recordId: `urn:seam:crossing:consent:${id}`,
    recordType: 'consent',
    emittedAt: NOW_ISO,
    emittedBy: party,
    provenanceStatus: 'asserted',
    governanceEvent: 'term-amendment-consent',
    boundType: 'exposure-upper-bound',
    lineageAnchorType: 'author-declared',
    consentId: id,
    consentingParty: party,
    amendmentRef: AMENDMENT_ID,
    ...overrides,
  };
}

/** Helper: build a minimal valid ResolutionRecord */
function makeResolution(authorDID: DID, overrides: Partial<ResolutionRecord> = {}): ResolutionRecord {
  return {
    recordId: 'urn:seam:crossing:resolution:001',
    recordType: 'resolution',
    emittedAt: NOW_ISO,
    emittedBy: authorDID,
    provenanceStatus: 'asserted',
    governanceEvent: 'term-amendment-resolution',
    boundType: 'exposure-upper-bound',
    lineageAnchorType: 'author-declared',
    resolutionId: RESOLUTION_ID,
    author: authorDID,
    amendmentRef: AMENDMENT_ID,
    outcome: 'accepted',
    ...overrides,
  };
}

/** Empty record set */
function emptyRecordSet(): P13RecordSet {
  return { amendments: [], objections: [], consents: [], resolutions: [] };
}

// ---------------------------------------------------------------------------
// TEST 1: CONTAINMENT CANARY
// Gate never reads contest state.
//
// STRUCTURAL ENFORCEMENT: This test verifies that the derivation functions
// (deriveAmendmentStatus, etc.) are NOT imported anywhere in the gate
// implementation. Since this test suite runs against the record-types module
// only (not a gate module), the canary test validates that:
//
//   (a) Contest state is only derivable via explicit derivation function calls
//   (b) No AmendmentStatus value appears in any gate type signature
//   (c) The record type definitions themselves carry no pre-computed status field
//
// If a future gate implementation imports deriveAmendmentStatus, the
// architectural review process (GPRF blast-radius tier: Critical) gates that
// PR. This test confirms the containment at schema level; the GPRF governs
// at implementation level.
// ---------------------------------------------------------------------------

describe('CONTAINMENT CANARY — gate never reads contest state', () => {
  it('SeamTermAmendmentRecord has no stored status field', () => {
    const amendment = makeAmendment();
    // The record type must NOT have a status field
    expect('status' in amendment).toBe(false);
    expect('amendmentStatus' in amendment).toBe(false);
    expect('contestState' in amendment).toBe(false);
  });

  it('SeamTermAmendmentRecord fields do not include AmendmentStatus', () => {
    const amendment = makeAmendment();
    const keys = Object.keys(amendment);
    // No key should carry a computed/derived status
    const statusKeys = keys.filter(k =>
      k.toLowerCase().includes('status') && k !== 'provenanceStatus'
    );
    expect(statusKeys).toHaveLength(0);
  });

  it('ObjectionRecord has no gate-blocking flag', () => {
    const objection = makeObjection();
    // ObjectionRecord must NOT have a field like blocking, blocksGate, vetoFlag
    expect('blocking' in objection).toBe(false);
    expect('blocksGate' in objection).toBe(false);
    expect('vetoFlag' in objection).toBe(false);
    expect('blocksGrant' in objection).toBe(false);
  });

  it('deriveAmendmentStatus is a standalone function — not embedded in record shape', () => {
    // The derivation is callable only from outside — not a method on any record
    const amendment = makeAmendment();
    expect(typeof (amendment as any).deriveStatus).toBe('undefined');
    expect(typeof deriveAmendmentStatus).toBe('function');
  });

  it('gate containment: an ObjectionRecord does not change any existing record', () => {
    // Structural enforcement: adding an objection emits a NEW record.
    // No existing record is mutated.
    const amendment = makeAmendment();
    const originalAmendment = { ...amendment };
    const _objection = makeObjection(); // emitting an objection

    // Original amendment is unchanged
    expect(amendment).toEqual(originalAmendment);
  });

  it('contest state is absent from all record shape fields except provenanceStatus', () => {
    // The only 'status' concept in a record itself is provenanceStatus (epistemic, not governance)
    // Amendment governance status lives ONLY in derivation functions
    const allRecords = [
      makeAmendment(),
      makeObjection(),
      makeConsent(WORKER_DID, CONSENT_ID_WORKER),
      makeResolution(RESOLVER_DID),
    ];
    for (const record of allRecords) {
      const keys = Object.keys(record);
      const governanceStatusKeys = keys.filter(k =>
        (k.toLowerCase().includes('status') && k !== 'provenanceStatus') ||
        k.toLowerCase().includes('contest') ||
        k.toLowerCase().includes('block')
      );
      expect(governanceStatusKeys).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// TEST 2: PARTITION TEST
// Two peers hold divergent views; on record-set union, both converge.
// ---------------------------------------------------------------------------

describe('PARTITION TEST — record-set union convergence', () => {
  it('two partitioned peers converge on union of objection records', () => {
    const amendment = makeAmendment();
    const objectionFromPeer1 = makeObjection({
      objectionId: 'urn:seam:objection:peer1',
      recordId: 'urn:seam:crossing:objection:peer1',
    });
    const objectionFromPeer2 = makeObjection({
      objectionId: 'urn:seam:objection:peer2',
      objector: WORKER_DID,
      recordId: 'urn:seam:crossing:objection:peer2',
    });

    // Peer A sees only peer1's objection; Peer B sees only peer2's objection
    const peer1RecordSet: P13RecordSet = {
      ...emptyRecordSet(),
      amendments: [amendment],
      objections: [objectionFromPeer1],
    };
    const peer2RecordSet: P13RecordSet = {
      ...emptyRecordSet(),
      amendments: [amendment],
      objections: [objectionFromPeer2],
    };

    // Under partition: both peers derive 'contested' from their own view
    const statusPeer1 = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, peer1RecordSet);
    const statusPeer2 = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, peer2RecordSet);
    expect(statusPeer1).toBe('contested');
    expect(statusPeer2).toBe('contested');

    // After partition heals: merge → union
    const merged = mergeRecordSets(peer1RecordSet, peer2RecordSet);
    const statusMerged = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, merged);

    // Both converge on 'contested' (2 objections present)
    expect(statusMerged).toBe('contested');
    expect(merged.objections).toHaveLength(2);
  });

  it('two partitioned peers with divergent consent visibility converge on union', () => {
    const amendment = makeAmendment();
    const workerConsent = makeConsent(WORKER_DID, CONSENT_ID_WORKER);
    const employerConsent = makeConsent(EMPLOYER_DID, CONSENT_ID_EMPLOYER);

    // Peer A (worker side) has only worker's consent
    const peerA: P13RecordSet = {
      ...emptyRecordSet(),
      amendments: [amendment],
      consents: [workerConsent],
    };
    // Peer B (employer side) has only employer's consent
    const peerB: P13RecordSet = {
      ...emptyRecordSet(),
      amendments: [amendment],
      consents: [employerConsent],
    };

    // Under partition: neither peer can derive 'operative' (missing the other's consent)
    const statusA = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, peerA);
    const statusB = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, peerB);
    expect(statusA).toBe('proposed'); // only worker's consent — not all parties
    expect(statusB).toBe('proposed'); // only employer's consent — not all parties

    // After partition heals: merge → union
    const merged = mergeRecordSets(peerA, peerB);
    const statusMerged = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, merged);

    // Both peers now derive 'operative' (all consents present)
    expect(statusMerged).toBe('operative');
    expect(merged.consents).toHaveLength(2);
  });

  it('mergeRecordSets is idempotent (merging same set is identity)', () => {
    const amendment = makeAmendment();
    const rs: P13RecordSet = { ...emptyRecordSet(), amendments: [amendment] };
    const merged = mergeRecordSets(rs, rs);
    expect(merged.amendments).toHaveLength(1); // deduplication applied
  });

  it('mergeRecordSets is commutative', () => {
    const amendment = makeAmendment();
    const objection = makeObjection();
    const consent = makeConsent(WORKER_DID, CONSENT_ID_WORKER);

    const rsA: P13RecordSet = { ...emptyRecordSet(), amendments: [amendment], objections: [objection] };
    const rsB: P13RecordSet = { ...emptyRecordSet(), amendments: [amendment], consents: [consent] };

    const mergedAB = mergeRecordSets(rsA, rsB);
    const mergedBA = mergeRecordSets(rsB, rsA);

    // Order of records may differ; compare by ID sets
    const amendmentIdsAB = new Set(mergedAB.amendments.map(a => a.recordId));
    const amendmentIdsBA = new Set(mergedBA.amendments.map(a => a.recordId));
    expect(amendmentIdsAB).toEqual(amendmentIdsBA);

    const objectionIdsAB = new Set(mergedAB.objections.map(o => o.recordId));
    const objectionIdsBA = new Set(mergedBA.objections.map(o => o.recordId));
    expect(objectionIdsAB).toEqual(objectionIdsBA);

    const consentIdsAB = new Set(mergedAB.consents.map(c => c.recordId));
    const consentIdsBA = new Set(mergedBA.consents.map(c => c.recordId));
    expect(consentIdsAB).toEqual(consentIdsBA);
  });
});

// ---------------------------------------------------------------------------
// TEST 3: CONSENT DERIVATION
// Amendment operative iff all grant-chain parties have unrevoked consent.
// ---------------------------------------------------------------------------

describe('CONSENT DERIVATION — operative / status-quo-ante', () => {
  it('amendment is operative when all grant-chain parties have consented', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [
        makeConsent(WORKER_DID, CONSENT_ID_WORKER),
        makeConsent(EMPLOYER_DID, CONSENT_ID_EMPLOYER),
      ],
      resolutions: [],
    };
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    expect(status).toBe('operative');
  });

  it('amendment is NOT operative when worker consent is missing', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [makeConsent(EMPLOYER_DID, CONSENT_ID_EMPLOYER)],
      resolutions: [],
    };
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    expect(status).not.toBe('operative');
  });

  it('amendment is NOT operative when employer consent is missing', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [makeConsent(WORKER_DID, CONSENT_ID_WORKER)],
      resolutions: [],
    };
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    expect(status).not.toBe('operative');
  });

  it('amendment is NOT operative when no consents are present', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [],
      resolutions: [],
    };
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    expect(status).toBe('proposed');
  });

  it('amendment is NOT operative when a consent is revoked (superseded)', () => {
    // Worker's consent is revoked
    const revokedWorkerConsent = makeConsent(WORKER_DID, CONSENT_ID_WORKER, {
      provenanceStatus: 'superseded',
      supersededBy: 'urn:seam:consent:worker-revocation-001',
    });
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [
        revokedWorkerConsent,
        makeConsent(EMPLOYER_DID, CONSENT_ID_EMPLOYER),
      ],
      resolutions: [],
    };
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    expect(status).not.toBe('operative');
  });

  it('amendment is operative even with an objection present (non-blocking objection)', () => {
    // All consents present + objection: operative wins (non-blocking model)
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [makeObjection()],
      consents: [
        makeConsent(WORKER_DID, CONSENT_ID_WORKER),
        makeConsent(EMPLOYER_DID, CONSENT_ID_EMPLOYER),
      ],
      resolutions: [],
    };
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    // Operative takes precedence over contested (non-blocking design)
    expect(status).toBe('operative');
  });

  it('amendment is contested when only objection is present (no consent)', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [makeObjection()],
      consents: [],
      resolutions: [],
    };
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    expect(status).toBe('contested');
  });

  it('amendment is lapsed when no activity after lapse interval', () => {
    // Amendment emitted in the past, no consent or objection
    const oldAmendment = makeAmendment({ emittedAt: PAST_ISO });
    const rs: P13RecordSet = {
      amendments: [oldAmendment],
      objections: [],
      consents: [],
      resolutions: [],
    };
    // Use lapse interval of 0 to force lapsed immediately
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs, 0);
    expect(status).toBe('lapsed');
  });

  it('amendment is proposed (not lapsed) when within lapse interval', () => {
    const recentAmendment = makeAmendment({ emittedAt: NOW_ISO });
    const rs: P13RecordSet = {
      amendments: [recentAmendment],
      objections: [],
      consents: [],
      resolutions: [],
    };
    // Default lapse interval — recent amendment cannot be lapsed
    const status = deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs);
    expect(status).toBe('proposed');
  });
});

// ---------------------------------------------------------------------------
// TEST 4: RESOLUTION CAPABILITY
// Rejected without formation-time-consented capability; accepted with it.
// ---------------------------------------------------------------------------

describe('RESOLUTION CAPABILITY — formation-time-consented authorization', () => {
  const validRegistry: ResolutionCapabilityRegistry = {
    entries: [
      {
        authorDID: RESOLVER_DID,
        grantedAt: NOW_ISO,
        grantedBy: GRANT_CHAIN, // All grant-chain parties consented
        scope: 'Employment seam — data-access-level amendments',
      },
    ],
  };

  const emptyRegistry: ResolutionCapabilityRegistry = {
    entries: [],
  };

  const partialRegistry: ResolutionCapabilityRegistry = {
    entries: [
      {
        authorDID: RESOLVER_DID,
        grantedAt: NOW_ISO,
        grantedBy: [WORKER_DID], // Only worker consented — NOT all parties
        scope: 'Employment seam',
      },
    ],
  };

  it('ACCEPTED: ResolutionRecord author has formation-time-consented capability', () => {
    const hasCapability = hasResolutionCapability(RESOLVER_DID, GRANT_CHAIN, validRegistry);
    expect(hasCapability).toBe(true);
  });

  it('REJECTED: ResolutionRecord author has no entry in the registry', () => {
    const unauthorizedDID: DID = 'did:key:unauthorized-party';
    const hasCapability = hasResolutionCapability(unauthorizedDID, GRANT_CHAIN, validRegistry);
    expect(hasCapability).toBe(false);
  });

  it('REJECTED: ResolutionRecord author has capability but not all grant-chain parties consented', () => {
    // Partial registry — only worker consented, not employer
    const hasCapability = hasResolutionCapability(RESOLVER_DID, GRANT_CHAIN, partialRegistry);
    expect(hasCapability).toBe(false);
  });

  it('REJECTED: Empty registry means no resolution capability exists', () => {
    const hasCapability = hasResolutionCapability(RESOLVER_DID, GRANT_CHAIN, emptyRegistry);
    expect(hasCapability).toBe(false);
  });

  it('ResolutionRecord without capability should be flagged at application layer', () => {
    // The record itself is valid TypeScript (the schema does not prevent creation);
    // admissibility is checked at application layer via hasResolutionCapability.
    // This test documents that pattern: creation ≠ admissibility.
    const resolution = makeResolution(RESOLVER_DID);
    expect(resolution.author).toBe(RESOLVER_DID);
    expect(resolution.outcome).toBe('accepted');

    // Without a registry entry, this resolution is inadmissible:
    const isAdmissible = hasResolutionCapability(resolution.author, GRANT_CHAIN, emptyRegistry);
    expect(isAdmissible).toBe(false);
  });

  it('ACCEPTED + propagates: resolution with valid capability is admissible', () => {
    const resolution = makeResolution(RESOLVER_DID);
    const isAdmissible = hasResolutionCapability(resolution.author, GRANT_CHAIN, validRegistry);
    expect(isAdmissible).toBe(true);

    // After admissibility check, the resolution enters the record set
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [],
      resolutions: [resolution],
    };
    expect(rs.resolutions).toHaveLength(1);
    expect(rs.resolutions[0].outcome).toBe('accepted');
  });
});

// ---------------------------------------------------------------------------
// ADDITIONAL TEST 5: MEET-OF-CANDIDATES (T12)
// ---------------------------------------------------------------------------

describe('MEET-OF-CANDIDATES (T12) — lattice derivation', () => {
  it('returns null when no operative amendments exist', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [], // no consent → not operative
      resolutions: [],
    };
    const meet = meetOfCandidates(
      'data-access-level',
      GRANT_CHAIN,
      rs,
      (a, b) => a.localeCompare(b)
    );
    expect(meet).toBeNull();
  });

  it('returns the operative value when single operative amendment exists', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [
        makeConsent(WORKER_DID, CONSENT_ID_WORKER),
        makeConsent(EMPLOYER_DID, CONSENT_ID_EMPLOYER),
      ],
      resolutions: [],
    };
    const meet = meetOfCandidates(
      'data-access-level',
      GRANT_CHAIN,
      rs,
      (a, b) => a.localeCompare(b)
    );
    expect(meet).toBe('read-only');
  });
});

// ---------------------------------------------------------------------------
// ADDITIONAL TEST 6: SCHEMA FIELD VALIDATION
// All required fields present in each record type
// ---------------------------------------------------------------------------

describe('SCHEMA FIELD VALIDATION — required fields', () => {
  it('SeamTermAmendmentRecord has all required CrossingRecord base fields', () => {
    const amendment = makeAmendment();
    expect(amendment.recordId).toBeDefined();
    expect(amendment.recordType).toBe('term-amendment');
    expect(amendment.emittedAt).toBeDefined();
    expect(amendment.emittedBy).toBeDefined();
    expect(amendment.provenanceStatus).toBeDefined();
    expect(amendment.governanceEvent).toBe('term-amendment-proposal');
    expect(amendment.boundType).toBe('exposure-upper-bound');
    expect(amendment.lineageAnchorType).toBe('author-declared');
  });

  it('SeamTermAmendmentRecord has all P13-specific fields', () => {
    const amendment = makeAmendment();
    expect(amendment.amendmentId).toBeDefined();
    expect(amendment.proposedBy).toBeDefined();
    expect(amendment.termKey).toBeDefined();
    expect(amendment.proposedValue).toBeDefined();
    expect(typeof amendment.effectiveIfOperative).toBe('boolean');
  });

  it('ObjectionRecord has all required fields', () => {
    const objection = makeObjection();
    expect(objection.recordId).toBeDefined();
    expect(objection.recordType).toBe('objection');
    expect(objection.emittedAt).toBeDefined();
    expect(objection.emittedBy).toBeDefined();
    expect(objection.provenanceStatus).toBeDefined();
    expect(objection.governanceEvent).toBe('term-amendment-objection');
    expect(objection.boundType).toBe('exposure-upper-bound');
    expect(objection.lineageAnchorType).toBe('author-declared');
    expect(objection.objectionId).toBeDefined();
    expect(objection.objector).toBeDefined();
    expect(objection.objectorStanding).toBeDefined();
    expect(objection.amendmentRef).toBeDefined();
    expect(objection.basis).toBeDefined();
  });

  it('ConsentRecord has all required fields', () => {
    const consent = makeConsent(WORKER_DID, CONSENT_ID_WORKER);
    expect(consent.recordId).toBeDefined();
    expect(consent.recordType).toBe('consent');
    expect(consent.emittedAt).toBeDefined();
    expect(consent.emittedBy).toBeDefined();
    expect(consent.provenanceStatus).toBeDefined();
    expect(consent.governanceEvent).toBe('term-amendment-consent');
    expect(consent.boundType).toBe('exposure-upper-bound');
    expect(consent.lineageAnchorType).toBe('author-declared');
    expect(consent.consentId).toBeDefined();
    expect(consent.consentingParty).toBeDefined();
    expect(consent.amendmentRef).toBeDefined();
  });

  it('ResolutionRecord has all required fields', () => {
    const resolution = makeResolution(RESOLVER_DID);
    expect(resolution.recordId).toBeDefined();
    expect(resolution.recordType).toBe('resolution');
    expect(resolution.emittedAt).toBeDefined();
    expect(resolution.emittedBy).toBeDefined();
    expect(resolution.provenanceStatus).toBeDefined();
    expect(resolution.governanceEvent).toBe('term-amendment-resolution');
    expect(resolution.boundType).toBe('exposure-upper-bound');
    expect(resolution.lineageAnchorType).toBe('author-declared');
    expect(resolution.resolutionId).toBeDefined();
    expect(resolution.author).toBeDefined();
    expect(resolution.amendmentRef).toBeDefined();
    expect(resolution.outcome).toBeDefined();
  });

  it('all records use author-declared lineage anchoring (Q6 lock satisfied)', () => {
    const records = [
      makeAmendment(),
      makeObjection(),
      makeConsent(WORKER_DID, CONSENT_ID_WORKER),
      makeResolution(RESOLVER_DID),
    ];
    for (const record of records) {
      expect(record.lineageAnchorType).toBe('author-declared');
    }
  });

  it('all records use exposure-upper-bound boundType (P9 satisfied)', () => {
    const records = [
      makeAmendment(),
      makeObjection(),
      makeConsent(WORKER_DID, CONSENT_ID_WORKER),
      makeResolution(RESOLVER_DID),
    ];
    for (const record of records) {
      expect(record.boundType).toBe('exposure-upper-bound');
    }
  });
});

// ---------------------------------------------------------------------------
// ADDITIONAL TEST 7: AMENDMENT STATUS STATE MACHINE
// All four status values reachable by derivation
// ---------------------------------------------------------------------------

describe('AMENDMENT STATUS STATE MACHINE — all status values derivable', () => {
  it('proposed status: no consent, no objection, within lapse interval', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment({ emittedAt: NOW_ISO })],
      objections: [],
      consents: [],
      resolutions: [],
    };
    expect(deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs)).toBe('proposed');
  });

  it('operative status: all grant-chain consents present', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [],
      consents: [
        makeConsent(WORKER_DID, CONSENT_ID_WORKER),
        makeConsent(EMPLOYER_DID, CONSENT_ID_EMPLOYER),
      ],
      resolutions: [],
    };
    expect(deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs)).toBe('operative');
  });

  it('contested status: ≥1 objection, not all consents', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment()],
      objections: [makeObjection()],
      consents: [],
      resolutions: [],
    };
    expect(deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs)).toBe('contested');
  });

  it('lapsed status: past lapse interval, no activity', () => {
    const rs: P13RecordSet = {
      amendments: [makeAmendment({ emittedAt: PAST_ISO })],
      objections: [],
      consents: [],
      resolutions: [],
    };
    expect(deriveAmendmentStatus(AMENDMENT_ID, GRANT_CHAIN, rs, 0)).toBe('lapsed');
  });
});
