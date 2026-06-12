// Shared display helpers for lead tables (LeadResults, AllLeads).

import type { Lead } from '../pages/LeadDetailPanel'

export const ALL_STATUSES = ['new', 'reviewing', 'contacted', 'pass']

export function formatLocation(lead: Lead): string {
  if (lead.city && lead.state) return `${lead.city}, ${lead.state}`
  if (lead.city) return lead.city
  if (lead.state) return lead.state
  return '—'
}

/** Top 3 signal labels for a lead, hard signals first. */
export function topSignalLabels(lead: Lead): string[] {
  const hard = lead.gap_signals.filter(s => s.is_hard)
  const soft = lead.gap_signals.filter(s => !s.is_hard)
  return [...hard, ...soft].slice(0, 3).map(s => s.signal_type.replace(/_/g, ' '))
}
