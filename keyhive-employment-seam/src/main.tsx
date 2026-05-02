import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { Repo } from '@automerge/automerge-repo'
import { RepoContext } from '@automerge/automerge-repo-react-hooks'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel'
import { getOrCreateRoot } from './rootDoc'
import App from './App'
import './index.css'

const repo = new Repo({
  network: [new BroadcastChannelNetworkAdapter()],
  storage: new IndexedDBStorageAdapter(),
})

const rootDocUrl = getOrCreateRoot(repo)
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