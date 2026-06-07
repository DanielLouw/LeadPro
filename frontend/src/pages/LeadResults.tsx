import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import LeadDetailPanel, { type Lead } from './LeadDetailPanel'
import SkeletonTable from '../components/SkeletonTable'
import Spinner from '../components/Spinner'
import ToastContainer, { makeToast, type ToastItem } from '../components/Toast'
import ServiceBadge, { getServiceBadges } from '../components/ServiceBadge'
import StatusBadge from '../components/StatusBadge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Run {
  id: number
  status: string
  total_leads: number
  config_yaml: string
  error_message: string | null
  apify_run_id?: string | null
  apify_status?: string | null
}

interface RunEstimate {
  query_count: number
  estimated_results: number
  estimated_cost_usd: number
}

interface RunProgress {
  status: string
  queries_completed: number
  queries_total: number
  leads_found: number
}

/** State machine for the "start new run" flow */
type NewRunStep =
  | { kind: 'idle' }
  | { kind: 'input'; configYaml: string }
  | { kind: 'estimating'; configYaml: string }
  | { kind: 'confirm'; configYaml: string; estimate: RunEstimate }
  | { kind: 'submitting'; configYaml: string; estimate: RunEstimate }

type SortField = 'gap_score' | 'name' | 'city'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'gap_score', label: 'Gap Score' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'city', label: 'City (A–Z)' },
]

const ALL_STATUSES = ['new', 'reviewing', 'contacted', 'pass']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLocation(lead: Lead): string {
  if (lead.city && lead.state) return `${lead.city}, ${lead.state}`
  if (lead.city) return lead.city
  if (lead.state) return lead.state
  return '—'
}

function topSignalLabels(lead: Lead): string[] {
  const hard = lead.gap_signals.filter(s => s.is_hard)
  const soft = lead.gap_signals.filter(s => !s.is_hard)
  return [...hard, ...soft].slice(0, 3).map(s => s.signal_type.replace(/_/g, ' '))
}

function buildLeadsUrl(
  runId: number,
  signalTypes: string[],
  statuses: string[],
  sort: SortField,
): string {
  const params = new URLSearchParams()
  for (const st of signalTypes) params.append('signal_types', st)
  for (const s of statuses) params.append('statuses', s)
  params.set('sort', sort)
  return `/api/leads/run/${runId}?${params.toString()}`
}

function uniqueSignalTypes(leads: Lead[]): string[] {
  const types = new Set<string>()
  for (const lead of leads) {
    for (const sig of lead.gap_signals) {
      types.add(sig.signal_type)
    }
  }
  return Array.from(types).sort()
}

