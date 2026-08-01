// src/AccessLogTab.tsx
import { useDocument } from '@automerge/automerge-repo-react-hooks'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { WorkerKnowledgeGraph, AccessEventType } from './types'

const EVENT_TYPE_LABELS: Record<AccessEventType, string> = {
  'document-initialized': 'Document initialized',
  'handoff-initiated':    'Handoff initiated',
  'bundle-ready':         'Bundle ready',
  'handoff-completed':    'Handoff completed',
  'handoff-failed':       'Handoff failed',
  'account-pre-empted':   'Account pre-empted',
  'capability-granted':   'Capability granted',
  'capability-revoked':   'Capability revoked',
  'bundle-accessed':      'Bundle accessed',
}

const EVENT_TYPE_CLASSES: Record<AccessEventType, string> = {
  'document-initialized': 'bg-gray-100 text-gray-600',
  'handoff-initiated':    'bg-blue-50 text-blue-700',
  'bundle-ready':         'bg-blue-50 text-blue-700',
  'handoff-completed':    'bg-blue-50 text-blue-700',
  'handoff-failed':       'bg-amber-50 text-amber-700',
  'account-pre-empted':   'bg-amber-50 text-amber-700',
  'capability-granted':   'bg-green-50 text-green-700',
  'capability-revoked':   'bg-red-50 text-red-600',
  'bundle-accessed':      'bg-purple-50 text-purple-700',
}

export default function AccessLogTab({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc] = useDocument<WorkerKnowledgeGraph>(docUrl)

  if (!doc) return null

  const events = [...doc.accessLog].reverse()

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Access Log</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Append-only. Worker-authored. {events.length} event{events.length !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <p className="text-gray-400 text-sm">No events recorded yet.</p>
      )}

      {/* Event list */}
      <div className="space-y-2">
        {events.map((event) => {
          const contact = event.subjectContactId
            ? doc.contacts[event.subjectContactId]
            : null
          const project = event.projectId
            ? doc.projects[event.projectId]
            : null
          return (
            <div key={event.eventId} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_TYPE_CLASSES[event.eventType]}`}>
                      {EVENT_TYPE_LABELS[event.eventType]}
                    </span>
                    {contact && (
                      <span className="text-xs text-gray-500">{contact.displayName}</span>
                    )}
                    {project && (
                      <span className="text-xs text-gray-400">· {project.title}</span>
                    )}
                  </div>
                  {event.notes && (
                    <p className="text-sm text-gray-600 mt-1">{event.notes}</p>
                  )}
                </div>
                <time className="text-xs text-gray-400 shrink-0 tabular-nums">
                  {new Date(event.timestamp).toLocaleString()}
                </time>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
