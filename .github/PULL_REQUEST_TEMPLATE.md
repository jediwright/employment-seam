<!--
PR Template · keyhive-employment-seam
Governed derivative of the Governed PR Framework v0.4 (J. Wright)
Full framework: github.com/jediwright/governed-pr-framework

HOW THIS WORKS
1. Declare your tier below. 2. Fill only the sections your tier requires. 3. Delete unused sections.
Tier disputes resolve UPWARD (reviewer's call wins if higher).
Changes touching a protected surface (see CONTRIBUTING.md) are automatically Critical.
No pre-cleared classes are declared in this repo yet — all changes tier normally.
This repo's review scale is S4 (public / maintainer review) — you don't declare it here.

EMERGENCY CHANGES (live incidents, security responses): act first, then open this PR
retrospectively within 1 business day. Fill it as a Critical-tier PR with honest
after-the-fact tags. See §10.1 of the framework for the full procedure.
-->

## Change Tier
<!-- Pick ONE. Tier = how far a failure would spread, not how many lines changed.
     Low-risk  — failure would be local and visible (rename, constant, test-only change)
     Feature   — failure could spread within one area (new feature, module refactor)
     Critical  — failure could be silent or unrecoverable:
                   • anything in src/types.ts (schema changes propagate everywhere)
                   • src/gate.ts (GateCheckRecord, assertCapabilityCurrent, confirmRevocation)
                   • AgentContact / AgentCapabilityGrant / Principle 6 boundary (recordSpeechAuthority)
                   • revocation state machine (revoked-local / revoked-confirmed prefixes)
                   • Automerge/Keyhive/Subduction pin versions in package.json
                   • CONTRIBUTING.md or this template (governance configuration)
                   • AccessEvent, AccessEventType, ExposureRecord (evidence layer)
                 Full protected-surface list: CONTRIBUTING.md -->

**Tier:** Low-risk / Feature / Critical

---

## Intent
<!-- ALL TIERS. What this changes and why — readable without opening the diff.
     Example: "Adds seam:gateCheckRecord to access-log entries for agent-class
     contacts so the log is queryable by agentDID and grantReference per
     the v0.5 acceptance criteria." -->



<!-- ============ LOW-RISK PRs STOP HERE. Everything below is Feature tier and up. ============ -->

## Acceptance Criteria  <!-- Feature + Critical -->
<!-- Written BEFORE the code. Given / when / then. Point each one at where it's met.
     Example: "Given an agent contact with a revoked-local capability ref,
     when assertCapabilityCurrent() runs, then gateResult is 'blocked-revoked'
     and a GateCheckRecord is emitted → met in gate.ts assertCapabilityCurrent + gate.test.ts" -->

- [ ] Given … when … then … → met in: …
- [ ] Given … when … then … → met in: …

## Verification Status  <!-- Feature + Critical -->
<!-- Tag each substantive claim. The tags:
     Confirmed      — verified; say against WHAT (test run, package version) and when
     Inferred       — follows from something confirmed; state the reasoning
     Unverified     — assumed; MUST include a closure plan (what you'll watch, by when).
                      Not allowed on protected surfaces (K4).
     Time-sensitive — true now; name what will make it expire

     Note: Confirmed tags against the Automerge/Keyhive pinned stack are
     Time-sensitive — the pins are frozen pre-releases. Name the version set
     the claim was confirmed against. -->

| Claim | Tag | Evidence / reasoning / closure plan |
|---|---|---|
|  |  |  |

## Not in this PR
<!-- One line. What you deliberately left out, and why leaving it out is safe. -->

**Not in this PR:** … — **safe to defer because:** …

## Pre-mortem  <!-- Feature + Critical -->
<!-- Answer in writing: "It's two weeks from now and this PR caused an incident.
     What was it?"
     For gate or schema changes: consider specifically — did this widen what
     an agent-class contact can do? Did it silently change what the gate records
     vs. what the access log stores? Did it affect the two-state revocation
     machine in a way that could produce a false 'pass'? -->



<!-- ============ FEATURE PRs STOP HERE. Everything below is Critical tier only. ============ -->

## Convention Check  <!-- Critical -->
<!-- Link the governing document for any schema, key format, protocol, or type convention touched.
     If the convention doc does not exist yet: writing it is part of this PR.
     For changes to types.ts, gate.ts, or the agent-class model: the governing spec is
     pattern-commons-07-employment-seam-v0-5_2026-08-08.md — link the relevant section. -->

- Convention doc(s):
- New/updated doc included in this PR (if a gap was found):

## Decision Record  <!-- Critical — only if this PR settles a question that would fail silently if wrong -->
<!-- Link a short record: context / decision / alternatives considered / consequences.
     Ordinary implementation choices that a visible later refactor could reverse don't need one.
     Changes to the revocation-state machine, the Principle 6 type boundary, or the
     gate/evidence separation almost always need one. -->

- Decision record link:

## Boundary Questions  <!-- Critical — protected surfaces only -->
<!-- Does this change what any party can SEE, FORGE, REPLAY, or DENY?
     "No change" is a fine answer. A blank is not.
     For agent-class model changes: also answer — does this widen what an
     AgentContact can do? Does it narrow or remove a Principle 6 constraint? -->

- See:
- Forge:
- Replay:
- Deny:

## Deletion Justification  <!-- Critical — only if code is removed -->
<!-- Why did the removed code exist? If the answer is "nobody knows," that's a
     documentation gap to log under §7 of the framework — not permission to delete. -->



## Verification Chain  <!-- Critical — bug fixes only -->
<!-- "Fixed the bug" is not evidence. Show the trail. -->

- Symptom (precise):
- Root cause (confirmed, not guessed):
- How it was confirmed (hypothesis → minimal test → result):

---

## Review  <!-- completed by the reviewer, not the author -->

- **Tier declaration matches the diff:** <!-- yes | disputed → resolves upward -->
- **Reviewed outside the authoring context via:** <!-- maintainer review | separate session vs. spec (solo) -->
- **Automated checks (lint, tsc, npm test — all 131 tests green):** <!-- green | bypass declared above with reason -->
- **No Unverified tags on protected surfaces:** <!-- confirmed | n/a -->

**Reviewer scope** <!-- required on Feature+ at this scale -->
- Approved (what I evaluated):
- Not evaluated (outside my domain):

**Block note** <!-- anyone may block any PR; overriding a block requires written justification here -->

---
<!-- Before merging:
     · Rebased across a package.json change? Confirmed tags on stack-dependent claims are stale — re-verify.
     · PR open past 14 days? Re-verify Confirmed tags; don't just rebase.
     · Agent-class changes: confirm recordSpeechAuthority?: never is untouched on AgentContact,
       or that any change to it has passed the full Principle 6 boundary-questions block above. -->
