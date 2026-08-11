/**
 * Form C — P13 D2 Build (D2-C1 / D2-C3 / D2-C6 / D2-C5) — Test Suite
 *
 * Session: P13 D2 build session
 * Date: 2026-08-10
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 *
 * Governing doc: form-c-p13-d2-schema-spec_2026-08-10.md
 *
 * REQUIRED TESTS (16 acceptance criteria — the build-session gate):
 *   D2-C1 §2.7: 4 tests (standing recognition +/-, supersession, SHACL)
 *   D2-C3 §3.6: 4 tests (panel valid, member not in registry, exclusion,
 *               empty-meet residual)
 *   D2-C6 §5.8: 4 tests (delegation in consent derivation, revocation by
 *               supersession, no-contested SHACL, absent delegation)
 *   D2-C5 §4.5: 4 tests (chain traversal, locked-in scope guard, locally-
 *               held boundary termination, author-declared under Q6)
 *
 * ADDITIONAL COVERAGE (additive):
 *   - emittedBy === grantor creation guard (D2-C6 §5.6)
 *   - effectiveFrom conditional creation guard (D2-C1 §2.5 TS-layer note)
 *   - deriveAmendmentStatus backward compatibility (no delegations param)
 *   - capabilityType type guard (D2-C3)
 *   - Q6 lock: witness-signed still rejected on D2-C5 fork records
 *   - Gate containment: gate module imports no D2 governance module
 *
 * 131 base tests must continue passing. All new tests are additive;
 * no existing tests are modified.
 */

import { describe, it, expect } from 'vitest';

import {
  type StandingRegistryEntry,
  type StandingRegistry,
  hasStanding,
  createStandingRegistryEntry,
  validateStandingRegistryEntryShape,
} from './p13-d2c1-standing-registry';

import {
  type PanelRule,
  type PanelRuleCapabilityEntry,
  type FixedPartyCapabilityEntry,
  isPanelRuleEntry,
  isPanelValid,
  validatePanelRuleShape,
} from './p13-d2c3-panel-rules';

import {
  type DelegationRecord,
  createDelegationRecord,
  hasDelegatedConsent,
  validateDelegationRecordShape,
} from './p13-d2c6-delegation-record';

import {
  traceLineage,
  isForkLineageAdmissible,
  D2C5_SCOPE_CONDITION,
} from './p13-d2c5-fork-lineage';

import {
  deriveAmendmentStatus,
  type ConsentRecord,
  type P13RecordSet,
  type DID,
  type URI,
} from './p13-record-types';

import { validateCrossingRecordBase } from './crossingRecord';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DID_A: DID = 'did:key:member-a';
const DID_B: DID = 'did:key:member-b';
const DID_C: DID = 'did:key:member-c';
const DID_D: DID = 'did:key:member-d';
const DID_X: DID = 'did:key:outsider-x';

const NOW_ISO = new Date().toISOString();

let entrySeq = 0;
/** Helper: build a minimal valid StandingRegistryEntry (formation-style). */
function makeStandingEntry(
  overrides: Partial<StandingRegistryEntry> = {}
): StandingRegistryEntry {
  entrySeq += 1;
  return {
    recordId: `urn:seam:standing:${entrySeq}`,
    recordType: 'standing-registry-entry',
    emittedAt: NOW_ISO,
    emittedBy: DID_A,
    provenanceStatus: 'asserted',
    governanceEvent: 'standing-constitution',
    boundType: 'confirmation',
    memberDID: DID_A,
    standingScope: 'full',
    membershipBasis: 'founding party',
    ...overrides,
  };
}

// ===========================================================================
// D2-C1 — StandingRegistry (§2.7 acceptance criteria)
// ===========================================================================