function topSignalBreakdown(leads: Lead[]): { type: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const lead of leads) {
    for (const sig of lead.gap_signals) {
      counts[sig.signal_type] = (counts[sig.signal_type] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeadResults() {
  const location = useLocation()
  const routerRunId: number | undefined = (location.state as { runId?: number } | null)?.runId

  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(routerRunId ?? null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  // Toast queue
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [exportingCsv, setExportingCsv] = useState(false)

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    setToasts(prev => [...prev, makeToast(message, type)])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // New-run flow
  const [newRunStep, setNewRunStep] = useState<NewRunStep>({ kind: 'idle' })
  const [newRunError, setNewRunError] = useState<string | null>(null)

  // Filter + sort state (persists across interactions)
  const [selectedSignalTypes, setSelectedSignalTypes] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [sort, setSort] = useState<SortField>('gap_score')

  // All signal types ever seen for current run (for checkbox list)
  const [knownSignalTypes, setKnownSignalTypes] = useState<string[]>([])

  // Progress polling (Google Places runs)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Apify status polling
  const [apifyStatus, setApifyStatus] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load runs on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setLoadingRuns(true)
    setError(null)
    fetch('/api/runs/')
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load runs: ${r.status}`)
        return r.json()
      })
      .then((data: Run[]) => {
        setRuns(data)
        if (data.length > 0) {
          setSelectedRunId(prev => {
            // If already set (from router state) AND that run still exists, keep it;
            // otherwise fall back to the first run in the list.
            if (prev != null && data.some(r => r.id === prev)) return prev
            return data[0].id
          })
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingRuns(false))
  }, [])

  // ---------------------------------------------------------------------------
  // Load leads whenever runId / filters / sort changes
  // ---------------------------------------------------------------------------

  const fetchLeads = useCallback(
    (runId: number) => {
      setLoadingLeads(true)
      setError(null)
      const url = buildLeadsUrl(runId, selectedSignalTypes, selectedStatuses, sort)
      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error(`Failed to load leads: ${r.status}`)
          return r.json()
        })
        .then((data: Lead[]) => {
          setLeads(data)
          // Discover signal types from each fetch to keep the list growing
          setKnownSignalTypes(prev => {
            const merged = new Set([...prev, ...uniqueSignalTypes(data)])
            return Array.from(merged).sort()
          })
        })
        .catch(e => setError(e.message))
        .finally(() => setLoadingLeads(false))
    },
    [selectedSignalTypes, selectedStatuses, sort],
  )

  useEffect(() => {
    if (selectedRunId == null) return
    fetchLeads(selectedRunId)
  }, [selectedRunId, fetchLeads])

  // ---------------------------------------------------------------------------
  // Progress polling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }

    if (selectedRunId == null) {
      setProgress(null)
      setApifyStatus(null)
      return
    }

    const selectedRun = runs.find(r => r.id === selectedRunId)
    if (!selectedRun || selectedRun.status !== 'running') {
      setProgress(null)
      setApifyStatus(selectedRun?.apify_run_id ? (selectedRun.apify_status ?? null) : null)
      return
    }

    const isApifyRun = !!selectedRun.apify_run_id

    if (isApifyRun) {
      // Apify run: poll GET /api/runs/{id} for apify_status
      setApifyStatus(selectedRun.apify_status ?? 'running')

      const poll = () => {
        fetch(`/api/runs/${selectedRunId}`)
          .then(r => r.ok ? r.json() : null)
          .then((data: Run | null) => {
            if (!data) return
            setApifyStatus(data.apify_status ?? null)
            if (data.status !== 'running') {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
              }
              // Update the run in the list and reload leads
              setRuns(prev => prev.map(r => r.id === data.id ? data : r))
              fetchLeads(selectedRunId)
            }
          })
          .catch(() => { /* swallow — non-critical */ })
      }

      poll()
      progressIntervalRef.current = setInterval(poll, 2000)
    } else {
      // Google Places run: poll /progress endpoint
      setApifyStatus(null)

      const poll = () => {
        fetch(`/api/runs/${selectedRunId}/progress`)
          .then(r => r.ok ? r.json() : null)
          .then((data: RunProgress | null) => {
            if (!data) return
            setProgress(data)
            if (data.status !== 'running') {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
              }
              fetchLeads(selectedRunId)
            }
          })
          .catch(() => { /* swallow — non-critical */ })
      }

      poll()
      progressIntervalRef.current = setInterval(poll, 2000)
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [selectedRunId, runs, fetchLeads])

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null
  const isRunning = selectedRun?.status === 'running'
  const breakdown = topSignalBreakdown(leads)

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function toggleSignalType(signalType: string) {
    setSelectedSignalTypes(prev =>
      prev.includes(signalType)
        ? prev.filter(s => s !== signalType)
        : [...prev, signalType],
    )
  }

  function toggleStatus(status: string) {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status],
    )
  }

  // ── New run flow handlers ──────────────────────────────────────────────────

  async function handleStartNewRun() {
    // If there's already a selected run with a config, fetch the estimate immediately.
    // Otherwise, show the YAML input form.
    const configYaml = selectedRun?.config_yaml ?? ''
    if (configYaml.trim()) {
      await fetchEstimate(configYaml)
    } else {
      setNewRunStep({ kind: 'input', configYaml: '' })
      setNewRunError(null)
    }
  }

  async function fetchEstimate(configYaml: string) {
    setNewRunStep({ kind: 'estimating', configYaml })
    setNewRunError(null)
    try {
      const resp = await fetch('/api/runs/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_yaml: configYaml }),
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(detail.detail ?? `Estimate failed: ${resp.status}`)
      }
      const estimate: RunEstimate = await resp.json()
      setNewRunStep({ kind: 'confirm', configYaml, estimate })
    } catch (e: unknown) {
      setNewRunError(e instanceof Error ? e.message : String(e))
      setNewRunStep({ kind: 'input', configYaml })
    }
  }

  async function handleFetchEstimate() {
    if (newRunStep.kind !== 'input') return
    await fetchEstimate(newRunStep.configYaml)
  }

  async function handleConfirmRun() {
    if (newRunStep.kind !== 'confirm') return
    const { configYaml, estimate } = newRunStep
    setNewRunStep({ kind: 'submitting', configYaml, estimate })
    setNewRunError(null)
    try {
      const resp = await fetch('/api/runs/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_yaml: configYaml }),
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(detail.detail ?? `Failed to start run: ${resp.status}`)
      }
      const newRun: Run = await resp.json()
      setRuns(prev => [newRun, ...prev])
      setSelectedRunId(newRun.id)
      setLeads([])
      setNewRunStep({ kind: 'idle' })
      addToast('Run submitted successfully')
    } catch (e: unknown) {
      setNewRunError(e instanceof Error ? e.message : String(e))
      setNewRunStep({ kind: 'confirm', configYaml, estimate })
    }
  }

  function handleCancelNewRun() {
    setNewRunStep({ kind: 'idle' })
    setNewRunError(null)
  }

  // ── Detail panel handlers ──────────────────────────────────────────────────

  function handleLeadUpdated(updated: Lead) {
    setLeads(prev => prev.map(l => (l.id === updated.id ? updated : l)))
    setSelectedLead(updated)
  }

  // ── CSV export ──────────────────────────────────────────────────────────────

  function handleExportCsv() {
    if (selectedRunId == null) return
    setExportingCsv(true)
    const url = `/api/runs/${selectedRunId}/leads/export`
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`Export failed: ${r.status}`)
        return r.blob()
      })
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = `leads_run_${selectedRunId}.csv`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(objectUrl)
      })
      .catch(e => setError(e.message))
      .finally(() => setExportingCsv(false))
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <h1 className="lp-page-title">
        Lead Results
      </h1>

      {error && <p role="alert" className="lp-error" style={{ marginBottom: '12px' }}>{error}</p>}

      {loadingRuns && <p style={{ color: '#6b7280' }}>Loading runs…</p>}

      {!loadingRuns && runs.length === 0 && !error && (
        <p style={{ color: '#6b7280' }}>No runs yet. Go to Config Builder to create one.</p>
      )}

      {/* Top toolbar — run selector + actions */}
      {runs.length > 0 && (
        <div
          className="lp-card"
          style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', padding: '16px 24px' }}
        >
          <section aria-label="Run selector" style={{ flex: '1 1 260px', minWidth: 0 }}>
            <label htmlFor="run-select" className="lp-label">Select run</label>
            <select
              id="run-select"
              className="lp-select"
              value={selectedRunId ?? ''}
              onChange={e => {
                setSelectedRunId(Number(e.target.value))
                setSelectedSignalTypes([])
                setSelectedStatuses([])
                setKnownSignalTypes([])
                setProgress(null)
              }}
            >
              {runs.map(r => (
                <option key={r.id} value={r.id}>
                  Run #{r.id} — {r.status} ({r.total_leads} leads)
                </option>
              ))}
            </select>
          </section>

          {selectedRun && (
            <section aria-label="Run details" style={{ flex: '1 1 auto' }}>
              <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: '36px' }}>
                Status: <strong style={{ color: '#111827' }}>{selectedRun.status}</strong>
                {selectedRun.total_leads > 0 && ` · ${selectedRun.total_leads} qualified leads`}
                {selectedRun.error_message && ` · Error: ${selectedRun.error_message}`}
              </p>
            </section>
          )}

          {/* Start new run button — idle state */}
          {newRunStep.kind === 'idle' && (
            <section aria-label="Start new run" style={{ flexShrink: 0 }}>
              <button className="btn btn-primary" onClick={handleStartNewRun}>Start new run</button>
            </section>
          )}
        </div>
      )}

      {/* Config input step */}
      {(newRunStep.kind === 'input' || newRunStep.kind === 'estimating') && (
        <section aria-label="New run configuration">
          <div className="lp-card" style={{ maxWidth: '600px' }}>
            <h2 className="lp-section-title">New Run</h2>
            <label htmlFor="new-run-yaml" className="lp-label">Paste your Search Config YAML</label>
            <textarea
              id="new-run-yaml"
              aria-label="Search config YAML"
              className="lp-textarea"
              rows={8}
              value={newRunStep.configYaml}
              onChange={e =>
                newRunStep.kind === 'input' &&
                setNewRunStep({ kind: 'input', configYaml: e.target.value })
              }
              disabled={newRunStep.kind === 'estimating'}
              style={{ marginBottom: '12px', fontFamily: 'monospace', fontSize: 'var(--font-size-sm)' }}
            />
            <div className="lp-row">
              <button
                className="btn btn-primary"
                onClick={handleFetchEstimate}
                disabled={newRunStep.kind === 'estimating' || !newRunStep.configYaml.trim()}
              >
                {newRunStep.kind === 'estimating' ? <><Spinner />Estimating…</> : 'Start new run'}
              </button>
              <button className="btn btn-secondary" onClick={handleCancelNewRun}>Cancel</button>
            </div>
            {newRunError && <p role="alert" className="lp-error">{newRunError}</p>}
          </div>
        </section>
      )}

      {/* Confirm step — shows estimate and requires explicit confirm */}
      {(newRunStep.kind === 'confirm' || newRunStep.kind === 'submitting') && (
        <section aria-label="Run cost estimate">
          <div className="lp-card" style={{ maxWidth: '400px' }}>
            <h2 className="lp-section-title" style={{ marginBottom: '12px' }}>Estimated Cost</h2>
            <p style={{ marginBottom: '4px', color: '#374151' }}>{newRunStep.estimate.query_count} queries</p>
            <p style={{ marginBottom: '4px', color: '#374151' }}>{newRunStep.estimate.estimated_results} results</p>
            <p style={{ marginBottom: '16px', color: '#374151' }}>${newRunStep.estimate.estimated_cost_usd.toFixed(3)} estimated API cost</p>
            <div className="lp-row">
              <button
                className="btn btn-primary"
                onClick={handleConfirmRun}
                disabled={newRunStep.kind === 'submitting'}
              >
                {newRunStep.kind === 'submitting' ? <><Spinner />Starting…</> : 'Confirm & start run'}
              </button>
              <button className="btn btn-secondary" onClick={handleCancelNewRun} disabled={newRunStep.kind === 'submitting'}>
                Cancel
              </button>
            </div>
            {newRunError && <p role="alert" className="lp-error">{newRunError}</p>}
          </div>
        </section>
      )}

      {/* Apify status indicator — shown when run has apify_run_id */}
      {selectedRun?.apify_run_id && apifyStatus && (
        <div
          role="status"
          aria-label="Apify status"
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '10px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#1d4ed8',
          }}
        >
          <p>Apify status: {apifyStatus}</p>
        </div>
      )}

      {/* Progress indicator — only shown for non-Apify running runs */}
      {isRunning && progress && !selectedRun?.apify_run_id && (
        <div
          role="status"
          aria-label="Run progress"
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '10px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#1d4ed8',
          }}
        >
          <p>
            Queries: {progress.queries_completed} / {progress.queries_total}{' '}
            &nbsp;·&nbsp; {progress.leads_found} leads found
          </p>
        </div>
      )}

      {/* Filters + sort controls — shown whenever there is a selected run */}
      {selectedRunId != null && (
        <section aria-label="Filters and sort">
          <div className="lp-card" style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: knownSignalTypes.length > 0 ? '16px' : 0 }}>
              <label htmlFor="sort-select" className="lp-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Sort by</label>
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
      )}

      {loadingLeads && <SkeletonTable />}

      {!loadingLeads && leads.length === 0 && selectedRunId != null && !error && (
        <p style={{ color: '#6b7280', marginTop: '16px' }}>No qualified leads for this run.</p>
      )}

      {leads.length > 0 && (
        <>
          {/* Summary */}
          <section aria-label="Summary" style={{ margin: '16px 0 8px' }}>
            <p style={{ fontSize: '13px', color: '#374151' }}>
              <strong>{leads.length} leads</strong>
              {breakdown.length > 0 && (
                <> — top signals:{' '}
                  {breakdown.map(b => (
                    <span key={b.type} style={{ marginRight: '0.5rem' }}>
                      {b.type.replace(/_/g, ' ')} ({b.count})
                    </span>
                  ))}
                </>
              )}
            </p>
          </section>

          <div style={{ marginBottom: '12px' }}>
            <button className="btn btn-secondary" onClick={handleExportCsv} disabled={exportingCsv}>
              {exportingCsv ? <><Spinner />Exporting…</> : 'Export CSV'}
            </button>
          </div>

          <table
            aria-label="Lead results"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {(['Name', 'Location', 'Phone', 'Gap Score', 'Top Signals', 'Services', 'Status'] as const).map(col => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontWeight: 600,
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: '#6b7280',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid #f3f4f6',
                    background: '#ffffff',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => setSelectedLead(lead)}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#eff6ff' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#ffffff' }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{lead.name}</td>
                  <td style={{ padding: '10px 12px', color: '#374151' }}>{formatLocation(lead)}</td>
                  <td style={{ padding: '10px 12px', color: '#374151' }}>{lead.phone ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1d4ed8' }}>{lead.gap_score.toFixed(1)}</td>
                  <td style={{ padding: '10px 12px', color: '#374151' }}>
                    {topSignalLabels(lead).map(label => (
                      <span
                        key={label}
                        style={{
                          display: 'inline-block',
                          marginRight: '4px',
                          marginBottom: '2px',
                          fontSize: '12px',
                          background: '#f3f4f6',
                          color: '#374151',
                          borderRadius: '4px',
                          padding: '1px 6px',
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {getServiceBadges(lead.gap_signals).map(service => (
                      <ServiceBadge key={service} service={service} />
                    ))}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusBadge status={lead.status} />
                  </td>
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
