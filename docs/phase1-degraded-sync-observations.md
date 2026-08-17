# Phase 1 — Degraded-Sync Observation Log
## Employment-Seam Prototype · Item 1.1 Live Relay Run

⚑ STAMP: SINGLE-CONTEXT — NOT PANELED
Populated from live DevTools run, 2026-08-16.

**Date:** 2026-08-16
**Repo:** `github.com/jediwright/employment-seam`
**HEAD at run time:** `5971fef` (HEAD -> main, origin/main — "P13 D2-C2: threshold/quorum derivation over closed standing sets")
**Relay:** BroadcastChannel (local; no external relay)
**Stack pin:** `@automerge/automerge-repo-keyhive@0.4.0-alpha.sub.4`
**Session:** Items 1.1 / 1.2 · Session Harness Mode 1 · 2026-08-16
**Session context:** Simulation layer complete at `0c044bf` (SL-0015 ✓);
this log captures the live-relay observation leg.
**Test suite at run time:** 188/188 passing (note: handoff stated 33/33 at
`802e841`; test count has grown since; 188/188 is the correct baseline)

---

## Pre-Run Baseline

**Existing document state (before any throttled run):**

- Access log: 6 events from 8/3/2026
- Last event: "Revocation issued" 8/3/2026 11:03:50 PM — `revoked-local`
  state; no "Revocation confirmed" entry follows. Path B pre-confirmed by
  baseline: ack signal never arrived in prior session.
- Full ceremony visible in pre-existing log: initialized → capability
  granted → revocation issued → handoff initiated → bundle ready →
  handoff completed
- Handoffs tab: Test-8.3.26 · Delivered · self → self · Initiated
  11:05:16 PM · Completed 11:05:38 PM ·
  Hash: 0746cd497ef2e2bad2e41b78f31d104fdc96a28c01af881bdc2a0456d6ea1db8
- No `HandoffFailureState` in existing document — clean slate for
  Profile 2 trigger

**Simulation timings (from degradedSync.test.ts stdout at npm test):**

| Simulated profile | propagationGapMs |
|---|---|
| fast | 12ms |
| degraded | 251ms |
| offline-then-reconnect | 151ms |
| degraded (1.2 re-execution, issued→confirmed) | 235ms |

---

## Profile 1 — 3G

**DevTools setting:** 3G (Chrome preset — "Slow 3G" not available in this
Chrome version; 3G is the equivalent)
**Project used:** Throttle test (new project created for this run)
**Receiving party:** Jedi Wright · self

### Ceremony timeline

| Event | Timestamp | Delta from prior |
|---|---|---|
| Handoff initiated | 10:43:37 AM | — |
| Bundle ready | 10:44:12 AM | +35s |
| Seam fired / Completed | 10:44:59 AM | +47s |
| **Total ceremony duration** | | **82 seconds** |

### UI state during gap
- HandoffsTab progressed through: Pending → Bundle ready (confirmation
  dialog) → Delivered
- No stuck or frozen state observed
- Confirmation dialog text: "Confirming delivery revokes all active
  cryptographic capabilities across all contacts. This cannot be undone."

### Access log entries (new, from this run)

```
Handoff completed · Jedi Wright · Throttle test
Handoff complete. Bundle delivered. Revocation issued for all active
capabilities (confirmation propagates separately). Exposure records
captured: 1 contact(s).
8/16/2026, 10:44:59 AM

Exposure record · Jedi Wright
Exposure record (exposure-upper-bound): document
"6db3a905-1c08-4c28-b947-30a65f8e5eda" — worker-side content proxy at
revocation: log-length:8. Per-peer sync state unavailable on this
transport (Item 1.1 finding: no ack surface on BroadcastChannel). This
record attests to the maximum the contact could have held as of this moment.
bound: exposure-upper-bound
docs: 6db3a905-1c08-4c28-b947-30a65f8e5eda
heads: 6db3a905-1c08-4c28-b947-30a65f8e5eda: [log-length:8]
8/16/2026, 10:44:59 AM

Revocation issued · Jedi Wright
Revocation issued at seam-firing (local operation complete, confirmation
propagating). Prior ref:
revoked:automerge:kYq84y2GsfjSDRHf7aCdvx7xd9iwtPxycT5djW8XrA2Jm1sFX
8/16/2026, 10:44:59 AM

Bundle ready · Throttle test
Bundle ready. Hash:
8014e318bbdd59550725f312ea6cca5251302a393b2bc9f60c6c4a0565272d30
8/16/2026, 10:44:12 AM

Handoff initiated · Jedi Wright · Throttle test
Handoff initiated. Receiving party: Jedi Wright
8/16/2026, 10:43:37 AM
```

### Revocation state
- `revoked-local` ("Revocation issued") fired at seam-firing: ✓ — 10:44:59 AM
- `revoked-confirmed` entry: absent
- Timestamp delta (issued → confirmed): N/A — no confirmation signal