describe('D2-C1 StandingRegistry — acceptance criteria (§2.7)', () => {
  it('Test 1 — standing recognition, positive case', () => {
    const registry: StandingRegistry = [
      makeStandingEntry({ memberDID: DID_A, standingScope: 'full' }),
    ];
    expect(hasStanding(DID_A, 'amendment', registry)).toBe(true);
  });

  it('Test 2 — standing recognition, absent DID (fail-safe)', () => {
    const registry: StandingRegistry = [
      makeStandingEntry({ memberDID: DID_A, standingScope: 'full' }),
    ];
    // DID-B not in registry: returns false; no exception; no gate blocked
    expect(() => hasStanding(DID_B, 'amendment', registry)).not.toThrow();
    expect(hasStanding(DID_B, 'amendment', registry)).toBe(false);
  });

  it('Test 3 — supersession (only non-superseded entry counts)', () => {
    const superseded = makeStandingEntry({
      memberDID: DID_A,
      standingScope: 'full',
      provenanceStatus: 'superseded',
      supersededBy: 'urn:seam:standing:next',
    });
    const surviving = makeStandingEntry({
      recordId: 'urn:seam:standing:next',
      memberDID: DID_A,
      standingScope: 'objection',
      provenanceStatus: 'asserted',
      governanceEvent: 'standing-amendment',
      effectiveFrom: 'urn:seam:amendment:membership-1',
      chainReference: superseded.recordId,
    });
    const registry: StandingRegistry = [superseded, surviving];
    // Surviving entry's 'objection' scope does not cover 'amendment'
    expect(hasStanding(DID_A, 'amendment', registry)).toBe(false);
    // (and does cover its own named scope)
    expect(hasStanding(DID_A, 'objection', registry)).toBe(true);
  });

  it('Test 4 — SHACL shape enforcement (missing memberDID)', () => {
    const invalid = makeStandingEntry();
    delete (invalid as Partial<StandingRegistryEntry>).memberDID;
    const violations = validateStandingRegistryEntryShape(invalid);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((msg) => msg.includes('seam:memberDID'))).toBe(true);
  });
});

describe('D2-C1 StandingRegistry — additive coverage', () => {
  it('conforming entry passes the shape validator', () => {
    const violations = validateStandingRegistryEntryShape(makeStandingEntry());
    expect(violations).toHaveLength(0);
  });

  it('creation guard: amendment-triggered entry without effectiveFrom throws (§2.5 TS-layer)', () => {
    expect(() =>
      createStandingRegistryEntry(
        makeStandingEntry({ governanceEvent: 'standing-amendment' })
      )
    ).toThrow(/effectiveFrom/);
    // With effectiveFrom present: no throw
    expect(() =>
      createStandingRegistryEntry(
        makeStandingEntry({
          governanceEvent: 'standing-amendment',
          effectiveFrom: 'urn:seam:amendment:membership-1',
        })
      )
    ).not.toThrow();
  });

  it("specific scope covers its named surface only; 'full' covers all", () => {
    const registry: StandingRegistry = [
      makeStandingEntry({ memberDID: DID_B, standingScope: 'consent' }),
    ];
    expect(hasStanding(DID_B, 'consent', registry)).toBe(true);
    expect(hasStanding(DID_B, 'resolution', registry)).toBe(false);
    expect(hasStanding(DID_B, 'amendment', registry)).toBe(false);
    expect(hasStanding(DID_B, 'objection', registry)).toBe(false);
  });

  it('empty registry: fail-safe false for any DID', () => {
    expect(hasStanding(DID_A, 'amendment', [])).toBe(false);
  });
});

// ===========================================================================
// D2-C3 — Member-drawn resolution panels (§3.6 acceptance criteria)
// ===========================================================================

/** Helper: registry where the given DIDs all hold 'resolution' standing. */
function makeResolutionRegistry(dids: DID[]): StandingRegistry {
  return dids.map((did) =>
    makeStandingEntry({ memberDID: did, standingScope: 'resolution' })
  );
}

/** Helper: build a minimal valid PanelRule. */
function makePanelRule(overrides: Partial<PanelRule> = {}): PanelRule {
  return {
    minMembers: 2,
    memberSource: 'standing-registry',
    exclusionRule: 'none',
    formationConsentRef: 'urn:seam:amendment:panel-rule-1',
    ...overrides,
  };
}

