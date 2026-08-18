# PC#8 Observation Log — Template

**Instrument:** PC#8 build plan v0.1 §H.3 observation log format
**Produced:** 2026-08-17 (Phase 0 closing deliverable, per session scope)
**Feeds:** `pc08-kl1-kl2-closing-evidence_YYYY-MM-DD.md`
**Status:** TEMPLATE — no observations recorded. Phase 1 instrumentation
must not begin before this file exists (build plan §5 item 4). One entry
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


### Run 1 — (first Phase 1 governed crossing; append below)

```
crossing_run:        1
scenario:            
intent_emitted_at:   
putrecord_called_at: 
pds_accepted_at:     
relay_ingested_at:   
completion_written_at: 
crossing_outcome:    
pds_accept_latency_ms: 
relay_ingest_gap_ms: 
intent_without_completion_window_ms: 
kl1_legibility_observation: 
kl2_back_pointer_observation: 
```

---

*Append-only. Canonical copy: operator's machine, then `substrate-crossing/docs/`
in the employment-seam repo once Phase 1 opens.*
<!-- Machine-emitted §H.3 entry — Item 1.2 instrumentation.
     NOT the canonical observation log. Paste the block below into
     observation-log-template-pc08.md by hand (append-only,
     delivery-not-application). -->

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
