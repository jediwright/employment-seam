import { useState } from 'react'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import { useDocument } from '@automerge/automerge-repo-react-hooks'
import type { WorkerKnowledgeGraph } from './types'
import ProjectsTab from './ProjectsTab'

type Tab = 'projects' | 'contacts' | 'decisions' | 'artifacts' | 'access-log'

export default function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)
  const [activeTab, setActiveTab] = useState<Tab>('projects')

  if (!doc) return <div className="p-4">Loading your knowledge graph...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">
            {doc.identity.displayName || 'My Knowledge Graph'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {new Date(doc.identity.createdAt).toLocaleDateString()}
          </p>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-4xl mx-auto flex gap-6">
          {(['projects', 'contacts', 'decisions', 'artifacts', 'access-log'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {activeTab === 'projects' && <ProjectsTab docUrl={docUrl} />}
        {activeTab === 'contacts' && <div className="text-gray-400">Contacts — coming soon</div>}
        {activeTab === 'decisions' && <div className="text-gray-400">Decisions — coming soon</div>}
        {activeTab === 'artifacts' && <div className="text-gray-400">Artifacts — coming soon</div>}
        {activeTab === 'access-log' && <div className="text-gray-400">Access Log — coming soon</div>}
      </main>
    </div>
  )
}