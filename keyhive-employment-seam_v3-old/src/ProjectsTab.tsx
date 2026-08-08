import { useState } from 'react'
import { useDocument } from '@automerge/automerge-repo-react-hooks'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { WorkerKnowledgeGraph, Project } from './types'

export default function ProjectsTab({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [title, setTitle] = useState('')
  const [employerName, setEmployerName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [contextNotes, setContextNotes] = useState('')

  if (!doc) return null

  const projects = Object.values(doc.projects)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Title is required'
    if (!employerName.trim()) e.employerName = 'Employer name is required'
    if (!startDate) e.startDate = 'Start date is required'
    return e
  }

  const handleSubmit = () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setSaving(true)
    const projectId = crypto.randomUUID()
    const now = new Date().toISOString()
    changeDoc((d) => {
      const project: Project = {
        projectId,
        title: title.trim(),
        employerName: employerName.trim(),
        startDate,
        status: 'active',
        contextNotes: contextNotes.trim(),
        stakeholders: [],
        artifactRefs: [],
        decisionRefs: [],
        createdAt: now,
      }
      d.projects[projectId] = project
      d.identity.lastModified = now
    })
    setSaving(false)
    setTitle(''); setEmployerName(''); setStartDate(''); setContextNotes('')
    setErrors({}); setShowForm(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Add Project
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Project</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Project title"
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employer *</label>
              <input
                value={employerName}
                onChange={(e) => setEmployerName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Employer or client name"
              />
              {errors.employerName && <p className="text-red-500 text-xs mt-1">{errors.employerName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Context Notes</label>
              <textarea
                value={contextNotes}
                onChange={(e) => setContextNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={3}
                placeholder="What is this project about?"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving to your local graph...' : 'Save Project'}
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

      {projects.length === 0 && !showForm && (
        <p className="text-gray-400 text-sm">No projects yet. Add your first project.</p>
      )}

      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.projectId} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-gray-900">{p.title}</h3>
                <p className="text-sm text-gray-500">{p.employerName} · Started {new Date(p.startDate).toLocaleDateString()}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                {p.status}
              </span>
            </div>
            {p.contextNotes && <p className="text-sm text-gray-600 mt-2">{p.contextNotes}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}