/**
 * PC#8 — Substrate-Crossing Seam — Item 3.3 (Run 8)
 * TOCTOU between mint and fire: fire-time re-verification of the outgoing
 * payload against the minted authorizedContentDigest.
 *
 * Governing docs:
 *   pc08-phase3-spec-v0-1-r2_2026-08-30.md §3 Item 3.3 (TOCTOU only, per
 *     the r2 as-implemented-ahead note)
 *   pc08-phase3-item-3-3-build-brief-v0-1_2026-08-30.md (§3 design;
 *     Q1–Q4 operator rulings)
 *   CONVENTIONS v0.3 §Digest (the "not implemented at this version"
 *     paragraph this item closes)
 *
 * Two surfaces:
 *   A — assembly document mutated between mint and fire → step 8v BLOCKS
 *       (status fire-verification-blocked; Q2/Q3 rulings): intent stays
 *       document-resident, crossing reads crossing-unconfirmed.
 *   B — outgoing payload diverged from the minted digest → the fire
 *       wrapper THROWS before publish (seam-fault posture; harness broke).
 *
 * Surface B is evidenced HERE only (unit test): a live mismatched publish
 * would mint garbage evidence. Scoped absence accepted at the Q-gate.
 */
import { describe, it, expect } from 'vitest';
import '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import {
  initiateCrossing,
  computeAuthorizedContentDigest,
  type CrossingLogEntry,
  type CrossingIntentRecord,
  type GateCheckFn,
  type CrossingInputHandle,
  type CrossingDocShape,
} from '../src/crossing-intent.js';
import {
  makeTimedPutRecord,
  emptyTimings,
  type WhtwndEntryRecord,
} from '../src/crossing-fire.js';
import { assembleCrossingContent } from '../src/assembly.js';

const TEST_DID = 'did:plc:testtesttesttesttesttest';
const TARGET_PDS = 'https://bsky.social';
const ACK = 'operator-acknowledged: exposure-unbounded crossing for Item 3.3 tests';

const passGate: GateCheckFn = async ({ documentURI }) => ({
  result: 'pass',
  grantReference: 'keyhive:test:read',
  gateCheckedAt: new Date().toISOString(),
  access: 'Read',
  documentURI,
});

function fixture() {
  const repo = new Repo({ network: [] } as any);
  const a = repo.create<CrossingDocShape>({
    title: 'doc_a — employment subset',
    content: 'Employment record content (doc_a).',
    createdAt: '2026-08-30T12:00:00.000Z',
  } as any);
  const b = repo.create<CrossingDocShape>({
    title: 'doc_b — project subset',
    content: 'Project record content (doc_b).',
    createdAt: '2026-08-30T12:30:00.000Z',
  } as any);
  const asm = repo.create<CrossingDocShape>({ title: '', content: '', createdAt: null } as any);
  const input = (h: any): CrossingInputHandle => ({
    url: h.url,
    doc: () => h.doc(),
    heads: () => {
      try { return h.heads?.(); } catch { return undefined; }
    },
  });
  const inputs = [input(a), input(b)];
  const presentedFrom = async () => {
    const da = await a.doc(); const db = await b.doc();
    return assembleCrossingContent([
      { title: da.title, content: da.content, createdAt: da.createdAt },
      { title: db.title, content: db.content, createdAt: db.createdAt },
    ]);
  };
  return { repo, a, b, asm, inputs, presentedFrom };
}

function baseParams(f: ReturnType<typeof fixture>, presented: any, log: CrossingLogEntry[]) {
  return {
    inputs: f.inputs,
    handle: f.asm as any,
    presentedContent: presented,
    gateCheck: passGate,
    identity: {
      grantorDID: TEST_DID,
      targetDID: TEST_DID,
      identityCustodyClass: 'provider-custodied' as const,
    },
    targetPDS: TARGET_PDS,
    regimeAcknowledgment: ACK,
    crossingTimeoutHorizon: new Date(Date.now() + 60_000).toISOString(),
    log,
  };
}

