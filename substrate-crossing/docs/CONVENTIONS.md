# substrate-crossing conventions

**Version:** v0.2
**Date:** 2026-08-30
**Supersedes:** v0.1 (2026-08-29, at `b075038`)
**Read first.** Every session that touches `substrate-crossing/` reads this
file before reading code. Conventions land here at the session that
establishes them, never later. Where a line describes something decided but
not yet implemented, it says so; the code at the commit named in the
`Decisions in force` section is the reference for everything else.

Sources of truth as of this version: `src/crossing-intent.ts`,
`src/crossing-completion.ts`, `src/crossing-fire.ts`, `src/digest.ts`,
`src/canonical-json.ts`, `src/assembly.ts`, `src/seam-crossing-ref.ts`,
`src/observation-log.ts`, `scripts/run-crossing.ts`,
`test/item-3-1-public-subset.test.ts`,
`test/spike/spike-3-1b-encrypted-transport.test.ts`,
`docs/observation-log-pc08.md`.

**What changed v0.1 → v0.2.** Run 6 (Item 3.1, public-subset crossing) ran
on 2026-08-29 local / 2026-08-30 UTC on the encrypted transport and the
operator confirmed AC-3.1.1–3.1.5. Everything v0.1 marked *decided, not
implemented* under D-1, D-3, D-4, D-5 is now as-implemented and is described
here as shipped. D-2 (`crossingGrantHorizon`) remains decided, not
implemented — Item 3.2. D-6 r1 (transport scope of D-1) is in force. New
sections: transport, the assembly rule, multi-input `grantReference`, leg
order, the un-granted probe, storage-scan decoding, observation-log
paste hygiene, the AppView observability note, and the CLI pathspec rule.

---

## Records

**crossing-intent** (`src/crossing-intent.ts`, `CrossingIntentRecord`).
Twenty-two fields, all required, none nullable or empty:
`recordType='crossing-intent'`, `governanceEvent='substrate-crossing'`,
`boundType='exposure-unbounded'`, `grantorDID`, `targetDID`,
`identityCustodyClass` (`self-custodied | mixed-custody | provider-custodied`),
`sourceDocumentURI`, `sourceDocumentCID`, `sourceLineage`,
`authorizedContentDigest`, `targetLexicon='com.whtwnd.blog.entry'`,
`targetPDS`, `crossingType='publication'`, `regimeAcknowledgment`,
`declaredBoundType='exposure-unbounded'`, `recallSemantics='propagated-request'`,
`crossingTimeoutHorizon` (ISO), `lineageAnchorType='author-declared'`,
`emittedAt` (ISO), `grantReference`, `gateResult='pass'`, `gateCheckedAt` (ISO).
Fixed-literal values are enforced by `validateCrossingIntentRecord()`; an
invalid record is never written (the seam throws).

- `sourceDocumentURI` and `sourceDocumentCID` are singular and name the
  **assembly document** (D-5). `sourceDocumentCID` is the comma-joined
  Automerge heads of the assembly document at mint, or the literal
  `heads-unavailable`.
- **`sourceLineage`** is an ordered `Array<{ documentURI, documentCID,
  contentDigest }>`, one entry per granted input document, in the fixed
  aggregation order. `validateCrossingIntentRecord()` rejects an empty list
  unconditionally. Lineage digests are informational; the binding digest is
  `authorizedContentDigest` over the assembly document's content object
  (D-3). `documentCID` is the input's heads as read on the actor's repo
  post-grant and therefore includes the granter's membership nudge commit
  (see Environment); this is expected and is not a digest input.
- **Uniform path.** Every crossing, single-source included, goes through an
  assembly document and carries a non-empty `sourceLineage`. There is no
  direct single-document path; `initiateCrossing()` has one code path. Runs
  1–5 evidence was minted under the singular shape and is never retrofitted.
- `grantReference` is `keyhive:<individual-id-hex>:<level>` where `<level>`
  is the access level actually held, read from `Access.toString()` — never
  hard-coded (D-4). On a multi-input crossing it names the **first input's**
  grant (ruling R-B, brief v0.1.3 §8, operator-confirmed 2026-08-29); the
  per-input levels are all `isReader`-or-better by construction of the gate.
  The seam does not parse it.
- `regimeAcknowledgment` is checked for presence, not authorship.
- Intent records live in the assembly document's `crossingRecords` array
  and are identified by `emittedAt` for read-back confirmation. Input
  documents receive no crossing records.
