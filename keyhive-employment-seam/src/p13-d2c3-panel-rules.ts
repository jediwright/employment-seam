/**
 * Form C — P13 D2-C3: Member-drawn resolution panels
 *
 * Session: P13 D2 build session (D2-C1/C3/C6/C5)
 * Date: 2026-08-10
 * Register: CONTEXTUAL
 * Stamps: ⚑ SINGLE-CONTEXT — NOT PANELED throughout
 *
 * Governing doc: form-c-p13-d2-schema-spec_2026-08-10.md §3
 *
 * D2-C3 is a PATTERN on the existing ResolutionCapabilityRegistry surface
 * (OI-P13-1). It is NOT a new record type and does not extend
 * seam:CrossingRecord. It adds a capabilityType discriminant and a PanelRule
 * sub-shape to ResolutionCapabilityEntry, permitting rule-valued capability
 * entries that specify panel membership criteria rather than a fixed DID.
 *
 * No new IRI. No new CV values.
 *
 * BACKWARD COMPATIBILITY NOTE: The OI-P13-1 ResolutionCapabilityEntry type
 * predates the discriminant and cannot be made to require capabilityType
 * without a breaking change to the existing 131-test base. The extension is
 * therefore expressed as a discriminated union over the existing base:
 * entries authored before D2-C3 carry no capabilityType and are fixed-party
 * by construction (existing behavior unchanged — spec §3.3: "For
 * capabilityType: 'fixed-party' entries: unchanged from OI-P13-1").
 *
 * COMPOSITION (spec §3.5):
 *   - Requires D2-C1 (StandingRegistry): isPanelValid() calls hasStanding().
 *     Build order: D2-C1 before D2-C3.
 *   - Composes with SeamTermAmendmentRecord: the panel rule is constituted
 *     by an operative amendment (formationConsentRef required). Panel rule
 *     changes are themselves amendment records.
 *   - Empty-meet residual composes (SL-0061): if no valid panel can be
 *     formed, status quo ante applies. D2-C3 narrows the set of disputes
 *     that fall into the residual; it does not eliminate it.
 *
 * KNOWN LIMITS (spec §3.7 — named, not solved):
 *   - Requires D2-C1. Without a standing registry, panel-rule entries
 *     cannot be validated.
 *   - memberSource locked to 'standing-registry'. Extension requires a
 *     governed vocabulary amendment.
 *   - Residual not closed (SL-0061).
 *
 * Q6 LOCK: In force. Nothing here touches or unlocks Q6.
 * NI-5: Local-first specific on current evidence.
 * Form C cluster PROPOSED per UFO Lexicon v1.5.
 */

import type { DID, URI, ResolutionCapabilityEntry } from './p13-record-types';
import { hasStanding, type StandingRegistry } from './p13-d2c1-standing-registry';

// ---------------------------------------------------------------------------
// PanelRule sub-shape (spec §3.2)
// ---------------------------------------------------------------------------

/** memberSource controlled value. Locked to 'standing-registry' (D2-C1
 *  composition). Extension requires a governed vocabulary amendment. */
export const PANEL_MEMBER_SOURCES = ['standing-registry'] as const;
export type PanelMemberSource = (typeof PANEL_MEMBER_SOURCES)[number];

/** exclusionRule controlled values. 'no-party-to-dispute' is the standard
 *  Ostrom P6 statement. Default: 'none'. */
export const PANEL_EXCLUSION_RULES = ['no-party-to-dispute', 'none'] as const;
export type PanelExclusionRule = (typeof PANEL_EXCLUSION_RULES)[number];

/**
 * PanelRule — 4 fields per spec §3.2.
 *
 *   - minMembers: integer ≥ 1. Minimum panel members for a valid panel.
 *   - memberSource: source from which panel members are drawn. Current
 *     value: 'standing-registry' (D2-C1 composition).
 *   - exclusionRule: whether dispute parties are excluded from the panel.
 *     Optional, default 'none'.
 *   - formationConsentRef: recordId of the SeamTermAmendmentRecord whose
 *     operativity constituted this panel rule. Links the rule to the
 *     amendment governance chain; ensures the rule is a consented seam term.
 */
export interface PanelRule {
  minMembers: number;
  memberSource: PanelMemberSource;
  exclusionRule?: PanelExclusionRule;
  formationConsentRef: URI;
}

// ---------------------------------------------------------------------------
// capabilityType discriminant on ResolutionCapabilityEntry (spec §3.2)
// ---------------------------------------------------------------------------

/** capabilityType discriminant values. 'fixed-party': existing OI-P13-1
 *  behavior. 'panel-rule': D2-C3 extension — rule-valued entry. */
export const CAPABILITY_TYPES = ['fixed-party', 'panel-rule'] as const;
export type CapabilityType = (typeof CAPABILITY_TYPES)[number];

/** Fixed-party capability entry — existing OI-P13-1 semantics with the
 *  discriminant made explicit. panelRule ABSENT (spec §3.2). */
export interface FixedPartyCapabilityEntry extends ResolutionCapabilityEntry {
  capabilityType: 'fixed-party';
  panelRule?: never;
}

/** Panel-rule capability entry — D2-C3 extension. All existing fields
 *  inherited per spec §3.2; panelRule REQUIRED. */
