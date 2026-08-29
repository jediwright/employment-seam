# substrate-crossing conventions

**Version:** v0.1
**Date:** 2026-08-29
**Supersedes:** none — first issue
**Read first.** Every session that touches `substrate-crossing/` reads this
file before reading code. Conventions land here at the session that
establishes them, never later. Where a line describes something decided but
not yet implemented, it says so; the code at the commit named in the
`Decisions in force` section is the reference for everything else.

Sources of truth as of this version: `src/crossing-intent.ts`,
`src/crossing-completion.ts`, `src/crossing-fire.ts`, `src/digest.ts`,
`src/seam-crossing-ref.ts`, `src/observation-log.ts`,
`scripts/run-crossing.ts`, `docs/observation-log-pc08.md`.

---

## Records

**crossing-intent** (`src/crossing-intent.ts`, `CrossingIntentRecord`).
Twenty-one fields, all required, none nullable or empty:
`recordType='crossing-intent'`, `governanceEvent='substrate-crossing'`,
`boundType='exposure-unbounded'`, `grantorDID`, `targetDID`,
`identityCustodyClass` (`self-custodied | mixed-custody | provider-custodied`),
`sourceDocumentURI`, `sourceDocumentCID`, `authorizedContentDigest`,
`targetLexicon='com.whtwnd.blog.entry'`, `targetPDS`,
`crossingType='publication'`, `regimeAcknowledgment`,
`declaredBoundType='exposure-unbounded'`, `recallSemantics='propagated-request'`,
`crossingTimeoutHorizon` (ISO), `lineageAnchorType='author-declared'`,
`emittedAt` (ISO), `grantReference`, `gateResult='pass'`, `gateCheckedAt` (ISO).
Fixed-literal values are enforced by `validateCrossingIntentRecord()`; an
invalid record is never written (the seam throws).

- `sourceDocumentCID` is the comma-joined Automerge heads at mint, or the
  literal `heads-unavailable`.
- `grantReference` is `keyhive:<individual-id-hex>:read` as minted by the
  runner; the seam does not parse it.
- `sourceDocumentURI` and `sourceDocumentCID` are singular and remain so.
  **Decided, not implemented (D-5):** for a crossing assembled from more
  than one governed document, both fields name the assembly document (see
  Gate). The intent record gains `sourceLineage`: an ordered list of
  `{ documentURI, documentCID, contentDigest }`, one entry per granted input
  document, in the fixed aggregation order. Required from Run 6. Lineage
  digests are informational; the binding digest is `authorizedContentDigest`
  over the assembly document's content object (D-3).
- `regimeAcknowledgment` is checked for presence, not authorship.
- Intent records live in the document's `crossingRecords` array and are
  identified by `emittedAt` for read-back confirmation.
- **Decided, not implemented (D-2):** `crossingGrantHorizon` (ISO) joins this
  record as an optional not-before horizon. See Gate.

**crossing-completion** (`src/crossing-completion.ts`,
`CrossingCompletionRecord`). Eleven fields; `relayIngestedAt` is the only
optional one: `recordType='crossing-completion'`,
`governanceEvent='substrate-crossing'`, `boundType='exposure-unbounded'`,
`crossingIntentRef`, `chainDepth=1`, `lineageAnchorType='author-declared'`,
`crossingTargetURI` (AT-URI), `crossingTargetCID` (PDS-returned CID),
`completedAt` (ISO), `pdsAcceptedAt` (ISO), `relayIngestedAt?` (ISO),
`crossingOutcome='completed'`.

- `crossingIntentRef` is `intent-sha256:<hex>`: SHA-256 over the intent
  record's canonical JSON — object keys sorted, `undefined` members dropped,
  no whitespace (`canonicalJson()` in `crossing-completion.ts`). Recomputable
  by any party holding the document; a mutated intent no longer matches.
- Completion records live in `completionRecords`, a separate array; the
  intent array is never edited.
- Mint-once: the completion hook throws on a second write.
- `completedAt`, the `completion-record-written` log event, and the hook mark
  are one clock read — the single closing anchor for
  `intent_without_completion_window_ms`.

**seamCrossingRef** (`src/seam-crossing-ref.ts`). Four fields carried on the
published `com.whtwnd.blog.entry` record: `sourceDocumentURI`,
`sourceDocumentCID`, `crossingIntentRef`, `authorizedContentDigest`. Derived
at fire time from the minted intent, so the payload cannot disagree with it.
Observed fate: survives PDS storage (`getRecord()` returns it intact),
present in the raw Jetstream commit payload, dropped at WhiteWind AppView
render (Runs 4 and 5).

**A blocked gate never mints a record.** A blocked access check, an expired
or unmet horizon at mint, or (once implemented) a digest mismatch, produces
no intent record. A failed or unaccepted publish produces no completion
record; the intent stays document-resident and the document reads
`crossing-intent-pending` → `crossing-unconfirmed` at horizon elapse
(`deriveDocumentCrossingState()`, no external lookup).

---

## Digest

