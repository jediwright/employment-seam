/**
 * Form C — P13 D2-C2: Counting Over Closed Sets
 *
 * Session: P13 D2-C2 build session, Session Harness v0.2 Mode 1
 * Date: 2026-08-10
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 * Spec: form-c-p13-d2-c2-threshold-schema-spec_2026-08-10.md
 *
 * Implements:
 *   - ThresholdRule sub-shape (PanelRule pattern; spec §2.3)
 *   - ThresholdDerivationContext interface (spec §2.4.4)
 *   - CONSTITUTIONAL_TERM_KEYS const (spec §2.4.7)
 *   - createThresholdRule() guard (spec §2.4.6)
 *   - countedStandingSet() denominator derivation (spec §2.4.1)
 *   - isThresholdMet() numerator derivation (spec §2.4.2)
 *   - THRESHOLD_RULE_SHAPE_TTL + validateThresholdRuleShape() (spec §2.5)
 *
 * Import graph discipline (acyclic per D2-C6 precedent):
 *   - Imports types from p13-record-types.ts (DID, URI, P13RecordSet,
 *     DelegationRecord — types only; no runtime imports from record-types)
 *   - Imports StandingRegistryEntry / StandingRegistry types from
 *     p13-d2c1-standing-registry.ts (types only)
 *   - Imports hasDelegatedConsent from p13-d2c6-delegation-record.ts (runtime)
 *   - Reverse direction: p13-record-types.ts imports
 *     ThresholdDerivationContext (type), CONSTITUTIONAL_TERM_KEYS, and
 *     isThresholdMet() from this file. Because this file's imports from
 *     record-types are type-only (erased at compile), the runtime graph
 *     is acyclic: record-types → threshold-rules → d2c6-delegation.
 *
 * Design constraints:
 *   - Zero new UFO Lexicon CV values (D2-C2 spec §2.2)
 *   - Q6 lock: untouched (lineageAnchorType, witness variants)
 *   - Delivery-not-application enforced
 *   - NI-5: local-first specific on current evidence
 *   - SL-0058 adhesion bound applies at full force (Known Limit 1)
 *   - SL-0061 empty-meet composition: ∅ never satisfies any kind (§2.4.5)
 */

import type { DID, URI, P13RecordSet, DelegationRecord } from './p13-record-types';
import {
  type StandingRegistryEntry,
  type StandingRegistry,
} from './p13-d2c1-standing-registry';
import { hasDelegatedConsent } from './p13-d2c6-delegation-record';

// ---------------------------------------------------------------------------
// ThresholdRule sub-shape (spec §2.3)
// ---------------------------------------------------------------------------

/**
 * The counting rule variant.
 * Sub-shape-internal vocabulary (spec §2.2): extension requires a
 * governed vocabulary amendment. These values are NOT added to the UFO
 * Lexicon CV tables.
 */
export type ThresholdKind = 'unanimity' | 'absolute-k' | 'majority';

/**
 * ThresholdRule sub-shape (spec §2.3).
 *
 * A derivation-rule structure, not a new governance-event record type.
 * Mirrors the PanelRule pattern (D2-C3 §3.2): constituted as a seam term
 * via the amendment chain (termKey: "threshold-rule", formationConsentRef
 * required per D3 condition 3).
 *
 * Not an IRI-bearing record class extending CrossingRecordBase.
 * Zero new UFO Lexicon CV values.
 */
export interface ThresholdRule {
  /**
   * The counting rule variant.
   * - 'unanimity': all counted-set members' slots must be filled.
   *   Recovers T7's form over the standing set (T7 equivalence: §2.6).
   * - 'absolute-k': ≥ k members' slots must be filled. k required.
   * - 'majority': filled × 2 > counted-set size (strict majority).
   */
  thresholdKind: ThresholdKind;

  /**
   * Required when thresholdKind === 'absolute-k'; MUST be absent otherwise.
   * Enforced at TypeScript layer (createThresholdRule guard, §2.4.6).
   * SHACL cannot condition on thresholdKind cleanly — same pattern as
   * D2-C1 effectiveFrom.
   */
  k?: number;

  /**
   * The standing surface defining counted-set eligibility.
   * Locked to 'consent': only members with consent-scope standing may author
   * the ConsentRecords being counted. Extension requires a governed vocabulary
   * amendment (mirrors D2-C6 scope lock).
   */
  countedScope: 'consent';