export interface PanelRuleCapabilityEntry extends ResolutionCapabilityEntry {
  capabilityType: 'panel-rule';
  panelRule: PanelRule;
}

/** The extended entry union. Entries authored before D2-C3 (no
 *  capabilityType) remain valid ResolutionCapabilityEntry values and are
 *  fixed-party by construction. */
export type ExtendedResolutionCapabilityEntry =
  | FixedPartyCapabilityEntry
  | PanelRuleCapabilityEntry;

/**
 * Type guard for the capabilityType conditional (spec §3.4 note: "TypeScript
 * type guard enforces this at application layer"). An entry is a panel-rule
 * entry iff it carries the 'panel-rule' discriminant AND a panelRule object.
 * Legacy entries (no discriminant) are NOT panel-rule entries.
 */
export function isPanelRuleEntry(
  entry: ResolutionCapabilityEntry | ExtendedResolutionCapabilityEntry
): entry is PanelRuleCapabilityEntry {
  return (
    (entry as PanelRuleCapabilityEntry).capabilityType === 'panel-rule' &&
    typeof (entry as PanelRuleCapabilityEntry).panelRule === 'object' &&
    (entry as PanelRuleCapabilityEntry).panelRule !== null
  );
}

// ---------------------------------------------------------------------------
// Derivation logic — isPanelValid() (spec §3.3)
// ---------------------------------------------------------------------------

/**
 * isPanelValid — panel validity check for capabilityType: 'panel-rule'
 * entries. Pure function; derivation-time; no act-time liveness dependency.
 *
 * Derivation (spec §3.3):
 *   1. If rule.exclusionRule === 'no-party-to-dispute' and disputeParties is
 *      provided: filter panelDIDs to exclude disputeParties.
 *   2. Check filteredDIDs.length >= rule.minMembers. If false: return false.
 *   3. For each DID in filteredDIDs: hasStanding(DID, 'resolution',
 *      standingRegistry) must return true. If any fails: return false.
 *   4. Return true.
 *
 * EMPTY-MEET COMPOSITION (SL-0061, spec §3.3): If the standing registry is
 * empty, or all eligible panel members are parties to the dispute and
 * excluded, isPanelValid() returns false. Calling code falls back to status
 * quo ante per the T12 empty-meet pattern. No new mechanism required; no
 * exception; no gate blocked.
 */
export function isPanelValid(
  panelDIDs: DID[],
  rule: PanelRule,
  standingRegistry: StandingRegistry,
  disputeParties?: DID[]
): boolean {
  const filteredDIDs =
    rule.exclusionRule === 'no-party-to-dispute' && disputeParties !== undefined
      ? panelDIDs.filter((did) => !disputeParties.includes(did))
      : panelDIDs;

  if (filteredDIDs.length < rule.minMembers) {
    return false;
  }

  return filteredDIDs.every((did) =>
    hasStanding(did, 'resolution', standingRegistry)
  );
}

// ---------------------------------------------------------------------------
// SHACL (pattern extension — spec §3.4). No new top-level shape.
// ---------------------------------------------------------------------------

/** PanelRule sub-shape SHACL (spec §3.4), carried verbatim. Conditional:
 *  applied only when capabilityType: 'panel-rule' — the TypeScript type
 *  guard (isPanelRuleEntry) enforces the conditional at application layer. */
export const PANEL_RULE_SHAPE_TTL = `
seam:PanelRuleShape
  a sh:NodeShape ;
  sh:targetClass seam:PanelRule ;

  sh:property [
    sh:path seam:minMembers ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:datatype xsd:integer ;
    sh:minInclusive 1 ;
  ] ;
  sh:property [
    sh:path seam:memberSource ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:hasValue "standing-registry" ;
  ] ;
  sh:property [
    sh:path seam:formationConsentRef ;
    sh:minCount 1 ; sh:maxCount 1 ;
    sh:nodeKind sh:IRI ;
  ] .
` as const;

const URI_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Runtime conformance validator mirroring seam:PanelRuleShape (spec §3.4).
 * Returns a list of violations; an empty list is conformance.
 */
export function validatePanelRuleShape(rule: unknown): string[] {
  const v: string[] = [];
  if (typeof rule !== 'object' || rule === null) {
    return ['panelRule: not an object'];
  }
  const r = rule as Record<string, unknown>;

  if (typeof r.minMembers !== 'number' || !Number.isInteger(r.minMembers)) {
    v.push('seam:minMembers — sh:minCount 1 / xsd:integer violated');
  } else if (r.minMembers < 1) {
    v.push('seam:minMembers — sh:minInclusive 1 violated');
  }
  if (r.memberSource !== 'standing-registry') {
    v.push("seam:memberSource — sh:hasValue 'standing-registry' violated");
  }
  if (
    r.exclusionRule !== undefined &&
    !PANEL_EXCLUSION_RULES.includes(r.exclusionRule as PanelExclusionRule)
  ) {
    v.push('seam:exclusionRule — value not in (no-party-to-dispute none)');
  }
  if (
    typeof r.formationConsentRef !== 'string' ||
    !URI_PATTERN.test(r.formationConsentRef)
  ) {
    v.push('seam:formationConsentRef — sh:minCount 1 / sh:nodeKind sh:IRI violated');
  }

  return v;
}
