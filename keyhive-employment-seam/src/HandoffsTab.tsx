// src/HandoffsTab.tsx
import { useState } from 'react'
import { useDocument } from '@automerge/automerge-repo-react-hooks'
import { isRevocationRef } from './gate'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type {
  WorkerKnowledgeGraph,
  HandoffRecord,
  HandoffStatus,
  HandoffFailureState,
  ExposureRecord,
} from './types'

const STATUS_LABELS: Record<HandoffStatus, string> = {
  'pending':      'Pending',
  'bundle-ready': 'Bundle ready',
  'delivered':    'Delivered',
  'failed':       'Failed',
  'pre-empted':   'Pre-empted',
}

const STATUS_CLASSES: Record<HandoffStatus, string> = {
  'pending':      'bg-amber-50 text-amber-700',
  'bundle-ready': 'bg-blue-50 text-blue-700',
  'delivered':    'bg-green-50 text-green-700',
  'failed':       'bg-red-50 text-red-600',
  'pre-empted':   'bg-gray-100 text-gray-500',
}

const FAILURE_LABELS: Record<HandoffFailureState, string> = {
  'relay-unreachable':                      'Relay unreachable',
  'receiving-party-unresponsive':           'Receiving party unresponsive',
  'bundle-rejected':                        'Bundle rejected',
  'account-pre-empted-before-bundle-ready': 'Account pre-empted before bundle ready',
  'account-pre-empted-after-bundle-ready':  'Account pre-empted after bundle ready',
  'partial-delivery':                       'Partial delivery',
  'contested':                              'Contested',
}

