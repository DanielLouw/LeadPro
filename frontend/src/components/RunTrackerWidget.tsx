/**
 * RunTrackerWidget — shows monthly budget consumption for Google Places and Apify.
 *
 * Polls GET /api/runs/monthly-spend every 30 seconds while mounted.
 * Turns amber when Apify spend exceeds 75% of budget; red when over budget.
 */

import { useEffect, useState } from 'react'

const MONTHLY_SPEND_URL = '/api/runs/monthly-spend'
const POLL_INTERVAL_MS = 30_000

interface SpendGroup {
  spent_usd: number
  budget_usd: number
  remaining_usd: number
}

interface MonthlySpend {
  google_places: SpendGroup
  apify: SpendGroup
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

function spendRatio(group: SpendGroup): number {
  if (group.budget_usd <= 0) return 0
  return group.spent_usd / group.budget_usd
}

interface BarProps {
  group: SpendGroup
  /** amber/red thresholds only apply when this is true */
  showWarnings: boolean
  label: string
}

function SpendRow({ group, showWarnings, label }: BarProps) {
  const ratio = spendRatio(group)
  const pct = Math.min(ratio * 100, 100)

  let barColor = '#4f8ef7' // default blue
  if (showWarnings) {
    if (ratio > 1) {
      barColor = '#ef4444' // red — over budget
    } else if (ratio > 0.75) {
      barColor = '#f59e0b' // amber — >75 %
    }
  }

  const amountLabel =
    group.budget_usd > 0
      ? `${formatUsd(group.spent_usd)} of ${formatUsd(group.budget_usd)} used`
      : '—'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 100, flexShrink: 0, color: 'rgba(255,255,255,0.8)' }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 3,
          overflow: 'hidden',
          minWidth: 60,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span style={{ width: 120, flexShrink: 0, color: 'rgba(255,255,255,0.7)', textAlign: 'right' }}>
        {amountLabel}
      </span>
    </div>
  )
}

interface RunTrackerWidgetProps {
  /** External trigger — increment to force an immediate refresh (e.g. after a run completes). */
  refreshTick?: number
}

export default function RunTrackerWidget({ refreshTick = 0 }: RunTrackerWidgetProps) {
  const [spend, setSpend] = useState<MonthlySpend | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchSpend() {
      try {
        const res = await fetch(MONTHLY_SPEND_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as MonthlySpend
        if (!cancelled) {
          setSpend(data)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    fetchSpend()
    const timer = setInterval(fetchSpend, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [refreshTick])

  if (error || spend === null) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '6px 16px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 6,
        minWidth: 280,
      }}
    >
      <SpendRow group={spend.google_places} showWarnings={false} label="Google Places" />
      <SpendRow group={spend.apify} showWarnings label="Apify" />
    </div>
  )
}
