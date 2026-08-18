# substrate-crossing — PC#8 Prototype (Phase 0 scaffold)

Sub-package of `jediwright/employment-seam` (Option A, PC#8 build plan v0.1
Item 0.1, decision recorded 2026-08-17).

**Governing spec:** `pattern-commons-08-substrate-crossing-seam-v0-1-3_2026-08-17.md`
**Build plan:** `pc08-build-plan-v0-1_2026-08-17.md`

## Getting started — verify your local setup


```bash
cd substrate-crossing
npm install
npm test              # vitest, zero tests, passes (Item 0.1 baseline)
npm run baseline:0-3  # Automerge + Keyhive grant + digest (Item 0.3)
```

## Item 0.2 — PDS connectivity (operator-run, live network required)

PDS target: **bsky.social** (declared 2026-08-17; self-hosted PDS held as a
Phase 3 contingency).

1. Create a throwaway Bluesky test account.
2. Generate an **App Password** (Settings → App Passwords).
3. `cp .env.example .env` and fill in `PDS_HANDLE` and `PDS_APP_PASSWORD`.
4. `npm run check:pds`

The script performs `createSession()`, opens a Jetstream subscription
filtered to the test DID, writes one `com.whtwnd.blog.entry` probe record,
and reports `pds_accept_latency_ms` and `relay_ingest_gap_ms` — the baseline
timing for Phase 1 KL-1 instrumentation. The probe record is not a governed
crossing (no intent record, no gate) and is safe to delete afterward.

**Credential handling:** the App Password lives only in your local `.env`
(gitignored); never commit it and never paste it into a chat session.

## Layout

```
src/digest.ts                  authorizedContentDigest (CP-F11 content binding)
scripts/item-0-3-baseline.ts   Item 0.3 acceptance script (runs offline)
scripts/check-pds.ts           Item 0.2 acceptance script (live network)
test/                          empty; Vitest baseline (passWithNoTests)
```

## Dependency notes

- `@automerge/automerge-repo-keyhive@0.5.0-alpha.1` — exact pin, matching the
  employment-seam upgrade decision (2026-08-16).
- `@automerge/automerge-subduction` pinned to `0.16.0` to match
  automerge-repo's own dependency; installing `0.16.1` alongside creates a
  duplicated wasm instance and `set_subduction_logger` init failures.
- Node wasm init: import `@automerge/automerge` and
  `@automerge/automerge-subduction` (full entries) before constructing a
  `Repo`; the repo itself imports only the `/slim` entries.
- Keyhive-protected documents are created with the async `repo.create2()`
  (experimental) so the hive's idFactory runs at creation; `repo.create()`
  produces an unprotected (pre-keyhive) document that `addMemberToDoc`
  rejects.

Phase 0 scope only — no crossing logic, no intent/completion records, no
relay-timing instrumentation beyond the Item 0.2 baseline probe.

## Implementation findings (Phase 1 / Item 1.1)

- **F-5 — DummyNetworkAdapter packaging breakage (upstream watch item).**
  `@automerge/automerge-repo@2.6.0-subduction.40` ships
  `dist/helpers/DummyNetworkAdapter.js` with a broken relative import
  (`../../src/helpers/pause.js`; the `src/` tree is not published), so the
  packaged helper cannot be imported. Workaround: self-contained
  `test/helpers/pair-network-adapter.ts` replicating the connected-pair
  behavior (microtask delivery). Remove on upstream fix. Do not patch
  node_modules.

- **F-6 — 0.5.0-alpha.1 API shape.**
  `initializeLegacyAutomergeRepoKeyhive(opts)` constructs the Repo itself
  and returns `{ hive, repo }`; it requires `storage`, `peerIdSuffix`,
  `networkAdapter`, `syncServer`, and `createRepo`. `accessForDoc(id, docUrl)`
  takes the member's `Identifier` first (obtain via
  `receiveContactCard(card).id`). The local contact card lives at
  `hive.active.contactCard`. `create2()` is the Keyhive create path (A3).

- **A6 qualification (gate predicate).** Item 1.1 gates on
  `accessForDoc(...) !== undefined` ("authorizing grant present") —
  consistent with the Phase 0 Item 0.3 baseline. The parent
  keyhive-employment-seam gate uses an ordinal AccessTier comparison; that
  richer pattern is the precedent if a later item requires tier-sensitive
  gating (e.g., publication requiring write-or-better).