// SHA-256 of handoffId + initiatedAt + exposure records (Phase 2) —
// prototype-scope stand-in for the URDNA2015 canonical hash Phase 6 produces.
// Phase 2 (Item 2.1): exposure records are now part of the hash input so the
// bundle hash commits to the exposure surface at seam-fire, not just the
// handoff identity. The records are serialized deterministically (sorted by
// contactId) so the hash is stable across equivalent inputs.
async function deriveBundleHash(
  handoffId: string,
  initiatedAt: string,
  exposureRecords: Array<{ contactId: string; record: ExposureRecord }> = [],
): Promise<string> {
  const sorted = [...exposureRecords].sort((a, b) =>
    a.contactId < b.contactId ? -1 : a.contactId > b.contactId ? 1 : 0
  )
  const exposurePayload = sorted
    .map(({ contactId, record }) =>
      `${contactId}:${record.boundType}:${record.documentIds.join(',')}:${record.revokedAt}`
    )
    .join('|')
  const rawInput = exposurePayload
    ? `${handoffId}:${initiatedAt}:${exposurePayload}`
    : `${handoffId}:${initiatedAt}`
  const input = new TextEncoder().encode(rawInput)
  const buffer = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function HandoffsTab({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)

  const [showForm, setShowForm]         = useState(false)
  const [errors, setErrors]             = useState<Record<string, string>>({})
  const [initiating, setInitiating]     = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const [projectId, setProjectId]                   = useState('')
  const [receivingContactId, setReceivingContactId] = useState('')

  if (!doc) return null

  const projects = Object.values(doc.projects)
  const contacts = Object.values(doc.contacts)
  const handoffs = Object.values(doc.handoffs).sort(
    (a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime()
  )

  const validate = () => {
    const e: Record<string, string> = {}
    if (!projectId)          e.projectId = 'Select a project'
    if (!receivingContactId) e.receivingContactId = 'Select a receiving party'
    return e
  }

  // Phase 1 — declare intent, create HandoffRecord, mark project handed-off
  const handleInitiate = async () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setInitiating(true)
    try {
      const handoffId = crypto.randomUUID()
      const now       = new Date().toISOString()
      changeDoc((d) => {
        const record: HandoffRecord = {
          handoffId,
          projectId,
          initiatedAt:             now,
          status:                  'pending',
          receivingPartyContactId: receivingContactId,
        }
        d.handoffs[handoffId]   = record
        d.identity.lastModified = now
        d.accessLog.push({
          eventId:          crypto.randomUUID(),
          timestamp:        now,
          eventType:        'handoff-initiated',
          projectId,
          handoffId,
          subjectContactId: receivingContactId,
          notes: `Handoff initiated. Receiving party: ${doc.contacts[receivingContactId]?.displayName ?? receivingContactId}`,
        })
        if (d.projects[projectId]) {
          d.projects[projectId].status  = 'handed-off'
          d.projects[projectId].endDate = now
        }
      })
      setProjectId(''); setReceivingContactId('')
      setErrors({}); setShowForm(false)
    } finally {
      setInitiating(false)
    }
  }

  // Phase 5 stub — derive bundle hash, advance status
  const handleMarkBundleReady = async (handoff: HandoffRecord) => {
    const hash = await deriveBundleHash(handoff.handoffId, handoff.initiatedAt)
    const now  = new Date().toISOString()
    changeDoc((d) => {
      d.handoffs[handoff.handoffId].status     = 'bundle-ready'
      d.handoffs[handoff.handoffId].bundleHash = hash
      d.identity.lastModified                  = now
      d.accessLog.push({
        eventId:   crypto.randomUUID(),
        timestamp: now,
        eventType: 'bundle-ready',
        projectId: handoff.projectId,
        handoffId: handoff.handoffId,
        notes:     `Bundle ready. Hash: ${hash}`,
      })
    })
  }

  // Phase 7 — seam fires: delivered, all active capabilities revoked.
  // Phase 2 (Item 2.1): exposure record captured per revoked contact at
  // seam-fire time; incorporated into the bundle hash.
  //
  // Sequence:
  //   1. Identify contacts to revoke (read-only pre-pass on current doc).
  //   2. Build ExposureRecord per contact — worker-side heads at this moment,
  //      labeled 'exposure-upper-bound' (per-peer state unavailable on this
  //      transport; confirmed by Item 1.1 findings).
  //   3. changeDoc: revoke capabilities, emit capability-revoked +
  //      exposure-record events, set handoff delivered.
  //   4. Recompute bundle hash incorporating exposure records; patch into doc.
  const handleConfirmDelivery = async (handoff: HandoffRecord) => {
    if (!doc) return
    const now = new Date().toISOString()

    // --- Step 1 + 2: collect contacts to revoke and build exposure records ---
    // Read current document IDs and worker-side heads. In this single-document
    // prototype, every contact with a capability holds access to the root
    // knowledge-graph document (the only Automerge document in the repo).
    // The pattern scales: multi-document deployments would enumerate per-contact
    // document grants here and capture heads for each.
    //
    // rootDocUrl is the URL of the single document this tab manages; it is
    // stable across the lifetime of the prototype. We use the handoffId
    // (not the URL) as the document identifier in the record so the record
    // is portable and doesn't embed internal addressing. The canonical
    // document reference in this prototype IS the handoff bundle — so the
    // handoffId is the natural identifier for "the document being handed off."
    const revokedContactIds: string[] = []
    Object.values(doc.contacts).forEach((contact) => {
      if (
        contact.keyhiveCapabilityRef &&
        !isRevocationRef(contact.keyhiveCapabilityRef)
      ) {
        revokedContactIds.push(contact.contactId)
      }
    })

    // Worker-side document heads at revocation time. We use the artifact and
    // project IDs as the documentId inventory — together they represent the
    // full content surface the contact could have synced. The 'heads' here
    // are the worker-side Automerge heads of the root document (the single
    // document in this prototype), captured at this instant.
    //
    // NOTE: DocHandle.heads() is not available at this layer (we have the
    // unwrapped doc, not the handle). We use a stable content-derived proxy:
    // the count of access-log entries (a monotonically increasing value that
    // changes with every write). This is prototype-scope only — a production
    // exposure record would call handle.heads() directly. Labeled accordingly.
    const documentId = handoff.projectId  // project-scoped; the handed-off work product
    const contentProxy = `log-length:${doc.accessLog.length}`   // see note above

    const exposurePayload: Array<{ contactId: string; record: ExposureRecord }> =
      revokedContactIds.map((contactId) => ({
        contactId,
        record: {
          boundType:         'exposure-upper-bound',
          documentIds:       [documentId],
          headsAtRevocation: { [documentId]: [contentProxy] },
          revokedAt:         now,
        },
      }))

    // --- Step 3: changeDoc — revocations + exposure-record events ---------------
    changeDoc((d) => {
      d.handoffs[handoff.handoffId].status      = 'delivered'
      d.handoffs[handoff.handoffId].completedAt = now
      d.identity.lastModified                   = now

      Object.values(d.contacts).forEach((contact) => {
        if (
          contact.keyhiveCapabilityRef &&
          !isRevocationRef(contact.keyhiveCapabilityRef)
        ) {
          const priorRef = contact.keyhiveCapabilityRef
          d.contacts[contact.contactId].keyhiveCapabilityRef = `revoked-local:${priorRef}`

          // Capability-revoked: the ISSUED half (Item 1.2 — unchanged).
          d.accessLog.push({
            eventId:          crypto.randomUUID(),
            timestamp:        now,
            eventType:        'capability-revoked',
            subjectContactId: contact.contactId,
            contactClass:     contact.contactClass ?? 'human',
            handoffId:        handoff.handoffId,
            notes:            `Revocation issued at seam-firing (local operation complete, confirmation propagating). Prior ref: ${priorRef}`,
          })

          // Phase 2 (Item 2.1): exposure-record event, one per revoked contact.
          // Emitted immediately after capability-revoked; same timestamp so the
          // pair correlates. The structured ExposureRecord travels as structured
          // data in the event field — the notes field carries a human-readable
          // summary for the Access Log tab.
          const er = exposurePayload.find((p) => p.contactId === contact.contactId)?.record
          if (er) {
            d.accessLog.push({
              eventId:          crypto.randomUUID(),
              timestamp:        now,
              eventType:        'exposure-record',
              subjectContactId: contact.contactId,
              contactClass:     contact.contactClass ?? 'human',
              handoffId:        handoff.handoffId,
              exposureRecord:   er,
              notes:            `Exposure record (${er.boundType}): document "${documentId}" — worker-side content proxy at revocation: ${contentProxy}. ` +
                                `Per-peer sync state unavailable on this transport (Item 1.1 finding: no ack surface on BroadcastChannel). ` +
                                `This record attests to the maximum the contact could have held as of this moment.`,
            })
          }
        }
      })

      d.accessLog.push({
        eventId:          crypto.randomUUID(),
        timestamp:        now,
        eventType:        'handoff-completed',
        projectId:        handoff.projectId,
        handoffId:        handoff.handoffId,
        subjectContactId: handoff.receivingPartyContactId,
        notes:            `Handoff complete. Bundle delivered. Revocation issued for all active capabilities (confirmation propagates separately). ` +
                          `Exposure records captured: ${exposurePayload.length} contact(s).`,
      })
    })

    // --- Step 4: recompute bundle hash incorporating exposure records ----------
    // The hash now commits to the exposure surface at seam-fire (Item 2.1
    // acceptance: "bundle hash incorporates it"). Async; patches the bundleHash
    // field after the synchronous changeDoc above completes.
    const hash = await deriveBundleHash(handoff.handoffId, handoff.initiatedAt, exposurePayload)
    changeDoc((d) => {
      d.handoffs[handoff.handoffId].bundleHash = hash
    })

    setConfirmingId(null)
  }

  const handleMarkFailed = (handoff: HandoffRecord, state: HandoffFailureState) => {
    const now = new Date().toISOString()
    changeDoc((d) => {
      d.handoffs[handoff.handoffId].status       = 'failed'
      d.handoffs[handoff.handoffId].failureState = state
      d.identity.lastModified                    = now
      d.accessLog.push({
        eventId:   crypto.randomUUID(),
        timestamp: now,
        eventType: 'handoff-failed',
        projectId: handoff.projectId,
        handoffId: handoff.handoffId,
        notes:     `Handoff failed. State: ${FAILURE_LABELS[state]}`,
      })
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Handoffs</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Initiate Handoff
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Handoff</h3>
          {projects.filter((p) => p.status === 'active').length === 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2 mb-4">
              No active projects. Add an active project before initiating a handoff.
            </p>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">Select a project</option>
                {projects
                  .filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.title} · {p.employerName}
                    </option>
                  ))}
              </select>
              {errors.projectId && <p className="text-red-500 text-xs mt-1">{errors.projectId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Receiving party *</label>
              <select
                value={receivingContactId}
                onChange={(e) => setReceivingContactId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">Select a contact</option>
                {contacts.map((c) => (
                  <option key={c.contactId} value={c.contactId}>
                    {c.displayName} · {c.role}
                  </option>
                ))}
              </select>
              {errors.receivingContactId && <p className="text-red-500 text-xs mt-1">{errors.receivingContactId}</p>}
            </div>
            <p className="text-xs text-gray-400">
              Initiating marks the project as handed-off. All active cryptographic
              capabilities are revoked when delivery is confirmed — this is the seam-firing moment.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleInitiate}
                disabled={initiating}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {initiating ? 'Initiating…' : 'Initiate Handoff'}
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

      {handoffs.length === 0 && !showForm && (
        <p className="text-gray-400 text-sm">
          No handoffs yet. Initiate one when you're ready to fire the seam.
        </p>
      )}

      <div className="space-y-4">
        {handoffs.map((handoff) => {
          const project      = doc.projects[handoff.projectId]
          const receiver     = doc.contacts[handoff.receivingPartyContactId]
          const isConfirming = confirmingId === handoff.handoffId

          return (
            <div key={handoff.handoffId} className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex justify-between items-start gap-4 mb-3">
                <div>
                  <h3 className="font-medium text-gray-900">{project?.title ?? handoff.projectId}</h3>
                  <p className="text-sm text-gray-500">{project?.employerName ?? '—'}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_CLASSES[handoff.status]}`}>
                  {STATUS_LABELS[handoff.status]}
                </span>
              </div>

              <div className="text-xs text-gray-400 space-y-1 mb-4">
                <p>
                  <span className="font-medium text-gray-500">Receiving party:</span>{' '}
                  {receiver ? `${receiver.displayName} · ${receiver.role}` : handoff.receivingPartyContactId}
                </p>
                <p>
                  <span className="font-medium text-gray-500">Initiated:</span>{' '}
                  {new Date(handoff.initiatedAt).toLocaleString()}
                </p>
                {handoff.completedAt && (
                  <p>
                    <span className="font-medium text-gray-500">Completed:</span>{' '}
                    {new Date(handoff.completedAt).toLocaleString()}
                  </p>
                )}
                {handoff.bundleHash && (
                  <p className="font-mono break-all">
                    <span className="font-sans font-medium text-gray-500">Hash:</span>{' '}
                    {handoff.bundleHash}
                  </p>
                )}
                {handoff.failureState && (
                  <p className="text-red-500">
                    <span className="font-medium">Failure:</span>{' '}
                    {FAILURE_LABELS[handoff.failureState]}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {handoff.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleMarkBundleReady(handoff)}
                      className="px-3 py-1.5 text-xs font-medium border border-blue-500 text-blue-600 rounded-md hover:bg-blue-50"
                    >
                      Mark bundle ready
                    </button>
                    <button
                      onClick={() => {
                        const state = window.prompt(
                          `Failure state:\n${Object.keys(FAILURE_LABELS).join('\n')}`
                        ) as HandoffFailureState | null
                        if (state && state in FAILURE_LABELS) handleMarkFailed(handoff, state)
                      }}
                      className="px-3 py-1.5 text-xs font-medium border border-red-400 text-red-600 rounded-md hover:bg-red-50"
                    >
                      Record failure
                    </button>
                  </>
                )}

                {handoff.status === 'bundle-ready' && !isConfirming && (
                  <>
                    <button
                      onClick={() => setConfirmingId(handoff.handoffId)}
                      className="px-3 py-1.5 text-xs font-medium border border-green-600 text-green-700 rounded-md hover:bg-green-50"
                    >
                      Confirm delivery
                    </button>
                    <button
                      onClick={() => {
                        const state = window.prompt(
                          `Failure state:\n${Object.keys(FAILURE_LABELS).join('\n')}`
                        ) as HandoffFailureState | null
                        if (state && state in FAILURE_LABELS) handleMarkFailed(handoff, state)
                      }}
                      className="px-3 py-1.5 text-xs font-medium border border-red-400 text-red-600 rounded-md hover:bg-red-50"
                    >
                      Record failure
                    </button>
                  </>
                )}

                {isConfirming && (
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-md p-3">
                    <p className="text-xs text-amber-800 font-medium mb-2">
                      Confirming delivery revokes all active cryptographic capabilities
                      across all contacts. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirmDelivery(handoff)}
                        className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Confirm — fire the seam
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
