# keyhive-employment-seam

Reference implementation for Pattern Commons #7 — the employment seam. See the [root README](../README.md) for the full architectural description and essay context.

## What This Is

A working Vite/React/TypeScript prototype demonstrating cryptographically-governed knowledge handoff at an employment boundary. Uses [Automerge](https://automerge.org/) with [Keyhive](https://github.com/inkandswitch/keyhive) for access control. The relay is structurally prevented from reading bundle contents.

Implements build plan v0.5: `assertCapabilityCurrent()` gate with `seam:gateCheckRecord` evidence, agent-class contacts (`seam:identityClass: Agent`) as structurally grantee-only, and two-state revocation (`revoked-local` / `revoked-confirmed`). 33/33 tests passing.

## Run Instructions

```bash
npm install
npm run dev      # development server at http://localhost:5173
npm test         # vitest run — 33/33 expected
npm run build    # production build check
```

## Dependency Pins — Do Not Loosen

This prototype runs on a frozen prerelease stack. Do not upgrade these without a dedicated dependency session.

| Package | Pinned version | Notes |
|---|---|---|
| `@automerge/automerge-repo` | `2.6.0-subduction.40` | Forked prerelease; hard-pinned |
| `@automerge/automerge-repo-keyhive` | `0.4.0-alpha.sub.4` | Keyhive adapter; frozen since Oct 2025 |
| `@automerge/automerge-repo-network-broadcastchannel` | `2.6.0-subduction.40` | Must cascade with repo pin |
| `@automerge/automerge-repo-react-hooks` | `2.6.0-subduction.40` | Must cascade with repo pin |
| `@automerge/automerge-repo-storage-indexeddb` | `2.6.0-subduction.40` | Must cascade with repo pin |
| `vite-plugin-wasm` | `^3.6.0` | Required for Automerge WASM |

All five `@automerge/*` packages must stay in lockstep at `2.6.0-subduction.40`. The Keyhive adapter (`0.4.0-alpha.sub.4`) is the only actively maintained artifact wrapping this stack.

## Relay Status

[subduct.io](https://subduct.io) is the official Ink & Switch hosted Subduction relay, labeled "early preview, not production-ready." The prototype's BroadcastChannel transport does not expose per-peer acknowledgment — exposure records carry `boundType: 'exposure-upper-bound'` to reflect this honestly. See the access log in the running app for gate-check and revocation evidence.

## Spec Reference

The governing specification is Pattern Commons #7 v0.5, maintained in the [local-first-series](https://github.com/jediwright/local-first-series) repo. The prototype co-registers against it; it does not author it.

---

MIT License · Built with AI-collaborative methods · Intellectual direction and authorial responsibility: Jedi Wright | [Systems of Thought](https://www.systemsofthought.com/) | UX Minds, LLC
