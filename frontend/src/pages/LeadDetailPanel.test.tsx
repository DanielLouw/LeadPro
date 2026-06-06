import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeadDetailPanel, { type Lead } from './LeadDetailPanel'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 1,
    run_id: 1,
    place_id: 'place_001',
    name: 'Alpha Plumber',
    phone: '(512) 555-0001',
    address: '1 Main St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    email: 'alpha@example.com',
    website_url: null,
    maps_url: 'https://maps.google.com/?q=alpha',
    gap_score: 10.0,
    status: 'new',
    gap_signals: [],
    note: null,
    ...overrides,
  }
}

function renderPanel(lead: Lead) {
  return render(
    <LeadDetailPanel
      lead={lead}
      onClose={() => {}}
      onLeadUpdated={() => {}}
    />
  )
}

// ---------------------------------------------------------------------------
// Issue #0012: service label and sales copy on gap signals
// ---------------------------------------------------------------------------

describe('LeadDetailPanel — gap signal service label', () => {
  it('renders the service label for a hard gap signal', () => {
    const lead = makeLead({
      gap_signals: [
        {
          id: 1,
          signal_type: 'no_website',
          is_hard: true,
          description: 'No website listed',
          service: 'Website Build',
          sales_copy: 'Every customer searches online first. Without a website you are invisible to them.',
        },
      ],
    })

    renderPanel(lead)

    expect(screen.getByText('Website Build')).toBeInTheDocument()
  })

  it('renders the service label for a soft gap signal', () => {
    const lead = makeLead({
      gap_signals: [
        {
          id: 2,
          signal_type: 'missing_meta_title',
          is_hard: false,
          description: 'Missing meta title',
          service: 'SEO Audit',
          sales_copy: 'A missing title tag costs you Google ranking every day.',
        },
      ],
    })

    renderPanel(lead)

    expect(screen.getByText('SEO Audit')).toBeInTheDocument()
  })

  it('renders service labels for each signal when multiple signals exist', () => {
    const lead = makeLead({
      gap_signals: [
        {
          id: 1,
          signal_type: 'no_website',
          is_hard: true,
          description: 'No website listed',
          service: 'Website Build',
          sales_copy: 'Every customer searches online first.',
        },
        {
          id: 2,
          signal_type: 'missing_meta_title',
          is_hard: false,
          description: 'Missing meta title',
          service: 'SEO Audit',
          sales_copy: 'A missing title tag hurts ranking.',
        },
      ],
    })

    renderPanel(lead)

    expect(screen.getByText('Website Build')).toBeInTheDocument()
    expect(screen.getByText('SEO Audit')).toBeInTheDocument()
  })
})

describe('LeadDetailPanel — gap signal sales copy', () => {
  it('renders the sales copy below the description for a hard signal', () => {
    const lead = makeLead({
      gap_signals: [
        {
          id: 1,
          signal_type: 'no_website',
          is_hard: true,
          description: 'No website listed',
          service: 'Website Build',
          sales_copy: 'Every customer searches online first. Without a website you are invisible to them.',
        },
      ],
    })

    renderPanel(lead)

    expect(
      screen.getByText('Every customer searches online first. Without a website you are invisible to them.')
    ).toBeInTheDocument()
  })

  it('renders the sales copy for a soft signal', () => {
    const lead = makeLead({
      gap_signals: [
        {
          id: 2,
          signal_type: 'missing_meta_title',
          is_hard: false,
          description: 'Missing meta title',
          service: 'SEO Audit',
          sales_copy: 'A missing title tag costs you Google ranking every day.',
        },
      ],
    })

    renderPanel(lead)

    expect(
      screen.getByText('A missing title tag costs you Google ranking every day.')
    ).toBeInTheDocument()
  })

  it('renders both description and sales copy for each signal', () => {
    const lead = makeLead({
      gap_signals: [
        {
          id: 1,
          signal_type: 'no_website',
          is_hard: true,
          description: 'No website listed',
          service: 'Website Build',
          sales_copy: 'Every customer searches online first.',
        },
        {
          id: 2,
          signal_type: 'missing_meta_title',
          is_hard: false,
          description: 'Missing meta title',
          service: 'SEO Audit',
          sales_copy: 'A missing title tag hurts ranking.',
        },
      ],
    })

    renderPanel(lead)

    // Descriptions
    expect(screen.getByText('No website listed')).toBeInTheDocument()
    expect(screen.getByText('Missing meta title')).toBeInTheDocument()
    // Sales copy
    expect(screen.getByText('Every customer searches online first.')).toBeInTheDocument()
    expect(screen.getByText('A missing title tag hurts ranking.')).toBeInTheDocument()
  })
})

describe('LeadDetailPanel — hard vs soft signal visual distinction', () => {
  it('hard signal description is rendered with bold weight while soft signal is not', () => {
    const lead = makeLead({
      gap_signals: [
        {
          id: 1,
          signal_type: 'no_website',
          is_hard: true,
          description: 'No website listed',
          service: 'Website Build',
          sales_copy: 'Pitch for website.',
        },
        {
          id: 2,
          signal_type: 'missing_meta_title',
          is_hard: false,
          description: 'Missing meta title',
          service: 'SEO Audit',
          sales_copy: 'Pitch for SEO.',
        },
      ],
    })

    renderPanel(lead)

    // Hard signal description — expects bold style (fontWeight bold)
    const hardDesc = screen.getByText('No website listed')
    expect(hardDesc).toHaveStyle({ fontWeight: 'bold' })

    // Soft signal description — expects normal weight
    const softDesc = screen.getByText('Missing meta title')
    expect(softDesc).toHaveStyle({ fontWeight: 'normal' })
  })
})
