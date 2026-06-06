import { useRef, useState } from 'react'
import * as yaml from 'js-yaml'
import { useNavigate } from 'react-router-dom'
import { businessTypes } from '../data/businessTypes'
import { stateCities } from '../data/stateCities'

const DEFAULT_MAX_RESULTS = 500

interface SelectedCity {
  city: string
  state: string
}

interface CustomBusinessType {
  name: string
  checked: boolean
}

interface RunEstimate {
  query_count: number
  estimated_results: number
  estimated_cost_usd: number
}

type Step =
  | { kind: 'editing' }
  | { kind: 'estimating' }
  | { kind: 'confirm'; estimate: RunEstimate; configYaml: string }
  | { kind: 'submitting'; estimate: RunEstimate; configYaml: string }

export default function ConfigBuilder() {
  const navigate = useNavigate()

  // Business type selection — keyed by type name
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [customTypes, setCustomTypes] = useState<CustomBusinessType[]>([])
  const [customInput, setCustomInput] = useState('')

  // City selection
  const [selectedState, setSelectedState] = useState('')
  const [citySelectValue, setCitySelectValue] = useState('')
  const [selectedCities, setSelectedCities] = useState<SelectedCity[]>([])

  // Max results cap
  const [maxResults, setMaxResults] = useState(DEFAULT_MAX_RESULTS)

  // Launch flow state machine
  const [step, setStep] = useState<Step>({ kind: 'editing' })
  const [runError, setRunError] = useState<string | null>(null)
  const estimatingRef = useRef(false)

  // Derive city options for selected state
  const stateEntry = stateCities.find(s => s.abbreviation === selectedState)
  const cityOptions = stateEntry ? stateEntry.cities : []

  function toggleType(name: string) {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleCustomType(name: string) {
    setCustomTypes(prev =>
      prev.map(ct => ct.name === name ? { ...ct, checked: !ct.checked } : ct)
    )
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function handleCustomInput(e: React.ChangeEvent<HTMLInputElement>) {
    setCustomInput(e.target.value)
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && customInput.trim()) {
      const name = customInput.trim()
      setCustomTypes(prev => [...prev, { name, checked: true }])
      setSelectedTypes(prev => new Set([...prev, name]))
      setCustomInput('')
    }
  }

  function handleStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedState(e.target.value)
    setCitySelectValue('')
  }

  function handleCityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const city = e.target.value
    if (!city || !selectedState) return
    setSelectedCities(prev => {
      if (prev.some(c => c.city === city && c.state === selectedState)) return prev
      return [...prev, { city, state: selectedState }]
    })
    setCitySelectValue('')
  }

  /** Build config YAML from current selections (internal use only). */
  function buildConfigYaml(): string {
    const builtInSelected = businessTypes
      .flatMap(g => g.types)
      .filter(t => selectedTypes.has(t))
    const customSelected = customTypes
      .map(ct => ct.name)
      .filter(name => selectedTypes.has(name))
    const allTypes = [...builtInSelected, ...customSelected]

    const queries: string[] = []
    for (const city of selectedCities) {
      for (const type of allTypes) {
        queries.push(`${type} in ${city.city} ${city.state}`)
      }
    }

    return yaml.dump({ queries, max_results_per_run: maxResults })
  }

  async function handleRun() {
    if (estimatingRef.current) return
    estimatingRef.current = true
    setRunError(null)
    const configYaml = buildConfigYaml()
    setStep({ kind: 'estimating' })

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
      setStep({ kind: 'confirm', estimate, configYaml })
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e))
      setStep({ kind: 'editing' })
    } finally {
      estimatingRef.current = false
    }
  }

  async function handleConfirmRun() {
    if (step.kind !== 'confirm') return
    const { estimate, configYaml } = step
    setStep({ kind: 'submitting', estimate, configYaml })
    setRunError(null)

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
      const newRun = await resp.json()
      navigate('/leads', { state: { runId: newRun.id } })
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e))
      setStep({ kind: 'confirm', estimate, configYaml })
    }
  }

  function handleCancel() {
    setStep({ kind: 'editing' })
    setRunError(null)
  }

  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '24px', color: '#111827' }}>
        Config Builder
      </h1>

      {/* Business Types */}
      <div className="lp-card">
        <h2 className="lp-section-title">Business Types</h2>
        {businessTypes.map(group => (
          <div key={group.vertical} style={{ marginBottom: '20px' }}>
            <h3 className="lp-subsection-title">{group.vertical}</h3>
            <div className="lp-checkbox-list">
              {group.types.map(type => (
                <label key={type} className="lp-checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedTypes.has(type)}
                    onChange={() => toggleType(type)}
                    aria-label={type}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Custom types */}
        {customTypes.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h3 className="lp-subsection-title">Custom types</h3>
            <div className="lp-checkbox-list">
              {customTypes.map(ct => (
                <label key={ct.name} className="lp-checkbox-item">
                  <input
                    type="checkbox"
                    checked={ct.checked}
                    onChange={() => toggleCustomType(ct.name)}
                    aria-label={ct.name}
                  />
                  {ct.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <input
          type="text"
          className="lp-input"
          style={{ maxWidth: '320px' }}
          placeholder="add custom business type"
          value={customInput}
          onChange={handleCustomInput}
          onKeyDown={handleCustomKeyDown}
        />
      </div>

      {/* City Picker */}
      <div className="lp-card">
        <h2 className="lp-section-title">Cities</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '560px', marginBottom: '16px' }}>
          <div>
            <label htmlFor="state-select" className="lp-label">Select state</label>
            <select
              id="state-select"
              className="lp-select"
              value={selectedState}
              onChange={handleStateChange}
            >
              <option value="">-- select state --</option>
              {stateCities.map(s => (
                <option key={s.abbreviation} value={s.abbreviation}>
                  {s.name} ({s.abbreviation})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="city-select" className="lp-label">Select city</label>
            <select
              id="city-select"
              className="lp-select"
              value={citySelectValue}
              onChange={handleCityChange}
            >
              <option value="">-- select city --</option>
              {cityOptions.map(city => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedCities.length > 0 && (
          <ul
            aria-label="Selected cities"
            style={{
              listStyle: 'none',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginTop: '4px',
            }}
          >
            {selectedCities.map((c, i) => (
              <li
                key={`${i}:${c.city}:${c.state}`}
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  borderRadius: '9999px',
                  padding: '2px 10px',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                {c.city}, {c.state}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Max results cap */}
      <div className="lp-card" style={{ paddingBottom: '20px' }}>
        <label htmlFor="max-results-cap" className="lp-label">Max results cap</label>
        <input
          id="max-results-cap"
          type="number"
          className="lp-input"
          style={{ maxWidth: '160px' }}
          min={1}
          value={maxResults}
          onChange={e => setMaxResults(Number(e.target.value))}
          aria-label="Max results cap"
        />
      </div>

      {/* Launch flow */}
      {step.kind === 'editing' && (
        <section>
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={selectedTypes.size === 0 || selectedCities.length === 0}
          >
            Run
          </button>
          {runError && <p role="alert" className="lp-error">{runError}</p>}
        </section>
      )}

      {step.kind === 'estimating' && (
        <section aria-label="Estimating cost">
          <p style={{ color: '#6b7280', marginBottom: '12px' }}>Estimating&hellip;</p>
          <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
        </section>
      )}

      {(step.kind === 'confirm' || step.kind === 'submitting') && (
        <section aria-label="Run cost estimate">
          <div className="lp-card" style={{ maxWidth: '400px' }}>
            <h2 className="lp-section-title" style={{ marginBottom: '12px' }}>Estimated Cost</h2>
            <p style={{ marginBottom: '4px', color: '#374151' }}>{step.estimate.query_count} queries</p>
            <p style={{ marginBottom: '4px', color: '#374151' }}>{step.estimate.estimated_results} results</p>
            <p style={{ marginBottom: '16px', color: '#374151' }}>${step.estimate.estimated_cost_usd.toFixed(3)} estimated API cost</p>
            <div className="lp-row">
              <button
                className="btn btn-primary"
                onClick={handleConfirmRun}
                disabled={step.kind === 'submitting'}
              >
                {step.kind === 'submitting' ? 'Starting…' : 'Confirm & start run'}
              </button>
              <button className="btn btn-secondary" onClick={handleCancel} disabled={step.kind === 'submitting'}>
                Cancel
              </button>
            </div>
            {runError && <p role="alert" className="lp-error">{runError}</p>}
          </div>
        </section>
      )}
    </div>
  )
}
