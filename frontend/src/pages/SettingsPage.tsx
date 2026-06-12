import { useEffect, useState } from 'react'

const SETTINGS_URL = '/api/settings'

interface BudgetSettings {
  google_places_monthly_budget_usd: number
  apify_monthly_budget_usd: number
}

type FormStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [googleBudget, setGoogleBudget] = useState('')
  const [apifyBudget, setApifyBudget] = useState('')
  const [formStatus, setFormStatus] = useState<FormStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetch(SETTINGS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<BudgetSettings>
      })
      .then((data) => {
        setGoogleBudget(String(data.google_places_monthly_budget_usd))
        setApifyBudget(String(data.apify_monthly_budget_usd))
        setLoading(false)
      })
      .catch((err: unknown) => {
        setLoadError(String(err))
        setLoading(false)
      })
  }, [])

  function handleFieldChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value)
      if (formStatus !== 'idle') {
        setFormStatus('idle')
        setSaveError(null)
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormStatus('saving')
    setSaveError(null)
    try {
      const res = await fetch(SETTINGS_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_places_monthly_budget_usd: parseFloat(googleBudget),
          apify_monthly_budget_usd: parseFloat(apifyBudget),
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error((detail as { detail?: string })?.detail ?? `HTTP ${res.status}`)
      }
      const updated = (await res.json()) as BudgetSettings
      setGoogleBudget(String(updated.google_places_monthly_budget_usd))
      setApifyBudget(String(updated.apify_monthly_budget_usd))
      setFormStatus('saved')
    } catch (err: unknown) {
      setSaveError(String(err))
      setFormStatus('error')
    }
  }

  if (loading) {
    return <p className="lp-help">Loading settings…</p>
  }

  if (loadError) {
    return <p className="lp-error">Error loading settings: {loadError}</p>
  }

  return (
    <div className="settings-page">
      <h1 className="lp-page-title">Settings</h1>
      <form onSubmit={handleSave} className="lp-card" style={{ maxWidth: '440px' }}>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label htmlFor="google-budget" className="lp-label">Google Places monthly budget (USD)</label>
          <input
            id="google-budget"
            className="lp-input"
            type="number"
            min="0.01"
            step="any"
            value={googleBudget}
            onChange={handleFieldChange(setGoogleBudget)}
            disabled={formStatus === 'saving'}
          />
        </div>
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <label htmlFor="apify-budget" className="lp-label">Apify monthly budget (USD)</label>
          <input
            id="apify-budget"
            className="lp-input"
            type="number"
            min="0.01"
            step="any"
            value={apifyBudget}
            onChange={handleFieldChange(setApifyBudget)}
            disabled={formStatus === 'saving'}
          />
        </div>
        <div className="lp-row">
          <button type="submit" className="btn btn-primary" disabled={formStatus === 'saving'}>
            {formStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
          {formStatus === 'saved' && (
            <span className="lp-success-text">Saved!</span>
          )}
        </div>
        {formStatus === 'error' && saveError && (
          <p className="lp-error">Save failed: {saveError}</p>
        )}
      </form>
    </div>
  )
}