describe('Item 3.3 — Surface A: step 8v fire-time re-verification', () => {
  it('blocks when the assembly document is mutated between mint and fire; intent stays document-resident; putRecord never called', async () => {
    const f = fixture();
    const presented = await f.presentedFrom();
    const log: CrossingLogEntry[] = [];
    let putCalled = false;
    const outcome = await initiateCrossing({
      ...baseParams(f, presented, log),
      putRecord: async () => {
        putCalled = true;
        throw new Error('putRecord must not fire on a blocked leg');
      },
      __testOnlyBetweenMintAndFire: () => {
        (f.asm as any).change((d: any) => {
          d.content = d.content + '\n\n<!-- mutated after mint, before fire -->';
        });
      },
    });

    expect(outcome.status).toBe('fire-verification-blocked');
    expect(putCalled).toBe(false);

    const events = log.map((e) => e.event);
    // The block is logged; no fire event exists (ordering statement).
    expect(events).toContain('intent-record-written');
    expect(events).toContain('fire-verification-blocked');
    expect(events).not.toContain('fire-verification-pass');
    expect(events).not.toContain('put-record-fired');
    expect(events.indexOf('fire-verification-blocked')).toBeGreaterThan(
      events.indexOf('intent-record-read-confirmed'),
    );

    // Evidence posture: the intent record is document-resident, NOT
    // retracted (append-only inside the document); crossing-unconfirmed.
    const doc = await (f.asm as any).doc();
    const intents = (doc.crossingRecords ?? []).filter(
      (r: CrossingIntentRecord) => r.recordType === 'crossing-intent',
    );
    expect(intents.length).toBe(1);
    expect(doc.completionRecords ?? []).toHaveLength(0);

    // The minted digest describes the PRE-mutation assembly; the document
    // no longer matches it — exactly what the block reason states.
    const nowDigest = computeAuthorizedContentDigest(doc);
    expect(nowDigest).not.toBe(intents[0].authorizedContentDigest);
    if (outcome.status === 'fire-verification-blocked') {
      expect(outcome.reason).toContain('assembly-mutated-after-mint');
      expect(outcome.reason).toContain('crossing-unconfirmed');
    }
  });

  it('passes on the clean path: fire-verification-pass is logged between the read-confirm and the fire, and the crossing fires', async () => {
    const f = fixture();
    const presented = await f.presentedFrom();
    const log: CrossingLogEntry[] = [];
    const outcome = await initiateCrossing({
      ...baseParams(f, presented, log),
      putRecord: async () => ({ uri: `at://${TEST_DID}/com.whtwnd.blog.entry/testrkey`, cid: 'bafytest' }),
    });

    expect(outcome.status).toBe('fired');
    const events = log.map((e) => e.event);
    const iConfirmed = events.indexOf('intent-record-read-confirmed');
    const iVerify = events.indexOf('fire-verification-pass');
    const iFired = events.indexOf('put-record-fired');
    expect(iVerify).toBeGreaterThan(iConfirmed);
    expect(iFired).toBeGreaterThan(iVerify);
    expect(events).not.toContain('fire-verification-blocked');
  });

  it('adversarial retest (spec r2 step): a clean attempt immediately after a blocked one passes — the gate does not latch', async () => {
    const f = fixture();
    const presented = await f.presentedFrom();

    // First: a TOCTOU-blocked attempt on its own assembly document.
    const log1: CrossingLogEntry[] = [];
    const blocked = await initiateCrossing({
      ...baseParams(f, presented, log1),
      putRecord: async () => {
        throw new Error('must not fire');
      },
      __testOnlyBetweenMintAndFire: () => {
        (f.asm as any).change((d: any) => {
          d.content = d.content + ' [tamper]';
        });
      },
    });
    expect(blocked.status).toBe('fire-verification-blocked');

    // Then: a fresh clean attempt on a FRESH assembly document (a retry
    // requires a fresh gate pass — KL-8a posture; the blocked document
    // keeps its evidence).
    const asm2 = f.repo.create<CrossingDocShape>({ title: '', content: '', createdAt: null } as any);
    const log2: CrossingLogEntry[] = [];
    const outcome = await initiateCrossing({
      ...baseParams(f, presented, log2),
      handle: asm2 as any,
      putRecord: async () => ({ uri: `at://${TEST_DID}/com.whtwnd.blog.entry/retest`, cid: 'bafyretest' }),
    });
    expect(outcome.status).toBe('fired');
  });

  it('seam fault: __testOnlyBetweenMintAndFire present but not a function throws (omitted-never-null rule)', async () => {
    const f = fixture();
    const presented = await f.presentedFrom();
    await expect(
      initiateCrossing({
        ...baseParams(f, presented, []),
        putRecord: async () => ({ uri: 'at://x', cid: 'y' }),
        __testOnlyBetweenMintAndFire: null as any,
      }),
    ).rejects.toThrow(/omitted-never-null|not a function/);
  });

  it('the hook is a parameter, never a record field: the minted intent record carries no hook and its canonical field set is unchanged', async () => {
    const f = fixture();
    const presented = await f.presentedFrom();
    const log: CrossingLogEntry[] = [];
    const outcome = await initiateCrossing({
      ...baseParams(f, presented, log),
      putRecord: async () => ({ uri: 'at://x', cid: 'y' }),
      __testOnlyBetweenMintAndFire: () => {
        /* present, no-op — the window opens and closes clean */
      },
    });
    expect(outcome.status).toBe('fired');
    const doc = await (f.asm as any).doc();
    const intent = (doc.crossingRecords ?? [])[0] as Record<string, unknown>;
    expect(intent).toBeDefined();
    expect(Object.keys(intent).some((k) => k.includes('testOnly') || k.includes('hook'))).toBe(false);
  });
});

