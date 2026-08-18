/**
 * In-memory connected-pair NetworkAdapter for tests.
 *
 * Rationale: @automerge/automerge-repo@2.6.0-subduction.40 ships
 * dist/helpers/DummyNetworkAdapter.js with a broken relative import
 * (`../../src/helpers/pause.js` — the src/ tree is not published), so the
 * packaged helper cannot be imported. This is a faithful, self-contained
 * replication of its connected-pair behavior (microtask delivery).
 * Watch item: remove when upstream fixes the helper packaging.
 */
import { NetworkAdapter, type Message, type PeerId } from '@automerge/automerge-repo';

export class PairNetworkAdapter extends NetworkAdapter {
  #sendMessage?: (message: Message) => void;
  #connected = false;
  #ready = false;
  #readyResolver?: () => void;
  #readyPromise: Promise<void> = new Promise((resolve) => {
    this.#readyResolver = resolve;
  });

  constructor(opts: { startReady?: boolean; sendMessage?: (m: Message) => void } = { startReady: true }) {
    super();
    if (opts.startReady !== false) this.#forceReady();
    this.#sendMessage = opts.sendMessage;
  }

  isReady(): boolean {
    return this.#ready;
  }
  whenReady(): Promise<void> {
    return this.#readyPromise;
  }
  #forceReady() {
    if (!this.#ready) {
      this.#ready = true;
      this.#readyResolver?.();
    }
  }
  connect(peerId: PeerId): void {
    this.#connected = true;
    this.peerId = peerId;
  }
  disconnect(): void {
    this.#connected = false;
  }
  peerCandidate(peerId: PeerId): void {
    this.emit('peer-candidate', { peerId, peerMetadata: {} });
  }
  send(message: Message): void {
    if (!this.#connected) return;
    this.#sendMessage?.(message);
  }
  receive(message: Message): void {
    if (!this.#connected) return;
    this.emit('message', message);
  }

  /** Microtask-delivery connected pair, mirroring the upstream helper. */
  static createConnectedPair(): [PairNetworkAdapter, PairNetworkAdapter] {
    const adapter1: PairNetworkAdapter = new PairNetworkAdapter({
      startReady: true,
      sendMessage: (message: Message) => queueMicrotask(() => adapter2.receive(message)),
    });
    const adapter2: PairNetworkAdapter = new PairNetworkAdapter({
      startReady: true,
      sendMessage: (message: Message) => queueMicrotask(() => adapter1.receive(message)),
    });
    return [adapter1, adapter2];
  }
}
