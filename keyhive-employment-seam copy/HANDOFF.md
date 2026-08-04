# Handoff — Keyhive integration

**Date:** 2026-08-01
**Status:** Done, verified in browser. Uncommitted on `main`.

## What changed

Integrated `@automerge/automerge-repo-keyhive` per the integration guide
(`~/Downloads/keyhive-integration_2026-08-01.md`), with one deviation from the
guide (see Gotcha below).

- `package.json` — pinned (exact, no `^`) all four `@automerge/automerge-repo*`
  packages to the `2.6.0-subduction.40` line, plus
  `@automerge/automerge-repo-keyhive@0.4.0-alpha.sub.4`. The guide only called
  out pinning the core `automerge-repo` package; `automerge-repo-react-hooks`,
  `-storage-indexeddb`, and `-network-broadcastchannel` all still pointed at
  `^2.5.5` and each got their own nested copy of `automerge-repo`, producing
  duplicate/incompatible `Repo` types (`tsc` caught this as `Property
  '#private' ... refers to a different member`). Bumped all three to
  `2.6.0-subduction.40` to dedupe.
- `src/main.tsx` — replaced `new Repo(...)` with
  `initializeLegacyAutomergeRepoKeyhive(...)`, added `initSubduction()` call
  (see Gotcha), reads `publicKeyFingerprint` off `hive.active.signer.verifyingKey`.
- `src/rootDoc.ts` — `getOrCreateRoot` is now async, takes
  `publicKeyFingerprint`, uses `repo.create2` (Keyhive-protected doc ID) instead
  of `repo.create`.
- `src/App.tsx` — added `IdentitySetup` first-launch gate, shown when
  `doc.identity.displayName` is empty.

## Gotcha not covered by the guide

The guide's comment on `initializeLegacyAutomergeRepoKeyhive` says step 1 is
"Calls `initKeyhiveWasm()` internally" and implies that's sufficient WASM
setup. It isn't. Confirmed by reading
`node_modules/@automerge/automerge-repo-keyhive/dist/keyhive/keyhive.js:254-263`:
it only calls `initKeyhiveWasm()` (Keyhive's own WASM). The pinned
`automerge-repo@2.6.0-subduction.40` has a **separate** Subduction WASM module
(`@automerge/automerge-subduction`) that the `Repo` constructor depends on
synchronously (`set_subduction_logger`) — without it, the app loads blank with:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'set_subduction_logger')
```

Fix: import and `await initSubduction()` from `@automerge/automerge-repo`
before calling `initializeLegacyAutomergeRepoKeyhive` — see the comment above
that call in `src/main.tsx`.

## Environment note (this machine)

`~/.npm/_cacache` has root-owned files from an old npm bug, so plain
`npm install` fails with `EACCES`/`EEXIST`. npm's own recommended fix is
`sudo chown -R 501:20 "/Users/jediwright/.npm"` — not run this session since
sudo needs an interactive TTY this tool doesn't have. Worked around by pointing
at a scratch cache dir (`npm install ... --cache <tmp-dir>`) instead. The repo
installs are fine either way, but every future `npm install` in this
environment will hit the same EACCES until the chown is actually run.

## Verified

- `npx tsc -b --noEmit` — clean.
- `npm run dev` — app loads, identity setup form renders, submitting a name
  persists and the tab shell renders. Confirmed manually in browser.
- Not yet checked: DevTools → Application → IndexedDB for the two expected
  databases (`keyhive-employment-seam-identity` + the doc-blob bucket), and
  the `publicKeyFingerprint` console check from the guide's Step 5. Worth a
  quick look next session but not blocking.

## Not committed

Nothing from this session has been committed — `package.json`,
`package-lock.json`, `src/App.tsx`, `src/main.tsx`, `src/rootDoc.ts` are all
modified in the working tree on `main`. Next session should review the diff
and commit.
