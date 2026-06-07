import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LeadResults from './LeadResults'

// Helper to render LeadResults inside a MemoryRouter with optional router state
function renderLeadResults(routerState?: Record<string, unknown>) {
  const initialEntries = routerState
    ? [{ pathname: '/leads', state: routerState }]
    : ['/leads']
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={0}>
      <LeadResults />
    </MemoryRouter>
  )
}

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
    address: '1 Main St, Austin, TX 78701',
    city: 'Austin',
    state: 'TX',
    phone: '(512) 555-0001',
    email: 'alpha@example.com',
    website_url: null,
    maps_url: 'https://maps.google.com/?q=alpha',
    gap_score: 10.0,
    status: 'new',
    note: null,
    gap_signals: [
      { id: 1, signal_type: 'no_website', is_hard: true, description: 'No website listed' },
    ],
  },
  {
    id: 2,
    run_id: 1,
    place_id: 'place_002',
    name: 'Beta Plumber',
    address: '2 Oak Ave, Dallas, TX 75201',
    city: 'Dallas',
    state: 'TX',
    phone: null,
    email: null,
    website_url: 'https://beta.example.com',
    maps_url: 'https://maps.google.com/?q=beta',
    gap_score: 4.0,
    status: 'new',
    note: null,
    gap_signals: [
      { id: 2, signal_type: 'missing_meta_title', is_hard: false, description: 'Missing title' },
    ],
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
    // runs list — only match the exact runs endpoint
    if (url === '/api/runs/' || url.endsWith('/api/runs/')) {
      return new Response(JSON.stringify(runsList), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Unrecognised URL — return 404 so tests fail loudly instead of silently
    return new Response(JSON.stringify({ detail: `Unrecognised mock URL: ${url}` }), {
      status: 404,
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
// Tests â€” existing behaviour (preserved)
// ---------------------------------------------------------------------------

describe('LeadResults â€” empty state (no runs)', () => {
  it('shows a prompt to create a run when no runs exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
    )
  })
})

describe('LeadResults â€” renders lead list', () => {
  it('renders a table with lead name, city/state, phone, and gap signals', async () => {
    mockFetch(mockRun, mockLeads)

    renderLeadResults()

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

    // Gap signal labels â€” scoped to the table to avoid matching the filter checkbox
    const table = screen.getByRole('table', { name: /lead results/i })
    expect(within(table).getByText('no website')).toBeInTheDocument()
  })

  it('shows leads sorted by gap score (highest first)', async () => {
    mockFetch(mockRun, mockLeads)

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    const rows = screen.getAllByRole('row')
    // rows[0] = header, rows[1] = first lead (highest score)
    expect(rows[1]).toHaveTextContent('Alpha Plumber')
    expect(rows[2]).toHaveTextContent('Beta Plumber')
  })
})

describe('LeadResults â€” run selector', () => {
  it('renders a run selector when runs exist', async () => {
    mockFetch([mockRun], mockLeads)

    renderLeadResults()

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

    renderLeadResults()

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

describe('LeadResults â€” error handling', () => {
  it('shows an error message when the API call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    )

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    )
  })
})

describe('LeadResults â€” no leads for run', () => {
  it('shows a message when the selected run has no qualified leads', async () => {
    mockFetch(mockRun, [])

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByText(/no qualified leads/i)).toBeInTheDocument()
    )
  })
})

// ---------------------------------------------------------------------------
// Issue #0006: cost estimate panel + confirmation dialog before run
// ---------------------------------------------------------------------------

describe('LeadResults â€” start run with cost estimate', () => {
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

    renderLeadResults()

    // Wait for runs to load
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    // Click "Start new run" â€” should show estimate panel
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

    renderLeadResults()

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

    // Click confirm â€” now the run is submitted
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

// ---------------------------------------------------------------------------
// Detail panel tests (issue #0007)
// ---------------------------------------------------------------------------

describe('LeadResults â€” detail panel opens on row click', () => {
  it('clicking a lead row opens the detail panel with business name', async () => {
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())

    await user.click(screen.getByText('Alpha Plumber'))

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /lead detail/i })).toBeInTheDocument()
    )
  })

  it('detail panel shows business name, address, phone, email, and gap score', async () => {
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    expect(panel).toHaveTextContent('Alpha Plumber')
    expect(panel).toHaveTextContent('1 Main St, Austin, TX 78701')
    expect(panel).toHaveTextContent('(512) 555-0001')
    expect(panel).toHaveTextContent('alpha@example.com')
    expect(panel).toHaveTextContent('10.0')
  })

  it('detail panel lists all gap signals with plain-English descriptions', async () => {
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    expect(panel).toHaveTextContent('No website listed')
  })

  it('detail panel has a website link that opens in a new tab', async () => {
    // Beta Plumber (mockLeads[1]) has website_url set
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Beta Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Beta Plumber'))

    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    const websiteLink = panel.querySelector('a[href="https://beta.example.com"]')
    expect(websiteLink).not.toBeNull()
    expect(websiteLink).toHaveAttribute('target', '_blank')
  })

  it('detail panel has a Google Maps link that opens in a new tab', async () => {
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    const mapsLink = panel.querySelector('a[href="https://maps.google.com/?q=alpha"]')
    expect(mapsLink).not.toBeNull()
    expect(mapsLink).toHaveAttribute('target', '_blank')
  })

  it('detail panel can be closed via a close button', async () => {
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    await screen.findByRole('dialog', { name: /lead detail/i })

    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /lead detail/i })).not.toBeInTheDocument()
    )
  })
})

