# HORIZONS.md — Employment-Seam Vocabulary (GSEF Horizon Record)

⚑ STAMP: SINGLE-CONTEXT — NOT PANELED

**Artifact class:** GSEF two-state deprecation record (mechanism M3) — *current
state*, updated in place with a transition log (§4). Not append-only; the
append-only history lives in `LINEAGE.md` (M4).
**Covers:** `https://seamstack.org/vocab/employment-seam/` — all schema-bearing
versions (0.3+).
**M3 commitments this file carries:**
1. **Deprecation without a horizon is inadmissible.** No version in this file
   is ever marked deprecated without a declared horizon date.
2. **Two-state lifecycle:** `deprecated-declared` → `deprecated-confirmed`.
   Confirmation on a mesh is *policy-confirmed only* — the horizon expired on
   its own declared terms. It is never observation-confirmed (the upper-bound
   principle, M2: what's out there is never fully knowable).
3. **Past-horizon reads are ungoverned reads**, not forbidden reads. The
   architecture bounds its readability commitment; it does not claim
   readability beyond the declared horizon (GSEF T-2, horizon-bounded scope).
**Provenance:** Produced 2026-08-19, GSEF Q-D build session (Session Harness
v0.2, Mode 1). Scope authority: `gsef-qa-resolution_2026-08-18.md` §5.3.
Status: PROPOSED-CANONICAL pending operator apply.

---

## 1. Current version — v0.5

| Field | Value |
|---|---|
| Version | 0.5 (`https://seamstack.org/vocab/employment-seam/0.5#`) |
| State | **SUPPORTED** (current) |
| Declared support horizon | **2028-08-08** |
| Horizon meaning | Until this date, governed reads of v0.5 bundles are committed: the lineage record is maintained, translation paths from v0.5 to any successor are recorded at introduction, and validation against the declared version remains available. |
| Deprecation state | Not deprecated. If deprecation is later declared, it must carry a (possibly revised) horizon and enters `deprecated-declared`; it becomes `deprecated-confirmed` only when that horizon expires on its own terms. |

## 2. Superseded versions — v0.3, v0.4, v0.4.1

| Version | State | Horizon | Readability basis |
|---|---|---|---|
| 0.3 | SUPERSEDED — not deprecated | None declared (none required while not deprecated) | Composed translation path to 0.5 per `LINEAGE.md` §3 (L-4 structural map → L-5 rename map → L-6 identity), under 0.5's horizon |
| 0.4 | SUPERSEDED — not deprecated | None declared | Path L-5 → L-6 under 0.5's horizon |
| 0.4.1 | SUPERSEDED — not deprecated | None declared | Path L-6 (identity) under 0.5's horizon |

Honest-state note: no production bundles are known to exist under 0.3–0.4.1
(the schema was specification-track until the v0.5-era prototype). The
readability commitments above are therefore currently untested by real bundles —
stated as a limit, not hidden.

## 3. Machine-readable horizons (normative for automated checks)

```json
{
  "horizonsFor": "https://seamstack.org/vocab/employment-seam/",
  "horizonRecordVersion": "0.1",
  "issued": "2026-08-19",
  "versions": [
    { "version": "0.3",   "state": "superseded", "deprecation": null,
      "readabilityVia": "0.5" },
    { "version": "0.4",   "state": "superseded", "deprecation": null,
      "readabilityVia": "0.5" },
    { "version": "0.4.1", "state": "superseded", "deprecation": null,
      "readabilityVia": "0.5" },
    { "version": "0.5",   "state": "supported",
      "supportHorizon": "2028-08-08",
      "supportHorizonStatus": "ratified",
      "deprecation": null }
  ],
  "deprecationLifecycle": ["deprecated-declared", "deprecated-confirmed"],
  "confirmationSemantics": "policy-confirmed-only",
  "pastHorizonSemantics": "ungoverned-read"
}
```

## 4. Transition log

| Date | Transition |
|---|---|
| 2026-08-19 | File created. v0.5 SUPPORTED with proposed horizon 2028-08-08; 0.3/0.4/0.4.1 recorded SUPERSEDED-not-deprecated. No deprecations declared. |
| 2026-08-19 | Horizon value ratified: 2028-08-08 (spec issuance 2026-08-08 + 24 months). Starting commitment on a specification-track vocabulary with no known production bundles at ratification date. Will be extended if adoption warrants. Replaces ⚑ PROPOSED-VALUE note in §1. |

---

*Current-state artifact under GSEF M3. Companion: `LINEAGE.md` (M4).
UX Minds, LLC · J. Wright · 2026-08-19.*
