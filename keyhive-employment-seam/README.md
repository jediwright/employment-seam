# employment-seam

**Pattern Commons #7 of the [Local-First Prototype Series](https://github.com/jediwright/local-first-series).** The architectural specification and reference implementation for the employment seam — the boundary event when a person enters or exits an employer–worker relationship.

> The worker owns the knowledge graph. The platform facilitates the handoff and exits.

## What This Is

The employment seam is the moment a working relationship ends. The architectural argument: knowledge artifacts should be written to a durable store the worker owns *before* the seam fires, with the platform facilitating the handoff and then exiting the relationship rather than accumulating it.

This repository documents and implements Pattern Commons #7 (v0.5). The specification is maintained in [`pattern-commons-07-employment-seam-v0-5_2026-08-08.md`](https://github.com/jediwright/local-first-series) (local-first-series). The working reference implementation lives in [`keyhive-employment-seam/`](https://github.com/jediwright/employment-seam/tree/main/keyhive-employment-seam) and demonstrates the claim in running code. The prototype uses [Automerge](https://automerge.org/) with [Keyhive](https://github.com/inkandswitch/keyhive) for cryptographic access control: the relay is structurally prevented from reading bundle contents, not just instructed not to.

## What the Spec Defines

The specification accommodates W-2 employment, contractor and sub-contractor arrangements, return-employee re-engagement, and mass-event separations (WARN Act, EU Collective Redundancies Directive, bankruptcy, acquisition). It defines:

- A nine-state failure taxonomy
- A seven-class participant model with sub-classes, plus agent-class contacts (Class G) as a first-class participant type
- Multi-perspective record preservation in contested cases
- A legal record format designed for evidentiary use across jurisdictions

It is the first Pattern Commons entry where all four layers of the [Seam Stack](https://www.systemsofthought.com/seam-stack/) — substrate, governance, boundary, evidence — become necessary at once.

## What the Prototype Demonstrates

- A worker maintains a cryptographically-governed knowledge graph across an employment relationship
- Contacts (human and agent-class) are granted and revoked capabilities through an explicit, logged ceremony
- The seam fires at a worker-initiated moment: all active capabilities revoke, project status advances to `handed-off`, and the access log records the full governance trail
- An `assertCapabilityCurrent()` gate enforces that any automated actor must verify capability state per invocation — never from a cached token or TTL — before acting on a worker's behalf; every invocation produces a `seam:gateCheckRecord` evidence artifact with the agent DID, grant reference, capability name, timestamp, and gate result
- Agent-class contacts (`seam:identityClass: Agent`) are structurally grantee-only: the type system makes attestation and account-submission authority unavailable to them, not merely unrendered in the UI (Principle 6: agents are governed parties, never authors of record)
- Revocation follows a two-state model — `revoked-local` (seam fired, signal propagating) and `revoked-confirmed` (acknowledgment received) — so the gate can distinguish an unconfirmed revocation signal from a confirmed one and record the distinction in the access log

## The Larger Argument

This prototype is the architectural demonstration for [*Full Personhood: The Governance Model AI Requires and Capitalism Never Built*](https://docs.google.com/document/d/1YvAFV_llrODhu6rViG8LXU1q1U1DVqTTIHBPLA4Qtdo/edit?usp=sharing) — a governance essay and manifesto developed on [Systems of Thought](https://www.systemsofthought.com/about/). The essay argues that the 140-year structural asymmetry between corporate personhood and worker personhood requires an architectural response, not just a legal one, and that the [Seam Stack](https://www.systemsofthought.com/seam-stack/) provides that model: substrate the participant owns, governance they control, boundary events with legal weight, and an evidence layer built for contested exits.

The employment seam is where all four Seam Stack layers become necessary at once.

## What This Pattern Does Not Solve

- It does not prevent the cost of being let go. It changes the recoverability of what comes next.
- It does not override the legal substrate in hostile exits.
- It does not solve the recruiting problem. The structural condition that produces lengthy recruitment cycles is upstream of what the pattern addresses.
- It does not guarantee the receiving party reads the bundle.
- It does not adjudicate. The platform records faithfully; courts, arbitrators, and administrative tribunals decide.

## How This Sits in the Series

The local-first prototype series demonstrates the seam argument across built domains: governance monitoring, commerce, healthcare, and social networking. The employment seam is Pattern Commons #7 — the case where the legal substrate is part of the architecture rather than a wrapper around it, and where the inversion becomes load-bearing.

---

MIT License · Built with AI-collaborative methods · Intellectual direction and authorial responsibility: Jedi Wright | [Systems of Thought](https://www.systemsofthought.com/) | UX Minds, LLC
