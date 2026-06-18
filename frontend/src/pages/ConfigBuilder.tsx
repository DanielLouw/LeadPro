import { useRef, useState } from 'react'
import * as yaml from 'js-yaml'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/apiFetch'
import { businessTypes } from '../data/businessTypes'
import { stateCities } from '../data/stateCities'

const DEFAULT_APIFY_MAX_RESULTS = 500
const CYCLING_SLOTS_PER_RUN = 3
const CYCLING_MAX_RESULTS = 50

type LeadSource = 'google_places' | 'apify_google_maps' | 'apify_facebook_pages'

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'google_places', label: 'Google Places API' },
  { value: 'apify_google_maps', label: 'Apify — Google Maps Scraper' },
  { value: 'apify_facebook_pages', label: 'Apify — Facebook Pages Scraper' },
]

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
  | { kind: 'confirm'; estimate: RunEstimate; configYamls: string[]; industryLabels: string[]; apifySpend?: MonthlySpend; typeCount: number }
  | { kind: 'submitting'; estimate: RunEstimate; configYamls: string[]; industryLabels: string[]; apifySpend?: MonthlySpend; typeCount: number }

export default function ConfigBuilder() {
  const navigate = useNavigate()

  // Lead source selection
  const [source, setSource] = useState<LeadSource>('google_places')

  // Business type selection — keyed by type name (Google Places only)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [customTypes, setCustomTypes] = useState<CustomBusinessType[]>([])
  const [customInput, setCustomInput] = useState('')

  // State selection (Google Places) — single state, cycling approach
  const [selectedState, setSelectedState] = useState('')
  const [countyCoverage, setCountyCoverage] = useState<{ total: number; searched: number } | null>(null)

  // Apify Google Maps fields — state-wide search
  const [apifySearchTerm, setApifySearchTerm] = useState('')
  const [apifyState, setApifyState] = useState('')

  // Apify Facebook Pages fields
  const [fbKeyword, setFbKeyword] = useState('')
  const [fbLocation, setFbLocation] = useState('')

  // Max results cap
  const [maxResults, setMaxResults] = useState(DEFAULT_APIFY_MAX_RESULTS)

  // Launch flow state machine
  const [step, setStep] = useState<Step>({ kind: 'editing' })
  const [runError, setRunError] = useState<string | null>(null)
  const estimatingRef = useRef(false)

  function stateName(abbreviation: string): string {
    return stateCities.find(s => s.abbreviation === abbreviation)?.name ?? abbreviation
  }

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

  // ── State picker (Google Places) — single-select ──────────────────────────

  function handleStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const state = e.target.value
    setSelectedState(state)
    setCountyCoverage(null)
    if (state) {
      void (async () => {
        try {
          const r = await apiFetch(`/api/runs/county-coverage?state=${state}`)
          if (!r.ok) return
          const data = await r.json()
          setCountyCoverage({ total: data.total_counties, searched: data.searched_counties })
        } catch {
          // leave badge hidden on network/parse failure
        }
      })()
    }
  }

  // ── Apify Google Maps state picker ───────────────────────────────────────────

  function handleApifyStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setApifyState(e.target.value)
  }

  // ── Config YAML builders ─────────────────────────────────────────────────────

  function getAllSelectedTypes(extraType?: string): string[] {
    const builtInSelected = businessTypes
      .flatMap(g => g.types)
      .filter(t => selectedTypes.has(t))
    const customSelected = customTypes
      .map(ct => ct.name)
      .filter(name => selectedTypes.has(name))
    const extra = extraType && !selectedTypes.has(extraType) ? [extraType] : []
    return [...builtInSelected, ...customSelected, ...extra]
  }

  function buildGooglePlacesYaml(industry: string): string {
    return yaml.dump({
      source: 'google_places',
      max_results_per_run: CYCLING_MAX_RESULTS,
      source_config: {
        industry,
        state: selectedState,
        slots_per_run: CYCLING_SLOTS_PER_RUN,
      },
    })
  }

  function buildApifyGoogleMapsYaml(): string {
    return yaml.dump({
      source: 'apify_google_maps',
      max_results_per_run: maxResults,
      source_config: {
        search_term: apifySearchTerm,
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

  // Returns one YAML per selected type for Google Places (cycling), or single YAML for Apify
  function buildConfigYamls(extraType?: string): string[] {
    if (source === 'apify_google_maps') return [buildApifyGoogleMapsYaml()]
    if (source === 'apify_facebook_pages') return [buildApifyFacebookPagesYaml()]
    const allTypes = getAllSelectedTypes(extraType)
    return allTypes.map(industry => buildGooglePlacesYaml(industry))
  }

  // ── Readiness check ──────────────────────────────────────────────────────────

  function isReadyToRun(): boolean {
    if (source === 'google_places') {
      return (selectedTypes.size > 0 || !!customInput.trim()) && !!selectedState
    }
    if (source === 'apify_google_maps') {
      return !!apifySearchTerm.trim() && !!apifyState
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

    const configYamls = buildConfigYamls(pendingType)
    if (configYamls.length === 0) {
      estimatingRef.current = false
      return
    }
    // Use first YAML for estimate call (all types have same cost: slots_per_run × max_results)
    const firstConfigYaml = configYamls[0]
    const typeCount = configYamls.length
    // For Google Places cycling: industry labels correspond 1:1 with configYamls
    const industryLabels = source === 'google_places'
      ? getAllSelectedTypes(pendingType)
      : []
    if (source === 'google_places' && industryLabels.length !== configYamls.length) {
      console.error('industryLabels/configYamls length mismatch', { industryLabels, configYamls })
    }

    setStep({ kind: 'estimating' })

    try {
      const isApify = source !== 'google_places'

      const [estimateResp, spendResp] = await Promise.all([
        apiFetch('/api/runs/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_yaml: firstConfigYaml }),
        }),
        isApify ? apiFetch('/api/runs/monthly-spend') : Promise.resolve(null),
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

      setStep({ kind: 'confirm', estimate, configYamls, industryLabels, apifySpend, typeCount })
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e))
      setStep({ kind: 'editing' })
    } finally {
      estimatingRef.current = false
    }
  }

  async function handleConfirmRun() {
    if (step.kind !== 'confirm') return
    const { estimate, configYamls, industryLabels, apifySpend, typeCount } = step
    setStep({ kind: 'submitting', estimate, configYamls, industryLabels, apifySpend, typeCount })
    setRunError(null)

    // Fire one POST /api/runs/ per config YAML in parallel
    const results = await Promise.allSettled(
      configYamls.map(configYaml =>
        apiFetch('/api/runs/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_yaml: configYaml }),
        }).then(async resp => {
          if (!resp.ok) {
            const detail = await resp.json().catch(() => ({ detail: 'Unknown error' }))
            throw new Error(detail.detail ?? `Failed to start run: ${resp.status}`)
          }
          return resp.json()
        })
      )
    )

    const succeeded = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: number }>[]
    const failed = results.filter(r => r.status === 'rejected')

    // Log warnings for any partial failures
    for (const f of failed) {
      console.warn('Run submission failed:', (f as PromiseRejectedResult).reason)
    }

    if (succeeded.length === 0) {
      // All failed — show error and return to confirm step
      const firstError = (failed[0] as PromiseRejectedResult).reason
      setRunError(firstError instanceof Error ? firstError.message : String(firstError))
      setStep({ kind: 'confirm', estimate, configYamls, industryLabels, apifySpend, typeCount })
      return
    }

    if (typeCount === 1) {
      // Single run: navigate with runId
      navigate('/leads', { state: { runId: succeeded[0].value.id } })
    } else {
      // Multiple runs: navigate to lead list without a specific runId
      navigate('/leads')
    }
  }

  function handleCancel() {
    setStep({ kind: 'editing' })
    setRunError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const isApifySource = source !== 'google_places'

  // Pre-compute budget info for the confirm step (only relevant for Apify sources)
  const confirmStep = step.kind === 'confirm' || step.kind === 'submitting' ? step : null
  const confirmApifySpend = confirmStep?.apifySpend
  const remainingAfterRun =
    confirmApifySpend != null && confirmStep != null
      ? confirmApifySpend.remaining_usd - confirmStep.estimate.estimated_cost_usd
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
                        className="lp-chip"
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
                        className="lp-chip"
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

          {/* State Picker — single-select for cycling */}
          <div className="lp-card">
            <h2 className="lp-section-title">State</h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ maxWidth: '272px' }}>
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
              {countyCoverage !== null && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'var(--lp-surface-2, #f3f4f6)',
                  fontSize: '13px',
                  color: 'var(--lp-text-muted, #6b7280)',
                  marginBottom: '2px',
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--lp-text, #111827)' }}>
                    {countyCoverage.searched} / {countyCoverage.total}
                  </span>
                  counties queried
                </div>
              )}
            </div>
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
          <div style={{ maxWidth: '272px' }}>
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
          <p className="lp-help" style={{ marginBottom: '12px' }}>Estimating&hellip;</p>
          <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
        </section>
      )}

      {(step.kind === 'confirm' || step.kind === 'submitting') && (
        <section aria-label="Run cost estimate">
          <div className="lp-card" style={{ maxWidth: '440px' }}>
            <h2 className="lp-section-title" style={{ marginBottom: '12px' }}>Estimated Cost</h2>

            {/* Google Places cycling confirm display */}
            {!isApifySource && step.typeCount === 1 && (
              <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                {CYCLING_SLOTS_PER_RUN} slots in {stateName(selectedState)}
                {' · '}~{step.estimate.estimated_results} results
                {' · '}~${step.estimate.estimated_cost_usd.toFixed(2)} estimated
              </p>
            )}
            {!isApifySource && step.typeCount > 1 && (
              <>
                {step.industryLabels.map(label => (
                  <p key={label} style={{ marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    {label} — {CYCLING_SLOTS_PER_RUN} slots · ~{step.estimate.estimated_results} results · ~${step.estimate.estimated_cost_usd.toFixed(2)}
                  </p>
                ))}
                <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                  {step.typeCount} runs · ~${(step.typeCount * step.estimate.estimated_cost_usd).toFixed(2)} estimated
                </p>
              </>
            )}

            {isApifySource && remainingAfterRun != null && (
              <>
                <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                  {step.estimate.estimated_results} results
                  {' · '}${step.estimate.estimated_cost_usd.toFixed(2)} estimated
                  {' · '}${Math.max(0, remainingAfterRun).toFixed(2)} remaining after this run
                </p>
                {remainingAfterRun < 0 && (
                  <p role="alert" aria-label="Budget warning" className="lp-warning-banner">
                    Warning: this run exceeds your remaining Apify monthly budget.
                  </p>
                )}
              </>
            )}

            {isApifySource && remainingAfterRun == null && (
              <p style={{ marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
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
