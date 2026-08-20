# LINEAGE.md — Employment-Seam Vocabulary (GSEF Lineage Record)

⚑ STAMP: SINGLE-CONTEXT — NOT PANELED

**Artifact class:** GSEF append-only lineage record (mechanism M4), with per-change
blast-radius annotation (M1) and per-version horizon references (M3).
**Covers:** `https://seamstack.org/vocab/employment-seam/` — all versions, v0.1 → v0.5.
**Companion artifact:** `HORIZONS.md` (M3 two-state deprecation — current state).
**Source of record for schema content:** `pattern-commons-07-employment-seam-v0-5_2026-08-08.md`
(spec + changelog). This file records *lineage facts*; it restates no schema semantics.
**Discipline:** Append-only. Entries are never edited or removed (M4). Corrections
append as new entries referencing the corrected one. This artifact is operational
infrastructure a runtime or deferred party consults — the machine-readable block
in §3 is normative for automated checks; the prose in §2 is explanatory.
**Provenance:** Produced 2026-08-19, GSEF Q-D build session (Session Harness v0.2,
Mode 1). Scope authority: `gsef-qa-resolution_2026-08-18.md` §5.3. Delivered by
session; canonical on operator apply. Status: PROPOSED-CANONICAL pending operator
apply to the employment-seam repo.

---

## 1. Blast-radius vocabulary used in this file (GSEF M1)

Five classes, per GSEF v0.1 §3.1:

| Class | Name | Meaning for a reader of the *prior* version |
|---|---|---|
| A | additive-tolerant | New terms; prior readers unaffected without any handling |
| B | additive-required | New terms/values; prior readers must tolerate unknowns to read validly |
| C | semantic shift | Existing term's meaning changes; silent-corruption class |
| D | structural | Shape, cardinality, or term-identity change; prior readers break loudly |
| E | destructive / invariant-touching | Removal or invariant change; only a successor system or explicit translation restores readability |

