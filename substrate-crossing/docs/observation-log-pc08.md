# PC#8 Observation Log

**Instrument:** PC#8 build plan v0.1 §H.3 observation log format
**Produced:** 2026-08-17 (Phase 0 closing deliverable, per session scope)
**Feeds:** `pc08-kl1-kl2-closing-evidence_YYYY-MM-DD.md`
**Status:** ACTIVE — entries appended through Run 6 (2026-08-29 local /
2026-08-30 UTC); Item 2.2 note appended; Run 6 carries an operator-notes section. One entry block per crossing run; append-only; do not edit
prior entries. Entry format extended with the three `phase3_*` fields at
Phase 3 open (2026-08-29); see `CONVENTIONS.md` §Observation log.

Field definitions are normative per §H.3. Timestamps are ISO 8601 with
milliseconds, UTC. `null` is written literally where §H.3 permits it.

---

## Entry format

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

The three `phase3_*` fields are required from Run 6 onward and optional for
Runs 1–5; prior entries remain valid without them.

---

## Entries

### Run 0 — Item 0.2 connectivity probe (pre-Phase 1 baseline; NOT a crossing)

Recorded here for timing-baseline continuity only. No intent record, no
gate, no completion record — the intent/completion fields are structurally
inapplicable and are marked `n/a` (distinct from `null`, which §H.3 reserves
for applicable-but-unobserved).

```
crossing_run:        0
scenario:            baseline (connectivity probe; not a governed crossing)
intent_emitted_at:   n/a
putrecord_called_at: 2026-08-18T04:16Z approx
pds_accepted_at:     +266ms
relay_ingested_at:   +109ms
completion_written_at: n/a
crossing_outcome:    n/a
pds_accept_latency_ms: 266
relay_ingest_gap_ms: 109
intent_without_completion_window_ms: n/a
kl1_legibility_observation: n/a (no intent record exists for this run)
kl2_back_pointer_observation: n/a (no completion record exists for this run)
```

---

### Run 1 — Item 1.2 instrumented run (baseline)

```
crossing_run:        1
scenario:            baseline
intent_emitted_at:   2026-08-18T16:22:31.566Z
putrecord_called_at: 2026-08-18T16:22:31.583Z
pds_accepted_at:     2026-08-18T16:22:31.904Z
relay_ingested_at:   2026-08-18T16:22:32.108Z
completion_written_at: null
crossing_outcome:    timeout
pds_accept_latency_ms: 321
relay_ingest_gap_ms: 204
intent_without_completion_window_ms: null
kl1_legibility_observation: Fired; publish accepted; completion record machinery not yet implemented (Item 1.3 pending). At horizon elapse a deferred party reading the document sees the intent record with no completion: state reads crossing-unconfirmed — distinguishable from not-yet-initiated (no intent record) and from completed (no completion record present).
kl2_back_pointer_observation: n/a at Item 1.2 (seamCrossingRef is Item 1.4; CID captured for the Item 1.3 completion record)
```

---

### Run 2 — Item 1.3 completion-capable run (baseline)

```
crossing_run:        2
scenario:            baseline
intent_emitted_at:   2026-08-18T16:58:23.275Z
putrecord_called_at: 2026-08-18T16:58:23.286Z
pds_accepted_at:     2026-08-18T16:58:23.610Z
relay_ingested_at:   2026-08-18T16:58:23.769Z
completion_written_at: 2026-08-18T16:58:23.773Z
crossing_outcome:    completed
pds_accept_latency_ms: 324
relay_ingest_gap_ms: 159
intent_without_completion_window_ms: 487
kl1_legibility_observation: Fired; publish accepted; crossing-completion record written and confirmed document-resident (crossingIntentRef content-addresses the intent record; crossingTargetCID matches the PDS response). Document-legible state: crossing-complete. A deferred party reading the document sees intent AND ref-matched completion: crossing-complete — chain closed.
kl2_back_pointer_observation: n/a until Item 1.4 (seamCrossingRef back-pointer); crossingTargetCID carried into the completion record
```

---

### Run 3 — Item 1.3 completion-capable run (failed)

