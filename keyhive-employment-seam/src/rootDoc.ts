import { Repo } from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { WorkerKnowledgeGraph } from './types'

const ROOT_DOC_URL_KEY = 'keyhive-employment-seam-root'

function initialDocument(): WorkerKnowledgeGraph {
  const now = new Date().toISOString()
  return {
    identity: {
      displayName: '',
      publicKeyFingerprint: '',
      createdAt: now,
      lastModified: now,
    },
    projects: {},
    contacts: {},
    decisions: [],
    artifacts: {},
    handoffs: {},
    accessLog: [{
      eventId: crypto.randomUUID(),
      timestamp: now,
      eventType: 'document-initialized',
      notes: 'Knowledge graph initialized',
    }],
  }
}

export const getOrCreateRoot = (repo: Repo): AutomergeUrl => {
  const existingUrl = localStorage.getItem(ROOT_DOC_URL_KEY)
  if (existingUrl) {
    return existingUrl as AutomergeUrl
  }
  const root = repo.create<WorkerKnowledgeGraph>(initialDocument())
  localStorage.setItem(ROOT_DOC_URL_KEY, root.url)
  return root.url
}