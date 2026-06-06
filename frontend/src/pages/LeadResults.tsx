import { useEffect, useState } from 'react'

interface GapSignal {
  id: number
  signal_type: string
  is_hard: boolean
  description: string
}

interface Lead {
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

/** State machine for the "start new run" flow */
type NewRunStep =
  | { kind: 'idle' }
  | { kind: 'input'; configYaml: string }
  | { kind: 'estimating'; configYaml: string }
  | { kind: 'confirm'; configYaml: string; estimate: RunEstimate }
  | { kind: 'submitting'; configYaml: string; estimate: RunEstimate }

export default function LeadResults() {
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New-run flow
  const [newRunStep, setNewRunStep] = useState<NewRunStep>({ kind: 'idle' })
  const [newRunError, setNewRunError] = useState<string | null>(null)

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

  useEffect(() => {
    if (selectedRunId == null) return
    setLoadingLeads(true)
    setError(null)
    fetch(`/api/leads/run/${selectedRunId}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load leads: ${r.status}`)
        return r.json()
      })
      .then((data: Lead[]) => setLeads(data))
      .catch(e => setError(e.message))
      .finally(() => setLoadingLeads(false))
  }, [selectedRunId])

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null

  function formatLocation(lead: Lead): string {
    if (lead.city && lead.state) return `${lead.city}, ${lead.state}`
    if (lead.city) return lead.city
    if (lead.state) return lead.state
    return '—'
  }

  function topSignalLabels(lead: Lead): string[] {
    // Hard signals first, then soft; show up to 3
    const hard = lead.gap_signals.filter(s => s.is_hard)
    const soft = lead.gap_signals.filter(s => !s.is_hard)
    return [...hard, ...soft].slice(0, 3).map(s => s.signal_type.replace(/_/g, ' '))
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
            onChange={e => setSelectedRunId(Number(e.target.value))}
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

      {loadingLeads && <p>Loading leads…</p>}

      {!loadingLeads && leads.length === 0 && selectedRunId != null && !error && (
        <p>No qualified leads for this run.</p>
      )}

      {leads.length > 0 && (
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
              <tr key={lead.id}>
                <td>
                  {lead.website_url
                    ? <a href={lead.website_url} target="_blank" rel="noopener noreferrer">{lead.name}</a>
                    : lead.name}
                </td>
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
      )}
    </div>
  )
}