describe('D2-C3 Member-drawn panels — acceptance criteria (§3.6)', () => {
  it('Test 1 — panel valid, basic case', () => {
    const registry = makeResolutionRegistry([DID_A, DID_B, DID_C]);
    const rule = makePanelRule({ minMembers: 2, exclusionRule: 'none' });
    expect(isPanelValid([DID_A, DID_B], rule, registry)).toBe(true);
  });

  it('Test 2 — panel invalid, member not in registry', () => {
    const registry = makeResolutionRegistry([DID_A, DID_B, DID_C]);
    const rule = makePanelRule({ minMembers: 2, exclusionRule: 'none' });
    // DID-X fails hasStanding
    expect(isPanelValid([DID_A, DID_X], rule, registry)).toBe(false);
  });

  it('Test 3 — exclusion rule applied', () => {
    const registry = makeResolutionRegistry([DID_A, DID_B, DID_C, DID_D]);
    const rule = makePanelRule({
      minMembers: 2,
      exclusionRule: 'no-party-to-dispute',
    });
    // Post-exclusion panel has only DID-C; 1 < minMembers:2
    expect(
      isPanelValid([DID_A, DID_B, DID_C], rule, registry, [DID_A, DID_B])
    ).toBe(false);
  });

  it('Test 4 — empty-meet residual (panel rule cannot be satisfied)', () => {
    const registry = makeResolutionRegistry([DID_A, DID_B]);
    const rule = makePanelRule({
      minMembers: 1,
      exclusionRule: 'no-party-to-dispute',
    });
    // All eligible members are dispute parties and excluded: no exception;
    // returns false; calling code falls through to empty-meet residual
    // (status quo ante, SL-0061); no gate blocked
    expect(() =>
      isPanelValid([DID_A, DID_B], rule, registry, [DID_A, DID_B])
    ).not.toThrow();
    expect(
      isPanelValid([DID_A, DID_B], rule, registry, [DID_A, DID_B])
    ).toBe(false);
  });
});

describe('D2-C3 Member-drawn panels — additive coverage', () => {
  it('capabilityType type guard discriminates panel-rule from fixed-party and legacy entries', () => {
    const panelEntry: PanelRuleCapabilityEntry = {
      authorDID: 'did:key:panel-rule-registrant',
      grantedAt: NOW_ISO,
      grantedBy: [DID_A, DID_B],
      scope: 'employment-seam-1',
      capabilityType: 'panel-rule',
      panelRule: makePanelRule(),
    };
    const fixedEntry: FixedPartyCapabilityEntry = {
      authorDID: 'did:key:resolver',
      grantedAt: NOW_ISO,
      grantedBy: [DID_A, DID_B],
      scope: 'employment-seam-1',
      capabilityType: 'fixed-party',
    };
    // Legacy OI-P13-1 entry — no discriminant; fixed-party by construction
    const legacyEntry = {
      authorDID: 'did:key:resolver',
      grantedAt: NOW_ISO,
      grantedBy: [DID_A, DID_B],
      scope: 'employment-seam-1',
    };
    expect(isPanelRuleEntry(panelEntry)).toBe(true);
    expect(isPanelRuleEntry(fixedEntry)).toBe(false);
    expect(isPanelRuleEntry(legacyEntry)).toBe(false);
  });

  it('PanelRuleShape validator: conforming rule passes; minMembers < 1 and missing formationConsentRef fail', () => {
    expect(validatePanelRuleShape(makePanelRule())).toHaveLength(0);

    const badMin = validatePanelRuleShape(makePanelRule({ minMembers: 0 }));
    expect(badMin.some((m) => m.includes('sh:minInclusive'))).toBe(true);

    const noRef = makePanelRule();
    delete (noRef as Partial<PanelRule>).formationConsentRef;
    const refViolations = validatePanelRuleShape(noRef);
    expect(refViolations.some((m) => m.includes('seam:formationConsentRef'))).toBe(true);
  });

  it('empty standing registry: isPanelValid false (SL-0061 composition)', () => {
    const rule = makePanelRule({ minMembers: 1 });
    expect(isPanelValid([DID_A], rule, [])).toBe(false);
  });
});

