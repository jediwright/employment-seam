import { useState } from 'react'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import { useDocument } from '@automerge/automerge-repo-react-hooks'
import type { WorkerKnowledgeGraph } from './types'
import ProjectsTab from './ProjectsTab'
import ContactsTab from './ContactsTab'
import DecisionsTab from './DecisionsTab'
import ArtifactsTab from './ArtifactsTab'
import AccessLogTab from './AccessLogTab'
import HandoffsTab from './HandoffsTab'

type Tab = 'projects' | 'contacts' | 'decisions' | 'artifacts' | 'access-log' | 'handoffs'

// First-launch identity setup screen.
// Shown when displayName is empty (i.e. doc was just created).
// On submit, writes displayName into the Automerge doc via changeDoc.
function IdentitySetup({
  onSubmit,
}: {
  onSubmit: (displayName: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a display name.')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-lg p-8 max-w-sm w-full shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          Set up your identity
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Your knowledge graph is ready. Enter a display name to get started.
          This is stored locally and never leaves your device.
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Display name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. Jedi Wright"
          autoFocus
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
        <button
          onClick={handleSubmit}
          className="mt-4 w-full bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
        >
          Get started
        </button>
      </div>
    </div>
  )
}

export default function App({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)
  const [activeTab, setActiveTab] = useState<Tab>('projects')

  if (!doc) return <div className="p-4">Loading your knowledge graph...</div>

  // First-launch gate: show identity setup until displayName is set.
  if (!doc.identity.displayName) {
    return (
      <IdentitySetup
        onSubmit={(displayName) => {
          changeDoc((d) => {
            d.identity.displayName = displayName
            d.identity.lastModified = new Date().toISOString()
          })
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">
            {doc.identity.displayName}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {new Date(doc.identity.createdAt).toLocaleDateString()}
          </p>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-4xl mx-auto flex gap-6">
          {(['projects', 'contacts', 'decisions', 'artifacts', 'access-log', 'handoffs'] as Tab[]).map((tab) => (
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
        {activeTab === 'contacts' && <ContactsTab docUrl={docUrl} />}
        {activeTab === 'decisions' && <DecisionsTab docUrl={docUrl} />}
        {activeTab === 'artifacts' && <ArtifactsTab docUrl={docUrl} />}
        {activeTab === 'access-log' && <AccessLogTab docUrl={docUrl} />}
        {activeTab === 'handoffs' && <HandoffsTab docUrl={docUrl} />}
      </main>
    </div>
  )
}