**Change driver** (GSEF v0.1 §3.1): *endogenous* (author's timeline; deferral
available) vs. *exogenous* (upstream's timeline; constrained deferral).
> Note: UFO Lexicon v2.1's "blast radius — GSEF sense" entry states the driver
> dimension as schema-pull / capability-push / protocol-version. The two
> formulations diverge; this file uses the GSEF v0.1 spec formulation
> (endogenous/exogenous) as source authority and flags the divergence for the
> CV-table promotion session. Not resolved here.

**Per-change annotation rule:** each change event carries the *highest* class any
of its component changes reaches, plus a component breakdown where mixed.

---

## 2. Lineage entries (append-only; oldest first)

### L-1 — v0.1 (2026-04-29) — pre-schema
Initial spec from the onoff.work concept board. **No bundle schema exists at this
version.** No blast radius (nothing machine-readable to break). No bundles can
declare conformance to v0.1. Driver: endogenous.

### L-2 — v0.2 (2026-04-30 AM) — pre-schema
Framing version (Seam Stack named; participant model at seven classes; platform
accountability). **Still no bundle schema.** Same disposition as L-1.
Driver: endogenous.

### L-3 — v0.3 (2026-04-30 PM) — schema genesis
First bundle schema: TCF tier mapping, five Zones, SHACL/JSON-LD/JSON Schema
layering, role-conditioned access, AI-provenance attributes; legal record format;
identity ceremony (seven classes). **Genesis entry — no prior readers exist, so no
blast-radius class applies.** Multi-perspective structure capped at three views
(worker / employer / escrow log). Driver: endogenous.
**Translation path from prior version:** none required (no prior schema).

### L-4 — v0.3 → v0.4 (2026-04-30 – 2026-05-01) — Class D (structural), endogenous
Component breakdown:
- **Class D (governing):** multi-perspective structure generalized from
  three-view to one-worker + N-employer-side + one-escrow-log. A v0.3 reader
  expecting exactly one employer view encounters a cardinality it cannot
  represent. v0.3 bundles remain valid v0.3 bundles; the break runs
  old-reader-of-new-bundle only.
- **Class B:** ~20 new terms across Zones 1/2/5, bundle-level Clusters, and two
  new per-Particle Taxonomy attributes (`seam:carriedForward`,
  `seam:credentialContext`); failure taxonomy 7 → 9 states; standalone
  `seam:WeingartenEvent` resource (outside bundle structure, hash-referenced).
- **Class A:** case anchors, regime prose (non-schema).
**Translation path v0.3 → v0.4:** structural, one-step — a v0.3 three-view bundle
maps into the v0.4 generalized structure (the single `employer` view becomes the
sole member of the employer-side set). Forward-only. Recorded here as the path a
deferred v0.4+ reader of a v0.3 bundle follows.

### L-5 — v0.4 → v0.4.1 (2026-05-01) — Class D (term identity + cardinality), endogenous
Component breakdown:
- **Class D (governing):** `seam:employerSubmittedAccount` **renamed** to
  `seam:employerSideAccount`; cardinality exactly-one → one-or-more. A rename is
  a term-identity change: a v0.4 reader resolving the old IRI against a v0.4.1
  bundle finds nothing (loud break, not silent corruption — hence D, not C: no
  term changed *meaning*).
- **Class A:** rationale prose, annotation trims, witnessing-role clarification
  (no semantics changed).
**Translation path v0.4 → v0.4.1:** explicit one-step rename mapping
(`seam:employerSubmittedAccount` ⇒ `seam:employerSideAccount`; cardinality
widening is read-compatible in the forward direction). Per the PC#7 changelog:
"v0.4 bundles serialize validly as v0.4.1 bundles after applying the term
rename." This is the vocabulary's one existing named translation step.

### L-6 — v0.4.1 → v0.5 (2026-08-08) — Class B (additive-required), endogenous
Component breakdown:
- **Class B (governing):** `seam:identityClass: Agent` added to a controlled
  vocabulary — a v0.4.1 reader encountering an Agent-class participant sees an
  unknown enum value and must tolerate it to read the rest of the bundle
  validly. Three new terms (`seam:agentCapabilityGrant`,
  `seam:agentRevocationState`, `seam:gateCheckRecord`); Class G grantee-only
  SHACL shape (constrains the new class only).
- **Class A:** Principle 6, ceremony/Phase-0 additions (spec-level).
- **No term modified or renamed** (per changelog: "terms added, none modified
  or renamed"). Backward-compatible with v0.4.1 and, transitively, v0.3 in the
  declared-version sense.
**Translation path v0.4.1 → v0.5:** identity for all v0.4.1 terms (additive
change; no mapping required). A v0.5 reader reads a v0.4.1 bundle directly.

### L-7 — Lineage-record genesis (2026-08-19) — meta-entry, no schema change
This file created as the GSEF M4 lineage record for the vocabulary (Q-D
deliverable 1). Horizon declarations for all versions issued in `HORIZONS.md`
same date (see §4). No vocabulary content changed by this entry.

---

## 3. Machine-readable lineage (normative for automated checks)

```json
{
  "lineageFor": "https://seamstack.org/vocab/employment-seam/",
  "lineageRecordVersion": "0.1",
  "issued": "2026-08-19",
  "appendOnly": true,
  "entries": [
    { "id": "L-1", "version": "0.1", "date": "2026-04-29", "schema": false },
    { "id": "L-2", "version": "0.2", "date": "2026-04-30", "schema": false },
    { "id": "L-3", "version": "0.3", "date": "2026-04-30", "schema": true,
      "blastRadiusClass": null, "driver": "endogenous",
      "translationFromPrior": "none-required-genesis" },
    { "id": "L-4", "version": "0.4", "date": "2026-05-01", "schema": true,
      "blastRadiusClass": "D", "driver": "endogenous",
      "translationFromPrior": "structural-map:three-view-to-1+N+1" },
    { "id": "L-5", "version": "0.4.1", "date": "2026-05-01", "schema": true,
      "blastRadiusClass": "D", "driver": "endogenous",
      "translationFromPrior": "rename-map:seam:employerSubmittedAccount=>seam:employerSideAccount" },
    { "id": "L-6", "version": "0.5", "date": "2026-08-08", "schema": true,
      "blastRadiusClass": "B", "driver": "endogenous",
      "translationFromPrior": "identity-additive" }
  ]
}
```

Rules for consumers:
- A version's **translation path** to any later version is the composition of
  the `translationFromPrior` steps between them (GSEF T-2 "full path"; M7:
  supersession-not-reinterpretation — steps compose, they are never edited).
- `blastRadiusClass: null` on L-3 = genesis (no prior readers), not "unclassified."
- Horizon facts live in `HORIZONS.md`, referenced by version. This file records
  that horizons **exist and where**; it does not restate their values (single
  source of truth for current deprecation state).

## 4. Horizon reference (M3 pointer — values live in HORIZONS.md)

| Version | Horizon record |
|---|---|
| 0.3, 0.4, 0.4.1 | `HORIZONS.md` §2 (superseded-not-deprecated; readability via composed translation path to 0.5 + 0.5's horizon) |
| 0.5 | `HORIZONS.md` §1 (current; declared support horizon) |

---

*Append-only under GSEF M4. Next entry: L-8. UX Minds, LLC · J. Wright · 2026-08-19.*