// ===========================================================================
// D2-C6 — DelegationRecord (§5.8 acceptance criteria)
// ===========================================================================

let delegationSeq = 0;
/** Helper: build a minimal valid DelegationRecord (emittedBy === grantor). */
function makeDelegation(
  overrides: Partial<DelegationRecord> = {}
): DelegationRecord {
  delegationSeq += 1;
  const grantor = overrides.grantor ?? DID_A;
  return {
    recordId: `urn:seam:delegation:${delegationSeq}`,
    recordType: 'delegation',
    emittedAt: NOW_ISO,
    emittedBy: grantor,
    provenanceStatus: 'asserted',
    governanceEvent: 'delegation-grant',
    boundType: 'confirmation',
    lineageAnchorType: 'author-declared',
    grantor,
    delegatee: DID_B,
    scope: 'consent',
    ...overrides,
  };
}

/** Helper: build a ConsentRecord authored by the given party. */
function makeConsentBy(
  consentingParty: DID,
  amendmentRef: URI,
  overrides: Partial<ConsentRecord> = {}
): ConsentRecord {
  return {
    recordId: `urn:seam:crossing:consent:${consentingParty}:${amendmentRef}`,
    recordType: 'consent',
    emittedAt: NOW_ISO,
    emittedBy: consentingParty,
    provenanceStatus: 'asserted',
    governanceEvent: 'term-amendment-consent',
    boundType: 'exposure-upper-bound',
    lineageAnchorType: 'author-declared',
    consentId: `urn:seam:consent:${consentingParty}:${amendmentRef}`,
    consentingParty,
    amendmentRef,
    ...overrides,
  };
}

const D2C6_AMENDMENT_ID: URI = 'urn:seam:amendment:d2c6-x';

/** Helper: record set with one amendment proposed between DID_A and DID_C. */
function makeD2C6RecordSet(consents: ConsentRecord[]): P13RecordSet {
  return {
    amendments: [
      {
        recordId: 'urn:seam:crossing:amendment:d2c6-x',
        recordType: 'term-amendment',
        emittedAt: NOW_ISO,
        emittedBy: DID_C,
        provenanceStatus: 'asserted',
        governanceEvent: 'term-amendment-proposal',
        boundType: 'exposure-upper-bound',
        lineageAnchorType: 'author-declared',
        amendmentId: D2C6_AMENDMENT_ID,
        proposedBy: DID_C,
        termKey: 'data-access-level',
        proposedValue: 'read-only',
        effectiveIfOperative: true,
      },
    ],
    objections: [],
    consents,
    resolutions: [],
  };
}