- **Decided, not implemented (D-2):** `crossingGrantHorizon` (ISO) joins this
  record as an optional not-before horizon. Item 3.2. See Gate.

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
  no whitespace (`canonicalJson()` in `src/canonical-json.ts`; the copy in
  `crossing-completion.ts` delegates to it). Recomputable by any party
  holding the assembly document; a mutated intent no longer matches.
- Completion records live in the assembly document's `completionRecords`,
  a separate array; the intent array is never edited.
- Mint-once: the completion hook throws on a second write.
- `completedAt`, the `completion-record-written` log event, and the hook mark
  are one clock read — the single closing anchor for
  `intent_without_completion_window_ms`.

**seamCrossingRef** (`src/seam-crossing-ref.ts`). Four fields carried on the
published `com.whtwnd.blog.entry` record: `sourceDocumentURI`,
`sourceDocumentCID`, `crossingIntentRef`, `authorizedContentDigest`. Derived
at fire time from the minted intent, so the payload cannot disagree with it.
It points at the assembly document, not at any input; `sourceLineage` is
not carried on the published record. Observed fate, unchanged Runs 4–6:
survives PDS storage (`getRecord()` returns it intact), present in the raw
Jetstream commit payload, dropped at WhiteWind AppView render as an unknown
field.

**A blocked gate never mints a record — or an assembly document.** A blocked
access check, a digest mismatch, or an expired or unmet horizon at mint,
produces no assembly document write and no intent record. A failed or
unaccepted publish produces no completion record; the intent stays
document-resident and the assembly document reads
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
  compatibility. Do not add a third. Per-input lineage digests are computed
  with `digest.ts`.
- The digest binds the **assembled** content object, not the `putRecord()`
  payload. `$type`, `visibility`, and `seamCrossingRef` are added after the
  digest and are outside it.
- **Digest check at the gate (D-1, D-3) — as implemented.** Before any
  write, the digest of the content presented for crossing
  (`presentedContent` on `initiateCrossing()`, ruling 4) is compared by hash
  equality — never by length or field presence — against the digest of the
  assembled authorized output. Mismatch blocks: no assembly document, no
  intent record. Run 6 adversarial leg: foreign bytes appended to the
  assembled `content` between assembly and check → `digest-check-blocked`
  on hash inequality, `assembly document untouched=true`.
- **Step-4 recompute.** After the assembly document is written, the digest
  is recomputed over the document's content object and must equal the gate
  value; inequality is a seam fault (thrown), not a gate block. Run 6:
  equal, with the membership nudge commit present on both inputs — the
  nudge field never enters the content object.
- The digest binds the assembled output for later verification by any party
  holding the intent record and the published record. It does not constrain
  a crossing actor who controls the seam: confidentiality is enforced at the
  capability layer (D-1); the digest is evidence, not enforcement, against
  the actor itself. Fire-time re-verification of the outgoing payload
  against the minted digest (TOCTOU between mint and fire) is Item 3.3's
  scope, not implemented at this version.

**Subset publication (D-1) — as implemented.** A document is never partly
authorized. Sections that may carry different authorizations are separate
Keyhive-protected documents. The crossing actor is granted read only on
documents whose whole content is authorized to cross; unauthorized sections
are separate documents with no grant to the actor and, on the encrypted
transport, are not decryptable by it (D-6 r1; see Environment). The seam
assembles the crossing content from the granted documents and computes the
digest over the assembled output. Subset confinement on this stack is a
capability-layer property achieved by document decomposition; the seam's
digest binds the assembled output.

**Aggregation digest (D-3) — as implemented.** For content derived from more
than one source document, the digest binds the aggregate output. Aggregation
is deterministic: fixed input order, canonical serialization, no timestamp or
random injection; the same inputs always yield the same bytes (tested:
same inputs twice → identical bytes). Input digests are carried as
`sourceLineage`; they are not the binding digest.

---

## Assembly

`src/assembly.ts#assembleCrossingContent` (ruling 3, normative):

- Inputs are taken in the fixed presentation order; the order is part of
  the authorized output.
- `title` is the **first input's** title.
- `content` is the inputs' `content` joined with `\n\n`.
- `createdAt` is the maximum `createdAt` across inputs in fixed order, or
  `null` if none carries one; **never the assembly clock** (D-5).