```
crossing_run:        3
scenario:            failed
intent_emitted_at:   2026-08-18T17:04:33.501Z
putrecord_called_at: 2026-08-18T17:04:33.519Z
pds_accepted_at:     null
relay_ingested_at:   null
completion_written_at: null
crossing_outcome:    failed
pds_accept_latency_ms: null
relay_ingest_gap_ms: null
intent_without_completion_window_ms: null
kl1_legibility_observation: Publish failed (Invalid NSID (got "com.whtwnd.invalid.collection!") at $.collection). Intent record remains document-resident with no completion: crossing-intent-failed, legible without external lookup (deriveDocumentCrossingState reads crossing-intent-pending → crossing-unconfirmed at horizon elapse); retry requires a new gate pass (KL-8a).
kl2_back_pointer_observation: n/a until Item 1.4 (seamCrossingRef back-pointer); crossingTargetCID carried into the completion record
```

---

### Run 4 — Item 1.4 back-pointer-carrying run (baseline)

```
crossing_run:        4
scenario:            baseline
intent_emitted_at:   2026-08-18T18:56:26.513Z
putrecord_called_at: 2026-08-18T18:56:26.531Z
pds_accepted_at:     2026-08-18T18:56:26.906Z
relay_ingested_at:   2026-08-18T18:56:27.135Z
completion_written_at: 2026-08-18T18:56:27.230Z
crossing_outcome:    completed
pds_accept_latency_ms: 375
relay_ingest_gap_ms: 229
intent_without_completion_window_ms: 700
kl1_legibility_observation: Fired; publish accepted; crossing-completion record written and confirmed document-resident (crossingIntentRef content-addresses the intent record; crossingTargetCID matches the PDS response). Document-legible state: crossing-complete. A deferred party reading the document sees intent AND ref-matched completion: crossing-complete — chain closed. The published record carries the Item 1.4 seamCrossingRef: the chain is now traversable from the AT Protocol side back to the governed document.
kl2_back_pointer_observation: seamCrossingRef attached at publish and returned INTACT by getRecord() (crossingIntentRef + authorizedContentDigest + sourceDocumentURI/CID all match the fired intent record). Back-pointer survives PDS storage. AppView surface/drop (whtwnd.com): DROPPED at rendering layer — field not surfaced in WhiteWind AppView UI (whtwnd.com/did:plc:4xoefmmbsulm4xns3kbb6mnk/3mtevg2odx424); standard $type content fields only rendered. Back-pointer survives to PDS layer; dropped at AppView rendering. Deep round-trip (firehose payload; AppView backing store) is Phase 2 Item 2.1.
```

### Run 5 — Phase 2 Item 2.1 firehose-capture crossing

```
crossing_run:        5
scenario:            baseline (Phase 2 Item 2.1 firehose-capture crossing; seamCrossingRef attached)
intent_emitted_at:   2026-08-18T21:32:39.316Z
putrecord_called_at: 2026-08-18T21:32:39.326Z
pds_accepted_at:     2026-08-18T21:32:39.693Z
relay_ingested_at:   2026-08-18T21:32:39.852Z
completion_written_at: 2026-08-18T21:32:39.954Z
crossing_outcome:    completed
pds_accept_latency_ms: 367
relay_ingest_gap_ms: 159
intent_without_completion_window_ms: 628
kl1_legibility_observation: Fired; publish accepted; crossing-completion record written and confirmed document-resident (crossingIntentRef content-addresses the intent record; crossingTargetCID matches the PDS response). Document-legible state: crossing-complete. A deferred party reading the document sees intent AND ref-matched completion: crossing-complete — chain closed. The published record carries seamCrossingRef: the chain is traversable from the AT Protocol side back to the governed document.
kl2_back_pointer_observation: seamCrossingRef attached at publish; INTACT in getRecord() (4-field match vs fired intent); PRESENT in raw Jetstream commit payload (capture file docs/firehose-captures/3mtf65fcgvf2s_2026-08-18T21-32-39-855Z.raw.json) with 4/4 firehose↔PDS field parity. AppView rendering drop previously confirmed (Run 4, whtwnd.com). Firehose event CID == getRecord CID == putRecord CID (bafyreiejm4uqepsz553mmbvieuveufylw6iedu2unhiaj76vcva7i2wrba). Relay timestamp note: runner-observed ingest .852Z (H.3 field, method-continuous with Runs 1–4); capture-script time_us-derived .893Z recorded in the capture file.
```