### HandoffFailureState
- Triggered: No — ceremony completed successfully under 3G

### Key finding
The exposure record entry is self-annotating: *"Per-peer sync state
unavailable on this transport (Item 1.1 finding: no ack surface on
BroadcastChannel)."* The prototype named the finding in its own log
output before the observation session concluded. Path B confirmed in the
access log text itself.

---

## Profile 2 — Offline

**DevTools setting:** Offline
**Project used:** Offline throttling (new project created for this run)
**Receiving party:** Jedi Wright · self

### Ceremony timeline

| Event | Timestamp | Delta from prior |
|---|---|---|
| Handoff initiated | 10:49:12 AM | — |
| Bundle ready | 10:49:38 AM | +26s (local computation; no network needed) |
| Failure recorded | 10:50:41 AM | +63s from initiation |
| **Total to failure** | | **89 seconds** |

### UI state during gap
- HandoffsTab: Pending → Bundle ready (bundle computation is local;
  completed instantly even offline) → operator selected "Record failure"
  → Failed · "Failure: Relay unreachable"
- No automatic timeout detected — `HandoffFailureState` is operator-declared
  via the "Record failure" dialog, not auto-fired by the prototype

### HandoffFailureState — triggered ✓

**Dialog presented full enum on "Record failure" click:**
- `relay-unreachable`
- `receiving-party-unresponsive`
- `bundle-rejected`
- `account-pre-empted-before-bundle-ready`
- `account-pre-empted-after-bundle-ready`
- `partial-delivery`
- `contested`

**Selected:** `relay-unreachable` (accurate for Offline profile)

### Access log entries (new, from this run)

```
Handoff failed · Offline throttling
Handoff failed. State: Relay unreachable
8/16/2026, 10:50:41 AM

Bundle ready · Offline throttling
Bundle ready. Hash:
c816da01b04fd86525432ac6b06d79c59a232faec73c369966ef93d8cfe61784
8/16/2026, 10:49:38 AM

Handoff initiated · Jedi Wright · Offline throttling
Handoff initiated. Receiving party: Jedi Wright
8/16/2026, 10:49:12 AM
```

### Revocation state
- No revocation issued — failure before seam-fire; capabilities not revoked
- `revoked-local`: absent (correct — seam never fired)
- `revoked-confirmed`: absent

### Key finding
`HandoffFailureState` is operator-declared, not automatically detected.
The prototype surfaces the full 7-state enum and records the operator's
selection. The ceremony sits at "Bundle ready" indefinitely under Offline
until the operator acts — there is no automatic relay-detection timeout
in the current implementation.

---

## Profile 3 — Intermittent

**DevTools setting:** Custom — "Intermittent" (750 kbit/s down, 750 kbit/s
up, 2000ms latency, 50% packet loss; added via DevTools Settings →
Throttling → Add profile)
**Project used:** No throttling test (new project created for this run)
**Receiving party:** Jedi Wright · self
**Note:** Project had no contacts attached — revocation machinery is
contact-scoped; 0 contacts → no revocation or exposure record emitted.
This is correct behavior.

### Ceremony timeline

| Event | Timestamp | Delta from prior |
|---|---|---|
| Handoff initiated | 10:55:22 AM | — |
| Bundle ready | 10:57:15 AM | +113s |
| Seam fired / Completed | 10:58:15 AM | +60s |
| **Total ceremony duration** | | **173 seconds** |

### UI state during gap
- HandoffsTab progressed through: Pending → Bundle ready → confirmation
  dialog → Delivered
- No stuck or frozen state; ceremony completed despite 50% packet loss
- Noticeably slower than Profile 1 (173s vs 82s — more than double)

### Access log entries (new, from this run)

```
Handoff completed · Jedi Wright · No throttling test
Handoff complete. Bundle delivered. Revocation issued for all active
capabilities (confirmation propagates separately). Exposure records
captured: 0 contact(s).
8/16/2026, 10:58:15 AM

Bundle ready · No throttling test
Bundle ready. Hash:
790a61d4d890bd3950865fbf95d30f1a5e51ee394164e1531495bda0fcc8bf7f
8/16/2026, 10:57:15 AM

Handoff initiated · Jedi Wright · No throttling test
Handoff initiated. Receiving party: Jedi Wright
8/16/2026, 10:55:22 AM
```

### Revocation state
- No revocation issued — 0 contacts attached to project; revocation
  machinery correctly did not fire
- `revoked-local`: absent (correct — no contacts to revoke)
- `revoked-confirmed`: absent

### HandoffFailureState
- Triggered: No — ceremony completed under Intermittent

---

## Cross-Profile Summary

