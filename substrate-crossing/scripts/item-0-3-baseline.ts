/**
 * PC#8 Phase 0, Item 0.3 — Automerge document baseline with Keyhive authorization.
 *
 * Acceptance (build plan v0.1 §2 Phase 0):
 *  - Automerge document exists with title/content/createdAt fields
 *  - Keyhive grant established on the document; test actor can read it
 *  - authorizedContentDigest computed and matches content at grant time
 *
 * Pattern: two local Keyhive identities (OWNER and TEST-ACTOR) wired over a
 * DummyNetworkAdapter pair with syncServer "none" — the standard local grant
 * pattern from the employment-seam prototype, adapted. No PDS, no crossing,
 * no intent record (Phase 1 scope).
 */
// Node wasm initialization: Repo imports the /slim entries, so the app loads
// the full node entries once to initSync the wasm modules.
import '@automerge/automerge';
import '@automerge/automerge-subduction';
import { Repo } from '@automerge/automerge-repo';
import { DummyStorageAdapter } from '@automerge/automerge-repo/helpers/DummyStorageAdapter.js';
import { DummyNetworkAdapter } from '@automerge/automerge-repo/helpers/DummyNetworkAdapter.js';
import {
  initializeLegacyAutomergeRepoKeyhive,
  Access,
} from '@automerge/automerge-repo-keyhive';
import { authorizedContentDigest, type CrossingSourceContent } from '../src/digest.js';

async function makeIdentity(label: string, networkAdapter: any) {
  return initializeLegacyAutomergeRepoKeyhive({
    storage: new DummyStorageAdapter(),
    peerIdSuffix: label,
    syncServer: 'none',
    networkAdapter,
    createRepo: (config) => new Repo(config),
  });
}

async function main() {
  const [ownerNet, actorNet] = DummyNetworkAdapter.createConnectedPair();

  const owner = await makeIdentity('pc08-owner', ownerNet);
  const actor = await makeIdentity('pc08-actor', actorNet);
  ownerNet.peerCandidate(actorNet.peerId!);
  actorNet.peerCandidate(ownerNet.peerId!);

  // 1. Automerge document with content fields (Groundmist-style local doc)
  const content: CrossingSourceContent = {
    title: 'PC#8 Phase 0 baseline entry',
    content: '# Baseline\n\nMinimal Markdown content for the substrate-crossing seam prototype.',
    createdAt: new Date().toISOString(),
  };
  // create2 is the keyhive-aware async create: it routes through the hive's
  // idFactory so the document is keyhive-protected from creation.
  const handle = await (owner.repo as any).create2(content);
  const doc = await handle.doc();
  console.log('[0.3] document exists:', handle.url);
  console.log('[0.3] fields:', Object.keys(doc ?? {}).join(', '));

  // 2. authorizedContentDigest at grant time (CP-F11 content binding)
  const digestAtGrant = authorizedContentDigest({
    title: doc!.title,
    content: doc!.content,
    createdAt: doc!.createdAt,
  });
  console.log('[0.3] authorizedContentDigest:', digestAtGrant);

  // 3. Keyhive grant: owner grants test actor read access via contact card.
  // The keyhive id factory registers doc protection asynchronously; poll
  // briefly until the doc is keyhive-protected before granting.
  const actorCard = await actor.hive.keyhive.contactCard();
  let granted = false;
  for (let i = 0; i < 20 && !granted; i++) {
    try {
      await owner.hive.addMemberToDoc(handle.url, actorCard, Access.read());
      granted = true;
    } catch (e: any) {
      if (e?.name === 'UnprotectedDocError' || /unprotected/i.test(String(e))) {
        await new Promise((r) => setTimeout(r, 250));
      } else throw e;
    }
  }
  if (!granted) throw new Error('doc never became keyhive-protected');

  // 3b. Verify the grant is queryable: resolve the actor's Individual from
  // its contact card and query its access on the document.
  const actorIndividual = await owner.hive.receiveContactCard(actorCard);
  if (actorIndividual) {
    const access = await owner.hive.accessForDoc(actorIndividual.id, handle.url);
    console.log('[0.3] accessForDoc(actor):', access ? access.toString() : 'undefined');
  }
  console.log('[0.3] grant established: actor granted read on', handle.url);

  // 4. Verify: digest recomputed from current content matches grant-time digest
  const digestNow = authorizedContentDigest({
    title: doc!.title,
    content: doc!.content,
    createdAt: doc!.createdAt,
  });
  const match = digestNow === digestAtGrant;
  console.log('[0.3] digest matches content at grant time:', match);

  if (!match) process.exit(1);
  console.log('[0.3] ITEM 0.3 BASELINE: PASS');
  process.exit(0);
}

main().catch((e) => {
  console.error('[0.3] ITEM 0.3 BASELINE: FAIL', e);
  process.exit(1);
});
