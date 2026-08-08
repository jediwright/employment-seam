import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { Repo, initSubduction } from '@automerge/automerge-repo'
import { RepoContext } from '@automerge/automerge-repo-react-hooks'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel'
import {
  initializeLegacyAutomergeRepoKeyhive,
  uint8ArrayToHex,
} from '@automerge/automerge-repo-keyhive'
import { getOrCreateRoot } from './rootDoc'
import App from './App'
import './index.css'

// Initialize Keyhive hive and repo together.
// - storage: Keyhive's own IndexedDB bucket (keypair + membership events)
// - networkAdapter: wraps BroadcastChannel for local-first / tab-to-tab sync
// - syncServer: 'none' — no relay server; worker owns all data locally
// - repo.storage: the existing doc storage bucket (Automerge document blobs)
//
// initializeLegacyAutomergeRepoKeyhive:
//   1. Calls initKeyhiveWasm() internally
//   2. Loads or generates an Ed25519 keypair from `storage`
//   3. Derives peerId and idFactory from the keypair
//   4. Calls createRepo({ network, peerId, idFactory, ...repo })
//   5. Links hive ↔ repo for membership change propagation
//
// initKeyhiveWasm() (called internally above) only loads Keyhive's own WASM
// module. The pinned automerge-repo build has a *separate* Subduction WASM
// module that the Repo constructor depends on (it calls set_subduction_logger
// synchronously in its constructor) — that one has to be awaited explicitly
// before createRepo runs, or the Repo constructor throws on an unready module.
await initSubduction()

const { hive, repo } = await initializeLegacyAutomergeRepoKeyhive({
  createRepo: (config) => new Repo(config),
  storage: new IndexedDBStorageAdapter('keyhive-employment-seam-identity'),
  peerIdSuffix: 'employment-seam',
  networkAdapter: new BroadcastChannelNetworkAdapter(),
  syncServer: 'none',
  repo: {
    storage: new IndexedDBStorageAdapter(),
  },
})

// Extract the hex fingerprint of this worker's Ed25519 public key.
// hive.active is populated after initialization and contains:
//   { keyPair, signer, peerId, individual, contactCard }
// signer.verifyingKey is the raw 32-byte public key.
// uint8ArrayToHex produces the 64-char hex string stored in the root doc.
const publicKeyFingerprint = uint8ArrayToHex(hive.active.signer.verifyingKey)

const rootDocUrl = await getOrCreateRoot(repo, publicKeyFingerprint)
const handle = await repo.find(rootDocUrl)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<div>Loading your knowledge graph...</div>}>
      <RepoContext.Provider value={repo}>
        <App docUrl={handle.url} />
      </RepoContext.Provider>
    </Suspense>
  </React.StrictMode>
)
