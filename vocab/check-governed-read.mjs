#!/usr/bin/env node
/**
 * check-governed-read.mjs — GSEF Q-D deferred-party check (reference impl)
 * v0.2 — QD-OI-1 applied: AF-2/AF-3 fingerprints verify against the lineage/
 *        horizon records AS OF CROSSING DATE via append-only prefix walk-back
 *        (truncate entries from the tail, recompute, match), not only the
 *        current file state. QD-OI-1 is CLOSED by this version.
 *
 * Given ONLY: a crossing record (with seam:schemaVersionDeclaration),
 * LINEAGE.md, and HORIZONS.md — determine governed-read status.
 * No third information source. Distinct failure states:
 *   AF-1 fail => undeclared-version
 *   AF-2 fail => lineage-unresolvable
 *   AF-3 fail => horizon-expired
 *
 * Usage: node check-governed-read.mjs <crossing.json> <LINEAGE.md> <HORIZONS.md>
 * Exit codes: 0 governed-read; 11 AF-1; 12 AF-2; 13 AF-3.
 *
 * ⚑ SINGLE-CONTEXT — NOT PANELED. Q-D build session 2026-08-19 (v0.2 same date).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const canonical = (o) =>
  JSON.stringify(o, (k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((a, key) => ((a[key] = v[key]), a), {})
      : v
  );

function machineBlock(mdText, label) {
  const m = mdText.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`no machine-readable block in ${label}`);
  return JSON.parse(m[1]);
}

/**
 * QD-OI-1 core: walk back through the append-only record's prefix states,
 * newest-first, recomputing the fingerprint at each state. Returns
 * { matched, atState, entries } where entries is the array as of the matched
 * state, or { matched: false } if no prefix state carries the declared hash.
 * `listKey` names the append-only array ("entries" / "versions").
 * NOTE (honest limit): non-array fields of the block (e.g. "issued") are held
 * at their current values during walk-back; if a future edit changes a scalar
 * field, that is an append-only violation upstream, not a checker concern.
 */
function prefixMatch(blockObj, listKey, declaredHash, prefix) {
  const full = blockObj[listKey];
  for (let n = full.length; n >= 1; n--) {
    const state = { ...blockObj, [listKey]: full.slice(0, n) };
    if (`${prefix}${sha256(canonical(state))}` === declaredHash)
      return { matched: true, atState: n, entries: full.slice(0, n) };
  }
  return { matched: false };
}

const [crossingPath, lineagePath, horizonsPath] = process.argv.slice(2);
const crossing = JSON.parse(readFileSync(crossingPath, 'utf8'));
const lineageBlock = machineBlock(readFileSync(lineagePath, 'utf8'), 'LINEAGE.md');
const horizonsBlock = machineBlock(readFileSync(horizonsPath, 'utf8'), 'HORIZONS.md');

const fail = (code, state, detail) => {
  console.log(`UNGOVERNED-READ [${state}] — ${detail}`);
  process.exit(code);
};

// ---- AF-1: version declared -------------------------------------------------
const d = crossing['seam:schemaVersionDeclaration'];
if (!d) fail(11, 'undeclared-version', 'seam:schemaVersionDeclaration absent');
const v = d['seam:vocabVersion'];
if (!v || !d['seam:vocabIRI'] || !d['seam:declaredAt'])
  fail(11, 'undeclared-version', 'declaration block malformed (missing required field)');
if (!d['seam:vocabIRI'].includes(`/${v}#`))
  fail(11, 'undeclared-version', `vocabIRI does not embed declared version ${v}`);
console.log(`AF-1 PASS — version ${v} declared at ${d['seam:declaredAt']}`);

// ---- AF-2: lineage bound, as of crossing date (QD-OI-1) ----------------------
// Content-address check FIRST, via prefix walk-back: find the historical state
// of the lineage record the declaration was stamped against.
const declaredLineageRef = d['seam:lineageRecordRef']?.['seam:ref'] ?? '';
const lm = prefixMatch(lineageBlock, 'entries', declaredLineageRef, 'lineage-sha256:');
if (!lm.matched)
  fail(12, 'lineage-unresolvable',
    `lineageRecordRef matches no state of the append-only lineage record ` +
    `(walked back ${lineageBlock.entries.length} prefix states) — record tampered, ` +
    `lineage rewritten (M4 violation), or wrong lineage file`);
