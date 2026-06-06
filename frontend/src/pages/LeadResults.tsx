import { useCallback, useEffect, useRef, useState } from 'react'
import LeadDetailPanel, { type Lead } from './LeadDetailPanel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Run {
  id: number
  status: string
  total_leads: number
  config_yaml: string
  error_message: string | null
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
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  // New-run flow
  const [newRunStep, setNewRunStep] = useState<NewRunStep>({ kind: 'idle' })
  const [newRunError, setNewRunError] = useState<string | null>(null)

  // Filter + sort state (persists across interactions)
  const [selectedSignalTypes, setSelectedSignalTypes] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [sort, setSort] = useState<SortField>('gap_score')

  // All signal types ever seen for current run (for checkbox list)
  const [knownSignalTypes, setKnownSignalTypes] = useState<string[]>([])

  // Progress polling
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
          setSelectedRunId(prev => prev ?? data[0].id)
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
      return
    }

    const selectedRun = runs.find(r => r.id === selectedRunId)
    if (!selectedRun || selectedRun.status !== 'running') {
      setProgress(null)
      return
    }

    // Fetch immediately, then poll every 2 seconds
    const poll = () => {
      fetch(`/api/runs/${selectedRunId}/progress`)
        .then(r => r.ok ? r.json() : null)
        .then((data: RunProgress | null) => {
          if (!data) return
          setProgress(data)
          if (data.status !== 'running') {
            // Run finished — stop polling and reload leads
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <h1>Lead Results</h1>

      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

      {loadingRuns && <p>Loading runs…</p>}

      {!loadingRuns && runs.length === 0 && !error && (
        <p>No runs yet. Go to Config Builder to create one.</p>
      )}

      {runs.length > 0 && (
        <section aria-label="Run selector">
          <label htmlFor="run-select">Select run</label>{' '}
          <select
            id="run-select"
            value={selectedRunId ?? ''}
            onChange={e => {
              setSelectedRunId(Number(e.target.value))
              // Reset filters when switching runs
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
      )}

      {selectedRun && (
        <section aria-label="Run details">
          <p>
            Status: <strong>{selectedRun.status}</strong>
            {selectedRun.total_leads > 0 && ` · ${selectedRun.total_leads} qualified leads`}
            {selectedRun.error_message && ` · Error: ${selectedRun.error_message}`}
          </p>
        </section>
      )}

      {/* Start new run button */}
      {newRunStep.kind === 'idle' && (
        <section aria-label="Start new run">
          <button onClick={handleStartNewRun}>Start new run</button>
        </section>
      )}

      {/* Config input step */}
      {(newRunStep.kind === 'input' || newRunStep.kind === 'estimating') && (
        <section aria-label="New run configuration">
          <h2>New Run</h2>
          <label htmlFor="new-run-yaml">Paste your Search Config YAML</label>
          <textarea
            id="new-run-yaml"
            aria-label="Search config YAML"
            rows={8}
            cols={60}
            value={newRunStep.configYaml}
            onChange={e =>
              newRunStep.kind === 'input' &&
              setNewRunStep({ kind: 'input', configYaml: e.target.value })
            }
            disabled={newRunStep.kind === 'estimating'}
          />
          <div>
            <button
              onClick={handleFetchEstimate}
              disabled={newRunStep.kind === 'estimating' || !newRunStep.configYaml.trim()}
            >
              {newRunStep.kind === 'estimating' ? 'Estimating…' : 'Start new run'}
            </button>
            <button onClick={handleCancelNewRun}>Cancel</button>
          </div>
          {newRunError && <p role="alert" style={{ color: 'red' }}>{newRunError}</p>}
        </section>
      )}

      {/* Confirm step — shows estimate and requires explicit confirm */}
      {(newRunStep.kind === 'confirm' || newRunStep.kind === 'submitting') && (
        <section aria-label="Run cost estimate">
          <h2>Estimated Cost</h2>
          <p>{newRunStep.estimate.query_count} queries</p>
          <p>{newRunStep.estimate.estimated_results} results</p>
          <p>${newRunStep.estimate.estimated_cost_usd.toFixed(3)} estimated API cost</p>
          <div>
            <button
              onClick={handleConfirmRun}
              disabled={newRunStep.kind === 'submitting'}
            >
              {newRunStep.kind === 'submitting' ? 'Starting…' : 'Confirm & start run'}
            </button>
            <button onClick={handleCancelNewRun} disabled={newRunStep.kind === 'submitting'}>
              Cancel
            </button>
          </div>
          {newRunError && <p role="alert" style={{ color: 'red' }}>{newRunError}</p>}
        </section>
      )}

      {/* Progress indicator — only shown while run is executing */}
      {isRunning && progress && (
        <div role="status" aria-label="Run progress">
          <p>
            Queries: {progress.queries_completed} / {progress.queries_total}{' '}
            &nbsp;·&nbsp; {progress.leads_found} leads found
          </p>
        </div>
      )}

      {/* Filters + sort controls — shown whenever there is a selected run */}
      {selectedRunId != null && (
        <section aria-label="Filters and sort">
          {/* Sort */}
          <label htmlFor="sort-select">Sort by</label>{' '}
          <select
            id="sort-select"
            value={sort}
            onChange={e => setSort(e.target.value as SortField)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Signal type filter */}
          {knownSignalTypes.length > 0 && (
            <fieldset>
              <legend>Signal type</legend>
              {knownSignalTypes.map(st => (
                <label key={st} style={{ marginRight: '0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedSignalTypes.includes(st)}
                    onChange={() => toggleSignalType(st)}
                  />{' '}
                  {st.replace(/_/g, ' ')}
                </label>
              ))}
            </fieldset>
          )}

          {/* Status filter */}
          <fieldset>
            <legend>Status</legend>
            {ALL_STATUSES.map(s => (
              <label key={s} style={{ marginRight: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                />{' '}
                {s}
              </label>
            ))}
          </fieldset>
        </section>
      )}

      {loadingLeads && <p>Loading leads…</p>}

      {!loadingLeads && leads.length === 0 && selectedRunId != null && !error && (
        <p>No qualified leads for this run.</p>
      )}

      {leads.length > 0 && (
        <>
          {/* Summary */}
          <section aria-label="Summary">
            <p>
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

          <table aria-label="Lead results">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Phone</th>
                <th>Gap Score</th>
                <th>Top Signals</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr
                  key={lead.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedLead(lead)}
                >
                  <td>{lead.name}</td>
                  <td>{formatLocation(lead)}</td>
                  <td>{lead.phone ?? '—'}</td>
                  <td>{lead.gap_score.toFixed(1)}</td>
                  <td>
                    {topSignalLabels(lead).map(label => (
                      <span key={label} style={{ marginRight: '0.4rem' }}>{label}</span>
                    ))}
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
        />
      )}
    </div>
  )
}
