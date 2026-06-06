// Colour-coded badges for the three service types derived from gap_signals.

export type ServiceType = 'Website Build' | 'Website Modernisation' | 'SEO Package'

const BADGE_STYLES: Record<ServiceType, React.CSSProperties> = {
  'Website Build': {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
  },
  'Website Modernisation': {
    backgroundColor: '#fffbeb',
    color: '#92400e',
    border: '1px solid #fcd34d',
  },
  'SEO Package': {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #93c5fd',
  },
}

const BASE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  fontSize: '0.75rem',
  fontWeight: 600,
  lineHeight: '1.25rem',
  marginRight: '0.25rem',
  whiteSpace: 'nowrap',
}

interface Props {
  service: ServiceType
}

export default function ServiceBadge({ service }: Props) {
  const colourStyle = BADGE_STYLES[service]
  return (
    <span style={{ ...BASE_STYLE, ...colourStyle }}>
      {service}
    </span>
  )
}

/** Return the deduplicated list of service types present on a lead's gap_signals. */
export function getServiceBadges(
  gapSignals: { service?: string }[],
): ServiceType[] {
  const seen = new Set<ServiceType>()
  for (const sig of gapSignals) {
    if (sig.service) seen.add(sig.service as ServiceType)
  }
  return Array.from(seen)
}
