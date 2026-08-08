# Contributing to keyhive-employment-seam

This repository follows the [Governed PR Framework v0.3](https://github.com/jediwright/governed-pr-framework) (J. Wright).
This file is a governed derivative of that framework. Inheritance rules: §8 of `FRAMEWORK.md`.

---

## What this repository is

`keyhive-employment-seam` is a local-first prototype implementing the Employment Seam pattern — worker-side governance of AI access at the employment boundary. The core claim: a worker should be able to grant, revoke, and verify AI agent capabilities against a local-first data store without surrendering custody of their own work record.

Governing specification: `pattern-commons-07-employment-seam-v0-5_2026-08-08.md`  
Build plan: `keyhive-employment-seam-build-plan-v0-5_2026-08-08.md`  
Vocabulary: `UFO_Lexicon_v1_2_2026-08-08.md`

---

## Review scale

This repository operates at **S1 — Solo + AI assistant** (§3 of the framework). There is one author; PRs are reviewed by the author in a separate session or context from the one that produced the code, against the written spec and acceptance criteria.

For Critical changes on protected surfaces, the compensating mechanism is external verification — checking the design claim against the Automerge/Keyhive ecosystem or the governing spec before merge. The ecosystem is the second reviewer of record for boundary-layer claims at this scale.

---

## Change tiers — the short version

Tier is determined by **how far a failure would spread**, not by line count.

| Tier | When to use it |
|---|---|
| **Low-risk** | Failure would be local and visible: a rename, a constant, a test-only change, copy. |
| **Feature** | Failure could spread within one bounded area: a new feature, a module refactor, a behavior change in one component. |
| **Critical** | Failure could be silent or unrecoverable. See the protected surfaces list below. |

**Tier disputes resolve upward** — if author and reviewer disagree (including across sessions), the higher tier applies.

---

## Protected surfaces

Changes touching any of the following are **automatically Critical**, regardless of diff size. K4 applies: no `Unverified` tags on protected-surface claims.

**Schema and data conventions**

- `src/types.ts` — the full schema declaration file. Any addition, removal, or modification of an exported type is a Critical change. This file governs the entire document model; errors propagate through every tab, every test, and every future import of the document.
- `src/rootDoc.ts` — root document structure and initialization. Changes here affect every document created by every installation.
- Any new file that declares or exports types consumed by the Automerge document (present or future).

**Sync and replication semantics**

- Automerge merge logic and document-head handling: anything that changes what state gets replicated, in what order, or what a peer can observe after a sync.
- The degraded-sync path (`src/degradedSync.test.ts` exercises this): changes to how the prototype behaves when the relay is unreachable or a peer is unresponsive.
- `BroadcastChannel` configuration and the `syncServer: 'none'` fallback path.

**Gate and capability semantics — the core governance layer**

- `src/gate.ts` — `assertCapabilityCurrent()` and `confirmRevocation()`. These are the prototype's primary governance claims. Changes affect what the gate permits, blocks, or records as evidence.
- `GateCheckRecord` structure in `src/types.ts`: any field addition, removal, or type change on `GateCheckRecord`, `GateResult`, or `RevocationConfirmationState`. The gate-check record is a first-class evidence artifact per PC#7 v0.5; its structure is cited by the governing spec.
- The two-state revocation model (`revoked-local` / `revoked-confirmed` prefixes on `keyhiveCapabilityRef`): any change to the state machine, the prefix strings, or the transition conditions.

**Agent-class participant model — Principle 6 boundary**

- `AgentContact`, `AgentCapabilityGrant`, and the `recordSpeechAuthority?: never` constraint in `src/types.ts`. These implement "Agents are governed parties, never authors of record" (Principle 6, PC#7 v0.5) as a type-system constraint. Any change that widens agent authority — including adding optional fields that could carry record-speech semantics — is Critical and requires explicit Principle 6 boundary questions answered.
- `seam:identityClass: 'Agent'` controlled-vocabulary value: changes to the string or its placement.
- Class C chain-of-authority: `authorizationVCReference` field and its required/optional status on `AgentCapabilityGrant`.

**Access log and evidence layer**

- `AccessEvent` and `AccessEventType` in `src/types.ts`: additions or removals that change what the log records, what can be queried, or what a downstream reader can reconstruct from the log.
- `ExposureRecord` structure: this is the worker-side evidence artifact for the exposure surface at revocation time; its shape is cited by the build plan.

**Dependency versions**

- Any change to the pinned Automerge/Keyhive/Subduction stack in `package.json` or `package-lock.json`. These packages are frozen pre-releases; a version change is a Critical change requiring a boundary-questions answer and a rationale for departing from the pin.

  Current pins (read from `package.json` at `c2a11ab`):

  | Package | Version |
  |---|---|
  | `@automerge/automerge-repo` | `2.6.0-subduction.40` |
  | `@automerge/automerge-repo-keyhive` | `0.4.0-alpha.sub.4` |
  | `@jtfmumm/patchwork-standalone-frame` | `0.7.0` |

**Governance configuration**

- This file (`CONTRIBUTING.md`) — declaring, widening, or modifying any pre-cleared class or protected surface is itself a Critical change (§2.3 of the framework).
- `.github/PULL_REQUEST_TEMPLATE.md` — changes to the PR template are Critical changes to the governance instrument.

---

## Pre-cleared change classes

**None declared yet.** Pre-cleared classes are created by a Critical-tier PR that declares the class, its machine-checkable boundary predicate, and its mandatory expiry/review interval (§2.3 of the framework). No class exists in this repository at adoption; instances will follow as CI gates are instrumented.

When a class is declared, it will appear here with: the class name, its exact boundary (which files may be touched, which semver band is permitted, what CI predicate verifies membership), and the review interval.

---

## The mechanized layer (§6 gates)

The following are enforced by tooling, not by reviewer memory:

- **Lint and type checks** — `npm run lint` / TypeScript compiler; must pass before merge.
- **Test suite** — `npm test` (Vitest); all 42 tests must be green. The suite covers gate behavior (`gate.test.ts`), degraded-sync behavior (`degradedSync.test.ts`), and the Phase 2 exposure record (`phase2ExposureRecord.test.ts`). A PR that breaks any of these is blocked regardless of tier.
- **Structured commit format** — `fix:` / `feat:` / `refactor:` / `chore:` + scope. Enforced by commit hook (to be added; manual discipline until then). Makes history parseable and intention-legible.
- **Diff-size advisory** — PRs exceeding 400 changed lines receive a comment requiring either a split or a written justification. Line count is not the tier definition; it is the signal that something may be mis-tiered.

Any rule currently enforced by memory is a candidate for the mechanized layer. If you find one, the §7 self-healing rule applies: surfacing it is part of your PR.

---

## What K2 (independent review) means at S1

K2 is satisfied by a review pass in a **separate session or context** from the one that produced the code, conducted against the written spec and acceptance criteria — not the diff alone.

For AI-assisted review: a review conducted in the same conversation that wrote the code is not independent. A fresh context given only the spec and the acceptance criteria (not the authoring conversation) can satisfy K2 at this scale. For Critical changes on protected surfaces, external verification against the upstream ecosystem or governing spec is the compensating control. See §3 (S1) and §6.1 of the framework for the full account.

---

## Self-healing conventions (§7)

If your PR surfaces something undocumented — a convention not written down, a failure mode not on any list, a protected surface not declared above, a dependency quirk not recorded — **updating this file (or the relevant governing document) is part of your PR**. Code and documentation ship together. This is universal at Critical tier; it is the only mechanism that keeps this file accurate over time.

---

## Emergency changes

Live incident, security response, something that cannot wait? **Act first.** Apply the fix. Then open a PR retrospectively within **1 business day** and fill it as a Critical-tier PR with honest after-the-fact tags. The emergency path moves the governance sequence; it does not remove the governance. `Confirmed` still means verified; `Unverified` still requires a closure plan.

See §10.1 of the framework for the full procedure.

---

## Attribution

This file is a governed derivative of the **Governed PR Framework v0.3** (J. Wright · UX Minds, LLC).  
Framework repo: `github.com/jediwright/governed-pr-framework`

Derivative-local content (protected surfaces, dependency pins, repository-specific gates) does not flow upstream. Improvements worth proposing upstream go through the parent's change-control process.

---

*`CONTRIBUTING.md` — keyhive-employment-seam — Governed PR Framework v0.3 derivative*  
*Adopted August 8, 2026. Register: CONTEXTUAL. Delivery-not-application: apply locally, commit.*