describe('Item 3.3 — Surface B: fire-wrapper payload check (unit-test-only evidence, scoped)', () => {
  const intentFor = (content: { title: string; content: string; createdAt: string }): CrossingIntentRecord =>
    ({
      recordType: 'crossing-intent',
      authorizedContentDigest: computeAuthorizedContentDigest(content),
    } as unknown as CrossingIntentRecord);

  it('throws before publish when the outgoing payload content diverges from the minted digest; putRecordCalledAt never stamped', async () => {
    const authorized = {
      title: 'Authorized title',
      content: 'Authorized content.',
      createdAt: '2026-08-30T12:00:00.000Z',
    };
    const divergent: WhtwndEntryRecord = {
      $type: 'com.whtwnd.blog.entry',
      title: authorized.title,
      content: 'SWAPPED content the intent never authorized.',
      createdAt: authorized.createdAt,
      visibility: 'public',
    };
    const timings = emptyTimings();
    let published = false;
    const put = makeTimedPutRecord({
      publish: async () => {
        published = true;
        return { uri: 'at://x', cid: 'y' };
      },
      record: divergent,
      timings,
    });
    await expect(put(intentFor(authorized))).rejects.toThrow(/Surface B|diverged/);
    expect(published).toBe(false);
    expect(timings.putRecordCalledAt).toBeNull();
    expect(timings.pdsAcceptedAt).toBeNull();
  });

  it('passes when the payload matches: the digest boundary excludes $type, visibility, and seamCrossingRef', async () => {
    const authorized = {
      title: 'Authorized title',
      content: 'Authorized content.',
      createdAt: '2026-08-30T12:00:00.000Z',
    };
    const record: WhtwndEntryRecord = {
      $type: 'com.whtwnd.blog.entry',
      ...authorized,
      visibility: 'public',
    };
    const timings = emptyTimings();
    const put = makeTimedPutRecord({
      publish: async () => ({ uri: 'at://x', cid: 'y' }),
      record,
      timings,
    });
    const res = await put(intentFor(authorized));
    expect(res.uri).toBe('at://x');
    expect(timings.putRecordCalledAt).not.toBeNull();
  });

  it('intent-less direct calls (mock/unit paths) skip the check unchanged — earlier-item shapes preserved', async () => {
    const record: WhtwndEntryRecord = {
      $type: 'com.whtwnd.blog.entry',
      title: 't',
      content: 'c',
      createdAt: '2026-08-30T12:00:00.000Z',
      visibility: 'public',
    };
    const timings = emptyTimings();
    const put = makeTimedPutRecord({
      publish: async () => ({ uri: 'at://x', cid: 'y' }),
      record,
      timings,
    });
    const res = await put();
    expect(res.cid).toBe('y');
  });
});
