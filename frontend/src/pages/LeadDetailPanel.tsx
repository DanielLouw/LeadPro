import { useRef, useState } from 'react'
import Spinner from '../components/Spinner'
import type { ToastType } from '../components/Toast'

interface GapSignal {
  id: number
  signal_type: string
  is_hard: boolean
  description: string
  service: string
  sales_copy: string
}

export interface Lead {
  id: number
  run_id: number
  external_id: string
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
  onToast?: (message: string, type?: ToastType) => void
}

export default function LeadDetailPanel({ lead, onClose, onLeadUpdated, onToast }: Props) {
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
        onToast?.('Status saved')
      } else {
        onToast?.('Failed to save status', 'error')
      }
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleNotesBlur() {
    if (notesValue === initialNote.current) return
    if (savingNotes) return
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
        onToast?.('Notes saved')
      } else {
        onToast?.('Failed to save notes', 'error')
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
      className="lp-panel"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3 }}>
          {lead.name}
        </h2>
        <button
          aria-label="Close detail panel"
          onClick={onClose}
          className="lp-panel-close"
        >
          ✕
        </button>
      </div>

      {/* Contact info */}
      <section aria-label="Contact information" style={{ marginBottom: '20px' }}>
        {lead.address && (
          <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {lead.address}
          </p>
        )}
        {lead.phone && (
          <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {lead.phone}
          </p>
        )}
        {lead.email && (
          <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {lead.email}
          </p>
        )}
        <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Gap Score:{' '}
          <strong style={{ color: 'var(--color-accent-text)', fontWeight: 700 }}>
            {lead.gap_score.toFixed(1)}
          </strong>
        </p>
      </section>

      {/* Links */}
      <section aria-label="Links" style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {lead.website_url && (
          <a
            href={lead.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-link"
          >
            Visit website ↗
          </a>
        )}
        {lead.maps_url && (
          <a
            href={lead.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="lp-link"
          >
            Google Maps ↗
          </a>
        )}
        {lead.website_url && (() => {
          try {
            const domain = new URL(lead.website_url).hostname.replace(/^www\./, '')
            return (
              <a
                href={`https://www.seoptimer.com/${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-link"
              >
                SEOptimer ↗
              </a>
            )
          } catch {
            return null
          }
        })()}
      </section>

      {/* Divider */}
      <hr className="lp-divider" />

      {/* Gap signals */}
      <section aria-label="Gap signals" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-muted)' }}>
          Gap Signals
        </h3>
        {lead.gap_signals.length === 0 ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>No signals detected.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lead.gap_signals.map(signal => (
              <li
                key={signal.id}
                className={signal.is_hard ? 'lp-signal lp-signal--hard' : 'lp-signal'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: signal.sales_copy ? '6px' : 0 }}>
                  <span style={{ fontWeight: signal.is_hard ? 'bold' : 'normal', fontSize: '14px', color: 'var(--color-text)' }}>
                    {signal.description}
                  </span>
                  {signal.service && (
                    <span
                      aria-label={`Service: ${signal.service}`}
                      className="lp-signal-service"
                    >
                      {signal.service}
                    </span>
                  )}
                </div>
                {signal.sales_copy && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.875rem',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {signal.sales_copy}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Divider */}
      <hr className="lp-divider" />

      {/* Status */}
      <section aria-label="Status" style={{ marginBottom: '20px' }}>
        <label htmlFor={`status-${lead.id}`} className="lp-label">
          Status
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            id={`status-${lead.id}`}
            aria-label="Status"
            className="lp-select"
            style={{ width: '160px' }}
            value={lead.status}
            disabled={savingStatus}
            onChange={e => handleStatusChange(e.target.value)}
          >
            {VALID_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {savingStatus && <Spinner />}
        </div>
      </section>

      {/* Notes */}
      <section aria-label="Notes">
        <label htmlFor={`notes-${lead.id}`} className="lp-label">
          Notes
        </label>
        <textarea
          id={`notes-${lead.id}`}
          aria-label="Notes"
          className="lp-textarea"
          value={notesValue}
          disabled={savingNotes}
          rows={5}
          style={{ marginBottom: '8px' }}
          onChange={e => setNotesValue(e.target.value)}
          onBlur={handleNotesBlur}
        />
        <button
          className="btn btn-primary"
          onClick={() => handleNotesBlur()}
          disabled={savingNotes}
        >
          {savingNotes ? <><Spinner />Saving…</> : 'Save notes'}
        </button>
      </section>
    </div>
  )
}
