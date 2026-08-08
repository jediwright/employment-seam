// src/degradedSync.test.ts — Item 1.1: degraded-sync test
// keyhive-employment-seam build plan v0.3 Item 1.1 (item text stands per
// v0.4.1 §Supersedes), scope per Thread A kickoff (full-cluster-status
// handoff, 2026-08-03): simulate a revocation signal arriving after an
// agent has acted on stale capability state; confirm the gate's
// per-invocation check catches the gap; confirm the access log records it.
//
// WHAT "DEGRADED SYNC" MEANS HERE:
// The production transport is BroadcastChannelNetworkAdapter with
// syncServer: 'none' (main.tsx) — tab-to-tab, no relay, and NO PER-PEER
// ACKNOWLEDGMENT SURFACE at the app layer. This test simulates the
// propagation layer directly: two replicas of the gate's document slice
// (worker-side and agent-side) joined by a sync channel with controllable
// latency. v0.3's original DevTools-throttling framing is superseded for
// this session by the kickoff's agent-era framing; timings recorded are
// SIMULATED-PROPAGATION timings, honestly labeled as such.
//
// THE FINDING THIS TEST DOCUMENTS (physics vs. governance):
// The propagation delay is physics; the gate is governance.
//   - During the gap (revocation issued worker-side, signal in flight),
//     the agent-side gate still passes — it checks CURRENT LOCAL STATE,
//     and a signal that has not arrived is not local state. The gate does
//     not and cannot beat physics. This is recorded, not hidden.
//   - The moment the signal lands, the IMMEDIATELY NEXT invocation blocks.
//     Exposure = propagation delay, exactly. No TTL, cache, or token
//     validity window extends it (contrast test below — the Parakhin
//     2026 / arXiv:2605.05440 failure mode, made concrete).
//   - Both sides' access logs record the sequence with independent
//     timestamps. The delta between the worker-side revocation event and
//     the first agent-side blocked gate-check IS the propagation gap,
//     made visible — the CSA time-to-revoke metric at individual-worker
//     scale (v0.3 Item 1.2 external anchor; measured here for 1.2's use).
//
// FINDING FOR ITEM 1.2 (ack availability):
// Neither the simulated channel nor the production BroadcastChannel
// transport exposes a per-peer acknowledgment signal. Item 1.2's
// two-state model therefore takes the v0.3 risk-note fallback branch:
// confirmation is a distinct recorded event when a confirmation signal
// exists, and its absence is reported honestly ("issued — propagation
// unconfirmed on this transport"), never faked from local success.

import { describe, it, expect, afterAll } from 'vitest'
import {
  createCapabilityGate,
  openAgentActionContext,
  revocationConfirmationState,
  confirmRevocation,
} from './gate'
import type { GateDoc } from './gate'
import type { WorkerKnowledgeGraph, Contact, AccessEvent } from './types'

// --- Two-replica harness with a latency-controlled sync channel -------------

type NetworkProfile =
  | { name: 'fast'; latencyMs: number }
  | { name: 'degraded'; latencyMs: number }
  | { name: 'offline-then-reconnect'; latencyMs: null } // held until reconnect()

