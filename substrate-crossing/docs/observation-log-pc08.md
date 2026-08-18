# PC#8 Observation Log

**Instrument:** PC#8 build plan v0.1 §H.3 observation log format
**Produced:** 2026-08-17 (Phase 0 closing deliverable, per session scope)
**Feeds:** `pc08-kl1-kl2-closing-evidence_YYYY-MM-DD.md`
**Status:** ACTIVE — entries appended through Run 3 (2026-08-18). One entry
block per crossing run; append-only; do not edit prior entries.

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
```

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

*Append-only. Canonical copy: operator's machine; `substrate-crossing/docs/` in the employment-seam repo.*

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
