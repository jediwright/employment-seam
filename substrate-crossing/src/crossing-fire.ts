/**
 * PC#8 — Substrate-Crossing Seam — Item 1.2
 * Live publish wiring: timed PutRecordFn, Jetstream relay watcher, and the
 * Item 1.3 completion hook (window closing edge, named but unwired).
 *
 * Governing docs:
 *   pc08-build-plan-v0-1_2026-08-17.md (§2 Item 1.2; AC-1.2/1.3)
 *   pattern-commons-08-substrate-crossing-seam-v0-1-3_2026-08-17.md
 *     (failure taxonomy; KL-1)
 *   session-record-pc08-item1-1-apply-close_2026-08-18.md (A6 tier-gate
 *     qualification — noted, not triggered: Item 1.2 remains read-gated;
 *     no tier-sensitive gating requirement arises at this item)
 *
 * Terminology note: the build plan's "putRecord()" is the generic
 * publish-call name. The concrete AT Protocol call is
 * com.atproto.repo.createRecord (auto-rkey), matching Item 0.2's probe.
 * The injected-function seam from Item 1.1 (PutRecordFn) is preserved;
 * this module supplies the live, timed implementation.
 *
 * Scope boundary (Item 1.3 excluded): the crossing-completion record is
 * NOT implemented here. Its timestamp anchor is delivered as CompletionHook
 * with the named event `completion-record-written` — the window's closing
 * edge. Until 1.3 calls hook.mark() at the completion-record document
 * write, completion_written_at is null and the intent-without-completion
 * window is applicable-but-unobserved (§H.3 null).
 */
import type { PutRecordFn, Clock } from './crossing-intent.js';

// ---------------------------------------------------------------------------
// Timed live publish — PDS-accept instrumentation (AC-1.2)
// ---------------------------------------------------------------------------

/** The com.whtwnd.blog.entry record shape published at this item.
 *  Item 1.4 (out of scope) later adds seamCrossingRef. */
export interface WhtwndEntryRecord {
  $type: 'com.whtwnd.blog.entry';
  title: string;
  content: string;
  createdAt: string;
  visibility: 'public';
}

/** Injected concrete publish call. run-crossing.ts wires the real
 *  agent.com.atproto.repo.createRecord; tests inject a mock. Keeping the
 *  agent out of this seam keeps the timing capture testable in-container
 *  (the container cannot reach bsky.social). */
export type PublishFn = (
  record: WhtwndEntryRecord,
) => Promise<{ uri: string; cid: string }>;

export interface LivePutTimings {
  /** ISO; stamped immediately before the publish call fires. */
  putRecordCalledAt: string | null;
  /** ISO; stamped when the PDS response resolves (the 200 OK moment as
   *  observable client-side). Null if the call threw. */
  pdsAcceptedAt: string | null;
  /** AT-URI from the PDS response; null until accepted. */
  uri: string | null;
  /** CID from the PDS response — becomes crossingTargetCID on the Item 1.3
   *  completion record; null until accepted. */
  cid: string | null;
}

/** Wraps a concrete publish call as the PutRecordFn that
 *  initiateCrossing() fires at step 6, capturing call/accept timestamps
 *  into the supplied timings object. On publish failure the call
 *  timestamp is retained, accepted stays null, and the error propagates —
 *  initiateCrossing() rejects, no completion is ever minted, and the
 *  intent record remains document-resident (crossing-intent-failed
 *  posture; retry requires a new gate pass per KL-8a). */
export function makeTimedPutRecord(params: {
  publish: PublishFn;
  record: WhtwndEntryRecord;
  timings: LivePutTimings;
  clock?: Clock;
}): PutRecordFn {
  const clock = params.clock ?? (() => new Date());
  return async () => {
    params.timings.putRecordCalledAt = clock().toISOString();
    const res = await params.publish(params.record);
    params.timings.pdsAcceptedAt = clock().toISOString();
    params.timings.uri = res.uri;
    params.timings.cid = res.cid;
    return res;
  };
}

export function emptyTimings(): LivePutTimings {
  return { putRecordCalledAt: null, pdsAcceptedAt: null, uri: null, cid: null };
}

// ---------------------------------------------------------------------------
// Jetstream relay watcher — relay-ingest instrumentation (AC-1.3)
// ---------------------------------------------------------------------------

/** Registered endpoint finding: jetstream1.us-east is the reliable
 *  endpoint (delivery variance on jetstream2 observed 2026-08-17/18).
 *  check-pds.ts still defaults to jetstream2 — divergence noted at this
 *  session; Item 1.2 defaults to jetstream1. */
export const DEFAULT_JETSTREAM =
  'wss://jetstream1.us-east.bsky.network/subscribe';

