/**
 * PC#8 Phase 3 — Item 3.1b SPIKE (S5, 2026-08-29)
 * Encrypted-transport fixture for Run 6: two hives on
 * initializeAutomergeRepoKeyhive (subduction transport), paired in-process
 * over the repo's PairNetworkAdapter via `subductionAdapters` — no sync
 * server. Answers spike questions 1–3 of the S4 handoff §7 kickoff with
 * observed behaviour; question 4 is derived from the deviations recorded
 * here and lives in the spike record.
 *
 * Spike code, not seam code. Not a Run 6 fixture yet; the fixture delta is
 * written from what this file observes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import { PairNetworkAdapter } from '../helpers/pair-network-adapter.js';
import { DummyStorageAdapter } from '@automerge/automerge-repo/helpers/DummyStorageAdapter.js';
import {
  initializeAutomergeRepoKeyhive,
  Access,
  setKeyhiveLogLevel,
} from '@automerge/automerge-repo-keyhive';
setKeyhiveLogLevel('debug');

const T = 15_000;

async function ed25519Pair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
}

/** Keyhive peer id in its wire form: base64 of the raw 32-byte Ed25519
 *  public key, no suffix (codec.ts#peerIdToSubduction strips any suffix). */
async function wirePeerId(kp: CryptoKeyPair): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return Buffer.from(raw).toString('base64');
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms)),
  ]);
}

async function grantWithRetry(hive: any, url: string, card: any, access: any) {
  for (let i = 0; i < 40; i++) {
    try {
      await hive.addMemberToDoc(url, card, access);
      return i;
    } catch (e: any) {
      if (e?.name === 'UnprotectedDocError' || /unprotected/i.test(String(e))) {
        await new Promise((r) => setTimeout(r, 250));
      } else throw e;
    }
  }
  throw new Error('grant never accepted (UnprotectedDocError persisted)');
}

let netA: PairNetworkAdapter;
let netB: PairNetworkAdapter;
let author: any;
let actor: any;
let authorIdInActorHive: any;
let actorIdInAuthorHive: any;
let actorRepoStorage: DummyStorageAdapter;