- Serialization is `canonicalJson()`; a per-input lineage digest is computed
  via `digest.ts` and carried on `sourceLineage`.
- The assembled content object is exactly `{ title, content, createdAt }`.
  Transport residue on the inputs (the membership nudge field) is not
  copied and is outside the digest.

Two consequences are observable from the public surface (Finding 9): the
AppView renders the first input's title, and the displayed date is the
content `createdAt` (Run 6: 01:27:43.680Z), not the publish time. Both are
seam rules, not AppView behaviour.

---

## Gate

Order as implemented (`initiateCrossing()`, Run 6):

1. **Access check, per input document, on the issuer's hive** (ruling 2 —
   stands, S5 §7.1; the actor's hive also sees its grants on the encrypted
   transport, but the gate is evaluated on the issuer's). `GateCheckFn` is
   per-document: for each input the actor presents, evaluate
   `author.hive.accessForDoc(actorIndividual, documentURI)` and pass only on
   `access.isReader` (D-4). A relay-level or absent grant blocks. The block
   log names the document ID that failed. Blocked → stop; no assembly, no
   assembly document, no record. Inputs are presented **by document ID**;
   an input the actor could not load is still presented and is exercised
   at this step on its ID (see Environment, un-granted probe).
2. **Assemble** in memory from the granted inputs in fixed order (see
   Assembly).
3. **Digest check** — hash equality of presented vs assembled (see Digest).
   Mismatch → stop; nothing written.
4. **Write the assembled output to the assembly document** (D-5); recompute
   the digest over the written content object and require equality with
   step 3 (seam fault on inequality).
5. `crossingTimeoutHorizon` must be in the future at mint. Expired → stop,
   no record (a record born expired would be born dead).
6. Mint the intent into the assembly document's `crossingRecords`;
   validate; write; read back and confirm presence (not found → throw).
7. Re-check `crossingTimeoutHorizon` at fire. Expired → do not fire; intent
   remains; document reads `crossing-unconfirmed` at elapse.
8. Fire `putRecord(intent)`.
9. On accepted publish, write the completion (separate call, same
   discipline: guard → mint → write → hook → read-back).

Every step stamps an ordered `CrossingLogEntry`; log order is the evidence
of write-before-fire and of block-before-any-intent. Timestamps are ISO 8601
with milliseconds, UTC. Run 6 events in order: `gate-check-started`,
`gate-check-pass` (per input) / `gate-check-blocked`, `assembly-completed`,
`digest-check-pass` / `digest-check-blocked`, `assembly-document-written`,
`intent-record-written`, `intent-record-read-confirmed`, `put-record-fired`,
`put-record-accepted`, `completion-record-written`.

**Grant boundary (D-1) — as implemented.** The grant boundary equals the
publish boundary. No principal other than the author holds read on a
document containing content not authorized to cross. A crossing actor's read
grants name exactly the documents whose whole content may be published.

**Access level (D-4) — as implemented.** The gate passes on
`access.isReader`, not on `access !== undefined`. A relay-level grant does
not pass (tested). `grantReference` names the level actually held.

**Assembly document (D-5) — as implemented.** The seam writes the assembled
output to its own Keyhive-protected document, created by the crossing actor
(`accessForDoc(self)=Admin`); the author is granted read on it. It hosts the
crossing's `crossingRecords` and `completionRecords`; input documents
receive none. It is the single `sourceDocumentURI` / `sourceDocumentCID` and
the object `seamCrossingRef` points at. Each leg of a multi-leg invocation
creates its own assembly document; a blocked leg leaves its assembly
document untouched (content never written, records empty). **KL-1 cost,
recorded not disputed:** a deferred party following `sourceDocumentURI`
lands on the actor's assembly document, not the author's content documents;
the author's documents are reachable only via `sourceLineage` and carry no
crossing records.

**Grant lifetime (D-1 consequence).** A read grant on a content document
authorizes that document's future state, not one crossing. A document
authorized to cross is not edited with unauthorized content unless the
grant is revoked first.

**Leg order for multi-leg scenarios (ruling R-A).** Blocking legs run
first: negative → adversarial → positive, three legs in one invocation,
each logging before the next begins. This makes AC-3.1.3's "block event and
timestamp logged before any intent-record timestamp" hold across the whole
invocation, not only within a leg. Run 6: block logged 01:27:52.297Z; first
intent 01:27:52.317Z.

