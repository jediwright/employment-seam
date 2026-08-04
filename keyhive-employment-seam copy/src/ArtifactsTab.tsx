// src/ArtifactsTab.tsx
import { useState } from 'react'
import { useDocument } from '@automerge/automerge-repo-react-hooks'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { WorkerKnowledgeGraph, Artifact, ArtifactType } from './types'

const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  document:      'Document',
  diagram:       'Diagram',
  code:          'Code',
  'meeting-notes': 'Meeting notes',
  other:         'Other',
}

export default function ArtifactsTab({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)
  const [showForm, setShowForm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form state
  const [projectId, setProjectId] = useState('')
  const [title, setTitle]         = useState('')
  const [type, setType]           = useState<ArtifactType>('document')
  const [content, setContent]     = useState('')
  const [tags, setTags]           = useState('')

  if (!doc) return null

  const projects  = Object.values(doc.projects)
  const artifacts = Object.values(doc.artifacts).reverse()

  const validate = () => {
    const e: Record<string, string> = {}
    if (!projectId)    e.projectId = 'Project is required'
    if (!title.trim()) e.title = 'Title is required'
    return e
  }

  const handleAddArtifact = () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }

    const artifactId = crypto.randomUUID()
    const now        = new Date().toISOString()

    // Parse tags: comma-separated string → trimmed string[]
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    changeDoc((d) => {
      const artifact: Artifact = {
        artifactId,
        projectId,
        title:     title.trim(),
        type,
        content:   content.trim(),
        createdAt: now,
        tags:      tagList,
      }
      d.artifacts[artifactId] = artifact
      if (d.projects[projectId]) {
        d.projects[projectId].artifactRefs.push(artifactId)
      }
      d.identity.lastModified = now
    })

    setProjectId(''); setTitle(''); setType('document')
    setContent(''); setTags('')
    setErrors({}); setShowForm(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Artifacts</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Add Artifact
        </button>
      </div>

      {/* Add artifact form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Artifact</h3>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Artifact title"
                />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ArtifactType)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {(Object.entries(ARTIFACT_TYPE_LABELS) as [ArtifactType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                rows={6}
                placeholder="Paste or type artifact content"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Tags, comma-separated"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddArtifact}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                Save Artifact
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
      {artifacts.length === 0 && !showForm && (
        <p className="text-gray-400 text-sm">No artifacts yet. Add the first one.</p>
      )}

      {/* Artifact list */}
      <div className="space-y-3">
        {artifacts.map((artifact) => {
          const project = doc.projects[artifact.projectId]
          return (
            <div key={artifact.artifactId} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900">{artifact.title}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                      {ARTIFACT_TYPE_LABELS[artifact.type]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {project?.title ?? 'Unknown project'} · {new Date(artifact.createdAt).toLocaleDateString()}
                  </p>
                  {artifact.content && (
                    <pre className="mt-2 text-xs text-gray-700 bg-gray-50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                      {artifact.content}
                    </pre>
                  )}
                  {artifact.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {artifact.tags.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                          {tag}
                        </span>
                      ))}
                    </div>
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
