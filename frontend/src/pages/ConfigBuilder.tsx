import { useRef, useState } from 'react'
import * as yaml from 'js-yaml'
import { useNavigate } from 'react-router-dom'
import { businessTypes } from '../data/businessTypes'
import { stateCities } from '../data/stateCities'

const DEFAULT_MAX_RESULTS = 500

type LeadSource = 'google_places' | 'apify_google_maps' | 'apify_facebook_pages'

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'google_places', label: 'Google Places API' },
  { value: 'apify_google_maps', label: 'Apify — Google Maps Scraper' },
  { value: 'apify_facebook_pages', label: 'Apify — Facebook Pages Scraper' },
]

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

interface MonthlySpend {
  spent_usd: number
  budget_usd: number
  remaining_usd: number
}

interface MonthlySpendResponse {
  google_places: MonthlySpend
  apify: MonthlySpend
}

type Step =
  | { kind: 'editing' }
  | { kind: 'estimating' }
  | { kind: 'confirm'; estimate: RunEstimate; configYaml: string; apifySpend?: MonthlySpend }
  | { kind: 'submitting'; estimate: RunEstimate; configYaml: string; apifySpend?: MonthlySpend }

export default function ConfigBuilder() {
  const navigate = useNavigate()

  // Lead source selection
  const [source, setSource] = useState<LeadSource>('google_places')

  // Business type selection — keyed by type name (Google Places only)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [customTypes, setCustomTypes] = useState<CustomBusinessType[]>([])
  const [customInput, setCustomInput] = useState('')

  // City selection (Google Places)
  const [selectedState, setSelectedState] = useState('')
  const [citySelectValue, setCitySelectValue] = useState('')
  const [selectedCities, setSelectedCities] = useState<SelectedCity[]>([])

  // Apify Google Maps fields
  const [apifySearchTerm, setApifySearchTerm] = useState('')
  const [apifyState, setApifyState] = useState('')
  const [apifyCity, setApifyCity] = useState('')

  // Apify Facebook Pages fields
  const [fbKeyword, setFbKeyword] = useState('')
  const [fbLocation, setFbLocation] = useState('')

  // Max results cap
  const [maxResults, setMaxResults] = useState(DEFAULT_MAX_RESULTS)

  // Launch flow state machine
  const [step, setStep] = useState<Step>({ kind: 'editing' })
  const [runError, setRunError] = useState<string | null>(null)
  const estimatingRef = useRef(false)

  // Derived city options
  const stateEntry = stateCities.find(s => s.abbreviation === selectedState)
  const cityOptions = stateEntry ? stateEntry.cities : []

  const apifyStateEntry = stateCities.find(s => s.abbreviation === apifyState)
  const apifyCityOptions = apifyStateEntry ? apifyStateEntry.cities : []

  // ── Business type (Google Places) ───────────────────────────────────────────

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
    if (e.key !== 'Enter') return
    if (customInput.trim()) {
      const name = customInput.trim()
      setCustomTypes(prev => [...prev, { name, checked: true }])
      setSelectedTypes(prev => new Set([...prev, name]))
      setCustomInput('')
    } else {
      handleRun()
    }
  }

  // ── City picker (Google Places) ─────────────────────────────────────────────

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

  // ── Apify Google Maps city picker ────────────────────────────────────────────

  function handleApifyStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setApifyState(e.target.value)
    setApifyCity('')
  }

  function handleApifyCityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setApifyCity(e.target.value)
  }

  // ── Config YAML builders ─────────────────────────────────────────────────────

  function buildGooglePlacesYaml(extraType?: string): string {
    const builtInSelected = businessTypes
      .flatMap(g => g.types)
      .filter(t => selectedTypes.has(t))
    const customSelected = customTypes
      .map(ct => ct.name)
      .filter(name => selectedTypes.has(name))
    const extra = extraType && !selectedTypes.has(extraType) ? [extraType] : []
    const allTypes = [...builtInSelected, ...customSelected, ...extra]

    const queries: string[] = []
    for (const city of selectedCities) {
      for (const type of allTypes) {
        queries.push(`${type} in ${city.city} ${city.state}`)
      }
    }

    return yaml.dump({
      source: 'google_places',
      max_results_per_run: maxResults,
      source_config: { queries },
    })
  }

  function buildApifyGoogleMapsYaml(): string {
    return yaml.dump({
      source: 'apify_google_maps',
      max_results_per_run: maxResults,
      source_config: {
        search_term: apifySearchTerm,
        city: apifyCity,
        state: apifyState,
      },
    })
  }

  function buildApifyFacebookPagesYaml(): string {
    const query = [fbKeyword, fbLocation].filter(Boolean).join(' ')
    return yaml.dump({
      source: 'apify_facebook_pages',
      max_results_per_run: maxResults,
      source_config: { query },
    })
  }

  function buildConfigYaml(extraType?: string): string {
    if (source === 'apify_google_maps') return buildApifyGoogleMapsYaml()
    if (source === 'apify_facebook_pages') return buildApifyFacebookPagesYaml()
    return buildGooglePlacesYaml(extraType)
  }

  // ── Readiness check ──────────────────────────────────────────────────────────

  function isReadyToRun(): boolean {
    if (source === 'google_places') {
      return (selectedTypes.size > 0 || !!customInput.trim()) && selectedCities.length > 0
    }
    if (source === 'apify_google_maps') {
      return !!apifySearchTerm.trim() && !!apifyCity && !!apifyState
    }
    if (source === 'apify_facebook_pages') {
      return !!fbKeyword.trim()
    }
    return false
  }

  // ── Run flow ─────────────────────────────────────────────────────────────────

  async function handleRun() {
    if (estimatingRef.current) return
    estimatingRef.current = true
    setRunError(null)

    // Commit pending custom type for Google Places
    let pendingType: string | undefined
    if (source === 'google_places') {
      pendingType = customInput.trim() || undefined
      if (pendingType) {
        setCustomTypes(prev => [...prev, { name: pendingType!, checked: true }])
        setSelectedTypes(prev => new Set([...prev, pendingType!]))
        setCustomInput('')
      }
    }

    const configYaml = buildConfigYaml(pendingType)
    setStep({ kind: 'estimating' })

    try {
      const isApify = source !== 'google_places'

      const [estimateResp, spendResp] = await Promise.all([
        fetch('/api/runs/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_yaml: configYaml }),
        }),
        isApify ? fetch('/api/runs/monthly-spend') : Promise.resolve(null),
      ])

      if (!estimateResp.ok) {
        const detail = await estimateResp.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(detail.detail ?? `Estimate failed: ${estimateResp.status}`)
      }

      const estimate: RunEstimate = await estimateResp.json()
      let apifySpend: MonthlySpend | undefined
      if (spendResp && spendResp.ok) {
        const spendData: MonthlySpendResponse = await spendResp.json()
        apifySpend = spendData.apify
      }

      setStep({ kind: 'confirm', estimate, configYaml, apifySpend })
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e))
      setStep({ kind: 'editing' })
    } finally {
      estimatingRef.current = false
    }
  }

  async function handleConfirmRun() {
    if (step.kind !== 'confirm') return
    const { estimate, configYaml, apifySpend } = step
    setStep({ kind: 'submitting', estimate, configYaml, apifySpend })
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
      setStep({ kind: 'confirm', estimate, configYaml, apifySpend })
    }
  }

  function handleCancel() {
    setStep({ kind: 'editing' })
    setRunError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const isApifySource = source !== 'google_places'

  // Pre-compute budget info for the confirm step (only relevant for Apify sources)
  const confirmApifySpend =
    (step.kind === 'confirm' || step.kind === 'submitting') ? step.apifySpend : undefined
  const remainingAfterRun =
    confirmApifySpend != null
      ? confirmApifySpend.remaining_usd - ((step.kind === 'confirm' || step.kind === 'submitting') ? step.estimate.estimated_cost_usd : 0)
      : null

  return (
    <div>
      <h1 className="lp-page-title">Config Builder</h1>

      {/* Source selector */}
      <div className="lp-card" style={{ paddingBottom: '20px' }}>
        <label htmlFor="lead-source-select" className="lp-label">Lead Source</label>
        <select
          id="lead-source-select"
          className="lp-select"
          style={{ maxWidth: '320px' }}
          aria-label="Lead Source"
          value={source}
          onChange={e => setSource(e.target.value as LeadSource)}
        >
          {SOURCE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Google Places form */}
      {source === 'google_places' && (
        <>
          {/* Business Types — chip grid */}
          <div className="lp-card">
            <h2 className="lp-section-title">Business Types</h2>
            {businessTypes.map(group => (
              <div key={group.vertical} style={{ marginBottom: '20px' }}>
                <h3 className="lp-subsection-title">{group.vertical}</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {group.types.map(type => {
                    const isSelected = selectedTypes.has(type)
                    return (
                      <button
                        key={type}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={type}
                        onClick={() => toggleType(type)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          border: isSelected ? '1px solid #2563eb' : '1px solid #d1d5db',
                          background: isSelected ? '#2563eb' : '#ffffff',
                          color: isSelected ? '#ffffff' : '#374151',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Custom types */}
            {customTypes.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 className="lp-subsection-title">Custom types</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {customTypes.map(ct => {
                    const isSelected = ct.checked
                    return (
                      <button
                        key={ct.name}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={ct.name}
                        onClick={() => toggleCustomType(ct.name)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          border: isSelected ? '1px solid #2563eb' : '1px solid #d1d5db',
                          background: isSelected ? '#2563eb' : '#ffffff',
                          color: isSelected ? '#ffffff' : '#374151',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {ct.name}
                      </button>
                    )
                  })}
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
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedCities.length > 0 && (
              <ul
                aria-label="Selected cities"
                style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}
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
        </>
      )}

      {/* Apify Google Maps form */}
      {source === 'apify_google_maps' && (
        <div className="lp-card">
          <h2 className="lp-section-title">Search Parameters</h2>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="apify-search-term" className="lp-label">Search term</label>
            <input
              id="apify-search-term"
              type="text"
              className="lp-input"
              style={{ maxWidth: '320px' }}
              aria-label="Search term"
              placeholder="e.g. plumbers"
              value={apifySearchTerm}
              onChange={e => setApifySearchTerm(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '560px' }}>
            <div>
              <label htmlFor="apify-state-select" className="lp-label">Select state</label>
              <select
                id="apify-state-select"
                className="lp-select"
                value={apifyState}
                onChange={handleApifyStateChange}
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
              <label htmlFor="apify-city-select" className="lp-label">Select city</label>
              <select
                id="apify-city-select"
                className="lp-select"
                value={apifyCity}
                onChange={handleApifyCityChange}
              >
                <option value="">-- select city --</option>
                {apifyCityOptions.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Apify Facebook Pages form */}
      {source === 'apify_facebook_pages' && (
        <div className="lp-card">
          <h2 className="lp-section-title">Search Parameters</h2>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="fb-keyword" className="lp-label">Keyword</label>
            <input
              id="fb-keyword"
              type="text"
              className="lp-input"
              style={{ maxWidth: '400px' }}
              aria-label="Keyword"
              placeholder="e.g. plumbers Austin Texas"
              value={fbKeyword}
              onChange={e => setFbKeyword(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="fb-location" className="lp-label">Location</label>
            <input
              id="fb-location"
              type="text"
              className="lp-input"
              style={{ maxWidth: '320px' }}
              aria-label="Location"
              placeholder="e.g. Austin Texas"
              value={fbLocation}
              onChange={e => setFbLocation(e.target.value)}
            />
          </div>
        </div>
      )}

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
            disabled={!isReadyToRun()}
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
          <div className="lp-card" style={{ maxWidth: '440px' }}>
            <h2 className="lp-section-title" style={{ marginBottom: '12px' }}>Estimated Cost</h2>

            {!isApifySource && (
              <>
                <p style={{ marginBottom: '4px', color: '#374151' }}>{step.estimate.query_count} queries</p>
                <p style={{ marginBottom: '4px', color: '#374151' }}>{step.estimate.estimated_results} results</p>
                <p style={{ marginBottom: '16px', color: '#374151' }}>${step.estimate.estimated_cost_usd.toFixed(3)} estimated API cost</p>
              </>
            )}

            {isApifySource && remainingAfterRun != null && (
              <>
                <p style={{ marginBottom: '16px', color: '#374151' }}>
                  {step.estimate.estimated_results} results
                  {' · '}${step.estimate.estimated_cost_usd.toFixed(2)} estimated
                  {' · '}${Math.max(0, remainingAfterRun).toFixed(2)} remaining after this run
                </p>
                {remainingAfterRun < 0 && (
                  <p
                    role="alert"
                    aria-label="Budget warning"
                    style={{ color: '#d97706', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '13px' }}
                  >
                    Warning: this run exceeds your remaining Apify monthly budget.
                  </p>
                )}
              </>
            )}

            {isApifySource && remainingAfterRun == null && (
              <p style={{ marginBottom: '16px', color: '#374151' }}>
                {step.estimate.estimated_results} results
                {' · '}${step.estimate.estimated_cost_usd.toFixed(2)} estimated
              </p>
            )}

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
