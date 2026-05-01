# employment-seam

**Pattern Commons #7 of the [Local-First Prototype Series](https://github.com/jediwright/local-first-series).** A published architectural specification for the employment seam — the boundary event when a person enters or exits an employer–worker relationship.

> The worker owns the knowledge graph. The platform facilitates the handoff and exits.

## Status

**Spec-only.** This is the first entry in the Pattern Commons series specified without a reference implementation. The spec is at v0.4.1 and is internally coherent, externally citable, and complete enough to build against. Whether a reference implementation gets built — and whether the contractor case is the first one — is an open question.

The spec proper is forthcoming in this repo. The v0.4.1 specification will be available as a working artifact under [Systems of Thought](https://www.systemsofthought.com/) by 5.1.26 EOD EDT. This README will be updated when the spec, vocabulary, and schemas land in their canonical locations.

## What This Pattern Is

The employment seam is the boundary event that fires when a person enters or exits an employer–worker relationship. The architectural argument is that knowledge artifacts should be written to a durable substrate the worker owns *before* the seam fires, with the platform facilitating the handoff and exiting the relationship rather than accumulating it.

The pattern accommodates W-2 employment, contractor and sub-contractor arrangements, return-employee re-engagement, and mass-event separations (WARN Act, EU Collective Redundancies Directive, bankruptcy, acquisition). It defines a nine-state failure taxonomy, a seven-class participant model with sub-classes, multi-perspective record preservation in contested cases, and a legal record format designed for evidentiary use across jurisdictions.

It is the first Pattern Commons entry where all four layers of the [Seam Stack](https://github.com/jediwright/local-first-series) — substrate, governance, boundary, evidence — become necessary at once.

## What This Pattern Does Not Solve

- It does not prevent the cost of being let go. It changes the recoverability of what comes next.
- It does not override the legal substrate in hostile exits.
- It does not solve the recruiting problem. The structural condition that produces lengthy recruitment cycles is upstream of what the pattern addresses.
- It is not a guarantee that the receiving party reads the bundle.
- It does not adjudicate. The platform records faithfully; courts, arbitrators, and administrative tribunals decide.

## How This Sits Relative to the Series

The local-first prototype series demonstrates the seam argument across four built domains: governance monitoring (no seam), commerce (one seam per transaction), healthcare (one seam per intake), and social networking (a seam per connection, distributed). The employment seam is the seventh Pattern Commons entry and the first specified without a corresponding prototype.

The Seam Stack synthesis — the four-layer architectural composition the series demonstrates — will be documented at [seamstack.org](https://seamstack.org) and in the [local-first-series](https://github.com/jediwright/local-first-series) repo by 5.3.26 EOD EDT.

## What's Coming

- The v0.4.1 specification as a versioned artifact in this repo
- Cross-references to the SHACL shapes, JSON-LD context, and JSON Schema fallback validator (which live in [local-first-series/schemas/](https://github.com/jediwright/local-first-series))
- Cross-references to the vocabulary (which lives in [local-first-series/vocab/](https://github.com/jediwright/local-first-series) and resolves at `seamstack.org/vocab/employment-seam/0.4.1#`)
- Open questions and changelog

## Contributing

Issues are welcome for spec-level discussion. Pull requests on prose are not currently accepted without prior discussion via issue. The spec is the canonical artifact; this repo is its home.

---

MIT License · Built with AI-collaborative methods · Intellectual direction and authorial responsibility: Jedi Wright | [Systems of Thought](https://www.systemsofthought.com/) | UX Minds, LLC
