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

// ---------------------------------------------------------------------------
// Issue #0006: cost estimate panel + confirmation dialog before run
// ---------------------------------------------------------------------------

describe('LeadResults — start run with cost estimate', () => {
  const estimateResponse = {
    query_count: 2,
    estimated_results: 40,
    estimated_cost_usd: 0.064,
  }

  function mockFetchWithEstimate() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/runs/estimate')) {
        return new Response(JSON.stringify(estimateResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/runs/') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 99, status: 'pending', total_leads: 0, config_yaml: '', error_message: null }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // GET /runs/
      return new Response(JSON.stringify([mockRun]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
  }

  it('shows a "Start new run" button that fetches a cost estimate before submitting', async () => {
    const user = userEvent.setup()
    mockFetchWithEstimate()

    render(<LeadResults />)

    // Wait for runs to load
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    // Click "Start new run" — should show estimate panel
    await user.click(screen.getByRole('button', { name: /start new run/i }))

    // Estimate panel should appear with query count, results, and cost
    await waitFor(() =>
      expect(screen.getByText(/2 queries/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/40 results/i)).toBeInTheDocument()
    expect(screen.getByText(/\$0\.064/i)).toBeInTheDocument()
  })

  it('requires a confirm action before submitting the run to the backend', async () => {
    const user = userEvent.setup()
    mockFetchWithEstimate()

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /start new run/i }))

    // Wait for estimate to load
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    )

    // POST /runs/ should NOT have been called yet
    const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => {
        const url = args[0]
        const init = args[1] as RequestInit | undefined
        return typeof url === 'string' && url.includes('/runs/') && !url.includes('/estimate') && init?.method === 'POST'
      }
    )
    expect(postCalls).toHaveLength(0)

    // Click confirm — now the run is submitted
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const allCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const submitted = allCalls.some((args: unknown[]) => {
        const url = args[0]
        const init = args[1] as RequestInit | undefined
        return typeof url === 'string' && url.includes('/runs/') && !url.includes('/estimate') && init?.method === 'POST'
      })
      expect(submitted).toBe(true)
    })
  })
})