console.log(
  `AF-2 (a) — lineage fingerprint matched at historical state ` +
  `${lm.atState}/${lineageBlock.entries.length} entries` +
  (lm.atState < lineageBlock.entries.length
    ? ` (record predates ${lineageBlock.entries.length - lm.atState} later entr${lineageBlock.entries.length - lm.atState === 1 ? 'y' : 'ies'})`
    : ' (current state)')
);
// Declared version + entry must exist WITHIN the matched historical state
const entry = lm.entries.find((e) => e.version === v && e.schema === true);
if (!entry)
  fail(12, 'lineage-unresolvable',
    `no schema-bearing lineage entry for version ${v} in the lineage state the record was stamped against`);
const declaredEntryId = d['seam:lineageRecordRef']?.['seam:lineageEntryId'];
if (declaredEntryId !== entry.id)
  fail(12, 'lineage-unresolvable',
    `declaration names lineage entry ${declaredEntryId}; matched lineage state holds ${entry.id} for ${v}`);
// Path composition runs against the CURRENT full record (T-2 full path: the
// deferred party translates forward to today's version, so later steps count)
const schemaEntries = lineageBlock.entries.filter((e) => e.schema);
const idx = schemaEntries.findIndex((e) => e.version === v);
const path = schemaEntries.slice(idx + 1);
for (const step of path)
  if (!step.translationFromPrior)
    fail(12, 'lineage-unresolvable',
      `translation step missing at ${step.version} — path from ${v} to current does not compose`);
console.log(
  `AF-2 PASS — entry ${entry.id}; path to current composes (${path.length} step(s): ${
    path.map((s) => s.translationFromPrior).join(' → ') || 'none needed'
  })`
);

// ---- AF-3: horizon unexpired at crossing date (QD-OI-1 walk-back on ref) ----
const h = d['seam:horizonAtCrossing'];
if (!h) fail(13, 'horizon-expired', 'horizonAtCrossing block absent (no horizon fact recorded at crossing)');
// Verify the horizon-record reference against the state in force at crossing
const declaredHorizonRef = h['seam:horizonRecordRef'] ?? '';
let horizonVersions = horizonsBlock.versions;
if (declaredHorizonRef) {
  const hm = prefixMatch(horizonsBlock, 'versions', declaredHorizonRef, 'horizons-sha256:');
  if (!hm.matched)
    fail(13, 'horizon-expired',
      `horizonRecordRef matches no state of the horizon record ` +
      `(walked back ${horizonsBlock.versions.length} prefix states) — cannot establish the horizon in force at crossing`);
  horizonVersions = hm.entries;
  console.log(`AF-3 (a) — horizon fingerprint matched at historical state ${hm.atState}/${horizonsBlock.versions.length} versions`);
}
const hv = horizonVersions.find((x) => x.version === v);
if (!hv) fail(13, 'horizon-expired', `no horizon record for version ${v} in the state in force at crossing`);
const horizonDate = h['seam:supportHorizon'] ?? hv.supportHorizon;
if (!horizonDate) fail(13, 'horizon-expired', `no declared horizon for version ${v}`);
if (h['seam:supportHorizon'] && hv.supportHorizon && h['seam:supportHorizon'] !== hv.supportHorizon)
  fail(13, 'horizon-expired',
    `record claims horizon ${h['seam:supportHorizon']} but the horizon record in force at crossing declares ${hv.supportHorizon}`);
const crossedAt = new Date(d['seam:declaredAt']);
if (crossedAt > new Date(`${horizonDate}T23:59:59Z`))
  fail(13, 'horizon-expired',
    `crossing ${d['seam:declaredAt']} is past declared horizon ${horizonDate} — ungoverned read per M3`);
console.log(`AF-3 PASS — horizon ${horizonDate} unexpired at crossing date`);

console.log('GOVERNED-READ — AF-1/AF-2/AF-3 all met from crossing record + lineage artifacts only.');
process.exit(0);
