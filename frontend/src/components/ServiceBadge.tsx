// Colour-coded badges for the three service types derived from gap_signals.
// Colours come from theme tokens (see index.css) so they adapt to dark mode.

export type ServiceType = 'Website Build' | 'Website Modernisation' | 'SEO Package'

const SERVICE_CLASS: Record<ServiceType, string> = {
  'Website Build': 'lp-service-badge--build',
  'Website Modernisation': 'lp-service-badge--modern',
  'SEO Package': 'lp-service-badge--seo',
}

interface Props {
  service: ServiceType
}

export default function ServiceBadge({ service }: Props) {
  return (
    <span className={`lp-service-badge ${SERVICE_CLASS[service]}`}>
      {service}
    </span>
  )
}

const VALID_SERVICES = new Set<string>(Object.keys(SERVICE_CLASS))

/** Return the deduplicated list of service types present on a lead's gap_signals. */
export function getServiceBadges(
  gapSignals: { service?: string }[] = [],
): ServiceType[] {
  const seen = new Set<ServiceType>()
  for (const sig of gapSignals) {
    if (sig.service && VALID_SERVICES.has(sig.service)) {
      seen.add(sig.service as ServiceType)
    }
  }
  return Array.from(seen)
}
