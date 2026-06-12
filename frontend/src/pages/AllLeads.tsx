import { useCallback, useEffect, useMemo, useState } from 'react'
import LeadDetailPanel, { type Lead } from './LeadDetailPanel'
import SkeletonTable from '../components/SkeletonTable'
import Spinner from '../components/Spinner'
import ToastContainer, { makeToast, type ToastItem } from '../components/Toast'
import ServiceBadge, { getServiceBadges } from '../components/ServiceBadge'
import StatusBadge from '../components/StatusBadge'
import { ALL_STATUSES, formatLocation, topSignalLabels } from '../utils/leadDisplay'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SortField = 'gap_score' | 'name' | 'city' | 'state'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'gap_score', label: 'Gap Score' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'city', label: 'City (A–Z)' },
  { value: 'state', label: 'State (A–Z)' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAllLeadsUrl(
  signalTypes: string[],
  statuses: string[],
  states: string[],
  search: string,
  sort: SortField,
): string {
  const params = new URLSearchParams()
  for (const st of signalTypes) params.append('signal_types', st)
  for (const s of statuses) params.append('statuses', s)
  for (const st of states) params.append('states', st)
  if (search.trim()) params.set('search', search.trim())
  params.set('sort', sort)
  return `/api/leads/?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AllLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  // Toast queue
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    setToasts(prev => [...prev, makeToast(message, type)])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Filter + sort state
  const [search, setSearch] = useState('')
  const [selectedSignalTypes, setSelectedSignalTypes] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedState, setSelectedState] = useState('')
  const [sort, setSort] = useState<SortField>('gap_score')

  // Known filter options, accumulated from results so checkboxes don't vanish
  // when their filter excludes the leads that produced them.
  const [knownSignalTypes, setKnownSignalTypes] = useState<string[]>([])
  const [knownStates, setKnownStates] = useState<string[]>([])

  // Debounce the search input so we don't fetch on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const states = selectedState ? [selectedState] : []
    fetch(buildAllLeadsUrl(selectedSignalTypes, selectedStatuses, states, debouncedSearch, sort))
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load leads: ${r.status}`)
        return r.json() as Promise<Lead[]>
      })
      .then(data => {
        if (cancelled) return
        setLeads(data)
        setKnownSignalTypes(prev => {
          const merged = new Set(prev)
          for (const lead of data) {
            for (const sig of lead.gap_signals) merged.add(sig.signal_type)
          }
          return Array.from(merged).sort()
        })
        setKnownStates(prev => {
          const merged = new Set(prev)
          for (const lead of data) {
            if (lead.state) merged.add(lead.state)
          }
          return Array.from(merged).sort()
        })
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedSignalTypes, selectedStatuses, selectedState, debouncedSearch, sort])

  function toggleSignalType(st: string) {
    setSelectedSignalTypes(prev =>
      prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st]
    )
  }

  function toggleStatus(s: string) {
    setSelectedStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  function handleLeadUpdated(updated: Lead) {
    setLeads(prev => prev.map(l => (l.id === updated.id ? updated : l)))
    setSelectedLead(updated)
  }

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedSignalTypes.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedState !== ''

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const lead of leads) counts[lead.status] = (counts[lead.status] ?? 0) + 1
    return counts
  }, [leads])

  return (
    <div>
      <h1 className="lp-page-title">All Leads</h1>

      {error && <p role="alert" className="lp-error" style={{ marginBottom: '12px' }}>{error}</p>}

      {/* Filter bar */}
      <section aria-label="Filters and sort">
        <div className="lp-card" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ flex: '1 1 220px', maxWidth: '320px' }}>
              <label htmlFor="lead-search" className="lp-label">Search by name</label>
              <input
                id="lead-search"
                type="search"
                className="lp-input"
                placeholder="e.g. plumbing"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="state-filter" className="lp-label">State</label>
              <select
                id="state-filter"
                className="lp-select"
                style={{ width: '140px' }}
                value={selectedState}
                onChange={e => setSelectedState(e.target.value)}
              >
                <option value="">All states</option>
                {knownStates.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sort-select" className="lp-label">Sort by</label>
              <select
                id="sort-select"
                className="lp-select"
                style={{ width: '160px' }}
                value={sort}
                onChange={e => setSort(e.target.value as SortField)}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Signal type filter */}
          {knownSignalTypes.length > 0 && (
            <fieldset className="lp-fieldset" style={{ marginBottom: '12px' }}>
              <legend>Signal type</legend>
              <div className="lp-checkbox-inline-list">
                {knownSignalTypes.map(st => (
                  <label key={st} className="lp-checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedSignalTypes.includes(st)}
                      onChange={() => toggleSignalType(st)}
                    />
                    {st.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Status filter */}
          <fieldset className="lp-fieldset">
            <legend>Status</legend>
            <div className="lp-checkbox-inline-list">
              {ALL_STATUSES.map(s => (
                <label key={s} className="lp-checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(s)}
                    onChange={() => toggleStatus(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      {loading && leads.length === 0 && <SkeletonTable />}
      {loading && leads.length > 0 && (
        <p className="lp-help" style={{ margin: '8px 0' }}><Spinner />Updating…</p>
      )}

      {!loading && leads.length === 0 && !error && (
        <p className="lp-help" style={{ marginTop: '16px' }}>
          {hasActiveFilters
            ? 'No leads match the current filters.'
            : 'No leads yet. Go to Config Builder to start a run.'}
        </p>
      )}

      {leads.length > 0 && (
        <>
          {/* Summary */}
          <section aria-label="Summary" style={{ margin: '16px 0 8px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              <strong>{leads.length} leads</strong>
              {ALL_STATUSES.filter(s => statusCounts[s]).map(s => (
                <span key={s} style={{ marginLeft: '0.75rem' }}>
                  {s}: {statusCounts[s]}
                </span>
              ))}
            </p>
          </section>

          <table aria-label="All leads" className="lp-table">
            <thead>
              <tr>
                {(['Name', 'Location', 'Phone', 'Gap Score', 'Top Signals', 'Services', 'Status', 'Run'] as const).map(col => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} onClick={() => setSelectedLead(lead)}>
                  <td className="lp-cell-name">{lead.name}</td>
                  <td>{formatLocation(lead)}</td>
                  <td>{lead.phone ?? '—'}</td>
                  <td className="lp-cell-score">{lead.gap_score.toFixed(1)}</td>
                  <td>
                    {topSignalLabels(lead).map(label => (
                      <span key={label} className="lp-tag">
                        {label}
                      </span>
                    ))}
                  </td>
                  <td>
                    {getServiceBadges(lead.gap_signals).map(service => (
                      <ServiceBadge key={service} service={service} />
                    ))}
                  </td>
                  <td>
                    <StatusBadge status={lead.status} />
                  </td>
                  <td>#{lead.run_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onLeadUpdated={handleLeadUpdated}
          onToast={addToast}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