  /**
   * recordId of the SeamTermAmendmentRecord (termKey: "threshold-rule") or
   * formation record whose operativity constituted this rule.
   * Required: links the rule to the consent chain, ensuring it is a consented
   * seam term (D3 condition 3; D2-C3 §3.2 formationConsentRef precedent).
   */
  formationConsentRef: URI;
}

// ---------------------------------------------------------------------------
// ThresholdDerivationContext (spec §2.4.4)
// Exported for import by p13-record-types.ts, where it types the
// deriveAmendmentStatus() position-6 extension. record-types also imports
// CONSTITUTIONAL_TERM_KEYS and isThresholdMet() from this file at runtime;
// see the header import-graph note for why this remains acyclic.
// ---------------------------------------------------------------------------

/**
 * Bundles the ThresholdRule and the live StandingRegistry for the
 * position-6 optional context in deriveAmendmentStatus().
 *
 * The registry parameter is meaningful only when a rule is present;
 * bundling them extends the position-5 optional-parameter convention
 * (SL-0074; live at 64f3dff) without introducing two coupled optionals.
 *
 * Default undefined → existing T7 derivation runs unchanged.
 */
export interface ThresholdDerivationContext {
  rule: ThresholdRule;
  standingRegistry: StandingRegistry;
}

// ---------------------------------------------------------------------------
// Constitutional term keys (spec §2.4.7)
// ---------------------------------------------------------------------------

/**
 * termKey strings that always derive under T7 unanimity (all grant-chain
 * parties), regardless of any supplied ThresholdDerivationContext.
 *
 * Grounds: The closed set that legitimates counting (the standing registry)
 * and the rule that governs how counting is done (the threshold rule) must
 * not themselves be modifiable by counting — or the legitimacy ground is
 * consumed by the mechanism it grounds (D3 §1.5 conditions 1–3 + D3
 * "what D2-C2 does not cover" clause).
 *
 * Spec-internal convention, exported constant.
 * Note: this is a termKey STRING convention, not a schema-enforceable
 * semantic. A seam encoding constitutional terms under other termKeys
 * escapes the carve-out. Deployment discipline (Known Limit 4).
 */
export const CONSTITUTIONAL_TERM_KEYS = [
  'standing-registry',  // D2-C1 membership amendments (D2 spec §2.6)
  'threshold-rule',     // D2-C2 threshold-rule constitution/amendment (this spec)
] as const;

export type ConstitutionalTermKey = (typeof CONSTITUTIONAL_TERM_KEYS)[number];

// ---------------------------------------------------------------------------
// createThresholdRule() guard (spec §2.4.6)
// ---------------------------------------------------------------------------

/**
 * Creation guard for ThresholdRule (spec §2.4.6).
 *
 * Throws at rule creation, not derivation time (D2-C1/D2-C6 guard pattern).
 * Enforces the k conditional that SHACL cannot express cleanly.
 *
 * @throws Error if the rule is structurally invalid:
 *   - thresholdKind === 'absolute-k' and k absent
 *   - thresholdKind !== 'absolute-k' and k present
 *   - k present but < 1 or not an integer
 *   - formationConsentRef absent or empty
 */
export function createThresholdRule(rule: ThresholdRule): ThresholdRule {
  if (rule.thresholdKind === 'absolute-k') {
    if (rule.k === undefined || rule.k === null) {
      throw new Error(
        "ThresholdRule: 'k' is required when thresholdKind === 'absolute-k'"
      );
    }
    if (!Number.isInteger(rule.k) || rule.k < 1) {
      throw new Error(
        `ThresholdRule: 'k' must be an integer ≥ 1; got ${rule.k}`
      );
    }
  } else {
    if (rule.k !== undefined && rule.k !== null) {
      throw new Error(
        `ThresholdRule: 'k' must be absent when thresholdKind === '${rule.thresholdKind}'`
      );
    }
  }

  if (!rule.formationConsentRef || rule.formationConsentRef.trim() === '') {
    throw new Error(
      "ThresholdRule: 'formationConsentRef' is required and must be a non-empty URI"
    );
  }

  return rule;
}

// ---------------------------------------------------------------------------
// countedStandingSet() — denominator derivation (spec §2.4.1)
// ---------------------------------------------------------------------------