export interface RelayObservation {
  /** ISO; stamped when the matching commit event arrives. Null if the
   *  watch timed out (applicable-but-unobserved per §H.3). */
  relayIngestedAt: string | null;
  /** at:// URI reconstructed from the observed event; null on timeout. */
  observedUri: string | null;
  /** rkey of the observed record; null on timeout. */
  rkey: string | null;
  timedOut: boolean;
}

/** Minimal WebSocket surface used — lets tests inject the same `ws`
 *  implementation against a local server. */
export interface WsLike {
  on(event: 'open', cb: () => void): unknown;
  on(event: 'message', cb: (data: { toString(): string }) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  close(): void;
}
export type WsFactory = (url: string) => WsLike;

/**
 * Unfiltered Jetstream subscription with client-side DID + collection
 * filtering (registered finding: wantedCollections does not deliver
 * com.whtwnd.blog.entry commits). Subscription MUST be open before the
 * publish fires — start() resolves once the socket is open; observed()
 * resolves with the observation (or a timedOut observation; it does not
 * reject on timeout, so a missed relay event degrades to a null field in
 * the H.3 entry rather than aborting the run's other timings).
 */
export class JetstreamWatcher {
  #ws: WsLike | null = null;
  #resolved = false;
  #observation: Promise<RelayObservation>;
  #resolveObservation!: (o: RelayObservation) => void;
  #opened: Promise<void>;
  #resolveOpened!: () => void;
  #rejectOpened!: (e: Error) => void;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly opts: {
      endpoint?: string;
      did: string;
      collection?: string;
      timeoutMs?: number;
      clock?: Clock;
      wsFactory: WsFactory;
    },
  ) {
    this.#observation = new Promise((res) => (this.#resolveObservation = res));
    this.#opened = new Promise((res, rej) => {
      this.#resolveOpened = res;
      this.#rejectOpened = rej;
    });
  }

  /** Opens the subscription. Await this BEFORE firing the publish. */
  async start(): Promise<void> {
    const endpoint = this.opts.endpoint ?? DEFAULT_JETSTREAM;
    const collection = this.opts.collection ?? 'com.whtwnd.blog.entry';
    const clock = this.opts.clock ?? (() => new Date());
    const timeoutMs = this.opts.timeoutMs ?? 60_000;

    const ws = this.opts.wsFactory(endpoint);
    this.#ws = ws;

    ws.on('open', () => this.#resolveOpened());
    ws.on('error', (e) => {
      this.#rejectOpened(e);
      this.#settle({
        relayIngestedAt: null,
        observedUri: null,
        rkey: null,
        timedOut: true,
      });
    });
    ws.on('message', (data) => {
      try {
        const evt = JSON.parse(data.toString());
        if (
          evt?.did === this.opts.did &&
          evt?.commit?.collection === collection &&
          evt?.commit?.operation === 'create'
        ) {
          this.#settle({
            relayIngestedAt: clock().toISOString(),
            observedUri: `at://${evt.did}/${evt.commit.collection}/${evt.commit.rkey}`,
            rkey: String(evt.commit.rkey),
            timedOut: false,
          });
        }
      } catch {
        /* non-JSON frame; ignore */
      }
    });

    this.#timer = setTimeout(() => {
      this.#settle({
        relayIngestedAt: null,
        observedUri: null,
        rkey: null,
        timedOut: true,
      });
    }, timeoutMs);

    await this.#opened;
  }

  #settle(o: RelayObservation): void {
    if (this.#resolved) return;
    this.#resolved = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#resolveObservation(o);
  }

  /** Resolves with the relay observation (or timedOut). */
  observed(): Promise<RelayObservation> {
    return this.#observation;
  }

  close(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#ws?.close();
  }
}

// ---------------------------------------------------------------------------
// Completion hook — the window's CLOSING edge, named for Item 1.3
// ---------------------------------------------------------------------------

/** Event name reserved for the closing edge. Item 1.3 stamps this into the
 *  CrossingLogEntry[] vocabulary when the completion record is written;
 *  here it exists so 1.3 inherits an unambiguous anchor (session decision
 *  2026-08-18: opening edge = intent-record-written; closing edge =
 *  completion-record-written). */
export const COMPLETION_WRITTEN_EVENT = 'completion-record-written' as const;

export interface CompletionHook {
  /** ISO timestamp of the completion-record document write; null until
   *  Item 1.3 wires mark(). */
  readonly completionWrittenAt: string | null;
  /** Called by Item 1.3 exactly once, at the completion record's
   *  document write. Second call throws — a completion is minted once. */
  mark(at?: Date): void;
}

export function createCompletionHook(clock?: Clock): CompletionHook {
  const c = clock ?? (() => new Date());
  let at: string | null = null;
  return {
    get completionWrittenAt() {
      return at;
    },
    mark(when?: Date) {
      if (at !== null) {
        throw new Error(
          `${COMPLETION_WRITTEN_EVENT} already marked; a completion record is minted once (completion-mint discipline)`,
        );
      }
      at = (when ?? c()).toISOString();
    },
  };
}
