import { useRef, useState } from 'react'

interface GapSignal {
  id: number
  signal_type: string
  is_hard: boolean
  description: string
}

export interface Lead {
  id: number
  run_id: number
  place_id: string
  name: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  email: string | null
  website_url: string | null
  maps_url: string | null
  gap_score: number
  status: string
  gap_signals: GapSignal[]
  note: { content: string; updated_at: string } | null
}

const VALID_STATUSES = ['new', 'reviewing', 'contacted', 'pass'] as const

interface Props {
  lead: Lead
  onClose: () => void
  onLeadUpdated: (updated: Lead) => void
}

export default function LeadDetailPanel({ lead, onClose, onLeadUpdated }: Props) {
  const [notesValue, setNotesValue] = useState(lead.note?.content ?? '')
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  // Track note at open time to avoid unnecessary saves on blur with no change
  const initialNote = useRef(lead.note?.content ?? '')

  async function handleStatusChange(newStatus: string) {
    setSavingStatus(true)
    try {
      const resp = await fetch(`/api/leads/${lead.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (resp.ok) {
        const updated: Lead = await resp.json()
        onLeadUpdated(updated)
      }
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleNotesBlur() {
    if (notesValue === initialNote.current) return
    setSavingNotes(true)
    try {
      const resp = await fetch(`/api/leads/${lead.id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: notesValue }),
      })
      if (resp.ok) {
        const updated: Lead = await resp.json()
        initialNote.current = notesValue
        onLeadUpdated(updated)
      }
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Lead detail"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        background: '#fff',
        boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
        overflowY: 'auto',
        padding: '1.5rem',
        zIndex: 1000,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{lead.name}</h2>
        <button aria-label="Close detail panel" onClick={onClose} style={{ fontSize: '1.25rem', lineHeight: 1, cursor: 'pointer' }}>
          ✕
        </button>
      </div>

      <section aria-label="Contact information">
        {lead.address && <p style={{ margin: '0.25rem 0' }}>{lead.address}</p>}
        {lead.phone && <p style={{ margin: '0.25rem 0' }}>{lead.phone}</p>}
        {lead.email && <p style={{ margin: '0.25rem 0' }}>{lead.email}</p>}
        <p style={{ margin: '0.25rem 0' }}>Gap Score: <strong>{lead.gap_score.toFixed(1)}</strong></p>
      </section>

      <section aria-label="Links" style={{ margin: '1rem 0' }}>
        {lead.website_url && (
          <a href={lead.website_url} target="_blank" rel="noopener noreferrer" style={{ marginRight: '1rem' }}>
            Visit website
          </a>
        )}
        {lead.maps_url && (
          <a href={lead.maps_url} target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
        )}
      </section>

      <section aria-label="Gap signals" style={{ margin: '1rem 0' }}>
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Gap Signals</h3>
        {lead.gap_signals.length === 0 ? (
          <p>No signals detected.</p>
        ) : (
          <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
            {lead.gap_signals.map(signal => (
              <li key={signal.id} style={{ marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: signal.is_hard ? 'bold' : 'normal' }}>
                  {signal.description}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Status" style={{ margin: '1rem 0' }}>
        <label htmlFor={`status-${lead.id}`} style={{ display: 'block', marginBottom: '0.25rem' }}>
          Status
        </label>
        <select
          id={`status-${lead.id}`}
          aria-label="Status"
          value={lead.status}
          disabled={savingStatus}
          onChange={e => handleStatusChange(e.target.value)}
        >
          {VALID_STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </section>

      <section aria-label="Notes" style={{ margin: '1rem 0' }}>
        <label htmlFor={`notes-${lead.id}`} style={{ display: 'block', marginBottom: '0.25rem' }}>
          Notes
        </label>
        <textarea
          id={`notes-${lead.id}`}
          aria-label="Notes"
          value={notesValue}
          disabled={savingNotes}
          rows={5}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
          onChange={e => setNotesValue(e.target.value)}
          onBlur={handleNotesBlur}
        />
      </section>
    </div>
  )
}