**Negative-leg presentation.** The negative leg presents the un-granted
document to the gate **by ID, unconditionally**, after the bounded
un-granted probe (`probeUngranted()`, see Environment) has recorded its
result. The brief's earlier `loadOnActor(section_c, 5_000)` /
`unloadableInput` wording (Finding 6) describes the same intent; the shipped
runner is the reference.

**Decided, not implemented:**

- **Not-before horizon (D-2).** When `crossingGrantHorizon` is present on the
  crossing request, the gate blocks any attempt before it, at mint, with no
  record minted. Checked from the system clock, evaluated fresh on every
  attempt, never cached. `crossingGrantHorizon` (earliest authorized) and
  `crossingTimeoutHorizon` (latest, after which an unconfirmed crossing
  hardens) are both carried on the intent record; they differ in meaning,
  not in host object. Item 3.2 (KL-12 observation).
- **Fire-time payload re-verification (TOCTOU).** Item 3.3.

Every gate decision is re-evaluated on every attempt. A prior pass, block,
or mismatch carries no state into the next attempt.

---

## Observation log

`docs/observation-log-pc08.md`. One block per crossing run; append-only; prior
entries are never edited. The runner writes each entry to its own file under
`docs/` (`run-N-entry_<UTC date>.md`) and the block is pasted into the log
by hand (delivery-not-application).

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

- The three `phase3_*` fields are required from Run 6 onward
  (`buildH3Entry` enforces) and optional for Runs 1–5; prior entries remain
  valid without them. `H3Entry` and the runner's entry writer carry them as
  of this version.
- `phase3_finding` names any evidence file it relies on **by repo path** so
  the entry and the evidence reference each other (e.g.
  `substrate-crossing/test/spike/spike-3-1b-encrypted-transport.test.ts`).
- Scenario vocabulary is closed: the five values above plus `chained-pc9-pc8`
  if the chained supplemental run is taken. The runner's `--scenario` flag
  accepts the subset it can run (`baseline | failed | public-subset` at this
  version).
- Run numbering: Run 0 is the connectivity probe and is excluded from
  acceptance-criteria counts. Check the log's tail before choosing `--run N`.
- `null` means applicable but unobserved. `n/a` means structurally
  inapplicable. They are not interchangeable.
- For a blocked attempt, the block event and its timestamp are logged before
  any intent-record timestamp; a block that appears after an intent
  timestamp is a discipline violation, not a passing negative case.

**Paste hygiene (Finding 8).** When pasting a runner-emitted block into the
canonical log:

- Strip the runner's machine header (the HTML comment at the top of
  `run-N-entry_<date>.md`). It is never pasted into the canonical log.
- Insert the new block **before** the footer line
  (`*Append-only. Canonical copy: …*`), which stays the last line of the
  file.
- Update the `**Status:**` line in the file header at each paste to name the
  latest run appended.
- Fixes to a paste defect (header leaked, block landed after the footer,
  a field left unfilled) are applied by a content-anchored script, never by
  hand-editing a prior run's fields; the pre- and post-fix sha256 are
  recorded in the session record.

**Operator-notes section.** Observations the runner cannot make (AppView
rendering, operator-side timing, evidence-caveat notes) are appended under a
sibling heading `### Run N — operator notes (<date>)` immediately after the
run's block, as `key: value` lines in the same style (Run 6:
`appview_observation`, `storage_scan_note`). They are part of the append-only
record and are never merged into the machine-emitted block.

**Evidence targets — do not delete.** All governed-crossing records are
published under the Phase 2/3 test account `localboundary.bsky.social`
(`did:plc:4xoefmmbsulm4xns3kbb6mnk`), a repo separate from the operator's
primary handle; nothing has been published under the primary handle. Run 2
(`3mteosxkzms27`), Run 4 (`3mtevg2odx424`), Run 5 (`3mtf65fcgvf2s`), Run 6
(`3mubag4iqdp2q`, CID
`bafyreigiaiypsj3vwgss4yh3arthyqofoxndhwoni7ps74ja5lazlw5gty`). The Run 5
record carries the title "Run 1" on WhiteWind — fixture-title reuse, not
misattribution; the PDS is left alone. Records published by governed
crossings are retained as evidence, never deleted, never retrofitted.