`authorizedContentDigest` is SHA-256 (hex, no prefix) over
`JSON.stringify([title, content, createdAt])` — fixed field order, no
whitespace, absent `createdAt` serialized as `null`.

- Two implementations exist with byte-identical output:
  `crossing-intent.ts#computeAuthorizedContentDigest` (the one
  `initiateCrossing()` calls) and `digest.ts#authorizedContentDigest` (the
  documented one). `digest.ts` is canonical; the other is retained for
  compatibility. Do not add a third.
- The digest binds the content object, not the `putRecord()` payload.
  `$type`, `visibility`, and `seamCrossingRef` are added after the digest and
  are outside it.
- At this version the digest is minted into the intent record and verified
  after the fact (`verifySeamCrossingRefAgainstIntent`); nothing compares a
  presented payload against an authorized digest before mint.
- The digest binds the assembled output for later verification by any party
  holding the intent record and the published record. It does not constrain
  a crossing actor who controls the seam: confidentiality is enforced at the
  capability layer (D-1); the digest is evidence, not enforcement, against
  the actor itself.

**Decided, not implemented:**

- **Subset publication (D-1).** A document is never partly authorized.
  Sections that may carry different authorizations are separate
  Keyhive-protected documents. The crossing actor is granted read only on
  documents whose whole content is authorized to cross; unauthorized
  sections are separate documents with no grant to the actor and are not
  decryptable by it. The seam assembles the crossing content from the
  granted documents and computes the digest over the assembled output
  (the D-3 rule). Subset confinement on this stack is a capability-layer
  property achieved by document decomposition; the seam's digest binds the
  assembled output.
- **Aggregation digest (D-3).** For content derived from more than one
  source document, the digest binds the aggregate output. Aggregation is
  deterministic: fixed input order, canonical serialization, no timestamp
  or random injection; the same inputs always yield the same bytes. Input
  digests may be carried as a lineage list on the intent record; they are
  not the binding digest.
- **Digest check at the gate (D-1, D-3).** The digest of the content
  presented for crossing is compared against the digest of the assembled
  authorized output before mint. Mismatch blocks; no intent record. The
  comparison is a hash comparison, never a length or field-presence
  comparison.

---

## Gate

Order at this version (`initiateCrossing()`):

1. Access check via the injected `GateCheckFn` (zero-argument at this
   version). Blocked → stop, no record.
2. `crossingTimeoutHorizon` must be in the future at mint. Expired → stop,
   no record (a record born expired would be born dead).
3. Mint the intent; validate; write to the document.
4. Read the document back; confirm the record is present. Not found → throw.
5. Re-check `crossingTimeoutHorizon` at fire. Expired → do not fire; intent
   remains; document reads `crossing-unconfirmed` at elapse.
6. Fire `putRecord(intent)`.
7. On accepted publish, write the completion (separate call, same
   discipline: guard → mint → write → hook → read-back).

Every step stamps an ordered `CrossingLogEntry`; log order is the evidence
of write-before-fire. Timestamps are ISO 8601 with milliseconds, UTC.

**Decided, not implemented:**

- **Grant boundary (D-1).** The grant boundary equals the publish boundary.
  No principal other than the author holds read on a document containing
  content not authorized to cross. A crossing actor's read grants name
  exactly the documents whose whole content may be published.
- **Access level (D-4).** The gate passes on `access.isReader` (read or
  higher), not on `access !== undefined`. A relay-level grant does not
  pass. `grantReference` should name the level actually held.
- **Not-before horizon (D-2).** When `crossingGrantHorizon` is present on the
  crossing request, the gate blocks any attempt before it, at mint, with no
  record minted. Checked from the system clock, evaluated fresh on every
  attempt, never cached. `crossingGrantHorizon` (earliest authorized) and
  `crossingTimeoutHorizon` (latest, after which an unconfirmed crossing
  hardens) are both carried on the intent record; they differ in meaning,
  not in host object.
- **Assembly document (D-5).** Before step 3, the seam writes the assembled
  output to its own Keyhive-protected document, the assembly document. The
  crossing actor holds edit on it and read on the input documents; the
  author is granted read on it. The assembly document hosts the crossing's
  `crossingRecords` and `completionRecords`; input documents receive no
  crossing records. It is the single `sourceDocumentURI` /
  `sourceDocumentCID` and the object `seamCrossingRef` points at. Its content
  object's `createdAt` is the maximum `createdAt` across inputs in fixed
  order, or `null` if none; never the assembly clock.
- **Grant lifetime (D-1 consequence).** A read grant on a content document
  authorizes that document's future state, not one crossing. A document
  authorized to cross is not edited with unauthorized content unless the
  grant is revoked first.
- **Digest check** — see Digest.

Every gate decision is re-evaluated on every attempt. A prior pass, block,
or mismatch carries no state into the next attempt.

---

## Observation log

`docs/observation-log-pc08.md`. One block per crossing run; append-only; prior
entries are never edited. The runner writes each entry to its own file under
`docs/` (`run-N-entry_<date>.md`) and the block is pasted into the log by
hand.

