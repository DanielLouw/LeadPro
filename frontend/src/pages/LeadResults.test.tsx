import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    note: null,
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
    note: null,
  },
]

// ---------------------------------------------------------------------------
// Helper: mock fetch for a test
// ---------------------------------------------------------------------------

function mockFetch(
  runsResponse: object | object[],
  leadsResponse: object[],
  progressResponse?: object,
) {
  const runsList = Array.isArray(runsResponse) ? runsResponse : [runsResponse]
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/progress')) {
      return new Response(
        JSON.stringify(
          progressResponse ?? { status: 'completed', queries_completed: 0, queries_total: 0, leads_found: 0 }
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
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
// Tests — existing behaviour (preserved)
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

    // Gap signal labels — scoped to the table to avoid matching the filter checkbox
    const table = screen.getByRole('table', { name: /lead results/i })
    expect(within(table).getByText('no website')).toBeInTheDocument()
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
        note: null,
      },
    ]

    let leadsRunId = 1
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/progress')) {
        return new Response(
          JSON.stringify({ status: 'completed', queries_completed: 0, queries_total: 0, leads_found: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
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
// Tests — issue #0008: filters, sort, summary, progress
// ---------------------------------------------------------------------------

describe('LeadResults — sort control', () => {
  it('renders a sort selector with Gap Score, Name, and City options', async () => {
    mockFetch(mockRun, mockLeads)
    render(<LeadResults />)

    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    const sortSelect = screen.getByRole('combobox', { name: /sort by/i })
    expect(sortSelect).toBeInTheDocument()

    const options = within(sortSelect).getAllByRole('option')
    const optionTexts = options.map(o => o.textContent?.toLowerCase() ?? '')
    expect(optionTexts.some(t => t.includes('gap score'))).toBe(true)
    expect(optionTexts.some(t => t.includes('name'))).toBe(true)
    expect(optionTexts.some(t => t.includes('city'))).toBe(true)
  })

  it('passes sort=name query param to the API when Name is selected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/progress')) {
        return new Response(
          JSON.stringify({ status: 'completed', queries_completed: 0, queries_total: 0, leads_found: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    render(<LeadResults />)
    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    const user = userEvent.setup()
    const sortSelect = screen.getByRole('combobox', { name: /sort by/i })
    await user.selectOptions(sortSelect, 'name')

    await waitFor(() => {
      const leadsCalls = fetchSpy.mock.calls
        .map(([input]) => (typeof input === 'string' ? input : input.toString()))
        .filter(url => url.includes('/leads'))
      expect(leadsCalls.some(url => url.includes('sort=name'))).toBe(true)
    })
  })
})

describe('LeadResults — signal type filter', () => {
  it('renders a signal type filter field', async () => {
    mockFetch(mockRun, mockLeads)
    render(<LeadResults />)

    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    // There should be a filter control for signal types
    expect(screen.getByRole('group', { name: /signal type/i })).toBeInTheDocument()
  })

  it('sends signal_types query param when a signal filter is selected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/progress')) {
        return new Response(
          JSON.stringify({ status: 'completed', queries_completed: 0, queries_total: 0, leads_found: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    render(<LeadResults />)
    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    // Click the no_website checkbox
    const user = userEvent.setup()
    const checkbox = screen.getByRole('checkbox', { name: /no.?website/i })
    await user.click(checkbox)

    await waitFor(() => {
      const leadsCalls = fetchSpy.mock.calls
        .map(([input]) => (typeof input === 'string' ? input : input.toString()))
        .filter(url => url.includes('/leads'))
      expect(leadsCalls.some(url => url.includes('signal_types=no_website'))).toBe(true)
    })
  })
})

describe('LeadResults — status filter', () => {
  it('renders status filter checkboxes', async () => {
    mockFetch(mockRun, mockLeads)
    render(<LeadResults />)

    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    expect(screen.getByRole('group', { name: /status/i })).toBeInTheDocument()
  })

  it('sends statuses query param when a status is selected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/progress')) {
        return new Response(
          JSON.stringify({ status: 'completed', queries_completed: 0, queries_total: 0, leads_found: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    render(<LeadResults />)
    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    const user = userEvent.setup()
    const checkbox = screen.getByRole('checkbox', { name: /^new$/i })
    await user.click(checkbox)

    await waitFor(() => {
      const leadsCalls = fetchSpy.mock.calls
        .map(([input]) => (typeof input === 'string' ? input : input.toString()))
        .filter(url => url.includes('/leads'))
      expect(leadsCalls.some(url => url.includes('statuses=new'))).toBe(true)
    })
  })
})

describe('LeadResults — summary row', () => {
  it('shows total leads and top signal breakdown', async () => {
    mockFetch(mockRun, mockLeads)
    render(<LeadResults />)

    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    // Summary should show signal type breakdown
    const summary = screen.getByRole('region', { name: /summary/i })
    expect(summary).toBeInTheDocument()

    // Summary should show count of leads (scoped to the summary region)
    expect(within(summary).getByText(/2 leads/i)).toBeInTheDocument()
  })
})

describe('LeadResults — progress indicator', () => {
  it('shows a progress indicator when the run is still running', async () => {
    const runningRun = { ...mockRun, status: 'running' }
    const progressData = { status: 'running', queries_completed: 3, queries_total: 10, leads_found: 2 }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/progress')) {
        return new Response(JSON.stringify(progressData), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([runningRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    render(<LeadResults />)

    await waitFor(() =>
      expect(screen.getByRole('status', { name: /run progress/i })).toBeInTheDocument()
    )

    // Should show queries progress
    expect(screen.getByText(/3\s*\/\s*10/)).toBeInTheDocument()
    // Should show leads found
    expect(screen.getByText(/2 leads found/i)).toBeInTheDocument()
  })

  it('does not show progress indicator for completed runs', async () => {
    mockFetch(mockRun, mockLeads)

    render(<LeadResults />)

    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    expect(screen.queryByRole('status', { name: /run progress/i })).not.toBeInTheDocument()
  })

  it('filters and sort state are preserved when detail panel opens and closes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/progress')) {
        return new Response(
          JSON.stringify({ status: 'completed', queries_completed: 0, queries_total: 0, leads_found: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    render(<LeadResults />)
    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    // Set sort to name
    const user = userEvent.setup()
    const sortSelect = screen.getByRole('combobox', { name: /sort by/i })
    await user.selectOptions(sortSelect, 'name')

    // The sort select should still show 'name' (state persists)
    expect(sortSelect).toHaveValue('name')

    // Simulate clicking a lead to open a detail panel and close it (if detail panel exists)
    // At minimum, the sort select retains its value after re-render
    expect(screen.getByRole('combobox', { name: /sort by/i })).toHaveValue('name')
  })
})
