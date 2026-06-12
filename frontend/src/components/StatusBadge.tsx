// Colour-coded pill badge for lead status values.
// Colours come from theme tokens (see index.css) so they adapt to dark mode.

type LeadStatus = 'new' | 'reviewing' | 'contacted' | 'pass'

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: 'lp-status-badge--new',
  reviewing: 'lp-status-badge--reviewing',
  contacted: 'lp-status-badge--contacted',
  pass: 'lp-status-badge--pass',
}

interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const modifier = STATUS_CLASS[status as LeadStatus] ?? ''
  return (
    <span className={`lp-status-badge ${modifier}`.trim()}>
      {status}
    </span>
  )
}
