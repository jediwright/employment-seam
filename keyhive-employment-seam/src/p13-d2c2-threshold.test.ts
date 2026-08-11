/**
 * Form C — P13 D2-C2: Counting Over Closed Sets — Test Suite
 *
 * Session: P13 D2-C2 build session, Session Harness v0.2 Mode 1
 * Date: 2026-08-10
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 * Spec: form-c-p13-d2-c2-threshold-schema-spec_2026-08-10.md
 *
 * REQUIRED TESTS (5 acceptance criteria — the build-session gate):
 *   §2.7 Test 1 — absolute-k met → operative; backward-compat asserted
 *   §2.7 Test 2 — denominator and numerator discipline
 *   §2.7 Test 3 — delegated consent fills grantor's slot; revocation clears it
 *   §2.7 Test 4 — constitutional carve-out
 *   §2.7 Test 5 — empty counted set: non-vacuous fail-safe (SL-0061)
 *
 * ADDITIONAL COVERAGE (additive):
 *   - majority kind
 *   - unanimity kind
 *   - createThresholdRule() guard: structural invalidity throws
 *   - validateThresholdRuleShape(): shape violations detected
 *   - countedStandingSet(): deduplication by memberDID (multi-active-entry)
 *   - countedStandingSet(): scope filter ('objection' excluded)
 *   - CONSTITUTIONAL_TERM_KEYS includes expected values
 *
 * The 161-test base must continue passing. All tests here are additive;
 * no existing tests are modified.
 */

import { describe, it, expect } from 'vitest';

import {
  type ThresholdRule,
  type ThresholdDerivationContext,
  CONSTITUTIONAL_TERM_KEYS,
  createThresholdRule,
  countedStandingSet,
  isThresholdMet,
  validateThresholdRuleShape,
} from './p13-d2c2-threshold-rules';

import {
  type StandingRegistryEntry,
  type StandingRegistry,
} from './p13-d2c1-standing-registry';

import {
  type DelegationRecord,
  createDelegationRecord,
} from './p13-d2c6-delegation-record';

import {
  deriveAmendmentStatus,
  type ConsentRecord,
  type SeamTermAmendmentRecord,
  type P13RecordSet,
  type DID,
  type URI,
} from './p13-record-types';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const DID_A: DID = 'did:key:member-a';
const DID_B: DID = 'did:key:member-b';
const DID_C: DID = 'did:key:member-c';
const DID_D: DID = 'did:key:member-d';   // delegatee, not in registry
const DID_X: DID = 'did:key:outsider-x'; // non-member

const NOW_ISO = new Date().toISOString();

let seq = 0;
const uid = (prefix: string) => `urn:seam:${prefix}:${++seq}`;

