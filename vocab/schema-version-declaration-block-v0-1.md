# Schema Version Declaration Block — v0.1
## GSEF-Conformant Field Group for the Employment-Seam Crossing Record

⚑ STAMP: SINGLE-CONTEXT — NOT PANELED

**Artifact class:** GSEF field-group specification (mechanisms M3 + M5),
formalizing the partially-present PC#7 v0.5 design element.
**Q-D deliverable 2 of 3.** Scope authority: `gsef-qa-resolution_2026-08-18.md`
§5.3. Companions: `LINEAGE.md` (M4), `HORIZONS.md` (M3).
**Provenance:** Produced 2026-08-19, GSEF Q-D build session (Session Harness
v0.2, Mode 1). Status: PROPOSED-CANONICAL pending operator apply. All coinages
PROPOSED pending lexicon queue.

---

## 1. What was partially present, and what this formalizes

PC#7 v0.5 §"Versioning and extensibility" carries the design element as prose:
*"The IRI for the vocabulary includes the version… Bundles declare which
vocabulary version they conform to. Receiving parties can validate against the
declared version. Future versions add terms; deprecations are explicit; no
silent breakage."*

Present: the declaration-of-conformance commitment, carried implicitly by the
versioned vocab IRI.
Absent (the gap this spec closes):
1. A **named field group** — the declaration has no field name, no required
   contents, no cardinality, no placement rule.
2. **Lineage binding** — nothing ties the declaration to the lineage record in
   force at crossing time (GSEF T-2 fact F4: *lens/translation path recorded as
   of crossing date*).
3. **Horizon binding** — nothing records the horizon in force at crossing time
   (F5: *horizon unexpired at crossing date*).
4. **M5 admissibility coupling** — validation against the declared version is
   nowhere stated as a *precondition of governed read*; a bundle with an absent
   or unverifiable declaration currently fails soft.

## 2. The field group (normative)

Placement: bundle-level (Structure-level Cluster in TCF terms) — exactly one
per bundle/crossing record. Serialization shown in JSON-LD (canonical) with the
JSON-Schema fallback implied per PC#7 §Schema language.

```json
"seam:schemaVersionDeclaration": {
  "seam:vocabVersion":   "0.5",
  "seam:vocabIRI":       "https://seamstack.org/vocab/employment-seam/0.5#",
  "seam:declaredAt":     "2026-08-19T14:02:00Z",
  "seam:lineageRecordRef": {
    "seam:refType": "content-address",
    "seam:ref":     "lineage-sha256:<sha256-of-LINEAGE.md-machine-block-at-crossing>",
    "seam:lineageEntryId": "L-6"
  },
  "seam:horizonAtCrossing": {
    "seam:state":          "supported",
    "seam:supportHorizon": "2028-08-08",
    "seam:horizonRecordRef": "horizons-sha256:<sha256-of-HORIZONS.md-machine-block-at-crossing>"
  }
}
```

Field rules:

