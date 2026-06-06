import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeadResults from './LeadResults'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockRun = {
  id: 1,
  status: 'completed',
  total_leads: 2,
  config_yaml: 'queries:\n  - plumbers in Austin TX\n',
  error_message: null,
}

const mockLeads = [
  {
    id: 1,
    run_id: 1,
    place_id: 'place_001',
    name: 'Alpha Plumber',
    city: 'Austin',
    state: 'TX',
    phone: '(512) 555-0001',
    website_url: null,
    gap_score: 10.0,
    status: 'new',
    gap_signals: [
      { signal_type: 'no_website', is_hard: true, description: 'No website listed' },
    ],
  },
  {
    id: 2,
    run_id: 1,
    place_id: 'place_002',
    name: 'Beta Plumber',
    city: 'Dallas',
    state: 'TX',
    phone: null,
    website_url: 'https://beta.example.com',
    gap_score: 4.0,
    status: 'new',
    gap_signals: [
      { signal_type: 'missing_meta_title', is_hard: false, description: 'Missing title' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helper: mock fetch for a test
// ---------------------------------------------------------------------------

function mockFetch(runsResponse: object | object[], leadsResponse: object[]) {
  const runsList = Array.isArray(runsResponse) ? runsResponse : [runsResponse]
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/leads')) {
      return new Response(JSON.stringify(leadsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // runs list
    return new Response(JSON.stringify(runsList), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeadResults — empty state (no runs)', () => {
  it('shows a prompt to create a run when no runs exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
    )
  })
})

describe('LeadResults — renders lead list', () => {
  it('renders a table with lead name, city/state, phone, and gap signals', async () => {
    mockFetch(mockRun, mockLeads)

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    // Both leads should appear
    expect(screen.getByText('Alpha Plumber')).toBeInTheDocument()
    expect(screen.getByText('Beta Plumber')).toBeInTheDocument()

    // Location
    expect(screen.getByText('Austin, TX')).toBeInTheDocument()
    expect(screen.getByText('Dallas, TX')).toBeInTheDocument()

    // Phone
    expect(screen.getByText('(512) 555-0001')).toBeInTheDocument()

    // Gap signal labels
    expect(screen.getByText('no website')).toBeInTheDocument()
  })

  it('shows leads sorted by gap score (highest first)', async () => {
    mockFetch(mockRun, mockLeads)

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    const rows = screen.getAllByRole('row')
    // rows[0] = header, rows[1] = first lead (highest score)
    expect(rows[1]).toHaveTextContent('Alpha Plumber')
    expect(rows[2]).toHaveTextContent('Beta Plumber')
  })
})

describe('LeadResults — run selector', () => {
  it('renders a run selector when runs exist', async () => {
    mockFetch([mockRun], mockLeads)

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )
  })

  it('switches leads when a different run is selected', async () => {
    const secondRun = { id: 2, status: 'completed', total_leads: 1, config_yaml: '', error_message: null }
    const secondLeads = [
      {
        id: 10,
        run_id: 2,
        place_id: 'place_x',
        name: 'Second Run Lead',
        city: 'Houston',
        state: 'TX',
        phone: null,
        website_url: null,
        gap_score: 10.0,
        status: 'new',
        gap_signals: [{ signal_type: 'no_website', is_hard: true, description: 'No website' }],
      },
    ]

    let leadsRunId = 1
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads')) {
        const data = leadsRunId === 1 ? mockLeads : secondLeads
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun, secondRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    render(<LeadResults />)

    // First run's leads shown
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())

    // Switch to second run
    leadsRunId = 2
    const user = userEvent.setup()
    const select = screen.getByRole('combobox', { name: /select run/i })
    await user.selectOptions(select, '2')

    await waitFor(() => expect(screen.getByText('Second Run Lead')).toBeInTheDocument())
    expect(screen.queryByText('Alpha Plumber')).not.toBeInTheDocument()
  })
})

describe('LeadResults — error handling', () => {
  it('shows an error message when the API call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    )

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    )
  })
})

describe('LeadResults — no leads for run', () => {
  it('shows a message when the selected run has no qualified leads', async () => {
    mockFetch(mockRun, [])

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByText(/no qualified leads/i)).toBeInTheDocument()
    )
  })
})

describe('LeadResults — Export CSV button', () => {
  it('renders an Export CSV button when leads are present', async () => {
    mockFetch(mockRun, mockLeads)

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    )
  })

  it('calls the export endpoint and initiates a download when Export CSV is clicked', async () => {
    // Single unified mock that handles runs, leads, and export
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/export')) {
        return new Response('name,address\nAlpha Plumber,1 Main St\n', {
          status: 200,
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=leads_run_1.csv' },
        })
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify(mockLeads), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([mockRun]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    // Stub URL.createObjectURL so jsdom doesn't error
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    globalThis.URL.revokeObjectURL = vi.fn()

    const user = userEvent.setup()
    render(<LeadResults />)

    // Wait for button to appear (leads loaded)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /export csv/i }))

    // The export fetch call should have been made
    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map(([url]) => (typeof url === 'string' ? url : url.toString()))
      expect(calls.some(url => url.includes('/export'))).toBe(true)
    })
  })
})
