import { Repo } from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { WorkerKnowledgeGraph } from './types'

const ROOT_DOC_URL_KEY = 'keyhive-employment-seam-root'

function initialDocument(publicKeyFingerprint: string): WorkerKnowledgeGraph {
  const now = new Date().toISOString()
  return {
    identity: {
      displayName: '',
      publicKeyFingerprint,
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

// Now async because repo.create2() is async (Keyhive idFactory generates the doc ID).
// publicKeyFingerprint is passed in from main.tsx after hive initialization —
// this keeps rootDoc.ts free of any direct Keyhive import.
export const getOrCreateRoot = async (
  repo: Repo,
  publicKeyFingerprint: string
): Promise<AutomergeUrl> => {
  const existingUrl = localStorage.getItem(ROOT_DOC_URL_KEY)
  if (existingUrl) {
    return existingUrl as AutomergeUrl
  }

  // create2 uses the Keyhive idFactory to generate a document ID derived from
  // the worker's keypair. Documents created with create2 are Keyhive-protected:
  // the relay can sync ciphertext but cannot read the contents.
  // create() would produce an unprotected document — do not use it here.
  const root = await repo.create2<WorkerKnowledgeGraph>(initialDocument(publicKeyFingerprint))
  localStorage.setItem(ROOT_DOC_URL_KEY, root.url)
  return root.url
}