### Item 2.2 note — CID-anchor stability verification (AC-2.3 / AC-2.4)

```
verified_runs:       2, 4, 5 (rkeys 3mteosxkzms27, 3mtevg2odx424, 3mtf65fcgvf2s)
putrecord_cids:      recovered from runner console output (fired: lines), cross-confirmed
                     against each run's completion-record targetCID
round_trip_ac23:     3/3 MATCH (putRecord CID == getRecord CID for all three)
content_address_ac24: 3/3 MATCH (CID independently recomputed from record content via
                     jsonToLex + cidForCbor, atproto derivation; matches PDS-returned CID)
run_cids:            Run 2 = bafyreicmlwc3hv42dk3a34lxledd22syjc3zfvu6boqorn2qohdgi76yly
                     Run 4 = bafyreifp2f3wiuquv4lcxsxfmoxdrrl7n5jh3utwzrqcdrblbs5uibiwua
                     Run 5 = bafyreiejm4uqepsz553mmbvieuveufylw6iedu2unhiaj76vcva7i2wrba
                     Run 1 = bafyreify3v7no62eezhbcvfzpiqwe7a5dblyhkwbbffpy37h5eznp3btdq (provenance only)
note:                CID is content-addressed and stable across PDS retrieve; migration
                     stability deferred.
```

### Run 6 — Item 3.1 public-subset crossing (negative → adversarial → positive)

```
crossing_run:        6
scenario:            public-subset
intent_emitted_at:   2026-08-30T01:27:52.317Z
putrecord_called_at: 2026-08-30T01:27:52.322Z
pds_accepted_at:     2026-08-30T01:27:52.628Z
relay_ingested_at:   2026-08-30T01:28:08.506Z
completion_written_at: 2026-08-30T01:28:08.800Z
crossing_outcome:    completed
pds_accept_latency_ms: 306
relay_ingest_gap_ms: 15878
intent_without_completion_window_ms: 16478
kl1_legibility_observation: Fired; publish accepted; crossing-completion minted in the ASSEMBLY document (actor-owned; author holds read) and confirmed document-resident. Document-legible state: crossing-complete. KL-1 (D-5 cost, not a defect): a deferred party following sourceDocumentURI lands on the actor's assembly document automerge:2stjg5ft1kCK29dsybrQ7koFRVHtGRm3sAXTshCtPzHN9rsBnE, not the author's content documents; the author's documents are reachable only via the intent's sourceLineage (2 entries) and carry no crossing records. Gate evaluated on the issuer's hive, not the presenting party's (ruling 2) — legibility note.
kl2_back_pointer_observation: seamCrossingRef (four-field singular shape) returned INTACT by getRecord(); it points at the ASSEMBLY document automerge:2stjg5ft1kCK29dsybrQ7koFRVHtGRm3sAXTshCtPzHN9rsBnE (D-5), not an input. B-5: published record or sourceLineage names section_c = false (expected false). AppView surface/drop (whtwnd.com): operator observation — expected unchanged from Runs 4–5 (dropped at AppView); record manually.
phase3_pattern:      public-subset
phase3_gate_observation: NEGATIVE leg: presented [section_a, section_b, section_c] → gate-blocked at accessForDoc(section_c) on the issuer's hive: no authorizing grant present in causal history [automerge:29u89rH3Zf67A9Pno4GazauVsLhw6dZTz2PYUe1mQBgAG1ALBo]; block logged 2026-08-30T01:27:52.297Z; assembly document untouched=true; intent records=0; putRecord not called. | ADVERSARIAL leg: presented [section_a, section_b] + appended foreign bytes → digest-blocked on hash inequality at step 3 (both gates passed); assembly document untouched=true; no intent; putRecord not called. | POSITIVE leg: presented 2 granted input(s) → gate passed on isReader for each (issuer's hive) → assembled → digest matched → assembly document written → fired.
phase3_finding:      Membership lag (spike D-4; fixture timing, not a gate): actor's hive saw its read grant after section_a 2012ms, section_b 1ms; actor-side find() succeeded after the wait. | section_c (no grant) not decryptable by the actor: handle pending at timeout (2 round(s) over 6000ms: timeout:find:section_c); actor repo storage: chunks=19, bytes under section_c=0, section_c plaintext hits=0, control (section_a) plaintext hits=0. Ciphertext transits; plaintext does not (spike Q2, SL-0186). Evidence file: substrate-crossing/test/spike/spike-3-1b-encrypted-transport.test.ts. | Membership nudge (spike D-6, author-hive write, not a seam write): __automerge-repo-keyhive__last-added-member-ts present on section_a=true, section_b=true, section_c=false (expected true/true/false). Content object {title, content, createdAt} unaffected; nudge commit is included in the lineage documentCIDs read post-grant — observation, not defect. | Assembly document creator access (negative leg): accessForDoc(self)=Admin; members: 9b2273a865fb…:Read, 2682d95b5658…:Admin (self). | Negative leg: section_c presented to the gate by document ID; actor-side handle pending at timeout (un-granted, not decryptable — spike D-5); gate exercised on the ID at step 1. | Assembly document creator access (positive leg): accessForDoc(self)=Admin; members: 9b2273a865fb…:Read, 2682d95b5658…:Admin (self). | CID observation (spike D-6): sourceDocumentCID=4inBcReFpaK3dpBX2gbD6bfdDr8E4EsfPbFEFZLqgonWWtAkV names the assembly document's heads including the author's membership nudge commit (nudge field present on assembly document=true); sourceLineage documentCIDs automerge:iBY6skLvYuxLujtgQCiGv9zwyCMcj8i1VRLsGGAwSkxYrnn28@2Mm7rojH8dE4M69h3BHUAMpfZ37J3rF9tL2EWp2tVANoorAV1R, automerge:n8Q7cLP7kuBQ41n62ZVbTb6qJnW9QoJtmSZrGuqsaoszFXCmW@h2ddJNhRe5CRzN7eQ2NZgEAmMH3nxJkticq5TQn7LSdxXUWLy each include the nudge commit on the granted input. Content object and digests unaffected (step-4 recompute equal).
```

