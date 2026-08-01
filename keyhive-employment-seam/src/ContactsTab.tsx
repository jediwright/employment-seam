// src/ContactsTab.tsx
import { useState } from 'react'
import { useDocument, useRepo } from '@automerge/automerge-repo-react-hooks'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type {
  WorkerKnowledgeGraph,
  Contact,
  AccessTier,
  RelationshipType,
} from './types'

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  employer:       'Employer',
  colleague:      'Colleague',
  successor:      'Successor',
  client:         'Client',
  subcontractor:  'Subcontractor',
}

const ACCESS_TIER_LABELS: Record<AccessTier, string> = {
  none:          'No access',
  'read-bundle': 'Read bundle',
  'read-full':   'Read full',
  'write-collab':'Write / collab',
}

function capabilityState(ref?: string): { label: string; classes: string } {
  if (!ref)
    return { label: 'No cryptographic access', classes: 'bg-amber-50 text-amber-700' }
  if (ref.startsWith('revoked:'))
    return { label: 'Access revoked', classes: 'bg-red-50 text-red-600' }
  return { label: 'Access granted', classes: 'bg-green-50 text-green-700' }
}

export default function ContactsTab({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)
  const repo             = useRepo()

  const [showForm, setShowForm]                   = useState(false)
  const [errors, setErrors]                       = useState<Record<string, string>>({})
  const [capabilityLoading, setCapabilityLoading] = useState<string | null>(null)

  // Form state
  const [displayName, setDisplayName]         = useState('')
  const [role, setRole]                       = useState('')
  const [employerName, setEmployerName]       = useState('')
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('colleague')
  const [accessTier, setAccessTier]           = useState<AccessTier>('none')
  const [notes, setNotes]                     = useState('')

  if (!doc) return null

  const contacts = Object.values(doc.contacts)

  // --- Validation ---
  const validate = () => {
    const e: Record<string, string> = {}
    if (!displayName.trim()) e.displayName = 'Name is required'
    if (!role.trim())         e.role = 'Role is required'
    if (!employerName.trim()) e.employerName = 'Employer is required'
    return e
  }

  // --- Add contact (data only; capability ungoverned until worker explicitly grants) ---
  const handleAddContact = () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }

    const contactId = crypto.randomUUID()
    const now       = new Date().toISOString()

    changeDoc((d) => {
      const contact: Contact = {
        contactId,
        displayName:      displayName.trim(),
        role:             role.trim(),
        employerName:     employerName.trim(),
        relationshipType,
        accessTier,
        keyhiveCapabilityRef: undefined,
        notes:            notes.trim(),
        createdAt:        now,
      }
      d.contacts[contactId]    = contact
      d.identity.lastModified  = now
      // No access log entry on add — capability grant is the governance event
    })

    setDisplayName(''); setRole(''); setEmployerName('')
    setRelationshipType('colleague'); setAccessTier('none'); setNotes('')
    setErrors({}); setShowForm(false)
  }

  // --- Grant capability (worker-initiated; explicit governance action; logged) ---
  const handleGrantCapability = async (contact: Contact) => {
    setCapabilityLoading(contact.contactId)
    try {
      const capDoc = await repo.create2()
      const capRef = capDoc.url

      const now = new Date().toISOString()
      changeDoc((d) => {
        d.contacts[contact.contactId].keyhiveCapabilityRef = capRef
        d.identity.lastModified = now
        d.accessLog.push({
          eventId:          crypto.randomUUID(),
          timestamp:        now,
          eventType:        'capability-granted',
          subjectContactId: contact.contactId,
          notes:            `Cryptographic access granted. Capability ref: ${capRef}`,
        })
      })
    } catch (err) {
      console.error('Capability grant failed:', err)
    } finally {
      setCapabilityLoading(null)
    }
  }

  // --- Revoke capability (worker-initiated; logged; prior ref preserved) ---
  const handleRevokeCapability = (contact: Contact) => {
    if (!contact.keyhiveCapabilityRef) return
    const priorRef = contact.keyhiveCapabilityRef
    const now      = new Date().toISOString()

    changeDoc((d) => {
      d.contacts[contact.contactId].keyhiveCapabilityRef = `revoked:${priorRef}`
      d.identity.lastModified = now
      d.accessLog.push({
        eventId:          crypto.randomUUID(),
        timestamp:        now,
        eventType:        'capability-revoked',
        subjectContactId: contact.contactId,
        notes:            `Access revoked. Prior ref preserved: ${priorRef}`,
      })
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Add Contact
        </button>
      </div>

      {/* Add contact form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Contact</h3>
          <div className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Full name"
              />
              {errors.displayName && <p className="text-red-500 text-xs mt-1">{errors.displayName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Their role"
              />
              {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employer *</label>
              <input
                value={employerName}
                onChange={(e) => setEmployerName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Their employer or org"
              />
              {errors.employerName && <p className="text-red-500 text-xs mt-1">{errors.employerName}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {(Object.entries(RELATIONSHIP_LABELS) as [RelationshipType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access tier</label>
                <select
                  value={accessTier}
                  onChange={(e) => setAccessTier(e.target.value as AccessTier)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {(Object.entries(ACCESS_TIER_LABELS) as [AccessTier, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={3}
                placeholder="Your framing of this relationship"
              />
            </div>

            <p className="text-xs text-gray-400">
              Cryptographic access is not provisioned on add. Use "Grant access" on the
              contact card when ready — that action is recorded in your access log.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleAddContact}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                Save Contact
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
      {contacts.length === 0 && !showForm && (
        <p className="text-gray-400 text-sm">No contacts yet. Add the first one.</p>
      )}

      {/* Contact list */}
      <div className="space-y-3">
        {contacts.map((contact) => {
          const cap       = capabilityState(contact.keyhiveCapabilityRef)
          const isGranted = !!contact.keyhiveCapabilityRef && !contact.keyhiveCapabilityRef.startsWith('revoked:')
          const isRevoked = contact.keyhiveCapabilityRef?.startsWith('revoked:') ?? false
          const isLoading = capabilityLoading === contact.contactId

          return (
            <div key={contact.contactId} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start gap-4">

                {/* Contact info */}
                <div className="min-w-0">
                  <h3 className="font-medium text-gray-900">{contact.displayName}</h3>
                  <p className="text-sm text-gray-500">
                    {contact.role} · {contact.employerName}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400">
                      {RELATIONSHIP_LABELS[contact.relationshipType]}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      {ACCESS_TIER_LABELS[contact.accessTier]}
                    </span>
                  </div>
                  {contact.notes && (
                    <p className="text-sm text-gray-600 mt-2">{contact.notes}</p>
                  )}
                  {/* Capability badge */}
                  <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${cap.classes}`}>
                    {cap.label}
                  </span>
                </div>

                {/* Capability actions — the governance surface */}
                <div className="flex flex-col gap-2 shrink-0">
                  {!isGranted && !isRevoked && (
                    <button
                      onClick={() => handleGrantCapability(contact)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-xs font-medium border border-green-600 text-green-700 rounded-md hover:bg-green-50 disabled:opacity-50"
                    >
                      {isLoading ? 'Granting…' : 'Grant access'}
                    </button>
                  )}
                  {isGranted && (
                    <button
                      onClick={() => handleRevokeCapability(contact)}
                      className="px-3 py-1.5 text-xs font-medium border border-red-400 text-red-600 rounded-md hover:bg-red-50"
                    >
                      Revoke access
                    </button>
                  )}
                  {isRevoked && (
                    <span className="text-xs text-gray-400 px-3 py-1.5">Revoked</span>
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
