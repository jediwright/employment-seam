// src/DecisionsTab.tsx
import { useState } from 'react'
import { useDocument } from '@automerge/automerge-repo-react-hooks'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { WorkerKnowledgeGraph, Decision } from './types'

export default function DecisionsTab({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)
  const [showForm, setShowForm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form state
  const [projectId, setProjectId]     = useState('')
  const [title, setTitle]             = useState('')
  const [context, setContext]         = useState('')
  const [outcome, setOutcome]         = useState('')
  const [rationale, setRationale]     = useState('')
  const [madeAt, setMadeAt]           = useState('')
  const [participants, setParticipants] = useState('')
  const [supersedes, setSupersedes]   = useState('')

  if (!doc) return null

  const projects  = Object.values(doc.projects)
  const decisions = [...doc.decisions].reverse() // most recent first

  const validate = () => {
    const e: Record<string, string> = {}
    if (!projectId)       e.projectId = 'Project is required'
    if (!title.trim())    e.title = 'Title is required'
    if (!outcome.trim())  e.outcome = 'Outcome is required'
    if (!madeAt)          e.madeAt = 'Date is required'
    return e
  }

  const handleAddDecision = () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }

    const decisionId = crypto.randomUUID()
    const now        = new Date().toISOString()

    // Parse participants: comma-separated string → trimmed string[]
    const participantList = participants
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    changeDoc((d) => {
      const decision: Decision = {
        decisionId,
        projectId,
        title:        title.trim(),
        context:      context.trim(),
        outcome:      outcome.trim(),
        rationale:    rationale.trim(),
        madeAt,
        participants: participantList,
        createdAt:    now,
      }
      // Omit supersedes entirely when blank — Automerge rejects undefined assignments
      if (supersedes.trim()) decision.supersedes = supersedes.trim()
      d.decisions.push(decision)
      // Back-reference on the project
      if (d.projects[projectId]) {
        d.projects[projectId].decisionRefs.push(decisionId)
      }
      d.identity.lastModified = now
    })

    setProjectId(''); setTitle(''); setContext(''); setOutcome('')
    setRationale(''); setMadeAt(''); setParticipants(''); setSupersedes('')
    setErrors({}); setShowForm(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Decisions</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Add Decision
        </button>
      </div>

      {/* Add decision form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Decision</h3>
          <div className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
              {projects.length === 0 ? (
                <p className="text-sm text-gray-400">No projects yet — add a project first.</p>
              ) : (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">Select a project</option>
                  {projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>{p.title}</option>
                  ))}
                </select>
              )}
              {errors.projectId && <p className="text-red-500 text-xs mt-1">{errors.projectId}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Decision title"
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Context</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder="What situation prompted this decision?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Outcome *</label>
              <textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder="What was decided?"
              />
              {errors.outcome && <p className="text-red-500 text-xs mt-1">{errors.outcome}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rationale</label>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder="Why was this decision made?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date made *</label>
                <input
                  type="date"
                  value={madeAt}
                  onChange={(e) => setMadeAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                {errors.madeAt && <p className="text-red-500 text-xs mt-1">{errors.madeAt}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Participants</label>
                <input
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Names, comma-separated"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supersedes
                <span className="font-normal text-gray-400 ml-1">(decision ID, optional)</span>
              </label>
              <select
                value={supersedes}
                onChange={(e) => setSupersedes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">None</option>
                {doc.decisions
                  .filter((d) => d.projectId === projectId)
                  .map((d) => (
                    <option key={d.decisionId} value={d.decisionId}>{d.title}</option>
                  ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddDecision}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                Save Decision
              </button>
              <button
                onClick={() => { setShowForm(false); setErrors({}) }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {decisions.length === 0 && !showForm && (
        <p className="text-gray-400 text-sm">No decisions yet. Add the first one.</p>
      )}

      {/* Decision list */}
      <div className="space-y-3">
        {decisions.map((decision) => {
          const project = doc.projects[decision.projectId]
          const supersededDecision = decision.supersedes
            ? doc.decisions.find((d) => d.decisionId === decision.supersedes)
            : null
          return (
            <div key={decision.decisionId} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h3 className="font-medium text-gray-900">{decision.title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {project?.title ?? 'Unknown project'} · {new Date(decision.madeAt).toLocaleDateString()}
                  </p>
                  {decision.outcome && (
                    <p className="text-sm text-gray-700 mt-2">
                      <span className="font-medium">Outcome: </span>{decision.outcome}
                    </p>
                  )}
                  {decision.context && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">Context: </span>{decision.context}
                    </p>
                  )}
                  {decision.rationale && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">Rationale: </span>{decision.rationale}
                    </p>
                  )}
                  {decision.participants.length > 0 && (
                    <p className="text-xs text-gray-400 mt-2">
                      Participants: {decision.participants.join(', ')}
                    </p>
                  )}
                  {supersededDecision && (
                    <p className="text-xs text-amber-600 mt-1">
                      Supersedes: {supersededDecision.title}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