**Runs 1–5 comparability.** Runs 1–5 ran on the legacy transport under the
whole-document publish boundary; no read confinement was claimed and none
was tested. Their storage was never scanned, so the decoded-scan rule below
is not back-propagated to them. Their intent records carry the singular
shape without `sourceLineage`.

---

## Environment

**Transport (F-P3-1, D-6 r1).** From Run 6 the runner and the substrate
test leg use the **encrypted transport**: `initializeAutomergeRepoKeyhive`
with subduction, two hives paired in-process over a `PairNetworkAdapter`
supplied as `repo.subductionAdapters`, `syncServer: 'none'`, no sync
server. On this transport a Keyhive read grant is enforced on sync:
granted documents decrypt on the actor's repo; an un-granted document's
ciphertext transits but never decrypts. The legacy automerge-repo sync
transport used by Runs 1–5 records grants but does **not** enforce them on
sync (SL-0185) and is not used for Phase 3 runs. Unit tests that exercise
seam logic without a substrate stay on the legacy transport.

- The runner fixture sets `shareConfigDebounceMs: 0` so share-config
  changes propagate without delay in the in-process pair.
- Keyhive-protected documents are created with `repo.create2()`, not
  `repo.create()`.
- `@automerge/automerge-repo-keyhive@0.5.0-alpha.1`, exact, vendored in
  `vendor/`; its Keyhive dependency is `@keyhive/keyhive@0.1.0-alpha.6`.
  `@automerge/automerge-subduction` is hard-pinned `0.16.0` (Finding F-7).

**Fixture timing rules (spike D-4, D-5) — not gates.**

- *Membership-visible wait.* An actor-side `find()` on a granted document
  before the actor's hive has learned its membership returns `unavailable`
  in ~25 ms. The runner waits for `actor.hive.accessForDoc(actorSelf, url)`
  to be defined (poll, bounded by `--read-wait-ms`, default 15000) before
  any `find()` on a granted input; `resyncSubduction(docId)` recovers a
  document already marked unavailable. Observed lag Run 6: 2012 ms
  (section_a), 1 ms (section_b). Elapsed → `phase3_finding` and abort;
  there is no fallback to the author's copy (ruling 1).
- *Un-granted probe.* An actor-side `find()` on an un-granted document
  never resolves — timeout, no error. `probeUngranted()` bounds it
  (`--ungranted-probe-ms`, default 6000, in resync rounds), records the
  behaviour, then scans the actor's storage (see below). Run 6: 2 rounds /
  6000 ms, `timeout:find:section_c`. The negative leg then presents the
  document to the gate by ID.

**Membership nudge write (spike D-6, author-hive write).** `addMemberToDoc`
triggers the *granter's* write of
`__automerge-repo-keyhive__last-added-member-ts` into the granted document.
Content documents a/b and every assembly document (author granted read)
carry it; the un-granted document does not (Run 6: true/true/false). It is
outside the digested content object; the nudge commit is visible in
`sourceLineage` `documentCID`s and in `sourceDocumentCID`. Recorded as an
observation, not a defect.

**Storage scan must decode (Finding 2).** Automerge deflates snapshot
columns holding strings ≥ 256 bytes, so a raw byte scan of the actor's
storage for a plaintext marker is **inconclusive** for fixture content of
that size — Run 6's raw positive control returned 0. The scan therefore
loads each chunk with `Automerge.load()` where loadable and tests the
decoded JSON as well; hits are reported `raw/decoded` (post-fix control:
`0/1`). A scan that reports raw hits only is not evidence of absence.
`bytesUnderC=0` (Finding 4) is expected: the un-granted document's
ciphertext transits and is not persisted under the document's storage key
on the actor's repo; plaintext does not materialise. The storage half of
AC-3.1.2 for Run 6 rests on the test leg and the spike (control 1 / hits 0
/ bytesUnderC 0); the runner scan was fixed after the run and Run 6 was not
re-run (ruled).

**Transport transients (Finding 3) — watch.** Two messages have been seen
on the encrypted transport without affecting outcomes: "no derivable PCS
key" on document create, and "CGKA decrypt failed / Key not found" before
the next-round read. Both cleared on the following round. Record in
`phase3_finding` if they recur; escalate if either persists past the
bounded waits.

