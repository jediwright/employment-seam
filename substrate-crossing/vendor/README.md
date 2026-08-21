# substrate-crossing/vendor/

Preserved upstream package tarballs for archival and evidentiary reference.

---

## `automerge-automerge-repo-keyhive-0.5.0-alpha.1.tgz`

| Field | Value |
|---|---|
| Package | `@automerge/automerge-repo-keyhive` |
| Version | `0.5.0-alpha.1` |
| shasum | `dc34e94bb2fe36ea79ea5e4a3425d432096a5a0e` |
| Packed size | 105.8 kB (106 files; 476.0 kB unpacked) |
| Date preserved | 2026-08-21 |
| Committed at | `e012dcc` |
| Preserved by | J. Wright / UX Minds, LLC |

**Reason:** PC#8 Phase 0 baseline pin. The upstream README explicitly
announces removal of the TypeScript sync protocol surface
(`sync-protocol.ts`, `network-adapter.ts`, `subduction-transport/`, and
all caching modules) in favor of a WASM API for the Rust implementation.
This tarball preserves the full TS source that produced the Phase 0
findings (F-1 through F-4) and the Phase 1 two-record crossing
implementation (Items 1.1–1.4, 27/27 tests, Runs 0–4).

**Verification:** `npm pack` shasum above is the canonical integrity
anchor. The package was also published with integrity
`sha512-A3Yr4aFs8Dcs0[...]kT0BvKJ2jhWog==` (full value in npm pack
output, 2026-08-21 session).

**Do not delete.** This tarball is evidentiary, not a build artifact.
The live pin in `substrate-crossing/package.json` may advance; this
file stays.