const PROFILES: NetworkProfile[] = [
  { name: 'fast', latencyMs: 10 },
  { name: 'degraded', latencyMs: 250 },
  { name: 'offline-then-reconnect', latencyMs: null },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function makeContact(contactId: string, ref: string | undefined): Contact {
  return {
    contactId,
    displayName: 'Automation Agent',
    role: 'Drafting assistant',
    employerName: 'Acme',
    relationshipType: 'subcontractor',
    accessTier: 'read-bundle',
    ...(ref !== undefined ? { keyhiveCapabilityRef: ref } : {}),
    notes: '',
    createdAt: new Date().toISOString(),
    contactClass: 'agent',
  }
}

/** One replica: a GateDoc plus its own gate instance and access log. */
function makeReplica(label: string, contact: Contact) {
  const accessLog: AccessEvent[] = []
  const doc: GateDoc = {
    contacts: { [contact.contactId]: { ...contact } },
    accessLog,
  }
  const gate = createCapabilityGate(
    () => doc,
    (mutate) => mutate(doc as WorkerKnowledgeGraph),
  )
  return { label, doc, gate, accessLog }
}

/**
 * Simulated sync channel, worker → agent, replicating capability state.
 * Latency-controlled per profile; 'offline-then-reconnect' holds every
 * message until reconnect() is called. No acknowledgment flows back —
 * matching the production transport's app-layer surface (see header).
 */
function makeSyncedPair(profile: NetworkProfile) {
  const contactId = 'a-1'
  const granted = makeContact(contactId, 'automerge:cap1')
  const worker = makeReplica('worker', granted)
  const agent = makeReplica('agent', granted)

  const held: Array<() => void> = []

  /** Worker-side seam-fire: local revocation + local log entry, then the
   *  signal enters the channel. Returns the worker-side revocation
   *  timestamp (ms) for delta measurement. */
  const fireSeamAtWorker = (): { revokedAtMs: number; delivered: Promise<number> } => {
    const revokedAtMs = Date.now()
    const c = worker.doc.contacts[contactId]
    c.keyhiveCapabilityRef = 'revoked:automerge:cap1'
    worker.accessLog.push({
      eventId: crypto.randomUUID(),
      timestamp: new Date(revokedAtMs).toISOString(),
      eventType: 'capability-revoked',
      subjectContactId: contactId,
      contactClass: 'agent',
      notes: 'Seam fired: capability revoked (local operation complete, signal in flight).',
    })
    const delivered = new Promise<number>((resolve) => {
      const deliver = () => {
        agent.doc.contacts[contactId].keyhiveCapabilityRef = 'revoked:automerge:cap1'
        resolve(Date.now())
      }
      if (profile.latencyMs === null) held.push(deliver)
      else setTimeout(deliver, profile.latencyMs)
    })
    return { revokedAtMs, delivered }
  }

  const reconnect = () => {
    while (held.length) held.shift()!()
  }

  return { contactId, worker, agent, fireSeamAtWorker, reconnect }
}

// --- Timing capture for the observations log ---------------------------------

type TimingRecord = {
  profile: string
  propagationGapMs: number       // worker revocation → signal delivery
  exposureBeyondPhysicsMs: number // signal delivery → first agent-side block
  staleChecksDuringGap: number
}
const timings: TimingRecord[] = []

afterAll(() => {
  // Emitted into vitest output; captured into the Item 1.1 observations log.
  console.log('\n=== ITEM 1.1 DEGRADED-SYNC TIMINGS (simulated propagation) ===')
  for (const t of timings) {
    console.log(
      `profile=${t.profile} propagationGapMs=${t.propagationGapMs} ` +
      `exposureBeyondPhysicsMs=${t.exposureBeyondPhysicsMs} ` +
      `staleChecksDuringGap=${t.staleChecksDuringGap}`,
    )
  }
})

// --- The core scenario, run under all three profiles --------------------------

describe.each(PROFILES)('degraded sync — revocation arrives after stale-state action [$name]', (profile) => {
  it('gate catches the gap at signal arrival; both logs record the sequence', async () => {
    const { contactId, worker, agent, fireSeamAtWorker, reconnect } = makeSyncedPair(profile)

    // T0 — agent acts on current (soon-to-be-stale) capability state.
    expect(await agent.gate.assertCapabilityCurrent(contactId, 'read-bundle')).toBe('pass')
    const ctx = await openAgentActionContext(agent.gate, contactId, 'read-bundle')
    expect(ctx).not.toBeNull() // the agent has acted

    // T1 — worker fires the seam. Signal enters the (degraded) channel.
    const { revokedAtMs, delivered } = fireSeamAtWorker()

    // Worker-side gate refuses IMMEDIATELY — it is inside the propagation
    // gap it created, and it knows it (issued, unconfirmed → blocked).
    expect(await worker.gate.assertCapabilityCurrent(contactId, 'read-bundle')).toBe('blocked-unconfirmed')

    // T1..T2 — THE GAP. The agent-side gate still passes: the signal has
    // not arrived, so current local state honestly shows the grant. This
    // is the physics the gate cannot beat — recorded, not hidden.
    let staleChecksDuringGap = 0
    if (profile.latencyMs === null || profile.latencyMs >= 100) {
      const during = await agent.gate.assertCapabilityCurrent(contactId, 'read-bundle')
      expect(during).toBe('pass') // stale pass INSIDE the gap — the honest finding
      staleChecksDuringGap = 1
    }

    // T2 — signal arrives (offline profile: on explicit reconnect).
    if (profile.latencyMs === null) {
      await sleep(150) // stay offline long enough to be a real gap
      reconnect()
    }
    const deliveredAtMs = await delivered

    // T3 — the IMMEDIATELY NEXT invocation blocks. Exposure beyond
    // physics is one gate check, not one token lifetime.
    const firstCheckAfterArrival = await agent.gate.assertCapabilityCurrent(contactId, 'read-bundle')
    const firstBlockAtMs = Date.now()
    expect(firstCheckAfterArrival).toBe('blocked-unconfirmed')

    // And AgentActionContext is unobtainable from here on:
    expect(await openAgentActionContext(agent.gate, contactId, 'read-bundle')).toBeNull()

    // --- Access log: the gap is visible in the record ---
    // Worker side: the revocation event exists, timestamped independently.
    expect(worker.accessLog.some((e) => e.eventType === 'capability-revoked')).toBe(true)
    // Agent side: gate-check entries for the stale pass(es) AND the block —
    // a blocked action is governance evidence, and so is a stale pass.
    const agentGateChecks = agent.accessLog.filter((e) => e.eventType === 'gate-check')
    expect(agentGateChecks.filter((e) => e.gateResult === 'pass').length).toBeGreaterThanOrEqual(1)
    expect(agentGateChecks.some((e) => e.gateResult === 'blocked-unconfirmed')).toBe(true)
    // Timestamps on both sides are independent ISO strings; the worker
    // revocation → agent first-block delta is the measured gap:
    timings.push({
      profile: profile.name,
      propagationGapMs: deliveredAtMs - revokedAtMs,
      exposureBeyondPhysicsMs: firstBlockAtMs - deliveredAtMs,
      staleChecksDuringGap,
    })
  })
})

// --- Contrast: the TTL failure mode the gate exists to prevent ----------------

describe('per-invocation check vs. TTL token (Parakhin contrast)', () => {
  it('a TTL token keeps authorizing after the signal arrives; the gate does not', async () => {
    const profile: NetworkProfile = { name: 'degraded', latencyMs: 100 }
    const { contactId, agent, fireSeamAtWorker } = makeSyncedPair(profile)

    // Simulated TTL scheme: token minted at grant, valid 10s. This is the
    // scheme the gate's header forbids — reproduced here only as the
    // negative control.
    const token = { contactId, mintedAtMs: Date.now(), ttlMs: 10_000 }
    const ttlAuthorizes = () => Date.now() - token.mintedAtMs < token.ttlMs

    const { delivered } = fireSeamAtWorker()
    await delivered // signal has ARRIVED on the agent replica

    // TTL: still authorizing — unexpired token, revocation invisible to it.
    expect(ttlAuthorizes()).toBe(true)
    // Gate: blocked on the very next invocation.
    expect(await agent.gate.assertCapabilityCurrent(contactId, 'read-bundle')).toBe('blocked-unconfirmed')
    // Under TTL, exposure = max(propagation, remaining TTL); under the
    // per-invocation gate, exposure = propagation, exactly.
  })
})

// --- Item 1.2 acceptance: degraded run re-executed, states diverge -----------
// v0.3 Item 1.2 acceptance: "degraded-sync run from 1.1 re-executed showing
// the states diverge under throttling." Divergence here is per-replica
// derived state — physics made visible in the two-state model.

describe('two-state revocation under degraded sync (Item 1.2 re-execution)', () => {
  it('states diverge across replicas during the gap; confirmation is its own later event', async () => {
    const profile: NetworkProfile = { name: 'degraded', latencyMs: 200 }
    const { contactId, worker, agent, fireSeamAtWorker } = makeSyncedPair(profile)

    const { revokedAtMs, delivered } = fireSeamAtWorker()

    // DURING THE GAP — the divergence, stated as derived states:
    // worker replica: 'issued' (it fired the seam; signal in flight)
    // agent replica:  'none'   (grant still current on its local knowledge)
    expect(revocationConfirmationState(worker.doc.contacts[contactId])).toBe('issued')
    expect(revocationConfirmationState(agent.doc.contacts[contactId])).toBe('none')

    await delivered

    // AFTER DELIVERY — both replicas now 'issued'; on this transport
    // (no ack surface, Item 1.1 finding) this is the honest resting state:
    // "issued — propagation unconfirmed on this transport."
    expect(revocationConfirmationState(worker.doc.contacts[contactId])).toBe('issued')
    expect(revocationConfirmationState(agent.doc.contacts[contactId])).toBe('issued')
    expect(await worker.gate.assertCapabilityCurrent(contactId, 'read-bundle')).toBe('blocked-unconfirmed')

    // CONFIRMATION — simulating the future acknowledgment signal Item 1.1
    // found absent from the transport. The basis is named; the event gets
    // its own timestamp, independent of the issued event's.
    await sleep(30)
    const outcome = confirmRevocation(
      (mutate) => mutate(worker.doc as WorkerKnowledgeGraph),
      contactId,
      'simulated transport acknowledgment (test stand-in; no ack surface on BroadcastChannel — Item 1.1 finding)',
    )
    expect(outcome).toBe('confirmed')
    expect(revocationConfirmationState(worker.doc.contacts[contactId])).toBe('confirmed')
    // Gate mapping flips: issued → blocked-unconfirmed became
    // confirmed → blocked-revoked.
    expect(await worker.gate.assertCapabilityCurrent(contactId, 'read-bundle')).toBe('blocked-revoked')

    // BOTH EVENTS in the log, independent timestamps — the delta between
    // them is the issued→confirmed propagation gap, made visible.
    const issuedEvt = worker.accessLog.find((e) => e.eventType === 'capability-revoked')
    const confirmedEvt = worker.accessLog.find((e) => e.eventType === 'capability-revocation-confirmed')
    expect(issuedEvt).toBeDefined()
    expect(confirmedEvt).toBeDefined()
    const issuedMs = Date.parse(issuedEvt!.timestamp)
    const confirmedMs = Date.parse(confirmedEvt!.timestamp)
    expect(confirmedMs).toBeGreaterThan(issuedMs)
    // Record the measured issued→confirmed delta alongside the 1.1 timings.
    timings.push({
      profile: 'degraded (1.2 re-execution, issued→confirmed)',
      propagationGapMs: confirmedMs - revokedAtMs,
      exposureBeyondPhysicsMs: 0,
      staleChecksDuringGap: 0,
    })
  })
})