### Run 6 — operator notes (2026-08-29 local / 2026-08-30 UTC)

```
ac_3_1_4_observation: Public subset crossing — grant boundary equals publish boundary; unauthorized section held in a separate document with no grant to the crossing actor; assembled output bound by digest; foreign-byte injection blocked on hash mismatch. Subset confinement on this stack is a capability-layer property achieved by document decomposition — on the encrypted (subduction) transport the un-granted document is not decryptable by the actor; ciphertext transits — and the seam's digest binds the assembled output.
ac_confirmation:     AC-3.1.1, AC-3.1.2, AC-3.1.3, AC-3.1.4, AC-3.1.5 confirmed by operator against this entry, 2026-08-29.
storage_scan_note:   Runner storage-scan positive control returned 0 hits; the scan half of the un-granted probe is inconclusive in the runner for this run. Storage evidence for AC-3.1.2 rests on the Item 3.1 test leg (control 1 / section_c hits 0) and the spike (control 1 / hits 0 / bytesUnderC 0), both run on the operator's machine 2026-08-29 21:22 local at b075038 + the staged Run 6 files. Cause to be determined at the Run 6 close session.
transport_transients: (1) create-time "no derivable PCS key … dropping outgoing blob" once per document (S5 watch item, reproduced). (2) Spike Q2b: interceptor logged "CGKA decrypt failed … Key not found; leaving pending" twice on a granted document, then read a/b in plaintext on the next round. Both transient; watch items.
ciphertext_persistence: bytesUnderC=0 in the actor's repo storage (spike and runner): section_c ciphertext transits on sync but is not persisted under the document's storage key. Sharpens "ciphertext transits; plaintext does not".
appview_observation: surfaced — whtwnd.com/localboundary.bsky.social/3mubag4iqdp2q renders section_a + section_b (title from first input; displayed date = content createdAt 01:27:43.680Z, not publish time); section_c absent on the surface (B-5); seamCrossingRef not rendered — unknown field dropped at the AppView, unchanged from Runs 4–5. Observed 2026-08-29 local.
```

*Append-only. Canonical copy: operator's machine; `substrate-crossing/docs/` in the employment-seam repo.*