| Measurement | 3G | Offline | Intermittent |
|---|---|---|---|
| Total ceremony duration | 82s | 89s (to failure) | 173s |
| Bundle computation time | 35s | 26s | 113s |
| Subduction timeout fired? | No | No (operator-declared) | No |
| HandoffFailureState triggered? | No | Yes — relay-unreachable | No |
| `revoked-local` in access log? | Yes — 10:44:59 AM | No (no seam-fire) | No (0 contacts) |
| `revoked-confirmed` in access log? | No | No | No |
| Exposure record emitted? | Yes — 1 contact | No | No (0 contacts) |
| UI state during gap | Sequential, no freeze | Bundle ready → Failed | Sequential, slower |

---

## Item 1.1 Acceptance Checklist

- [x] Three network profiles run and timed (3G: 82s; Offline: 89s to failure; Intermittent: 173s)
- [x] Access log entries captured for each profile
- [x] `HandoffFailureState` triggered at least once (Profile 2, Offline — relay-unreachable)

**Acceptance verdict: PASS**

---

## Item 1.2 Feed — Ack Signal Determination

**Finding: Ack signal ABSENT**

Observations across all three profiles:
- No `revoked-confirmed` entry appeared in the access log under any profile
- The Profile 1 exposure record entry explicitly states: *"Per-peer sync
  state unavailable on this transport (Item 1.1 finding: no ack surface on
  BroadcastChannel)."* The prototype self-annotated this finding.
- The BroadcastChannel adapter does not expose a per-peer delivery
  acknowledgment signal. Automerge-repo's sync protocol confirms
  document-level convergence, not per-operation delivery to a specific peer.

**Path B applies.** Proceed with the honest degraded indicator:
"issued — propagation unconfirmed on this transport."

This is not a failure of Item 1.2. It is Item 1.2's correct outcome on
this transport at this stack pin.

---

## Simulation vs. Live Comparison

| Simulation assumption | Live observation | Match? | Notes |
|---|---|---|---|
| Timeout threshold fires automatically | No auto-timeout observed | No | HandoffFailureState is operator-declared; no auto-detection in current impl |
| `revoked-local` fires on seam-fire | Yes — fired at 10:44:59 AM (Profile 1) | Yes | Contact-scoped; 0 contacts → no fire (Profile 3) |
| `HandoffFailureState` fires on relay loss | Yes — operator-declared relay-unreachable | Partial | Requires operator action; not auto-detected |
| Timestamp delta is non-zero and legible | All events at same second (10:44:59 AM) | Partial | Sub-second deltas not visible in UI timestamp; ceremony duration delta legible across profiles |
| Bundle computation is network-dependent | Completed offline in 26s | No | Bundle computation is fully local; network not required |

---

## Significant Findings

**F1 — Self-annotating exposure record (Path B pre-confirmed)**
The prototype's own access log text states: *"Per-peer sync state
unavailable on this transport (Item 1.1 finding: no ack surface on
BroadcastChannel)."* Item 1.2 Path B was pre-confirmed in the log before
the observation concluded. The code already knows and says this.

**F2 — HandoffFailureState is operator-declared, not auto-detected**
No automatic relay-detection timeout exists. The ceremony sits at "Bundle
ready" indefinitely under Offline until the operator triggers "Record
failure." The 7-state enum is surfaced via a text-input dialog. This is a
design observation, not a defect — but it means the "timeout duration"
measurement from the build plan spec is not applicable in the current
implementation; the relevant measurement is ceremony duration to
operator-declared failure.

**F3 — Bundle computation is fully local**
Bundle hash generation completed in 26 seconds under Offline and 35
seconds under 3G. Network state has no effect on bundle computation. The
Automerge document hash is computed locally from local state.

**F4 — Intermittent adds measurable latency**
173 seconds under Intermittent vs 82 seconds under 3G — more than double.
The 50% packet loss and 2000ms latency are observable in ceremony duration.
The ceremony completed despite degraded conditions; no failure state
triggered.

**F5 — Revocation is contact-scoped**
Profile 3 (0 contacts) produced no "Revocation issued" entry and no
exposure record. Profile 1 (1 contact) produced both. The revocation
machinery correctly does not fire when there are no active capability
holders. This is correct behavior per the spec.

---

*Employment-Seam prototype · Phase 1 degraded-sync observations · 2026-08-16*
*Stack: @automerge/automerge-repo-keyhive@0.4.0-alpha.sub.4 (frozen)*
*Governing spec: pattern-commons-07-employment-seam-v0-5_2026-08-08.md (locked)*
*SL-0015 (degraded-sync simulation ✓ at 0c044bf) · SL-0016 (two-state revocation ✓ at 0c044bf)*
*HEAD at run time: 5971fef*
*Tests at run time: 188/188*
*SINGLE-CONTEXT — NOT PANELED*
*J. Wright / UX Minds, LLC · AI-collaborative synthesis; human authorial
responsibility and intellectual direction held by the named author.*
