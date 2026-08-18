# employment-seam

Pattern Commons #7 of the [Local-First Prototype Series](https://github.com/jediwright/local-first-series). The architectural specification and reference implementation for the employment seam — the boundary event that fires whenever the legal, evidentiary, or relational status of a working relationship changes state: at hire, engagement start, role change, project handoff, and exit.

> The worker owns the knowledge graph. The platform facilitates the boundary crossing and exits.

---

## What This Is

The employment seam fires at any governed transition in a working relationship — not only at exit. A net new hire joining a company, a freelancer starting an engagement, a gig worker accepting a platform assignment, a contractor moving from SOW to SOW, a full-time employee changing classification, a returning worker re-engaging after a prior separation: each is a boundary event where the legal, evidentiary, and relational status of the relationship changes state. The architectural argument is that knowledge artifacts should be written to a durable substrate the worker owns *before* the seam fires, with the platform facilitating the boundary crossing and exiting the relationship rather than accumulating it.

This repository documents and implements Pattern Commons #7 (v0.5). The specification is maintained separately in the [local-first-series](https://github.com/jediwright/local-first-series) repo. The working reference implementation lives in `keyhive-employment-seam/` and demonstrates the claim in running code. The prototype uses Automerge with Keyhive for cryptographic access control: the relay is structurally prevented from reading bundle contents, not just instructed not to.

---

## What the Spec Defines

The specification accommodates W-2 employment, contractor and sub-contractor arrangements, freelance and gig-economy engagements, net new hire onboarding, return-employee re-engagement, and mass-event separations (WARN Act, EU Collective Redundancies Directive, bankruptcy, acquisition). It defines:

- A nine-state failure taxonomy
- An eight-class participant model with sub-classes (Classes A through G, with B′ as a named client-party variant), including agent-class contacts (Class G) as a first-class participant type
- Multi-perspective record preservation in contested cases
- A legal record format designed for evidentiary use across jurisdictions

It is the first Pattern Commons entry where all four layers of the [Seam Stack](https://github.com/jediwright/seam-stack) — substrate, governance, boundary, evidence — become necessary at once.

---

## What the Prototype Demonstrates

- A worker maintains a cryptographically-governed knowledge graph across an employment relationship
- Contacts (human and agent-class) are granted and revoked capabilities through an explicit, logged ceremony
- The seam fires at a worker-initiated moment: all active capabilities revoke, project status advances to `handed-off`, and the access log records the full governance trail
- An `assertCapabilityCurrent()` gate enforces that any automated actor must verify capability state per invocation — never from a cached token or TTL — before acting on a worker's behalf; every invocation produces a `seam:gateCheckRecord` evidence artifact with the agent DID, grant reference, capability name, timestamp, and gate result
- Agent-class contacts (`seam:identityClass: Agent`) are structurally grantee-only: the type system makes attestation and account-submission authority unavailable to them, not merely unrendered in the UI (Principle 6: agents are governed parties, never authors of record)
- Revocation follows a two-state model — `revoked-local` (seam fired, signal propagating) and `revoked-confirmed` (acknowledgment received) — so the gate can distinguish an unconfirmed revocation signal from a confirmed one and record the distinction in the access log
- A relay seam (Type 2) demonstrates that composition rules CR-1 through CR-5 hold across chained crossings: a relay party can hold an inner seam with a worker while the outer seam with the hiring organization remains governed independently, with no shared finality authority
- The `seam:CrossingRecord` base shape provides a unified, chain-aware schema that all governed-event record types instantiate: gate-check records, lineage records, AI-provenance records, and code-change verification records compose uniformly against a single auditable structure
- A P13 evidence plane implements multi-party governance record types — `SeamTermAmendmentRecord`, `ObjectionRecord`, `ConsentRecord`, `ResolutionRecord` — all finality-arbiter-free: consent is derived from the record set, not from a coordinator; amendment status is a pure derivation, never stored in any record

## Pattern Commons #8 — Substrate-Crossing Seam (prototype, Phase 0)

`substrate-crossing/` is a sub-package prototype for Pattern Commons #8:
the governed crossing from a local-first Automerge/Keyhive substrate into
AT Protocol (bsky.social). It tests the KL-1 and KL-2 claims from the
[PC#8 spec](https://github.com/jediwright/local-first-series) — that a
governed crossing with an honest declared bound is legible to a deferred
party and that the completion record's CID anchor is stable and
verifiable. Phase 1 complete (Items 1.1–1.4: crossing-intent record, instrumented putRecord, crossing-completion record, seamCrossingRef back-pointer); observation log through Run 4; KL-1/KL-2 closing-evidence artifact issued (SL-0120); Phase 2 open.

**Implementation status:** 191/191 tests passing (164 base + 27 P13 D2-C2 threshold/quorum). Items 1.1 and 1.2 — degraded-sync behavior and two-state revocation — are implemented in simulation (`degradedSync.test.ts`, 8/8 passing); the live-relay observation leg (DevTools throttling against the Subduction relay) ran 2026-08-16 across all three profiles (3G, Offline, Intermittent); findings in `phase1-degraded-sync-observations.md`. The substrate-crossing/ sub-package (PC#8) runs a separate suite: 27/27 passing (Items 1.1–1.4); Phase 1 complete.

See `keyhive-employment-seam/README.md` for run instructions.

Build tracker: [employment-seam build tracker](https://github.com/users/jediwright/projects/1)

---

## The Larger Argument

This prototype is the architectural demonstration for *[Full Personhood: The Governance Model AI Requires and Capitalism Never Built](https://www.systemsofthought.com/full-personhood/)* — a governance essay developed on Systems of Thought. The essay argues that the 140-year structural asymmetry between corporate personhood and worker personhood requires an architectural response, not just a legal one, and that the Seam Stack provides that model: substrate the participant owns, governance they control, boundary events with legal weight, and an evidence layer built for contested exits.

The employment seam is where all four Seam Stack layers become necessary at once.

The employment seam is also the first governed seam of a wider scope:
person-side infrastructure for the records a whole life produces, with
cross-domain composition — not additional verticals — as the near-term
direction. Roadmap at
[seam-stack](https://github.com/jediwright/seam-stack).

---

## What This Pattern Does Not Solve

- It does not prevent the cost of being let go. It changes the recoverability of what comes next.
- It does not override the legal substrate in hostile exits.
- It does not solve the recruiting problem. The structural condition that produces lengthy recruitment cycles is upstream of what the pattern addresses.
- It does not guarantee the receiving party reads the bundle.
- It does not adjudicate. The platform records faithfully; courts, arbitrators, and administrative tribunals decide.

---

## How This Sits in the Series

The local-first prototype series demonstrates the seam argument across built domains: governance monitoring, commerce, healthcare, and social networking. The employment seam is Pattern Commons #7 — the case where the legal substrate is part of the architecture rather than a wrapper around it, where the seam fires at entry as much as at exit, and where the inversion becomes load-bearing.

---

MIT License · Built with AI-collaborative methods · Intellectual direction and authorial responsibility: Jedi Wright | [Systems of Thought](https://www.systemsofthought.com/) | UX Minds, LLC
