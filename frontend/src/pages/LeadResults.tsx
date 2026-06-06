import { useEffect, useState } from 'react'
import LeadDetailPanel, { type Lead } from './LeadDetailPanel'

interface Run {
  id: number
  status: string
  total_leads: number
  config_yaml: string
  error_message: string | null
}

export default function LeadResults() {
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

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

  function handleLeadUpdated(updated: Lead) {
    setLeads(prev => prev.map(l => (l.id === updated.id ? updated : l)))
    setSelectedLead(updated)
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
