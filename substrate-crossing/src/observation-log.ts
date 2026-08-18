/**
 * PC#8 — Substrate-Crossing Seam — Item 1.2
 * §H.3 structured observation log: entry model, builder, renderer, writer.
 *
 * Governing docs:
 *   pc08-build-plan-v0-1_2026-08-17.md (§2 Item 1.2 instrumentation;
 *     AC-1.2/1.3/1.4/1.7)
 *   observation-log-template-pc08.md (normative §H.3 field set; Run-N
 *     entry block format; append-only discipline)
 *   pattern-commons-08-substrate-crossing-seam-v0-1-3_2026-08-17.md
 *     (failure-state taxonomy — outcome CV mapping)
 *
 * DELIVERY-NOT-APPLICATION (machine-emitted entries):
 *   This module NEVER appends to the canonical observation log. It writes
 *   each run's entry block to its own output file (docs/run-N-entry_*.md);
 *   the operator pastes the block into the canonical log by hand. The
 *   canonical log's append-only discipline stays under the operator's hand.
 *
 * WINDOW ANCHOR (settled at session open, 2026-08-18):
 *   The intent-without-completion window's OPENING edge is the
 *   `intent-record-written` event in the CrossingLogEntry[] timing log —
 *   the first moment the intent record is document-resident and therefore
 *   legible to a deferred party (the failure taxonomy's
 *   `crossing-intent-pending` condition, "intent record emitted," made
 *   operational at the document write). The record's own `emittedAt`
 *   (mint stamp) is reported in the H.3 `intent_emitted_at` field per the
 *   template, but the window arithmetic anchors on the log event, not the
 *   mint stamp — the two differ by sub-millisecond mint→write latency and
 *   the write is the defensible legibility moment.
 *   The CLOSING edge is `completion-record-written` — Item 1.3's event.
 *   This session delivers the closing edge as a named hook only
 *   (CompletionHook in crossing-fire.ts); until 1.3 wires it, the window
 *   is null (applicable-but-unobserved per §H.3 null semantics).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CrossingLogEntry } from './crossing-intent.js';

// ---------------------------------------------------------------------------
// §H.3 entry model — field set and order are normative per the template.
// No fields added, none renamed (queue-don't-reopen applies to the template).
// ---------------------------------------------------------------------------

export type H3Scenario =
  | 'baseline'
  | 'failed'
  | 'delayed-release'
  | 'public-subset'
  | 'aggregated';

/** Template CV. Taxonomy mapping (spec v0.1.3 failure states):
 *  completed → crossing-complete; failed → crossing-intent-failed;
 *  timeout → crossing-unconfirmed (horizon elapsed, no completion). */
export type H3Outcome = 'completed' | 'failed' | 'timeout';

export interface H3Entry {
  crossing_run: number;
  scenario: H3Scenario;
  intent_emitted_at: string | null;
  putrecord_called_at: string | null;
  pds_accepted_at: string | null;
  relay_ingested_at: string | null;
  completion_written_at: string | null;
  crossing_outcome: H3Outcome;
  pds_accept_latency_ms: number | null;
  relay_ingest_gap_ms: number | null;
  intent_without_completion_window_ms: number | null;
  kl1_legibility_observation: string;
  kl2_back_pointer_observation: string;
}

// ---------------------------------------------------------------------------
// Builder — assembles an H.3 entry from the run's timing sources.
// ---------------------------------------------------------------------------

export interface BuildH3EntryParams {
  runNumber: number;
  scenario: H3Scenario;
  /** The ordered CrossingLogEntry[] from initiateCrossing() — the timing
   *  log the build plan requires the window to be computable from. */
  crossingLog: CrossingLogEntry[];
  /** intent record's own emittedAt (mint stamp) — H.3 field verbatim. */
  intentEmittedAt: string | null;
  /** From LivePutTimings (crossing-fire.ts). */
  putRecordCalledAt: string | null;
  pdsAcceptedAt: string | null;
  /** From JetstreamWatcher; null if not observed within timeout. */
  relayIngestedAt: string | null;
  /** From CompletionHook; null until Item 1.3 wires the closing edge. */
  completionWrittenAt: string | null;
  crossingOutcome: H3Outcome;
  kl1Observation: string;
  kl2Observation: string;
}

