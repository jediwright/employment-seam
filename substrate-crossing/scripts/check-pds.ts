/**
 * PC#8 Phase 0, Item 0.2 — Live PDS credential setup and connectivity check.
 *
 * PDS target: bsky.social (declared 2026-08-17; self-hosted PDS held as
 * Phase 3 contingency).
 *
 * OPERATOR-RUN: this script requires live network access to bsky.social and
 * the Jetstream relay, which the authoring container does not have. Run
 * locally after creating a throwaway test account and an App Password:
 *
 *   cp .env.example .env   # fill in PDS_HANDLE + PDS_APP_PASSWORD
 *   npm run check:pds
 *
 * Acceptance (build plan v0.1 §2 Phase 0, Item 0.2):
 *  - createSession() succeeds against the chosen PDS
 *  - a test com.whtwnd.blog.entry record can be written and is observable on
 *    the relay within a measurable time window
 *  - relay subscription running and producing events for the test DID
 *
 * This is setup work, not a crossing: no intent record, no gate, no governed
 * act. The record written here is a plain connectivity probe. The measured
 * PDS-accept -> relay-ingest gap is the baseline timing for Phase 1 KL-1
 * instrumentation, logged in the H.3 observation format fields.
 */
import 'dotenv/config';
import { AtpAgent } from '@atproto/api';
import WebSocket from 'ws';

const PDS_SERVICE = process.env.PDS_SERVICE ?? 'https://bsky.social';
const HANDLE = process.env.PDS_HANDLE;
const APP_PASSWORD = process.env.PDS_APP_PASSWORD;
const JETSTREAM =
  process.env.JETSTREAM_ENDPOINT ??
  'wss://jetstream2.us-east.bsky.network/subscribe';
const RELAY_TIMEOUT_MS = 30_000;

async function main() {
  if (!HANDLE || !APP_PASSWORD) {
    console.error('[0.2] Missing PDS_HANDLE / PDS_APP_PASSWORD in .env');
    process.exit(1);
  }

  // --- 1. createSession() ---
  const agent = new AtpAgent({ service: PDS_SERVICE });
  const t0 = Date.now();
  await agent.login({ identifier: HANDLE, password: APP_PASSWORD });
  const did = agent.session?.did;
  console.log(`[0.2] createSession() OK (${Date.now() - t0}ms) did=${did}`);

  // --- 2. Relay subscription (start BEFORE the write so the event is caught) ---
  const wsUrl = JETSTREAM; // unfiltered: Jetstream wantedCollections filter does not deliver com.whtwnd.blog.entry commits (observed 2026-08-18); client-side DID+collection filter in the message handler
  const ws = new WebSocket(wsUrl);
  let relayIngestedAt: number | null = null;
  let observedUri: string | null = null;

  const relayObserved = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`relay event not observed within ${RELAY_TIMEOUT_MS}ms`)),
      RELAY_TIMEOUT_MS,
    );
    ws.on('message', (data: Buffer) => {
      try {
        const evt = JSON.parse(data.toString());
        if (
          evt?.did === did &&
          evt?.commit?.collection === 'com.whtwnd.blog.entry' &&
          evt?.commit?.operation === 'create'
        ) {
          relayIngestedAt = Date.now();
          observedUri = `at://${evt.did}/${evt.commit.collection}/${evt.commit.rkey}`;
          clearTimeout(timer);
          resolve();
        }
      } catch {
        /* non-JSON frame; ignore */
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  console.log(`[0.2] relay subscription open: ${JETSTREAM} (filtered to test DID)`);

  // --- 3. Write a test com.whtwnd.blog.entry record ---
  const putCalledAt = Date.now();
  const res = await agent.com.atproto.repo.createRecord({
    repo: did!,
    collection: 'com.whtwnd.blog.entry',
    record: {
      $type: 'com.whtwnd.blog.entry',
      title: 'PC#8 Item 0.2 connectivity probe',
      content: 'Connectivity probe — not a governed crossing. Safe to delete.',
      createdAt: new Date().toISOString(),
      visibility: 'public',
    },
  });
  const pdsAcceptedAt = Date.now();
  console.log(
    `[0.2] putRecord accepted (${pdsAcceptedAt - putCalledAt}ms) uri=${res.data.uri} cid=${res.data.cid}`,
  );

  // --- 4. Await relay observation and report the gap ---
  await relayObserved;
  console.log(`[0.2] relay ingested: ${observedUri}`);
  console.log(`[0.2] pds_accept_latency_ms: ${pdsAcceptedAt - putCalledAt}`);
  console.log(`[0.2] relay_ingest_gap_ms:   ${relayIngestedAt! - pdsAcceptedAt}`);
  ws.close();

  console.log('[0.2] ITEM 0.2 CONNECTIVITY: PASS');
  console.log('[0.2] (Optional cleanup: delete the probe record from the test account.)');
  process.exit(0);
}

main().catch((e) => {
  console.error('[0.2] ITEM 0.2 CONNECTIVITY: FAIL', e);
  process.exit(1);
});