describe('D2-C6 DelegationRecord — acceptance criteria (§5.8)', () => {
  it('Test 1 — delegation recognized, consent derivation affected', () => {
    // DID-A delegates consent-authoring to DID-B; DID-B authors the consent
    const delegation = makeDelegation({ grantor: DID_A, delegatee: DID_B });
    const grantChain = [DID_A, DID_C];
    const recordSet = makeD2C6RecordSet([
      makeConsentBy(DID_B, D2C6_AMENDMENT_ID), // fills DID-A's slot via delegation
      makeConsentBy(DID_C, D2C6_AMENDMENT_ID),
    ]);
    const status = deriveAmendmentStatus(
      D2C6_AMENDMENT_ID,
      grantChain,
      recordSet,
      undefined,
      [delegation]
    );
    expect(status).toBe('operative');

    // Control: without the delegation, DID-A's slot is unfilled → not operative
    const statusWithout = deriveAmendmentStatus(
      D2C6_AMENDMENT_ID,
      grantChain,
      recordSet
    );
    expect(statusWithout).not.toBe('operative');
  });

  it('Test 2 — revocation by supersession clears delegation', () => {
    const d2 = makeDelegation({ grantor: DID_A, delegatee: DID_C });
    const d1 = makeDelegation({
      grantor: DID_A,
      delegatee: DID_B,
      provenanceStatus: 'superseded',
      supersededBy: d2.recordId,
    });
    expect(hasDelegatedConsent(DID_A, DID_B, [d1, d2])).toBe(false);
    expect(hasDelegatedConsent(DID_A, DID_C, [d1, d2])).toBe(true);
  });

  it("Test 3 — no 'contested' derivation (D3 constraint 5, SHACL-enforced)", () => {
    const contested = {
      ...makeDelegation(),
      provenanceStatus: 'contested',
    };
    const violations = validateDelegationRecordShape(contested);
    expect(
      violations.some((m) => m.includes('sh:in (asserted superseded)'))
    ).toBe(true);
  });

  it('Test 4 — absent delegation: derivation proceeds without effect', () => {
    expect(() => hasDelegatedConsent(DID_A, DID_B, [])).not.toThrow();
    expect(hasDelegatedConsent(DID_A, DID_B, [])).toBe(false);

    // Amendment derivation proceeds without delegation effects; no exception;
    // no gate blocked
    const grantChain = [DID_A, DID_C];
    const recordSet = makeD2C6RecordSet([makeConsentBy(DID_C, D2C6_AMENDMENT_ID)]);
    expect(() =>
      deriveAmendmentStatus(D2C6_AMENDMENT_ID, grantChain, recordSet, undefined, [])
    ).not.toThrow();
    expect(
      deriveAmendmentStatus(D2C6_AMENDMENT_ID, grantChain, recordSet, undefined, [])
    ).toBe('proposed');
  });
});

describe('D2-C6 DelegationRecord — additive coverage', () => {
  it('creation guard: emittedBy !== grantor throws at record creation (§5.6)', () => {
    expect(() =>
      createDelegationRecord(
        makeDelegation({ grantor: DID_A, emittedBy: DID_C })
      )
    ).toThrow(/emittedBy must equal grantor/);
    expect(() => createDelegationRecord(makeDelegation())).not.toThrow();
  });

  it('conforming DelegationRecord passes the shape validator', () => {
    expect(validateDelegationRecordShape(makeDelegation())).toHaveLength(0);
  });

  it('Q6 lock: witness-signed lineageAnchorType fails the shape validator', () => {
    const record = { ...makeDelegation(), lineageAnchorType: 'witness-signed' };
    const violations = validateDelegationRecordShape(record);
    expect(violations.some((m) => m.includes('Q6 lock'))).toBe(true);
  });

  it('backward compatibility: deriveAmendmentStatus without delegations param behaves as OI-P13-1', () => {
    const grantChain = [DID_A, DID_C];
    const recordSet = makeD2C6RecordSet([
      makeConsentBy(DID_A, D2C6_AMENDMENT_ID),
      makeConsentBy(DID_C, D2C6_AMENDMENT_ID),
    ]);
    // 3-arg call site (existing convention) — still operative
    expect(deriveAmendmentStatus(D2C6_AMENDMENT_ID, grantChain, recordSet)).toBe(
      'operative'
    );
  });
});

// ===========================================================================
// D2-C5 — Fork lineage convention (§4.5 acceptance criteria)
// ===========================================================================