describe('Item 3.1b spike — encrypted (subduction) transport, in-process', () => {
  beforeAll(async () => {
    [netA, netB] = PairNetworkAdapter.createConnectedPair();
    const kpA = await ed25519Pair();
    const kpB = await ed25519Pair();
    const pidA = await wirePeerId(kpA);
    const pidB = await wirePeerId(kpB);

    const mk = (kp: CryptoKeyPair, remote: string, adapter: PairNetworkAdapter, label: string, role: 'connect' | 'accept') =>
      initializeAutomergeRepoKeyhive({
        storage: new DummyStorageAdapter(),
        peerIdSuffix: label,
        keyPair: kp,
        syncServer: 'none',
        remotePeerId: remote as any,
        shareConfigDebounceMs: 0,
        createRepo: (cfg: any) => new Repo(cfg),
        repo: {
          storage: role === 'connect' ? (actorRepoStorage = new DummyStorageAdapter()) : new DummyStorageAdapter(),
          subductionAdapters: [{ adapter, serviceName: 'spike-3-1b', role }],
        },
      });

    [author, actor] = await Promise.all([
      mk(kpA, pidB, netA, 'author', 'accept'),
      mk(kpB, pidA, netB, 'actor', 'connect'),
    ]);
    netA.peerCandidate(netB.peerId!);
    netB.peerCandidate(netA.peerId!);
  }, T);

  afterAll(() => {
    netA?.disconnect();
    netB?.disconnect();
  });

  it('Q1: two subduction hives pair in-process without a sync server', async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (author.repo.isSubductionConnected() && actor.repo.isSubductionConnected()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(author.repo.isSubductionConnected()).toBe(true);
    expect(actor.repo.isSubductionConnected()).toBe(true);
    const peersA = await author.repo.connectedSubductionPeerIds();
    const peersB = await actor.repo.connectedSubductionPeerIds();
    expect(peersA.length).toBe(1);
    expect(peersB.length).toBe(1);
    // Exchange contact cards both ways (keyhive identity, not transport).
    actorIdInAuthorHive = (await author.hive.receiveContactCard(actor.hive.active.contactCard))!.id;
    authorIdInActorHive = (await actor.hive.receiveContactCard(author.hive.active.contactCard))!.id;
    expect(actorIdInAuthorHive).toBeDefined();
  }, T);

  let urlA: string; let urlB: string; let urlC: string;

  it('Q2a: author creates a/b/c and grants actor read on a/b', async () => {
    const mkDoc = (n: string) => (author.repo as any).create2({
      title: `section_${n}`, content: `content ${n}`, createdAt: new Date().toISOString(),
    });
    const [hA, hB, hC] = await Promise.all([mkDoc('a'), mkDoc('b'), mkDoc('c')]);
    urlA = hA.url; urlB = hB.url; urlC = hC.url;
    console.log('[spike] ids a/b/c:', urlA, urlB, urlC);
    const card = actor.hive.active.contactCard;
    const ra = await grantWithRetry(author.hive, urlA, card, Access.read());
    const rb = await grantWithRetry(author.hive, urlB, card, Access.read());
    console.log(`[spike] grant retries a=${ra} b=${rb}`);
    const accA = await author.hive.accessForDoc(actorIdInAuthorHive, urlA);
    const accC = await author.hive.accessForDoc(actorIdInAuthorHive, urlC);
    expect(accA?.isReader).toBe(true);
    expect(accC).toBeUndefined();
  }, T);

  /** Wait until the actor's own hive reports the grant (keyhive sync). */
  async function waitActorSeesGrant(url: string, ms: number) {
    const selfActor = actor.hive.active.individual.id;
    const deadline = Date.now() + ms;
    let seen: any;
    while (Date.now() < deadline) {
      seen = await actor.hive.accessForDoc(selfActor, url);
      if (seen !== undefined) return seen;
      await new Promise((r) => setTimeout(r, 200));
    }
    return seen;
  }

  /** find() with resync retries; returns {behaviour, doc}. */
  async function patientFind(url: string, label: string, rounds: number, roundMs: number) {
    let last = '';
    for (let i = 0; i < rounds; i++) {
      try {
        const h = await withTimeout(actor.repo.find(url), roundMs, `find:${label}`);
        const d = await withTimeout(h.doc(), roundMs, `doc:${label}`);
        return { behaviour: `round ${i}: find resolved; doc() returned ${JSON.stringify(d)}`, doc: d };
      } catch (e: any) {
        last = String(e?.message ?? e);
        try { actor.repo.resyncSubduction((url as string).replace(/^automerge:/, '') as any); } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return { behaviour: `after ${rounds} rounds: ${last}`, doc: null };
  }

  it('Q2b: actor find()s a and b — readable in plaintext', async () => {
    const seenA = await waitActorSeesGrant(urlA, 15_000);
    console.log('[spike] actor-hive sees grant on a before find:', String(seenA));
    const readDoc = async (url: string, label: string) => {
      const r = await patientFind(url, label, 10, 3_000);
      console.log(`[spike] actor read ${label}:`, r.behaviour);
      if (!r.doc) throw new Error(r.behaviour);
      return r.doc;
    };
    const dA = await readDoc(urlA, 'a');
    const dB = await readDoc(urlB, 'b');
    expect(dA.title).toBe('section_a');
    expect(dB.title).toBe('section_b');
  }, 90_000);

  it('Q2c: actor find()s c — MUST NOT be obtainable or decryptable', async () => {
    const r = await patientFind(urlC, 'c', 6, 3_000);
    const behaviour = r.behaviour;
    const plaintext = r.doc;
    console.log('[spike] actor read c behaviour:', behaviour);
    const leaked = plaintext !== null && (plaintext.title === 'section_c' || plaintext.content === 'content c');
    expect(leaked).toBe(false);
    // What did the actor's repo storage receive for c? Bytes yes, plaintext no.
    const chunks = await actorRepoStorage.loadRange([]);
    const dec = new TextDecoder('utf8', { fatal: false });
    let cBytes = 0; let plainHits = 0; let aHits = 0;
    for (const ch of chunks) {
      if (!ch.data) continue;
      const key = ch.key.join('/');
      const txt = dec.decode(ch.data);
      if (/section_c|content c/.test(txt)) plainHits++;
      if (/section_a|content a/.test(txt)) aHits++;
      if (key.includes(urlC.replace(/^automerge:/, ''))) cBytes += ch.data.byteLength;
    }
    console.log(`[spike] actor storage: chunks=${chunks.length} bytesUnderC=${cBytes} plaintextHitsC=${plainHits} plaintextHitsA=${aHits}`);
    expect(plainHits).toBe(0);
  }, 60_000);

  it('Q3: creator access on own doc; actor-hive visibility of its own grants', async () => {
    const selfAuthor = author.hive.active.individual.id;
    const selfActor = actor.hive.active.individual.id;
    const creator = await author.hive.accessForDoc(selfAuthor, urlA);
    console.log('[spike] creator accessForDoc(self, a):', String(creator));
    expect(String(creator)).toBe('Admin');
    // Does the ACTOR's hive see the grant the author issued? (S4 ruling 2)
    let seen: any = undefined;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      seen = await actor.hive.accessForDoc(selfActor, urlA);
      if (seen !== undefined) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const seenC = await actor.hive.accessForDoc(selfActor, urlC);
    console.log('[spike] actor-hive accessForDoc(self, a):', String(seen), ' (self, c):', String(seenC));
    expect(seen?.isReader).toBe(true);
    expect(seenC).toBeUndefined();
  }, T);
});