**Relay.** `wss://jetstream1.us-east.bsky.network/subscribe` pinned as the
runner default (`DEFAULT_JETSTREAM`); overridable by `JETSTREAM_ENDPOINT`.
`check-pds.ts` still defaults to jetstream2 — known divergence.
`wantedCollections` server-side filtering does not deliver
`com.whtwnd.blog.entry` commits; subscriptions are unfiltered with
client-side DID + collection matching, opened before the publish fires.
Run 6 relay ingest gap: 15.9 s.

**Keyhive capabilities** are document-granular. `Access` is a four-level
total order — relay (0), read (1), edit (2), admin (3) — with `isReader`,
`isEditor`, `atLeast()`, `compareTo()`, `level`. It carries no data fields.
There is no sub-document scoping and no place on a grant for a horizon.

**AppView observability (Finding 9).** WhiteWind (`whtwnd.com`) renders the
first-input title and the content `createdAt` as the displayed date, drops
`seamCrossingRef` as an unknown field, and shows no trace of the un-granted
section. The AppView is a rendering of the PDS record, not evidence about
the seam; observations of it are recorded in the operator-notes section,
never in the machine block.

**Runs** are operator-executed against live network; the authoring
environment has no network access to the PDS or relay. Scripts:
`check:pds`, `run:crossing`, `verify:firehose`, `verify:cid`,
`baseline:0-3`, `test`. The spike suite runs under `vitest.spike.config.ts`
and is excluded from `tsc` via `tsconfig.json` `exclude: ["test/spike/**"]`
(Finding 7).

**CLI pathspec rule (Finding 1, I-1).** Every staging, add, or restore
command in a session paste block uses **absolute paths** from the repository
root (`$HOME/employment-seam/substrate-crossing/…`; `substrate-crossing/` is a
sibling of `keyhive-employment-seam/`, not nested under it), never `cd`
followed by a relative pathspec. `git` is invoked with `-C
"$HOME/employment-seam"`. Paste blocks are
zsh-safe: no inline `#` comments, no multi-line quoted strings, no
angle-bracket placeholders. Verification of a staged file is by sha256 of
the file on disk, stated by the operator.

---

## Decisions in force

Reference commit for "as implemented" statements above: **the Phase 3
reference commit** — the single commit that lands this file together with
the Run 6 files, the S7 runner diff, `tsconfig.json`, the Run 6 entry and the
post-fix observation log on `main`. Its SHA is recorded in manifest r3 and
in the SL-0184 closing delta; until then `b075038` remains the audit pin.

| Decision | File | One line |
|---|---|---|
| D-1 grant scoping | `D-1_grant-scoping_2026-08-28-r2.md` | Per-section documents; the crossing actor holds read only on documents whose whole content is authorized to cross; the seam binds the assembled output by digest. Grant boundary = publish boundary. **As implemented, Run 6.** |
| D-2 grant-horizon placement | `D-2_grant-horizon-placement_2026-08-28.md` | `crossingGrantHorizon` lives on the intent record beside `crossingTimeoutHorizon` as a not-before horizon. **Decided, not implemented — Item 3.2.** |
| D-3 aggregation digest boundary | `D-3_aggregation-digest-boundary_2026-08-28.md` | Digest binds the aggregate output; aggregation is deterministic; input digests are lineage, not binding. D-3's "Run 8" scheduling of the singular-source question is superseded by D-1 r2 / D-5 (spec r2 pointer fix queued). **As implemented, Run 6.** |
| D-4 gate access level | `D-4_gate-access-level_2026-08-28.md` | Gate checks `isReader`, not presence; `grantReference` names the level held. **As implemented, Run 6.** |
| D-5 multi-source representation | `D-5_multi-source-representation-and-SL0184-disposition_2026-08-29.md` | Assembled output is written to an assembly document, the single source; inputs carried as `sourceLineage`; crossing records hosted on the assembly document. **As implemented, Run 6 (validation event fired).** |
| D-6 r1 transport scope of D-1 | `D-6_transport-scope-of-D-1_2026-08-29-r1.md` | D-1's "not decryptable by the actor" claim is scoped to the encrypted (subduction) transport; Phase 3 runs use that transport. **In force.** |

Rulings carried as text in this version: S4 rulings 1–5 (actor-side input
reads, no fallback; gate on the issuer's hive; assembly rule; presented
content on `initiateCrossing()`; digest by hash equality); R-A (leg order);
R-B (multi-input `grantReference`). An actor-hive gate is queued as an Item
3.2 / addendum candidate, not a ruling.

Decision files are kept with the project's working records; each is the head
of its supersede chain until a later file names it.
