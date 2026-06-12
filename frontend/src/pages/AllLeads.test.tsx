import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AllLeads from './AllLeads'
import type { Lead } from './LeadDetailPanel'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 1,
    run_id: 1,
    external_id: 'p1',
    name: 'Ace Plumber',
    phone: '512-555-0142',
    address: '100 Main St',
    city: 'Austin',
    state: 'TX',
    email: null,
    website_url: null,
    maps_url: null,
    gap_score: 9.0,
    status: 'new',
    gap_signals: [
      { id: 1, signal_type: 'no_website', is_hard: true, description: 'No website', service: 'Website Build', sales_copy: '' },
    ],
    note: null,
    ...overrides,
  }
}

const LEADS: Lead[] = [
  makeLead(),
  makeLead({ id: 2, run_id: 2, name: 'Cedar HVAC', city: 'Chicago', state: 'IL', gap_score: 20.0, status: 'contacted' }),
]

function mockFetchWith(leads: Lead[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/leads/')) {
      return new Response(JSON.stringify(leads), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}

function renderAllLeads() {
  return render(
    <MemoryRouter>
      <AllLeads />
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

describe('AllLeads - consolidated listing', () => {
  beforeEach(() => { mockFetchWith(LEADS) })

  it('fetches GET /api/leads/ on mount and renders leads from multiple runs', async () => {
    renderAllLeads()

    await waitFor(() => {
      expect(screen.getByText('Ace Plumber')).toBeInTheDocument()
    })
    expect(screen.getByText('Cedar HVAC')).toBeInTheDocument()

    // Run column shows source run for each lead
    const table = screen.getByRole('table', { name: /all leads/i })
    expect(within(table).getByText('#1')).toBeInTheDocument()
    expect(within(table).getByText('#2')).toBeInTheDocument()
  })

  it('shows a lead count summary with status breakdown', async () => {
    renderAllLeads()

    await waitFor(() => {
      expect(screen.getByText(/2 leads/i)).toBeInTheDocument()
    })
    const summary = screen.getByRole('region', { name: /summary/i })
    expect(within(summary).getByText(/new: 1/i)).toBeInTheDocument()
    expect(within(summary).getByText(/contacted: 1/i)).toBeInTheDocument()
  })

  it('shows empty state when there are no leads at all', async () => {
    vi.restoreAllMocks()
    mockFetchWith([])
    renderAllLeads()

    await waitFor(() => {
      expect(screen.getByText(/no leads yet/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe('AllLeads - filters', () => {
  beforeEach(() => { mockFetchWith(LEADS) })

  it('status checkbox toggles add statuses to the request', async () => {
    const user = userEvent.setup()
    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())

    await user.click(screen.getByRole('checkbox', { name: /^new$/i }))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const withStatus = calls.some(args =>
        typeof args[0] === 'string' && (args[0] as string).includes('statuses=new')
      )
      expect(withStatus).toBe(true)
    })
  })

  it('state dropdown adds states to the request', async () => {
    const user = userEvent.setup()
    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())

    await user.selectOptions(screen.getByRole('combobox', { name: /state/i }), 'TX')

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const withState = calls.some(args =>
        typeof args[0] === 'string' && (args[0] as string).includes('states=TX')
      )
      expect(withState).toBe(true)
    })
  })

  it('search input adds a debounced search param to the request', async () => {
    const user = userEvent.setup()
    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())

    await user.type(screen.getByRole('searchbox', { name: /search by name/i }), 'plumb')

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const withSearch = calls.some(args =>
        typeof args[0] === 'string' && (args[0] as string).includes('search=plumb')
      )
      expect(withSearch).toBe(true)
    })
  })

  it('signal type checkboxes derived from results add signal_types to the request', async () => {
    const user = userEvent.setup()
    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())

    await user.click(screen.getByRole('checkbox', { name: /no website/i }))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const withSignal = calls.some(args =>
        typeof args[0] === 'string' && (args[0] as string).includes('signal_types=no_website')
      )
      expect(withSignal).toBe(true)
    })
  })

  it('sort select adds sort param to the request', async () => {
    const user = userEvent.setup()
    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())

    await user.selectOptions(screen.getByRole('combobox', { name: /sort by/i }), 'state')

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const withSort = calls.some(args =>
        typeof args[0] === 'string' && (args[0] as string).includes('sort=state')
      )
      expect(withSort).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Detail panel interaction
// ---------------------------------------------------------------------------

describe('AllLeads - detail panel', () => {
  beforeEach(() => { mockFetchWith(LEADS) })

  it('clicking a row opens the lead detail panel', async () => {
    const user = userEvent.setup()
    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())

    await user.click(screen.getByText('Ace Plumber'))

    const dialog = await screen.findByRole('dialog', { name: /lead detail/i })
    expect(within(dialog).getByText('Ace Plumber')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: /status/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: /notes/i })).toBeInTheDocument()
  })

  it('closing the detail panel returns to the table', async () => {
    const user = userEvent.setup()
    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Ace Plumber'))
    await screen.findByRole('dialog', { name: /lead detail/i })

    await user.click(screen.getByRole('button', { name: /close detail panel/i }))
    expect(screen.queryByRole('dialog', { name: /lead detail/i })).not.toBeInTheDocument()
  })

  it('status change in the panel updates the table row', async () => {
    const user = userEvent.setup()

    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/status') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ ...LEADS[0], status: 'contacted' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/leads/')) {
        return new Response(JSON.stringify(LEADS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    renderAllLeads()

    await waitFor(() => expect(screen.getByText('Ace Plumber')).toBeInTheDocument())
    await user.click(screen.getByText('Ace Plumber'))
    const dialog = await screen.findByRole('dialog', { name: /lead detail/i })

    await user.selectOptions(within(dialog).getByRole('combobox', { name: /status/i }), 'contacted')

    await waitFor(() => {
      expect(screen.getByText(/status saved/i)).toBeInTheDocument()
    })
  })
})