| Field | Card. | Rule |
|---|---|---|
| `seam:vocabVersion` | 1 | Must match a `schema: true` entry in the lineage record. |
| `seam:vocabIRI` | 1 | Must embed `vocabVersion` (existing PC#7 practice, now checked). |
| `seam:declaredAt` | 1 | Crossing-time timestamp; the "as of crossing date" anchor for F4/F5. Self-asserted, same posture as PC#8 `emittedAt` (Q6 lock: author-declared anchoring; no verification claim). |
| `seam:lineageRecordRef` | 1 | Content address of the lineage machine-block **as it stood at crossing**. Follows the PC#8 `intent-sha256:` precedent (deterministic hash over canonical JSON, sorted keys) — tamper-evident, resolvable by any party holding the artifact, no external authority needed. `lineageEntryId` names the entry for the declared version. |
| `seam:horizonAtCrossing` | 1 | The declared version's horizon state and value **as recorded at crossing**, plus the content address of the horizon record then in force. This is what lets a deferred party evaluate F5 against crossing-date facts even after HORIZONS.md has since transitioned. |

## 3. M5 admissibility coupling (normative)

**Governed-read precondition.** A bundle is admissible for governed read iff,
from the crossing record and the lineage/horizon artifacts alone:

- **AF-1 (version declared):** `seam:schemaVersionDeclaration` is present,
  well-formed, and `vocabVersion`/`vocabIRI` agree.
- **AF-2 (lineage bound):** `lineageRecordRef` resolves against a lineage
  record containing the declared version, and the translation path from the
  declared version to the reader's version composes per `LINEAGE.md` §3 rules.
- **AF-3 (horizon unexpired):** the horizon recorded in `horizonAtCrossing`
  had not expired at `declaredAt`, under the horizon record referenced.

**Fail-closed:** any AF failure ⇒ the read is **ungoverned**, and the three
failures are *distinct, named states* — `undeclared-version` (AF-1),
`lineage-unresolvable` (AF-2), `horizon-expired` (AF-3) — mirroring the PC#7
failure-taxonomy posture (the existing *prior-bundle-unverifiable* state's
"vocabulary version unsupported" arm becomes mechanically checkable). An
ungoverned read is recorded, not silently performed — the same fail-closed
legibility discipline as PC#8's crossing-intent-failed state.

**Layer note (M5's Evidence-layer shift, GSEF-OI-3):** AF-1..3 define
*operational* admissibility (the read is permitted as governed). Whether the
bundle *qualifies as evidence* in a forum is the Evidence-layer sense — named
here to prevent ambiguity, resolved in the v0.2 scope statement session, not
this spec.

## 4. Deferred-party check (acceptance definition)

Given ONLY: (a) a crossing record carrying §2's block, (b) `LINEAGE.md`,
(c) `HORIZONS.md` — a deferred party verifies governed-read status by
evaluating AF-1, AF-2, AF-3 in order, with no third information source.
Reference implementation: `check-governed-read.mjs` (this session; §5 of the
session record carries the run + three deliberate-break results).

## 5. Relation to PC#8

The PC#8 crossing records (`CrossingIntentRecord` / `CrossingCompletionRecord`
at HEAD `3c219c3`) already practice the *precedent mechanics* this spec reuses
(content-address linking, fail-closed legibility, author-declared anchoring)
but target a different seam (WhiteWind publication) and declare `targetLexicon`,
not employment-seam vocab conformance. No PC#8 schema change is made or
required by this spec. If a future employment-seam crossing fires through the
PC#8 middleware, this block rides in the bundle, not in the intent record.

---

## 6. ⚑ SPECULATIVE overlay — superset fields (NOT part of the Q-D closure claim)

The blue-sky governed-header work (`cambria-refresh-spec-v0-1-SPECULATIVE` /
`derivation-comparison…_2026-08-19`) defines a superset header. For
generalization-in-view only, the §2 block admits these **optional, untagged-in-
no-canonical-artifact** extensions. None is implemented, none is claimed closed
by Q-D, and each requires its own governed pass:

| Field (SPECULATIVE) | Superset source |
|---|---|
| `seam:supersedes` / `seam:supersededBy` | governed header — supersession pointers in-record |
| `seam:changeDriver` | governed header — M1 driver carried per-record |
| `seam:blastRadiusClassAtIssue` | governed header — class carried per-record (lineage already carries it per-change) |
| `seam:declarationAuthor` + standing | governed header — author+standing block |
| `seam:supportedUntil` (in-record copy) | governed header — §2 carries it via `horizonAtCrossing` reference instead; an in-record *copy* is the speculative variant |

Design note recorded for the siloed re-run: §2 deliberately references horizon
facts by content address rather than copying `supportedUntil` into the record —
copies drift; references bind (from-corpus derivation B2/B7 posture).

---

*UX Minds, LLC · J. Wright · 2026-08-19. GSEF Q-D deliverable 2/3.
SINGLE-CONTEXT — NOT PANELED. PROPOSED-CANONICAL pending operator apply.*