/**
 * Returns the denominator set for threshold counting: the distinct memberDIDs
 * of non-superseded StandingRegistryEntry records whose standingScope covers
 * 'consent' (spec §2.4.1).
 *
 * Denominator discipline:
 *   - Superseded entries are excluded entirely from the denominator.
 *   - Deduplication by memberDID: if multiple non-superseded entries exist
 *     for one DID (a registry-hygiene defect per live D2-C1 multi-active-entry
 *     semantics at 64f3dff), the member counts ONCE, eligible iff ANY surviving
 *     entry covers 'consent'.
 *   - Non-member consents: a ConsentRecord from a DID not in the counted set
 *     is evidence in the record set but never moves the count (T8 Component B
 *     removal; D3 §1.3).
 *
 * @param registry The seam's StandingRegistry (array of StandingRegistryEntry).
 * @returns Array of distinct memberDIDs eligible to be counted.
 */
export function countedStandingSet(registry: StandingRegistry): DID[] {
  // 1. Filter to non-superseded entries covering 'consent' scope
  const eligible = registry.filter(
    (entry: StandingRegistryEntry) =>
      entry.provenanceStatus !== 'superseded' &&
      (entry.standingScope === 'consent' || entry.standingScope === 'full')
  );

  // 2. Return distinct memberDIDs (dedup by memberDID — one slot per member)
  const seen = new Set<DID>();
  const result: DID[] = [];
  for (const entry of eligible) {
    if (!seen.has(entry.memberDID)) {
      seen.add(entry.memberDID);
      result.push(entry.memberDID);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// isThresholdMet() — numerator derivation (spec §2.4.2)
// ---------------------------------------------------------------------------

/**
 * Returns true iff the threshold rule is satisfied for the given amendment
 * over the given standing registry and record set (spec §2.4.2).
 *
 * Numerator discipline:
 *   - Only counted-set members (from countedStandingSet()) contribute.
 *   - A counted member's slot is filled by direct consent OR by an active
 *     D2-C6 delegatee consent (grantor's-authority rule — delegatee standing
 *     never consulted).
 *   - One member, one numerator slot (Set semantics over memberDID).
 *   - Non-vacuous clause: empty counted set returns false for ALL kinds,
 *     including 'unanimity' (SL-0061; mirrors live T7 grantChain.length > 0
 *     guard).
 *
 * Fail-safe, derivation-time, pure: no exception on absent or degenerate
 * inputs; no gate blocked; locally-held records only; deterministic over
 * set union.
 *
 * @param amendmentId URI of the SeamTermAmendmentRecord being evaluated.
 * @param recordSet The seam's full P13RecordSet (locally held).
 * @param standingRegistry The seam's StandingRegistry.
 * @param rule The ThresholdRule to evaluate.
 * @param delegationRecords Active D2-C6 DelegationRecords (default []).
 * @returns true iff the threshold is met; false in all degenerate cases.
 */
export function isThresholdMet(
  amendmentId: URI,
  recordSet: P13RecordSet,
  standingRegistry: StandingRegistry,
  rule: ThresholdRule,
  delegationRecords: DelegationRecord[] = []
): boolean {
  // 1. Compute denominator: distinct non-superseded consent-scope members
  const counted = countedStandingSet(standingRegistry);

  // Non-vacuous clause (spec §2.4.5; SL-0061):
  // ∅ never satisfies any kind, including 'unanimity'.
  if (counted.length === 0) {
    return false;
  }

  // 2. Active consents for this amendment
  const activeConsents = recordSet.consents.filter(
    (c) => c.amendmentRef === amendmentId && c.provenanceStatus !== 'superseded'
  );

  // 3. Determine filled slots (one per counted member, Set semantics)
  //    A slot is filled by direct consent OR by an active delegatee consent
  //    where hasDelegatedConsent(member, consentingParty) is true.
  const filled = new Set<DID>();
  for (const member of counted) {
    const directlyFilled = activeConsents.some(
      (c) => c.consentingParty === member
    );
    if (directlyFilled) {
      filled.add(member);
      continue;
    }
    // Delegated fill: check whether any active consent is authored by a party
    // to whom 'member' (as grantor) has an active delegation (spec §2.4.3).
    const delegatedFill = activeConsents.some((c) =>
      hasDelegatedConsent(member, c.consentingParty, delegationRecords)
    );
    if (delegatedFill) {
      filled.add(member);
    }
  }

  const n = counted.length;
  const c = filled.size;

  // 4. Apply the threshold kind
  switch (rule.thresholdKind) {
    case 'unanimity':
      return c === n;
    case 'absolute-k':
      // k is guaranteed present by createThresholdRule() guard, but
      // default to n (unreachable) to satisfy TypeScript exhaustiveness.
      return c >= (rule.k ?? n);
    case 'majority':
      // Strict majority: filled × 2 > counted-set size.
      // Well-defined for all n ≥ 0; false at n = 0 (already caught above).
      return c * 2 > n;
  }
}

// ---------------------------------------------------------------------------
// SHACL shape + runtime validator (spec §2.5)
// ---------------------------------------------------------------------------

/**
 * SHACL shape for ThresholdRule (spec §2.5), carried verbatim.
 *
 * ThresholdRule is a sub-shape, not a seam:CrossingRecord extension —
 * no base-shape inheritance node (mirrors seam:PanelRuleShape, D2-C3 §3.4).
 *
 * The k conditional (required iff thresholdKind === 'absolute-k') is
 * enforced at the TypeScript layer only — SHACL cannot condition on field
 * values cleanly (same pattern as D2-C1 effectiveFrom).
 */
export const THRESHOLD_RULE_SHAPE_TTL = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix seam: <https://jediwright.github.io/seam-stack/vocab/crossing-record/0.1#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

seam:ThresholdRuleShape
  a sh:NodeShape ;
  sh:targetClass seam:ThresholdRule ;

  sh:property [
    sh:path seam:thresholdKind ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:in ( "unanimity" "absolute-k" "majority" ) ;
  ] ;
  sh:property [
    sh:path seam:k ;
    sh:minCount 0 ; sh:maxCount 1 ;
    sh:datatype xsd:integer ;
    sh:minInclusive 1 ;
  ] ;
  sh:property [
    sh:path seam:countedScope ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:hasValue "consent" ;
  ] ;
  sh:property [
    sh:path seam:formationConsentRef ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:nodeKind sh:IRI ;
  ] .

  # k required iff thresholdKind = 'absolute-k' is enforced at the
  # TypeScript layer (SHACL cannot condition cleanly on thresholdKind —
  # same pattern as D2-C1 effectiveFrom). Runtime validator mirrors this
  # shape plus the TS-layer conditional (repo convention:
  # validateStandingRegistryEntryShape).
`;

/**
 * Runtime mirror of the SHACL shape (spec §2.5).
 * Returns an array of violation strings; empty array = valid.
 * Mirrors repo convention: validateStandingRegistryEntryShape in
 * p13-d2c1-standing-registry.ts.
 */
export function validateThresholdRuleShape(rule: unknown): string[] {
  const violations: string[] = [];

  if (typeof rule !== 'object' || rule === null) {
    return ['ThresholdRule must be a non-null object'];
  }

  const r = rule as Record<string, unknown>;

  // thresholdKind: required, one of the three values
  const validKinds: ThresholdKind[] = ['unanimity', 'absolute-k', 'majority'];
  if (!r['thresholdKind']) {
    violations.push("Missing required field: 'thresholdKind'");
  } else if (!validKinds.includes(r['thresholdKind'] as ThresholdKind)) {
    violations.push(
      `Invalid 'thresholdKind': must be one of ${validKinds.join(', ')}`
    );
  }

  // k: conditional on thresholdKind (TS-layer enforcement)
  if (r['thresholdKind'] === 'absolute-k') {
    if (r['k'] === undefined || r['k'] === null) {
      violations.push("'k' is required when thresholdKind === 'absolute-k'");
    } else if (typeof r['k'] !== 'number' || !Number.isInteger(r['k']) || (r['k'] as number) < 1) {
      violations.push("'k' must be an integer ≥ 1");
    }
  } else if (r['k'] !== undefined && r['k'] !== null) {
    violations.push(
      `'k' must be absent when thresholdKind === '${r['thresholdKind']}'`
    );
  }

  // countedScope: required, locked to 'consent'
  if (!r['countedScope']) {
    violations.push("Missing required field: 'countedScope'");
  } else if (r['countedScope'] !== 'consent') {
    violations.push("'countedScope' must be 'consent'");
  }

  // formationConsentRef: required, non-empty URI
  if (!r['formationConsentRef']) {
    violations.push("Missing required field: 'formationConsentRef'");
  } else if (
    typeof r['formationConsentRef'] !== 'string' ||
    (r['formationConsentRef'] as string).trim() === ''
  ) {
    violations.push("'formationConsentRef' must be a non-empty URI string");
  }

  return violations;
}