describe('D2-C5 Fork lineage convention — acceptance criteria (§4.5)', () => {
  it('Test 1 — fork chain traversal, basic case', () => {
    const r1 = { recordId: 'urn:seam:formation:seam-a', chainDepth: 0 };
    const r2 = {
      recordId: 'urn:seam:formation:seam-b',
      chainReference: r1.recordId,
      chainDepth: 1,
    };
    expect(traceLineage(r2, [r1, r2])).toEqual([r1, r2]);
  });

  it('Test 2 — scope boundary (locked-in seam guard, design-time)', () => {
    // Employment seam: locked-in; substitutability absent. D2-C5 MUST NOT
    // be applied as a governance mechanism here (design-time constraint;
    // not a runtime schema validation).
    const employmentSeamContext = { substitutablePopulation: false };
    expect(isForkLineageAdmissible(employmentSeamContext)).toBe(false);
    // The scope condition itself is carried verbatim (SL-0060)
    expect(D2C5_SCOPE_CONDITION).toContain('substitutable populations only');
    expect(D2C5_SCOPE_CONDITION).toContain('MUST NOT');
    // Substitutable-population seam: in scope
    expect(isForkLineageAdmissible({ substitutablePopulation: true })).toBe(true);
  });

  it('Test 3 — lineage terminates at locally-held boundary', () => {
    const r2 = {
      recordId: 'urn:seam:formation:seam-b',
      chainReference: 'urn:seam:formation:not-held-locally',
    };
    expect(() => traceLineage(r2, [r2])).not.toThrow();
    expect(traceLineage(r2, [r2])).toEqual([r2]);
  });

  it('Test 4 — author-declared anchor under Q6 default (base-shape SHACL)', () => {
    const forkRecord = {
      recordId: 'urn:seam:formation:seam-b',
      recordType: 'lineage',
      emittedAt: NOW_ISO,
      emittedBy: DID_A,
      provenanceStatus: 'asserted',
      governanceEvent: 'schema-change',
      boundType: 'exposure-upper-bound',
      chainReference: 'urn:seam:formation:seam-a',
      chainDepth: 1,
      lineageAnchorType: 'author-declared',
    };
    // No violation: author-declared is valid under the Q6 default
    expect(validateCrossingRecordBase(forkRecord)).toHaveLength(0);
  });
});

describe('D2-C5 Fork lineage convention — additive coverage', () => {
  it('Q6 lock holds on fork records: witness-signed fails base-shape validation', () => {
    const forkRecord = {
      recordId: 'urn:seam:formation:seam-b',
      recordType: 'lineage',
      emittedAt: NOW_ISO,
      emittedBy: DID_A,
      provenanceStatus: 'asserted',
      governanceEvent: 'schema-change',
      boundType: 'exposure-upper-bound',
      chainReference: 'urn:seam:formation:seam-a',
      chainDepth: 1,
      lineageAnchorType: 'witness-signed',
    };
    const violations = validateCrossingRecordBase(forkRecord);
    expect(violations.some((m) => m.includes('LOCKED'))).toBe(true);
  });

  it('multi-hop chain traversal returns full chain in order', () => {
    const r1 = { recordId: 'urn:seam:formation:1' };
    const r2 = { recordId: 'urn:seam:formation:2', chainReference: r1.recordId };
    const r3 = { recordId: 'urn:seam:formation:3', chainReference: r2.recordId };
    expect(traceLineage(r3, [r2, r1, r3])).toEqual([r1, r2, r3]);
  });
});

// ===========================================================================
// Cross-cutting — containment and composition
// ===========================================================================

describe('D2 build — gate containment (canary)', () => {
  it('gate module imports no D2 governance module and no derivation function', () => {
    // Structural enforcement mirroring the OI-P13-1 canary: the gate stays
    // outside the evidence plane. No gate reads standing, panel, delegation,
    // or lineage derivations. Raw source loaded via Vite's glob import
    // (vite/client types; runs under vitest's vite-node).
    const rawModules = import.meta.glob('./gate.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const gateSource = rawModules['./gate.ts'];
    expect(typeof gateSource).toBe('string');
    expect(gateSource).not.toContain('p13-d2c1-standing-registry');
    expect(gateSource).not.toContain('p13-d2c3-panel-rules');
    expect(gateSource).not.toContain('p13-d2c6-delegation-record');
    expect(gateSource).not.toContain('p13-d2c5-fork-lineage');
    expect(gateSource).not.toContain('hasStanding');
    expect(gateSource).not.toContain('isPanelValid');
    expect(gateSource).not.toContain('hasDelegatedConsent');
    expect(gateSource).not.toContain('traceLineage');
  });
});
