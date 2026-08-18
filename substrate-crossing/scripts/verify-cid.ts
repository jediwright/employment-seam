/**
 * PC#8 Phase 2 — Item 2.2: CID-anchor stability verification (AC-2.3 / AC-2.4)
 *
 * For each supplied record, three checks:
 *
 *   A. Round-trip (AC-2.3): the operator-supplied putRecord() CID
 *      (from the crossing runner output / completion record
 *      `crossingTargetCID` / canonical observation log) equals the CID
 *      returned by an unauthenticated com.atproto.repo.getRecord.
 *   B. Independent recompute (AC-2.4): the CID recomputed locally from
 *      the record CONTENT — atproto's own derivation method:
 *      JSON → lex (jsonToLex, @atproto/lexicon) → DAG-CBOR → sha2-256 →
 *      CIDv1/dag-cbor (cidForCbor, @atproto/common) — equals the
 *      PDS-returned CID. This proves the CID is content-addressed, not
 *      a sequence number or opaque PDS identifier.
 *   C. Cross-consistency: A and B agree with each other.
 *
 * AC-2.3 requires three round-trips. Supply three records.
 *
 * Run:   npm run verify:cid -- <rkey>=<putRecordCid> [<rkey>=<putRecordCid> ...]
 *        (package.json: "verify:cid": "tsx scripts/verify-cid.ts" —
 *        use the same runner as check:pds if it is not tsx)
 *        A bare <rkey> with no =cid runs checks B/C only for that record
 *        and marks the round-trip UNSUPPLIED (does not count toward the
 *        three).
 * Env:   TEST_DID    (default: the PC#8 test-account DID)
 *        COLLECTION  (default: com.whtwnd.blog.entry)
 *        PDS_SERVICE (default: https://bsky.social)
 *
 * Deps (dev ok): @atproto/common, @atproto/lexicon — both already in the
 * @atproto dependency tree; add explicitly if not hoisted:
 *   npm i @atproto/common @atproto/lexicon
 *
 * No writes. No credentials. Evidence targets are read-only.
 */

import { cidForCbor } from "@atproto/common";
import { jsonToLex } from "@atproto/lexicon";

const TEST_DID =
  process.env.TEST_DID ?? "did:plc:4xoefmmbsulm4xns3kbb6mnk";
const COLLECTION = process.env.COLLECTION ?? "com.whtwnd.blog.entry";
const PDS_SERVICE = process.env.PDS_SERVICE ?? "https://bsky.social";

interface Target {
  rkey: string;
  putRecordCid: string | null;
}

interface RowResult {
  rkey: string;
  putRecordCid: string | null;
  getRecordCid: string;
  recomputedCid: string;
  roundTripMatch: "MATCH" | "MISMATCH" | "UNSUPPLIED";
  contentAddressMatch: "MATCH" | "MISMATCH";
}

function parseArgs(argv: string[]): Target[] {
  const targets: Target[] = [];
  for (const a of argv) {
    const eq = a.indexOf("=");
    if (eq === -1) {
      targets.push({ rkey: a, putRecordCid: null });
    } else {
      targets.push({
        rkey: a.slice(0, eq),
        putRecordCid: a.slice(eq + 1),
      });
    }
  }
  return targets;
}

async function getPdsRecord(
  rkey: string
): Promise<{ cid: string; value: unknown }> {
  const url =
    `${PDS_SERVICE}/xrpc/com.atproto.repo.getRecord` +
    `?repo=${encodeURIComponent(TEST_DID)}` +
    `&collection=${encodeURIComponent(COLLECTION)}` +
    `&rkey=${encodeURIComponent(rkey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getRecord ${rkey}: HTTP ${res.status}`);
  const body = (await res.json()) as { cid?: string; value?: unknown };
  if (!body.cid || body.value === undefined)
    throw new Error(`getRecord ${rkey}: response missing cid/value`);
  return { cid: body.cid, value: body.value };
}

async function recomputeCid(recordJsonValue: unknown): Promise<string> {
  // atproto derivation: JSON form → lex values (restores $link/$bytes
  // to CID/bytes; a no-op for plain-field records like ours, applied
  // anyway for method fidelity) → DAG-CBOR → sha2-256 → CIDv1 dag-cbor.
  const lex = jsonToLex(recordJsonValue as any);
  const cid = await cidForCbor(lex);
  return cid.toString();
}

async function main() {
  const targets = parseArgs(process.argv.slice(2));
  if (targets.length === 0) {
    console.error(
      `usage: npm run verify:cid -- <rkey>=<putRecordCid> [more ...]\n` +
        `AC-2.3 needs three rkey=cid pairs.`
    );
    process.exit(1);
  }

  console.log(`[verify:cid] Item 2.2 — AC-2.3 / AC-2.4`);
  console.log(`  repo:       ${TEST_DID}`);
  console.log(`  collection: ${COLLECTION}`);
  console.log(`  pds:        ${PDS_SERVICE}`);
  console.log(``);

  const rows: RowResult[] = [];
  for (const t of targets) {
    const { cid: getCid, value } = await getPdsRecord(t.rkey);
    const recomputed = await recomputeCid(value);
    rows.push({
      rkey: t.rkey,
      putRecordCid: t.putRecordCid,
      getRecordCid: getCid,
      recomputedCid: recomputed,
      roundTripMatch:
        t.putRecordCid === null
          ? "UNSUPPLIED"
          : t.putRecordCid === getCid
            ? "MATCH"
            : "MISMATCH",
      contentAddressMatch: recomputed === getCid ? "MATCH" : "MISMATCH",
    });
  }

  console.log(
    `  rkey | putRecord CID | getRecord CID | round-trip (AC-2.3) | ` +
      `recomputed CID | content-addressed (AC-2.4)`
  );
  console.log(`  ` + `-`.repeat(100));
  for (const r of rows) {
    console.log(
      `  ${r.rkey} | ${r.putRecordCid ?? "(unsupplied)"} | ` +
        `${r.getRecordCid} | ${r.roundTripMatch} | ` +
        `${r.recomputedCid} | ${r.contentAddressMatch}`
    );
  }

  const roundTrips = rows.filter((r) => r.roundTripMatch === "MATCH").length;
  const roundTripFail = rows.some((r) => r.roundTripMatch === "MISMATCH");
  const contentFail = rows.some(
    (r) => r.contentAddressMatch === "MISMATCH"
  );

  console.log(``);
  console.log(
    `  AC-2.3 round-trip matches: ${roundTrips}/3 required` +
      (roundTripFail ? `  ** MISMATCH PRESENT — investigate **` : "")
  );
  console.log(
    `  AC-2.4 content-address: ${
      contentFail ? "** MISMATCH PRESENT — investigate **" : "all MATCH"
    }`
  );
  console.log(``);
  console.log(`  Observation-log note (verbatim per build plan Item 2.2):`);
  if (!roundTripFail && !contentFail && roundTrips >= 3) {
    console.log(
      `  "CID is content-addressed and stable across PDS retrieve; ` +
        `migration stability deferred."`
    );
  } else {
    console.log(
      `  (bar not met — record the failing rows verbatim; do not emit ` +
        `the closing note)`
    );
  }

  if (roundTripFail || contentFail) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