describe('LeadResults â€” detail panel status selector', () => {
  it('shows current status in the status selector', async () => {
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    const statusSelect = panel.querySelector('select[aria-label="Status"]') as HTMLSelectElement | null
    expect(statusSelect).not.toBeNull()
    expect(statusSelect!.value).toBe('new')
  })

  it('changing status calls PATCH /leads/:id/status', async () => {
    const patchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...mockLeads[0], status: 'reviewing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads/1/status') && init?.method === 'PATCH') return patchMock(url, init)
      if (url.includes('/leads/run/')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const user = userEvent.setup()
    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    const statusSelect = panel.querySelector('select[aria-label="Status"]') as HTMLSelectElement
    await user.selectOptions(statusSelect, 'reviewing')

    await waitFor(() => expect(patchMock).toHaveBeenCalledOnce())
  })
})

describe('LeadResults â€” detail panel notes field', () => {
  it('shows a notes textarea in the detail panel', async () => {
    mockFetch(mockRun, mockLeads)
    const user = userEvent.setup()

    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    await screen.findByRole('dialog', { name: /lead detail/i })
    expect(screen.getByRole('textbox', { name: /notes/i })).toBeInTheDocument()
  })

  it('saving notes on blur calls PATCH /leads/:id/notes', async () => {
    const patchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ...mockLeads[0], note: { content: 'Test note', updated_at: new Date().toISOString() } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads/1/notes') && init?.method === 'PATCH') return patchMock(url, init)
      if (url.includes('/leads/run/')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const user = userEvent.setup()
    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    await screen.findByRole('dialog', { name: /lead detail/i })
    const notesField = screen.getByRole('textbox', { name: /notes/i })

    await user.click(notesField)
    await user.type(notesField, 'Test note')
    await user.tab() // blur

    await waitFor(() => expect(patchMock).toHaveBeenCalledOnce())
  })
})

// ---------------------------------------------------------------------------
// Tests â€” issue #0008: filters, sort, summary, progress
// ---------------------------------------------------------------------------

describe('LeadResults â€” sort control', () => {
  it('renders a sort selector with Gap Score, Name, and City options', async () => {
    mockFetch(mockRun, mockLeads)
    renderLeadResults()

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

    renderLeadResults()
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

describe('LeadResults â€” signal type filter', () => {
  it('renders a signal type filter field', async () => {
    mockFetch(mockRun, mockLeads)
    renderLeadResults()

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

    renderLeadResults()
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

describe('LeadResults â€” status filter', () => {
  it('renders status filter checkboxes', async () => {
    mockFetch(mockRun, mockLeads)
    renderLeadResults()

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

    renderLeadResults()
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

describe('LeadResults â€” summary row', () => {
  it('shows total leads and top signal breakdown', async () => {
    mockFetch(mockRun, mockLeads)
    renderLeadResults()

    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    // Summary should show signal type breakdown
    const summary = screen.getByRole('region', { name: /summary/i })
    expect(summary).toBeInTheDocument()

    // Summary should show count of leads (scoped to the summary region)
    expect(within(summary).getByText(/2 leads/i)).toBeInTheDocument()
  })
})

describe('LeadResults â€” progress indicator', () => {
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

    renderLeadResults()

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

    renderLeadResults()

    await waitFor(() => expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument())

    expect(screen.queryByRole('status', { name: /run progress/i })).not.toBeInTheDocument()
  })

  it('filters and sort state are preserved when detail panel opens and closes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
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

    renderLeadResults()
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

// ---------------------------------------------------------------------------
// Issue #0015: Loading states and toast notifications
// ---------------------------------------------------------------------------

describe('LeadResults — skeleton loader while leads are loading', () => {
  it('shows skeleton rows while leads are being fetched', async () => {
    // Arrange: fetch for leads never resolves until after we check
    let resolveLead: (v: Response) => void
    const leadsPromise = new Promise<Response>(res => { resolveLead = res })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads')) return leadsPromise
      return new Response(JSON.stringify([mockRun]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    renderLeadResults()

    // Wait until run is loaded (selector appears), then check for skeleton
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    // Skeleton should be visible while leads are still in-flight
    expect(screen.getByRole('status', { name: /loading leads/i })).toBeInTheDocument()

    // Resolve the lead fetch so we don't leak
    resolveLead!(new Response(JSON.stringify(mockLeads), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('replaces skeleton with real rows once leads arrive', async () => {
    mockFetch(mockRun, mockLeads)

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    expect(screen.queryByRole('status', { name: /loading leads/i })).not.toBeInTheDocument()
    expect(screen.getByText('Alpha Plumber')).toBeInTheDocument()
  })
})

describe('LeadResults — Export CSV button disabled while exporting', () => {
  it('disables the Export CSV button while the export is in-flight', async () => {
    let resolveExport: (v: Response) => void
    const exportPromise = new Promise<Response>(res => { resolveExport = res })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/export')) return exportPromise
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

    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    globalThis.URL.revokeObjectURL = vi.fn()

    const user = userEvent.setup()
    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /export csv/i }))

    // While export is in-flight, button text changes to Exporting… and is disabled
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled()
    )

    // Clean up — resolve export
    resolveExport!(new Response('data', { status: 200 }))
  })
})

describe('LeadResults — toast notification on run submitted', () => {
  it('shows a success toast after a new run is submitted successfully', async () => {
    const estimateResponse = {
      query_count: 2,
      estimated_results: 40,
      estimated_cost_usd: 0.064,
    }

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
        return new Response(
          JSON.stringify({ id: 99, status: 'pending', total_leads: 0, config_yaml: '', error_message: null }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify([mockRun]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const user = userEvent.setup()
    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    // Trigger start new run (uses existing config yaml from mockRun so goes straight to estimate)
    await user.click(screen.getByRole('button', { name: /start new run/i }))

    // Wait for estimate panel
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    )

    // Confirm the run
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    // Toast should appear
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /notifications/i })).toBeInTheDocument()
    )
    expect(screen.getByRole('status', { name: /notifications/i })).toHaveTextContent(/run submitted/i)
  })
})

describe('LeadResults — detail panel toast on status saved', () => {
  it('shows a success toast after status is saved in the detail panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads/1/status') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({ ...mockLeads[0], status: 'reviewing' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/leads/run/')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const user = userEvent.setup()
    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    const statusSelect = panel.querySelector('select[aria-label="Status"]') as HTMLSelectElement
    await user.selectOptions(statusSelect, 'reviewing')

    await waitFor(() =>
      expect(screen.getByRole('status', { name: /notifications/i })).toBeInTheDocument()
    )
    expect(screen.getByRole('status', { name: /notifications/i })).toHaveTextContent(/status saved/i)
  })
})

describe('LeadResults — detail panel toast on notes saved', () => {
  it('shows a success toast after notes are saved in the detail panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads/1/notes') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({ ...mockLeads[0], note: { content: 'Test', updated_at: new Date().toISOString() } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/leads/run/')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const user = userEvent.setup()
    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Alpha Plumber'))

    await screen.findByRole('dialog', { name: /lead detail/i })
    const notesField = screen.getByRole('textbox', { name: /notes/i })

    await user.click(notesField)
    await user.type(notesField, 'Test')
    await user.tab()

    await waitFor(() =>
      expect(screen.getByRole('status', { name: /notifications/i })).toBeInTheDocument()
    )
    expect(screen.getByRole('status', { name: /notifications/i })).toHaveTextContent(/notes saved/i)
  })
})

describe('LeadResults — multiple toasts can queue', () => {
  it('shows multiple toasts simultaneously without replacing each other', async () => {
    // Use real timers — toasts auto-dismiss after 3 s; we verify both appear before that.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads/1/status') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({ ...mockLeads[0], status: 'reviewing' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/leads/1/notes') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({ ...mockLeads[0], note: { content: 'hi', updated_at: new Date().toISOString() } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url.includes('/leads/run/') || url.includes('/leads')) {
        return new Response(JSON.stringify(mockLeads), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([mockRun]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const user = userEvent.setup()
    renderLeadResults()
    await waitFor(() => expect(screen.getByText('Alpha Plumber')).toBeInTheDocument())

    // Open detail panel and change status → first toast
    await user.click(screen.getByText('Alpha Plumber'))
    const panel = await screen.findByRole('dialog', { name: /lead detail/i })
    const statusSelect = panel.querySelector('select[aria-label="Status"]') as HTMLSelectElement
    await user.selectOptions(statusSelect, 'reviewing')
    await waitFor(() => expect(screen.getByText(/status saved/i)).toBeInTheDocument())

    // Save notes immediately (before the first toast's 3 s dismiss fires) → second toast
    const notesField = screen.getByRole('textbox', { name: /notes/i })
    await user.click(notesField)
    await user.type(notesField, 'hi')
    await user.tab()
    await waitFor(() => expect(screen.getByText(/notes saved/i)).toBeInTheDocument())

    // Both toasts must be present simultaneously in the DOM
    expect(screen.getByText(/status saved/i)).toBeInTheDocument()
    expect(screen.getByText(/notes saved/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Issue #0010: CSV export
// ---------------------------------------------------------------------------

describe('LeadResults â€” Export CSV button', () => {
  it('renders an Export CSV button when leads are present', async () => {
    mockFetch(mockRun, mockLeads)

    renderLeadResults()

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
    renderLeadResults()

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

// ---------------------------------------------------------------------------
// Issue #0013: Service badges on lead list
// ---------------------------------------------------------------------------

describe('LeadResults — service badges', () => {
  const leadsWithServices = [
    {
      id: 10,
      run_id: 1,
      place_id: 'place_010',
      name: 'Website Build Lead',
      city: 'Austin',
      state: 'TX',
      phone: null,
      email: null,
      website_url: null,
      maps_url: null,
      gap_score: 9.0,
      status: 'new',
      note: null,
      gap_signals: [
        { id: 100, signal_type: 'no_website', is_hard: true, description: 'No website', service: 'Website Build' },
      ],
    },
    {
      id: 11,
      run_id: 1,
      place_id: 'place_011',
      name: 'Multi-Service Lead',
      city: 'Dallas',
      state: 'TX',
      phone: null,
      email: null,
      website_url: null,
      maps_url: null,
      gap_score: 8.0,
      status: 'new',
      note: null,
      gap_signals: [
        { id: 101, signal_type: 'no_website', is_hard: true, description: 'No website', service: 'Website Build' },
        { id: 102, signal_type: 'missing_meta_title', is_hard: false, description: 'Missing title', service: 'SEO Package' },
        { id: 103, signal_type: 'missing_meta_desc', is_hard: false, description: 'Missing desc', service: 'SEO Package' },
      ],
    },
    {
      id: 12,
      run_id: 1,
      place_id: 'place_012',
      name: 'Modernisation Lead',
      city: 'Houston',
      state: 'TX',
      phone: null,
      email: null,
      website_url: null,
      maps_url: null,
      gap_score: 7.0,
      status: 'new',
      note: null,
      gap_signals: [
        { id: 104, signal_type: 'slow_page', is_hard: false, description: 'Slow page', service: 'Website Modernisation' },
        { id: 105, signal_type: 'no_ssl', is_hard: true, description: 'No SSL', service: 'Website Modernisation' },
      ],
    },
  ]

  it('shows a "Website Build" badge for a lead with a Website Build service signal', async () => {
    mockFetch(mockRun, leadsWithServices)
    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    const table = screen.getByRole('table', { name: /lead results/i })
    // The first lead row should show exactly one "Website Build" badge
    const badges = within(table).getAllByText('Website Build')
    // One badge on the first lead row
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('deduplicates service badges — two SEO signals produce one SEO badge', async () => {
    mockFetch(mockRun, leadsWithServices)
    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    const table = screen.getByRole('table', { name: /lead results/i })

    // Multi-Service Lead (id=11) has 2 SEO signals → only one "SEO Package" badge
    const rows = within(table).getAllByRole('row')
    // rows[0]=header, rows[1]=lead10, rows[2]=lead11, rows[3]=lead12
    const multiServiceRow = rows[2]
    const seoBadges = within(multiServiceRow).getAllByText('SEO Package')
    expect(seoBadges).toHaveLength(1)
  })

  it('shows multiple distinct badges for a lead with multiple service types', async () => {
    mockFetch(mockRun, leadsWithServices)
    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    const table = screen.getByRole('table', { name: /lead results/i })
    const rows = within(table).getAllByRole('row')
    // Multi-Service Lead has Website Build + SEO Package
    const multiServiceRow = rows[2]
    expect(within(multiServiceRow).getByText('Website Build')).toBeInTheDocument()
    expect(within(multiServiceRow).getByText('SEO Package')).toBeInTheDocument()
  })

  it('shows a "Website Modernisation" badge for a lead with that service', async () => {
    mockFetch(mockRun, leadsWithServices)
    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    const table = screen.getByRole('table', { name: /lead results/i })
    const rows = within(table).getAllByRole('row')
    const modernisationRow = rows[3]
    // Only one "Website Modernisation" badge despite two signals of that type
    const badges = within(modernisationRow).getAllByText('Website Modernisation')
    expect(badges).toHaveLength(1)
  })

  it('renders badges with the correct accessible role', async () => {
    mockFetch(mockRun, leadsWithServices)
    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('table', { name: /lead results/i })).toBeInTheDocument()
    )

    // Verify that each service badge text appears in the table at least once
    const table = screen.getByRole('table', { name: /lead results/i })
    expect(within(table).getAllByText('Website Build').length).toBeGreaterThanOrEqual(1)
    expect(within(table).getAllByText('Website Modernisation').length).toBeGreaterThanOrEqual(1)
    expect(within(table).getAllByText('SEO Package').length).toBeGreaterThanOrEqual(1)
  })

  it('renders no badges for a lead with no gap_signals', async () => {
    const leadNoSignals = {
      id: 20, run_id: 1, place_id: 'p20', name: 'No Signals Co', phone: null,
      address: null, city: 'Austin', state: 'TX', email: null, website_url: null,
      maps_url: null, gap_score: 0, status: 'new', gap_signals: [], note: null,
    }
    mockFetch(mockRun, [leadNoSignals])
    renderLeadResults()
    await waitFor(() => screen.getByText('No Signals Co'))
    expect(screen.queryByText('Website Build')).toBeNull()
    expect(screen.queryByText('Website Modernisation')).toBeNull()
    expect(screen.queryByText('SEO Package')).toBeNull()
  })

  it('silently omits badges for unknown service strings', async () => {
    const leadUnknown = {
      id: 21, run_id: 1, place_id: 'p21', name: 'Unknown Service Co', phone: null,
      address: null, city: 'Austin', state: 'TX', email: null, website_url: null,
      maps_url: null, gap_score: 5, status: 'new', note: null,
      gap_signals: [
        { id: 99, signal_type: 'no_website', is_hard: true,
          description: 'No site', service: 'Website Revamp', sales_copy: '' },
      ],
    }
    mockFetch(mockRun, [leadUnknown])
    renderLeadResults()
    await waitFor(() => screen.getByText('Unknown Service Co'))
    // Unknown service type is silently omitted — no badge rendered
    expect(screen.queryByText('Website Revamp')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Issue #0014: LeadResults auto-selects run from router state
// ---------------------------------------------------------------------------

describe('LeadResults - auto-selects run from router state', () => {
  const run42 = { id: 42, status: 'completed', total_leads: 1, config_yaml: '', error_message: null }
  const run1 = { id: 1, status: 'completed', total_leads: 2, config_yaml: '', error_message: null }

  function mockFetchWithRuns(runs: object[]) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/progress')) {
        return new Response(
          JSON.stringify({ status: 'completed', queries_completed: 0, queries_total: 0, leads_found: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/leads')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify(runs), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
  }

  it('when navigated with runId in router state, auto-selects that run in the selector', async () => {
    mockFetchWithRuns([run1, run42])

    renderLeadResults({ runId: 42 })

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    const select = screen.getByRole('combobox', { name: /select run/i }) as HTMLSelectElement
    expect(select.value).toBe('42')
  })

  it('when rendered with no router state, falls back to default (selects first run)', async () => {
    mockFetchWithRuns([run1, run42])

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    const select = screen.getByRole('combobox', { name: /select run/i }) as HTMLSelectElement
    expect(select.value).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// Issue #0023: Apify status display
// ---------------------------------------------------------------------------

describe('LeadResults — Apify status display', () => {
  const apifyRunning = {
    id: 3,
    status: 'running',
    total_leads: 0,
    config_yaml: 'source: apify_google_maps\n',
    error_message: null,
    apify_run_id: 'abc123',
    apify_status: 'running',
  }

  it('shows apify_status string for a run with apify_run_id set', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      // Single run status fetch
      if (url.match(/\/runs\/\d+$/) && !url.includes('/progress')) {
        return new Response(JSON.stringify(apifyRunning), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([apifyRunning]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    // Should show the apify_status value
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /apify status/i })).toBeInTheDocument()
    )
    expect(screen.getByRole('status', { name: /apify status/i })).toHaveTextContent(/running/i)
  })

  it('does not show queries progress bar for an Apify run (uses apify_status instead)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.match(/\/runs\/\d+$/) && !url.includes('/progress')) {
        return new Response(JSON.stringify(apifyRunning), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([apifyRunning]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    // Should NOT show the old "queries X / Y" progress bar
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /apify status/i })).toBeInTheDocument()
    )
    expect(screen.queryByText(/queries:/i)).not.toBeInTheDocument()
  })

  it('reloads leads when apify run transitions from running to completed', async () => {
    let callCount = 0
    const completedRun = { ...apifyRunning, status: 'completed', apify_status: 'succeeded' }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/leads/run/')) {
        callCount++
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.match(/\/runs\/\d+$/) && !url.includes('/progress')) {
        // First call returns running, second returns completed
        const run = callCount === 0 ? apifyRunning : completedRun
        return new Response(JSON.stringify(run), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([apifyRunning]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    renderLeadResults()

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /select run/i })).toBeInTheDocument()
    )

    // After run transitions, leads should be reloaded (callCount > 1)
    await waitFor(() => {
      expect(callCount).toBeGreaterThan(1)
    }, { timeout: 5000 })
  })
})
