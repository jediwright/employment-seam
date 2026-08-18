/**
 * PC#8 Phase 2 — Item 2.1: Firehose raw payload inspection (AC-2.2)
 *
 * Watch-mode capture. This script performs NO writes and needs NO
 * credentials. It subscribes to Jetstream (unfiltered, with client-side
 * DID+collection filtering per Phase 0/1 F-findings: `wantedCollections`
 * does not reliably deliver commit events for com.whtwnd.blog.entry),
 * waits for the operator to fire a governed crossing from a second
 * terminal (the same machinery that produced Run 4), and captures the
 * FIRST matching commit event:
 *
 *   1. The raw WebSocket message is written VERBATIM (pre-parse) to
 *      docs/firehose-captures/<rkey>_<iso>.raw.json — this file is the
 *      AC-2.2 evidence object.
 *   2. The script reports whether `seamCrossingRef` is present in the
 *      firehose payload (`commit.record.seamCrossingRef`), and if
 *      present, field-by-field match against the PDS-stored version
 *      retrieved via unauthenticated com.atproto.repo.getRecord.
 *   3. §H.3-mapped lines are printed for the observation-log entry
 *      (relay_ingested_at from the event's time_us; the operator merges
 *      these with the crossing runner's own intent/putRecord timings).
 *
 * Run:   npm run verify:firehose            (add to package.json:
 *        "verify:firehose": "tsx scripts/verify-firehose-payload.ts" —
 *        use the same runner as check:pds if it is not tsx)
 * Env:   TEST_DID        (default: the PC#8 test-account DID)
 *        COLLECTION      (default: com.whtwnd.blog.entry)
 *        JETSTREAM_URL   (default: wss://jetstream1.us-east.bsky.network/subscribe)
 *        CAPTURE_TIMEOUT_MS (default: 300000 — 5 min watch window)
 *        PDS_SERVICE     (default: https://bsky.social — for getRecord cross-check)
 *
 * Evidence hygiene: the observed event should come from a GOVERNED
 * crossing (Run 5), not a bare probe, so the capture and the H.3 run
 * entry describe the same crossing. Do not delete the captured record
 * until Phase 2 close.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";

const TEST_DID =
  process.env.TEST_DID ?? "did:plc:4xoefmmbsulm4xns3kbb6mnk";
const COLLECTION = process.env.COLLECTION ?? "com.whtwnd.blog.entry";
const JETSTREAM_URL =
  process.env.JETSTREAM_URL ??
  "wss://jetstream1.us-east.bsky.network/subscribe";
const CAPTURE_TIMEOUT_MS = Number(
  process.env.CAPTURE_TIMEOUT_MS ?? 300_000
);
const PDS_SERVICE = process.env.PDS_SERVICE ?? "https://bsky.social";
const OUT_DIR = join("docs", "firehose-captures");

// The four seamCrossingRef sub-fields checked for firehose↔PDS parity
// (same field set AC-2.1 matched against the fired intent record).
const REF_FIELDS = [
  "crossingIntentRef",
  "authorizedContentDigest",
  "sourceDocumentURI",
  "sourceDocumentCID",
] as const;

function isoFromTimeUs(timeUs: number): string {
  return new Date(timeUs / 1000).toISOString();
}

async function getPdsRecord(rkey: string): Promise<any> {
  const url =
    `${PDS_SERVICE}/xrpc/com.atproto.repo.getRecord` +
    `?repo=${encodeURIComponent(TEST_DID)}` +
    `&collection=${encodeURIComponent(COLLECTION)}` +
    `&rkey=${encodeURIComponent(rkey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`getRecord ${rkey}: HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  console.log(`[verify:firehose] Item 2.1 — AC-2.2 capture`);
  console.log(`  endpoint:   ${JETSTREAM_URL}`);
  console.log(`  filter:     client-side ${TEST_DID} + ${COLLECTION}`);
  console.log(`  subscription: UNFILTERED (per F-finding on wantedCollections)`);
  console.log(`  window:     ${CAPTURE_TIMEOUT_MS} ms`);
  console.log(``);
  console.log(`  >>> Subscription opening. Fire the governed crossing`);
  console.log(`  >>> (Run 5) from a second terminal once "listening"`);
  console.log(`  >>> appears below.`);
  console.log(``);

  mkdirSync(OUT_DIR, { recursive: true });

  const ws = new WebSocket(JETSTREAM_URL); // deliberately no query params
  let captured = false;

  const timeout = setTimeout(() => {
    if (!captured) {
      console.error(
        `[verify:firehose] TIMEOUT — no matching commit event in ` +
          `${CAPTURE_TIMEOUT_MS} ms. Record the null observation and ` +
          `re-run; do not infer absence of the field from absence of ` +
          `the event.`
      );
      ws.close();
      process.exitCode = 1;
    }
  }, CAPTURE_TIMEOUT_MS);

  ws.on("open", () => console.log(`[verify:firehose] listening…`));
  ws.on("error", (err) => {
    console.error(`[verify:firehose] WebSocket error:`, err);
    process.exitCode = 1;
  });

  ws.on("message", async (data: WebSocket.RawData) => {
    const raw = data.toString(); // verbatim wire text — the evidence object
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return; // non-JSON frame; ignore
    }

    // Client-side filter (F-finding discipline)
    if (evt?.did !== TEST_DID) return;
    if (evt?.kind !== "commit") return;
    if (evt?.commit?.collection !== COLLECTION) return;
    if (evt?.commit?.operation !== "create" && evt?.commit?.operation !== "update")
      return;

    captured = true;
    clearTimeout(timeout);
    ws.close();

    const rkey: string = evt.commit.rkey ?? "unknown-rkey";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = join(OUT_DIR, `${rkey}_${stamp}.raw.json`);
    writeFileSync(outPath, raw, "utf8");

    const relayIngestedAt =
      typeof evt.time_us === "number" ? isoFromTimeUs(evt.time_us) : "null";
    const fhRecord = evt.commit.record ?? {};
    const fhRef = fhRecord.seamCrossingRef;
    const presence = fhRef !== undefined ? "PRESENT" : "ABSENT";

    console.log(``);
    console.log(`[verify:firehose] CAPTURED commit event`);
    console.log(`  rkey:                ${rkey}`);
    console.log(`  event cid:           ${evt.commit.cid ?? "n/a"}`);
    console.log(`  raw payload saved:   ${outPath}`);
    console.log(`  relay_ingested_at:   ${relayIngestedAt}`);
    console.log(`  seamCrossingRef in firehose payload: ${presence}`);

    // Cross-check against PDS-stored version (AC-2.1 parity at the
    // firehose layer). Unauthenticated read.
    try {
      const pds = await getPdsRecord(rkey);
      const pdsRef = pds?.value?.seamCrossingRef;
      console.log(
        `  seamCrossingRef in PDS getRecord():  ${
          pdsRef !== undefined ? "PRESENT" : "ABSENT"
        }`
      );
      if (fhRef !== undefined && pdsRef !== undefined) {
        for (const f of REF_FIELDS) {
          const match =
            JSON.stringify(fhRef?.[f]) === JSON.stringify(pdsRef?.[f]);
          console.log(
            `    ${f}: ${match ? "MATCH" : "MISMATCH"}` +
              (match ? "" : ` (firehose=${JSON.stringify(fhRef?.[f])} pds=${JSON.stringify(pdsRef?.[f])})`)
          );
        }
      }
      console.log(`  getRecord cid:       ${pds?.cid ?? "n/a"}`);
    } catch (err) {
      console.error(`  [warn] PDS cross-check failed:`, err);
    }

    console.log(``);
    console.log(`  §H.3 lines for the Run 5 observation-log entry`);
    console.log(`  (merge with the crossing runner's own timings):`);
    console.log(`  ---------------------------------------------`);
    console.log(`  relay_ingested_at:   ${relayIngestedAt}`);
    console.log(
      `  kl2_back_pointer_observation: seamCrossingRef ${presence} in raw ` +
        `Jetstream commit payload (capture file ${outPath}); ` +
        `see console output for firehose↔PDS field parity.`
    );
    console.log(`  ---------------------------------------------`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