function findEvent(
  log: CrossingLogEntry[],
  event: CrossingLogEntry['event'],
): string | null {
  const e = log.find((l) => l.event === event);
  return e ? e.at : null;
}

function deltaMs(fromIso: string | null, toIso: string | null): number | null {
  if (fromIso === null || toIso === null) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return to - from;
}

export function buildH3Entry(p: BuildH3EntryParams): H3Entry {
  // Window opening edge: intent-record-written (see module header).
  const windowOpensAt = findEvent(p.crossingLog, 'intent-record-written');

  return {
    crossing_run: p.runNumber,
    scenario: p.scenario,
    intent_emitted_at: p.intentEmittedAt,
    putrecord_called_at: p.putRecordCalledAt,
    pds_accepted_at: p.pdsAcceptedAt,
    relay_ingested_at: p.relayIngestedAt,
    completion_written_at: p.completionWrittenAt,
    crossing_outcome: p.crossingOutcome,
    pds_accept_latency_ms: deltaMs(p.putRecordCalledAt, p.pdsAcceptedAt),
    relay_ingest_gap_ms: deltaMs(p.pdsAcceptedAt, p.relayIngestedAt),
    intent_without_completion_window_ms: deltaMs(
      windowOpensAt,
      p.completionWrittenAt,
    ),
    kl1_legibility_observation: p.kl1Observation,
    kl2_back_pointer_observation: p.kl2Observation,
  };
}

// ---------------------------------------------------------------------------
// Renderer — emits the template's Run-N entry block, field-for-field.
// ---------------------------------------------------------------------------

function fmt(v: string | number | null): string {
  return v === null ? 'null' : String(v);
}

/** Renders one append-ready entry block matching
 *  observation-log-template-pc08.md's Run 1+ format exactly:
 *  a `### Run N — <label>` heading followed by the fenced field block. */
export function renderH3Entry(entry: H3Entry, runLabel?: string): string {
  const heading = runLabel
    ? `### Run ${entry.crossing_run} — ${runLabel}`
    : `### Run ${entry.crossing_run}`;
  const lines = [
    '```',
    `crossing_run:        ${entry.crossing_run}`,
    `scenario:            ${entry.scenario}`,
    `intent_emitted_at:   ${fmt(entry.intent_emitted_at)}`,
    `putrecord_called_at: ${fmt(entry.putrecord_called_at)}`,
    `pds_accepted_at:     ${fmt(entry.pds_accepted_at)}`,
    `relay_ingested_at:   ${fmt(entry.relay_ingested_at)}`,
    `completion_written_at: ${fmt(entry.completion_written_at)}`,
    `crossing_outcome:    ${entry.crossing_outcome}`,
    `pds_accept_latency_ms: ${fmt(entry.pds_accept_latency_ms)}`,
    `relay_ingest_gap_ms: ${fmt(entry.relay_ingest_gap_ms)}`,
    `intent_without_completion_window_ms: ${fmt(entry.intent_without_completion_window_ms)}`,
    `kl1_legibility_observation: ${entry.kl1_legibility_observation}`,
    `kl2_back_pointer_observation: ${entry.kl2_back_pointer_observation}`,
    '```',
  ];
  return `${heading}\n\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Writer — own output file per run; never the canonical log.
// ---------------------------------------------------------------------------

/** Writes the rendered entry block to its own file and returns the path.
 *  Default path pattern: docs/run-<N>-entry_<ISO date>.md — the operator
 *  pastes the block into the canonical observation log by hand. */
export function writeH3EntryFile(
  entry: H3Entry,
  opts: { outPath?: string; runLabel?: string } = {},
): string {
  const date = new Date().toISOString().slice(0, 10);
  const path =
    opts.outPath ?? `docs/run-${entry.crossing_run}-entry_${date}.md`;
  mkdirSync(dirname(path), { recursive: true });
  const body = [
    `<!-- Machine-emitted §H.3 entry — Item 1.2 instrumentation.`,
    `     NOT the canonical observation log. Paste the block below into`,
    `     observation-log-template-pc08.md by hand (append-only,`,
    `     delivery-not-application). -->`,
    '',
    renderH3Entry(entry, opts.runLabel),
  ].join('\n');
  writeFileSync(path, body, 'utf8');
  return path;
}