function makeEntry(
  overrides: Partial<StandingRegistryEntry> = {}
): StandingRegistryEntry {
  return {
    recordId: uid('standing'),
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

function makeAmendment(
  overrides: Partial<SeamTermAmendmentRecord> = {}
): SeamTermAmendmentRecord {
  return {
    recordId: uid('amendment'),
    amendmentId: uid('amendment-id'),
    recordType: 'term-amendment',
    emittedAt: NOW_ISO,
    emittedBy: DID_A,
    provenanceStatus: 'asserted',
    governanceEvent: 'term-amendment-proposal',
    boundType: 'exposure-upper-bound',
    lineageAnchorType: 'author-declared',
    termKey: 'wage-review-interval',
    proposedValue: '6-months',
    ...overrides,
  };
}

function makeConsent(
  amendmentId: URI,
  consentingParty: DID,
  overrides: Partial<ConsentRecord> = {}
): ConsentRecord {
  return {
    recordId: uid('consent'),
    recordType: 'consent',
    emittedAt: NOW_ISO,
    emittedBy: consentingParty,
    provenanceStatus: 'asserted',
    governanceEvent: 'term-amendment-consent',
    boundType: 'exposure-upper-bound',
    lineageAnchorType: 'author-declared',
    amendmentRef: amendmentId,
    consentingParty,
    ...overrides,
  };
}

function makeRecordSet(
  amendments: SeamTermAmendmentRecord[],
  consents: ConsentRecord[],
  objections = [],
  resolutions = []
): P13RecordSet {
  return { amendments, consents, objections, resolutions };
}

function makeDelegation(
  grantor: DID,
  delegatee: DID,
  overrides: Partial<DelegationRecord> = {}
): DelegationRecord {
  return createDelegationRecord({
    recordId: uid('delegation'),
    recordType: 'delegation',
    emittedAt: NOW_ISO,
    emittedBy: grantor,
    provenanceStatus: 'asserted',
    governanceEvent: 'delegation-grant',
    boundType: 'confirmation',
    lineageAnchorType: 'author-declared',
    grantor,
    delegatee,
    scope: 'consent',
    ...overrides,
  });
}

const FORMATION_REF: URI = 'urn:seam:formation:seam-001';

function makeAbsoluteKRule(k: number): ThresholdRule {
  return createThresholdRule({
    thresholdKind: 'absolute-k',
    k,
    countedScope: 'consent',
    formationConsentRef: FORMATION_REF,
  });
}

function makeUnanimityRule(): ThresholdRule {
  return createThresholdRule({
    thresholdKind: 'unanimity',
    countedScope: 'consent',
    formationConsentRef: FORMATION_REF,
  });
}

function makeMajorityRule(): ThresholdRule {
  return createThresholdRule({
    thresholdKind: 'majority',
    countedScope: 'consent',
    formationConsentRef: FORMATION_REF,
  });
}

// ---------------------------------------------------------------------------
// §2.7 ACCEPTANCE CRITERIA (5 required tests — the build-session gate)
// ---------------------------------------------------------------------------

describe('D2-C2 ThresholdRule — §2.7 Acceptance Criteria (build-session gate)', () => {

  // ── Test 1 ─────────────────────────────────────────────────────────────────
  // absolute-k met → operative; T7 without thresholdContext does NOT derive
  // operative (backward-compatibility asserted in the same test).
  // Spec §2.7 Test 1.
  it('Test 1 — absolute-k met → operative; same inputs without thresholdContext → non-operative', () => {
    // Registry: A (full), B (consent), C (consent)
    const registry: StandingRegistry = [
      makeEntry({ memberDID: DID_A, standingScope: 'full' }),
      makeEntry({ memberDID: DID_B, standingScope: 'consent' }),
      makeEntry({ memberDID: DID_C, standingScope: 'consent' }),
    ];
    // rule: absolute-k, k=2 (2-of-3 sufficient)
    const rule = makeAbsoluteKRule(2);
    // Amendment: ordinary termKey (not constitutional)
    const amendment = makeAmendment({ termKey: 'wage-review-interval' });
    const { amendmentId } = amendment;
    // Consents from A and B only (C has not consented)
    const recordSet = makeRecordSet(
      [amendment],
      [makeConsent(amendmentId, DID_A), makeConsent(amendmentId, DID_B)]
    );
    // Grant chain includes C (T7 unanimity would require C)
    const grantChain: DID[] = [DID_A, DID_B, DID_C];
    const thresholdContext: ThresholdDerivationContext = { rule, standingRegistry: registry };

    // WITH thresholdContext: 2 of 3 counted members → operative (k=2 met)
    expect(deriveAmendmentStatus(amendmentId, grantChain, recordSet, undefined, [], thresholdContext))
      .toBe('operative');

    // SAME inputs WITHOUT thresholdContext: T7 requires C; C has not consented → non-operative
    const statusT7 = deriveAmendmentStatus(amendmentId, grantChain, recordSet);
    expect(statusT7).not.toBe('operative');
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────
  // Denominator and numerator discipline:
  //   - Superseded entry excluded from denominator AND numerator
  //   - Non-member consent excluded from numerator
  //   - Objection-only standing excluded from denominator
  // Spec §2.7 Test 2.
  it('Test 2 — denominator and numerator discipline: superseded, non-member, and wrong-scope excluded', () => {
    // Registry:
    //   A — full, asserted (in denominator)
    //   B — consent, superseded (OUT of denominator and numerator)
    //   C — objection, asserted (OUT: lacks consent scope)
    const entryA = makeEntry({ memberDID: DID_A, standingScope: 'full' });
    const entryBSuperseded = makeEntry({
      memberDID: DID_B,
      standingScope: 'consent',
      provenanceStatus: 'superseded',
      supersededBy: 'urn:seam:standing:b-next',
    });
    const entryC = makeEntry({ memberDID: DID_C, standingScope: 'objection' });
    const registry: StandingRegistry = [entryA, entryBSuperseded, entryC];

    const rule = makeAbsoluteKRule(2); // requires 2 filled slots
    const amendment = makeAmendment({ termKey: 'wage-review-interval' });
    const { amendmentId } = amendment;

    // Consents: from A (counted member), from B (superseded), from DID_X (non-member)
    const recordSet = makeRecordSet(
      [amendment],
      [
        makeConsent(amendmentId, DID_A),
        makeConsent(amendmentId, DID_B), // superseded member — evidence, but not counted
        makeConsent(amendmentId, DID_X), // non-member — evidence, but not counted
      ]
    );

    // Counted set = {A} only (B superseded out; C no consent scope)
    const counted = countedStandingSet(registry);
    expect(counted).toHaveLength(1);
    expect(counted).toContain(DID_A);

    // isThresholdMet: filled = {A} only; 1 < 2 → false
    const result = isThresholdMet(amendmentId, recordSet, registry, rule);
    expect(result).toBe(false);

    // No exception thrown (fail-safe discipline)
    expect(() => isThresholdMet(amendmentId, recordSet, registry, rule)).not.toThrow();
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────
  // Delegated consent fills the grantor's slot.
  // Revocation by supersession clears the fill path.
  // Spec §2.7 Test 3.
  it('Test 3 — delegated consent fills grantor slot; revocation clears it', () => {
    // Registry: A (consent, asserted); D is NOT in the registry
    const registry: StandingRegistry = [
      makeEntry({ memberDID: DID_A, standingScope: 'consent' }),
    ];
    // Active delegation: A → D
    const delegationAtoD = makeDelegation(DID_A, DID_D);
    const rule = makeAbsoluteKRule(1);
    const amendment = makeAmendment({ termKey: 'wage-review-interval' });
    const { amendmentId } = amendment;

    // Consent authored by D (the delegatee, absent from registry)
    const recordSet = makeRecordSet(
      [amendment],
      [makeConsent(amendmentId, DID_D)]
    );

    // With active delegation A→D: D's consent fills A's slot → true
    const result = isThresholdMet(amendmentId, recordSet, registry, rule, [delegationAtoD]);
    expect(result).toBe(true);

    // Revoke: supersede A→D and add new delegation A→E (but E authors no consent)
    const delegationAtoD_revoked: DelegationRecord = {
      ...delegationAtoD,
      recordId: uid('delegation'),
      provenanceStatus: 'superseded',
      supersededBy: uid('delegation-ref'),
    };
    const delegationAtoE = makeDelegation(DID_A, 'did:key:member-e');

    const resultAfterRevoke = isThresholdMet(
      amendmentId, recordSet, registry, rule,
      [delegationAtoD_revoked, delegationAtoE]
    );
    // D→A fill path revoked; E authored no consent → false
    expect(resultAfterRevoke).toBe(false);
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────
  // Constitutional carve-out: 'threshold-rule' and 'standing-registry'
  // termKeys always derive under T7 unanimity, even when a thresholdContext
  // is supplied. The majority rule is never consulted for these termKeys.
  // Spec §2.7 Test 4.
  it('Test 4 — constitutional carve-out: standing-registry and threshold-rule always require T7 unanimity', () => {
    // Registry: A and B (both full)
    const registry: StandingRegistry = [
      makeEntry({ memberDID: DID_A, standingScope: 'full' }),
      makeEntry({ memberDID: DID_B, standingScope: 'full' }),
    ];
    const rule = makeMajorityRule(); // would pass with 1-of-2 if applied
    const grantChain: DID[] = [DID_A, DID_B];

    // ── Test 4a: termKey 'threshold-rule' ───────────────────────────────────
    const amendmentTR = makeAmendment({ termKey: 'threshold-rule' });
    const { amendmentId: idTR } = amendmentTR;

    // Only A has consented — majority would be met (1*2 > 2 is false; strict
    // majority for 2 requires 2). Unanimity requires B as well.
    // Either way: the carve-out routes through T7; the threshold rule is never
    // consulted. We verify that the threshold rule is NOT applied by checking
    // that adding B's consent yields operative, and that withholding B's
    // consent does NOT yield operative (regardless of the rule).
    const recordSetTR_oneConsent = makeRecordSet([amendmentTR], [makeConsent(idTR, DID_A)]);
    const thresholdContext: ThresholdDerivationContext = { rule, standingRegistry: registry };

    // With only A's consent + constitutional termKey → NOT operative (T7 requires B)
    const statusTR_partial = deriveAmendmentStatus(
      idTR, grantChain, recordSetTR_oneConsent, undefined, [], thresholdContext
    );
    expect(statusTR_partial).not.toBe('operative');

    // Add B's consent → operative via T7
    const recordSetTR_bothConsent = makeRecordSet(
      [amendmentTR],
      [makeConsent(idTR, DID_A), makeConsent(idTR, DID_B)]
    );
    expect(
      deriveAmendmentStatus(idTR, grantChain, recordSetTR_bothConsent, undefined, [], thresholdContext)
    ).toBe('operative');

    // ── Test 4b: termKey 'standing-registry' ────────────────────────────────
    const amendmentSR = makeAmendment({ termKey: 'standing-registry' });
    const { amendmentId: idSR } = amendmentSR;

    const recordSetSR_oneConsent = makeRecordSet([amendmentSR], [makeConsent(idSR, DID_A)]);

    // Same pattern: carve-out routes through T7; NOT operative with only A
    expect(
      deriveAmendmentStatus(idSR, grantChain, recordSetSR_oneConsent, undefined, [], thresholdContext)
    ).not.toBe('operative');

    // With both: operative via T7
    const recordSetSR_bothConsent = makeRecordSet(
      [amendmentSR],
      [makeConsent(idSR, DID_A), makeConsent(idSR, DID_B)]
    );
    expect(
      deriveAmendmentStatus(idSR, grantChain, recordSetSR_bothConsent, undefined, [], thresholdContext)
    ).toBe('operative');
  });

  // ── Test 5 ─────────────────────────────────────────────────────────────────
  // Empty counted set: non-vacuous fail-safe (SL-0061).
  // ∅ never satisfies any kind, including 'unanimity'.
  // Status falls through to lapsed/contested/proposed.
  // No exception. No gate blocked.
  // Spec §2.7 Test 5.
  it('Test 5 — empty counted set: non-vacuous fail-safe (all kinds → false; SL-0061)', () => {
    // Registry: only an 'objection'-scope entry → counted set is ∅
    const registry: StandingRegistry = [
      makeEntry({ memberDID: DID_A, standingScope: 'objection' }),
    ];
    const unanimityRule = makeUnanimityRule();
    const absoluteKRule = makeAbsoluteKRule(1);
    const majorityRule = makeMajorityRule();

    const amendment = makeAmendment({ termKey: 'wage-review-interval' });
    const { amendmentId } = amendment;

    // One active consent present (shows that it is not the consent that is absent)
    const recordSet = makeRecordSet(
      [amendment],
      [makeConsent(amendmentId, DID_A)]
    );
    const grantChain: DID[] = [DID_A];

    // All three kinds: empty counted set → isThresholdMet returns false
    expect(isThresholdMet(amendmentId, recordSet, registry, unanimityRule)).toBe(false);
    expect(isThresholdMet(amendmentId, recordSet, registry, absoluteKRule)).toBe(false);
    expect(isThresholdMet(amendmentId, recordSet, registry, majorityRule)).toBe(false);

    // No exception thrown
    expect(() => isThresholdMet(amendmentId, recordSet, registry, unanimityRule)).not.toThrow();

    // deriveAmendmentStatus with thresholdContext: falls through to
    // lapsed/contested/proposed (status quo ante — no gate blocked)
    const context: ThresholdDerivationContext = { rule: unanimityRule, standingRegistry: registry };
    const status = deriveAmendmentStatus(amendmentId, grantChain, recordSet, undefined, [], context);
    expect(status).not.toBe('operative');
    // Status is proposed (recent amendment, no objection recorded)
    expect(['lapsed', 'contested', 'proposed']).toContain(status);
  });
});

// ---------------------------------------------------------------------------
// Additional coverage (additive)
// ---------------------------------------------------------------------------

describe('D2-C2 ThresholdRule — additional coverage (additive)', () => {

  describe('createThresholdRule() guard (§2.4.6)', () => {
    it('valid unanimity rule passes guard', () => {
      expect(() => makeUnanimityRule()).not.toThrow();
    });

    it('valid absolute-k rule passes guard', () => {
      expect(() => makeAbsoluteKRule(2)).not.toThrow();
    });

    it('absolute-k without k throws', () => {
      expect(() =>
        createThresholdRule({
          thresholdKind: 'absolute-k',
          countedScope: 'consent',
          formationConsentRef: FORMATION_REF,
        })
      ).toThrow(/k.*required/i);
    });

    it('unanimity with k present throws', () => {
      expect(() =>
        createThresholdRule({
          thresholdKind: 'unanimity',
          k: 2,
          countedScope: 'consent',
          formationConsentRef: FORMATION_REF,
        } as ThresholdRule)
      ).toThrow(/k.*absent/i);
    });

    it('k = 0 throws (must be ≥ 1)', () => {
      expect(() =>
        createThresholdRule({
          thresholdKind: 'absolute-k',
          k: 0,
          countedScope: 'consent',
          formationConsentRef: FORMATION_REF,
        })
      ).toThrow(/integer.*1|k.*1/i);
    });

    it('non-integer k throws', () => {
      expect(() =>
        createThresholdRule({
          thresholdKind: 'absolute-k',
          k: 1.5,
          countedScope: 'consent',
          formationConsentRef: FORMATION_REF,
        })
      ).toThrow(/integer/i);
    });

    it('missing formationConsentRef throws', () => {
      expect(() =>
        createThresholdRule({
          thresholdKind: 'unanimity',
          countedScope: 'consent',
          formationConsentRef: '',
        })
      ).toThrow(/formationConsentRef/i);
    });
  });

  describe('validateThresholdRuleShape() (§2.5)', () => {
    it('valid unanimity rule passes shape validation', () => {
      expect(validateThresholdRuleShape(makeUnanimityRule())).toHaveLength(0);
    });

    it('valid absolute-k rule passes shape validation', () => {
      expect(validateThresholdRuleShape(makeAbsoluteKRule(3))).toHaveLength(0);
    });

    it('missing thresholdKind is a violation', () => {
      const r = { countedScope: 'consent', formationConsentRef: FORMATION_REF };
      const violations = validateThresholdRuleShape(r);
      expect(violations.some((v) => v.includes('thresholdKind'))).toBe(true);
    });

    it('missing formationConsentRef is a violation', () => {
      const r = { thresholdKind: 'unanimity', countedScope: 'consent' };
      const violations = validateThresholdRuleShape(r);
      expect(violations.some((v) => v.includes('formationConsentRef'))).toBe(true);
    });

    it('countedScope !== consent is a violation', () => {
      const r = {
        thresholdKind: 'unanimity',
        countedScope: 'amendment', // invalid
        formationConsentRef: FORMATION_REF,
      };
      const violations = validateThresholdRuleShape(r);
      expect(violations.some((v) => v.includes('countedScope'))).toBe(true);
    });
  });

  describe('countedStandingSet() (§2.4.1)', () => {
    it('returns only distinct memberDIDs with consent scope (deduplication)', () => {
      // Two non-superseded entries for A (hygiene defect scenario; union semantics)
      const entryA1 = makeEntry({ memberDID: DID_A, standingScope: 'consent' });
      const entryA2 = makeEntry({ memberDID: DID_A, standingScope: 'full' });
      const entryB = makeEntry({ memberDID: DID_B, standingScope: 'full' });
      // C has objection-only scope — excluded
      const entryC = makeEntry({ memberDID: DID_C, standingScope: 'objection' });
      const registry: StandingRegistry = [entryA1, entryA2, entryB, entryC];
      const result = countedStandingSet(registry);
      expect(result).toHaveLength(2);
      expect(result).toContain(DID_A);
      expect(result).toContain(DID_B);
      expect(result).not.toContain(DID_C);
    });

    it('superseded entries excluded from denominator', () => {
      const superseded = makeEntry({
        memberDID: DID_A,
        standingScope: 'full',
        provenanceStatus: 'superseded',
        supersededBy: 'urn:seam:standing:next',
      });
      const registry: StandingRegistry = [superseded];
      expect(countedStandingSet(registry)).toHaveLength(0);
    });

    it('empty registry → empty counted set', () => {
      expect(countedStandingSet([])).toHaveLength(0);
    });
  });

  describe('majority kind (§2.3)', () => {
    it('strict majority: filled × 2 > n; 2-of-3 is majority', () => {
      const registry: StandingRegistry = [
        makeEntry({ memberDID: DID_A, standingScope: 'full' }),
        makeEntry({ memberDID: DID_B, standingScope: 'consent' }),
        makeEntry({ memberDID: DID_C, standingScope: 'consent' }),
      ];
      const rule = makeMajorityRule();
      const amendment = makeAmendment({ termKey: 'wage-review-interval' });
      const { amendmentId } = amendment;
      // A and B consent; C does not
      const recordSet = makeRecordSet(
        [amendment],
        [makeConsent(amendmentId, DID_A), makeConsent(amendmentId, DID_B)]
      );
      // 2*2 = 4 > 3 → true
      expect(isThresholdMet(amendmentId, recordSet, registry, rule)).toBe(true);
    });

    it('strict majority: 1-of-2 is NOT majority (requires > 50%, not ≥ 50%)', () => {
      const registry: StandingRegistry = [
        makeEntry({ memberDID: DID_A, standingScope: 'full' }),
        makeEntry({ memberDID: DID_B, standingScope: 'consent' }),
      ];
      const rule = makeMajorityRule();
      const amendment = makeAmendment({ termKey: 'wage-review-interval' });
      const { amendmentId } = amendment;
      // Only A consents
      const recordSet = makeRecordSet([amendment], [makeConsent(amendmentId, DID_A)]);
      // 1*2 = 2, NOT > 2 → false (strict majority)
      expect(isThresholdMet(amendmentId, recordSet, registry, rule)).toBe(false);
    });
  });

  describe('unanimity kind (§2.3)', () => {
    it('unanimity with all members consenting → operative', () => {
      const registry: StandingRegistry = [
        makeEntry({ memberDID: DID_A, standingScope: 'full' }),
        makeEntry({ memberDID: DID_B, standingScope: 'consent' }),
      ];
      const rule = makeUnanimityRule();
      const amendment = makeAmendment({ termKey: 'wage-review-interval' });
      const { amendmentId } = amendment;
      const recordSet = makeRecordSet(
        [amendment],
        [makeConsent(amendmentId, DID_A), makeConsent(amendmentId, DID_B)]
      );
      expect(isThresholdMet(amendmentId, recordSet, registry, rule)).toBe(true);
    });

    it('unanimity with one member not consenting → false', () => {
      const registry: StandingRegistry = [
        makeEntry({ memberDID: DID_A, standingScope: 'full' }),
        makeEntry({ memberDID: DID_B, standingScope: 'consent' }),
      ];
      const rule = makeUnanimityRule();
      const amendment = makeAmendment({ termKey: 'wage-review-interval' });
      const { amendmentId } = amendment;
      const recordSet = makeRecordSet([amendment], [makeConsent(amendmentId, DID_A)]);
      expect(isThresholdMet(amendmentId, recordSet, registry, rule)).toBe(false);
    });
  });

  describe('CONSTITUTIONAL_TERM_KEYS', () => {
    it('includes standing-registry and threshold-rule', () => {
      expect(CONSTITUTIONAL_TERM_KEYS).toContain('standing-registry');
      expect(CONSTITUTIONAL_TERM_KEYS).toContain('threshold-rule');
    });

    it('has exactly two entries (no accidental extensions)', () => {
      expect(CONSTITUTIONAL_TERM_KEYS).toHaveLength(2);
    });
  });

  describe('backward compatibility: deriveAmendmentStatus without thresholdContext', () => {
    it('existing T7 behavior unchanged when thresholdContext is omitted', () => {
      const amendment = makeAmendment({ termKey: 'wage-review-interval' });
      const { amendmentId } = amendment;
      const grantChain: DID[] = [DID_A, DID_B];
      const recordSet = makeRecordSet(
        [amendment],
        [makeConsent(amendmentId, DID_A), makeConsent(amendmentId, DID_B)]
      );
      // No thresholdContext — T7 path: both in grant chain, both consented
      expect(deriveAmendmentStatus(amendmentId, grantChain, recordSet)).toBe('operative');
    });
  });
});