Entry format:

```
crossing_run:        <integer (1, 2, 3, ...)>
scenario:            <baseline | failed | delayed-release | public-subset | aggregated>
intent_emitted_at:   <ISO timestamp>
putrecord_called_at: <ISO timestamp>
pds_accepted_at:     <ISO timestamp (from PDS response)>
relay_ingested_at:   <ISO timestamp (from firehose event; null if not yet observed)>
completion_written_at: <ISO timestamp (null if failed)>
crossing_outcome:    <completed | failed | timeout>
pds_accept_latency_ms: <integer>
relay_ingest_gap_ms: <integer (null if relay_ingested_at is null)>
intent_without_completion_window_ms: <integer (null if completion immediate)>
kl1_legibility_observation: <free text; what a deferred party would see>
kl2_back_pointer_observation: <free text; seamCrossingRef fate>
phase3_pattern:      <public-subset | delayed-release | aggregated>
phase3_gate_observation: <free text; what the gate did — pass / block / reason>
phase3_finding:      <free text; any architectural observation not captured above>
```

- The three `phase3_*` fields are required from Run 6 onward and optional
  for Runs 1–5; prior entries remain valid without them.
  **Decided, not implemented:** `H3Entry` in `src/observation-log.ts` and
  the runner's entry writer do not yet carry the three `phase3_*` fields
  (verified at `86c7d03`); they are added in the Run 6 build session. Until
  then the fields are filled by hand in the pasted block.
- Scenario vocabulary is closed: the five values above plus `chained-pc9-pc8`
  if the chained supplemental run is taken.
- Run numbering: Run 0 is the connectivity probe and is excluded from
  acceptance-criteria counts. Check the log's tail before choosing `--run N`.
- `null` means applicable but unobserved. `n/a` means structurally
  inapplicable (e.g. no intent record exists for the run). They are not
  interchangeable.
- For a blocked attempt, the block event and its timestamp are logged before
  any intent-record timestamp; a block that appears after an intent
  timestamp is a discipline violation, not a passing negative case.

**Evidence targets — do not delete.** Run 2 (`3mteosxkzms27`), Run 4
(`3mtevg2odx424`), Run 5 (`3mtf65fcgvf2s`) in the operator's bsky.social
repo. Records published by governed crossings are retained as evidence,
never deleted, never retrofitted.

---

## Environment

- Relay: `wss://jetstream1.us-east.bsky.network/subscribe` pinned as the
  runner default (`DEFAULT_JETSTREAM`); overridable by `JETSTREAM_ENDPOINT`.
  `check-pds.ts` still defaults to jetstream2 — known divergence.
- `wantedCollections` server-side filtering does not deliver
  `com.whtwnd.blog.entry` commits. Subscriptions are unfiltered with
  client-side DID + collection matching. The subscription is opened before
  the publish fires.
- `@automerge/automerge-repo-keyhive@0.5.0-alpha.1`, exact, vendored in
  `vendor/`. Its Keyhive dependency is `@keyhive/keyhive@0.1.0-alpha.6`.
- Keyhive capabilities are document-granular. `Access` is a four-level total
  order — relay (0), read (1), edit (2), admin (3) — with `isReader`,
  `isEditor`, `atLeast()`, `compareTo()`, `level`. It carries no data fields.
  There is no sub-document scoping and no place on a grant for a horizon.
- Runs are operator-executed against live network; the authoring
  environment has no network access to the PDS or relay.
- Scripts: `check:pds`, `run:crossing`, `verify:firehose`, `verify:cid`,
  `baseline:0-3`, `test`.

---

## Decisions in force

Reference commit for "as implemented" statements above: `86c7d03`.

| Decision | File | One line |
|---|---|---|
| D-1 grant scoping | `D-1_grant-scoping_2026-08-28-r2.md` | Per-section documents; the crossing actor holds read only on documents whose whole content is authorized to cross; the seam binds the assembled output by digest. Grant boundary = publish boundary. |
| D-2 grant-horizon placement | `D-2_grant-horizon-placement_2026-08-28.md` | `crossingGrantHorizon` lives on the intent record beside `crossingTimeoutHorizon` as a not-before horizon. |
| D-3 aggregation digest boundary | `D-3_aggregation-digest-boundary_2026-08-28.md` | Digest binds the aggregate output; aggregation is deterministic; input digests are lineage, not binding. D-3's "Run 8" scheduling of the singular-source question is superseded by D-1 r2 / D-5. |
| D-4 gate access level | `D-4_gate-access-level_2026-08-28.md` | Gate checks `isReader`, not presence. |
| D-5 multi-source representation | `D-5_multi-source-representation-and-SL0184-disposition_2026-08-29.md` | Assembled output is written to an assembly document, the single source; inputs carried as `sourceLineage` on the intent record; crossing records hosted on the assembly document. |

Decision files are kept with the project's working records; each is the head
of its supersede chain until a later file names it.
