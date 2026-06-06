// Colour-coded pill badge for lead status values.

import React from 'react'

type LeadStatus = 'new' | 'reviewing' | 'contacted' | 'pass'

const BADGE_STYLES: Record<LeadStatus, React.CSSProperties> = {
  new: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    border: '1px solid #93c5fd',
  },
  reviewing: {
    backgroundColor: '#bfdbfe',
    color: '#1e3a8a',
    border: '1px solid #60a5fa',
  },
  contacted: {
    backgroundColor: '#ffedd5',
    color: '#9a3412',
    border: '1px solid #fb923c',
  },
  pass: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    border: '1px solid #86efac',
  },
}

const BASE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  fontSize: '0.75rem',
  fontWeight: 600,
  lineHeight: '1.25rem',
  whiteSpace: 'nowrap',
}

interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const colourStyle = BADGE_STYLES[status as LeadStatus] ?? {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
  }
  return (
    <span style={{ ...BASE_STYLE, ...colourStyle }}>
      {status}
    </span>
  )
}
