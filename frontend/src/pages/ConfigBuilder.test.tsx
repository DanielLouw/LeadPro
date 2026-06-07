import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ConfigBuilder from './ConfigBuilder'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Helper to render ConfigBuilder inside a MemoryRouter (needed after useNavigate added)
function renderConfigBuilder() {
  return render(
    <MemoryRouter>
      <ConfigBuilder />
    </MemoryRouter>
  )
}

// -- 1. Renders business type category headings --------------------------------
describe('ConfigBuilder - business type categories', () => {
  it('renders all five vertical headings', () => {
    renderConfigBuilder()
    expect(screen.getByText('Home Services')).toBeInTheDocument()
    expect(screen.getByText('Health & Wellness')).toBeInTheDocument()
    expect(screen.getByText('Food & Hospitality')).toBeInTheDocument()
    expect(screen.getByText('Professional Services')).toBeInTheDocument()
    expect(screen.getByText('Auto')).toBeInTheDocument()
  })
})

// -- 2. Checking a business type checkbox selects it --------------------------
describe('ConfigBuilder - checkbox selection', () => {
  it('checking a business type marks it as selected', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const checkbox = screen.getByRole('checkbox', { name: /plumbers/i })
    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })
})

// -- 3. Multiple business types can be selected simultaneously ----------------
describe('ConfigBuilder - multiple checkbox selection', () => {
  it('allows selecting multiple business types at once', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const plumbersCheckbox = screen.getByRole('checkbox', { name: /plumbers/i })
    const hvacCheckbox = screen.getByRole('checkbox', { name: /hvac companies/i })
    await user.click(plumbersCheckbox)
    await user.click(hvacCheckbox)
    expect(plumbersCheckbox).toBeChecked()
    expect(hvacCheckbox).toBeChecked()
  })
})

// -- 4. Free-text input adds a custom business type ---------------------------
describe('ConfigBuilder - custom business type', () => {
  it('adds a custom business type via free-text input', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const input = screen.getByPlaceholderText(/add custom business type/i)
    await user.type(input, 'wedding photographers')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('checkbox', { name: /wedding photographers/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /wedding photographers/i })).toBeChecked()
  })
})

// -- 5. Selecting a state populates the city list -----------------------------
describe('ConfigBuilder - state -> city picker', () => {
  it('selecting a state populates the city dropdown with cities for that state', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const stateSelect = screen.getByRole('combobox', { name: /select state/i })
    await user.selectOptions(stateSelect, 'TX')
    expect(screen.getByRole('option', { name: /Austin/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Dallas/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Houston/i })).toBeInTheDocument()
  })
})

// -- 6. Selecting a city adds it to the selection -----------------------------
describe('ConfigBuilder - city selection', () => {
  it('selecting a city from the dropdown adds it to selected cities', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const stateSelect = screen.getByRole('combobox', { name: /select state/i })
    await user.selectOptions(stateSelect, 'TX')
    const citySelect = screen.getByRole('combobox', { name: /select city/i })
    await user.selectOptions(citySelect, 'Austin')

    // the selected city should appear as a tag/chip in a "selected cities" region
    const selectedCities = screen.getByRole('list', { name: /selected cities/i })
    expect(within(selectedCities).getByText(/Austin, TX/i)).toBeInTheDocument()
  })
})

// -- 7. Max results cap field renders with default 500 (issue #0006) ----------
describe('ConfigBuilder - max results cap', () => {
  it('renders a max results cap field with default value 500', () => {
    renderConfigBuilder()
    const input = screen.getByRole('spinbutton', { name: /max results cap/i })
    expect(input).toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('500')
  })
})

// -- 8. "Load Config" section is absent (issue #0014) -------------------------
describe('ConfigBuilder - Load Config section absent', () => {
  it('does not render a Load Config textarea', () => {
    renderConfigBuilder()
    expect(screen.queryByRole('textbox', { name: /load config/i })).not.toBeInTheDocument()
  })

  it('does not render a Load Config button', () => {
    renderConfigBuilder()
    expect(screen.queryByRole('button', { name: /load config/i })).not.toBeInTheDocument()
  })
})

// -- 9. "Run" button is present (issue #0014) ---------------------------------
describe('ConfigBuilder - Run button present', () => {
  it('renders a Run button', () => {
    renderConfigBuilder()
    expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument()
  })
})

// -- 10. Run button fetches estimate and displays it inline (issue #0014) -----
describe('ConfigBuilder - Run button fetches estimate', () => {
  const estimateResponse = {
    query_count: 2,
    estimated_results: 40,
    estimated_cost_usd: 0.064,
  }

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/runs/estimate') && init?.method === 'POST') {
        return new Response(JSON.stringify(estimateResponse), {
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
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function selectTypeAndCity(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('checkbox', { name: /plumbers/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /select state/i }), 'TX')
    await user.selectOptions(screen.getByRole('combobox', { name: /select city/i }), 'Austin')
  }

  it('clicking Run fetches POST /api/runs/estimate and displays query count, results, and cost', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    await selectTypeAndCity(user)

    await user.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() =>
      expect(screen.getByText(/2 queries/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/40 results/i)).toBeInTheDocument()
    expect(screen.getByText(/\$0\.064/i)).toBeInTheDocument()
  })

  it('shows "Confirm & start run" button after estimate is displayed', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    await selectTypeAndCity(user)

    await user.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm & start run/i })).toBeInTheDocument()
    )
  })

  it('"Cancel" at estimate step returns to editing (hides estimate, shows Run button)', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    await selectTypeAndCity(user)

    await user.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() =>
      expect(screen.getByText(/2 queries/i)).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Estimate panel gone
    expect(screen.queryByText(/2 queries/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm & start run/i })).not.toBeInTheDocument()
    // Run button back
    expect(screen.getByRole('button', { name: /^run$/i })).toBeInTheDocument()
  })

  it('"Confirm & start run" calls POST /api/runs/ and navigates to /leads with the new runId', async () => {
    mockNavigate.mockClear()
    const user = userEvent.setup()
    renderConfigBuilder()
    await selectTypeAndCity(user)

    await user.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm & start run/i })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /confirm & start run/i }))

    // Verify POST /api/runs/ was called
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const submitted = calls.some((args: unknown[]) => {
        const url = args[0]
        const init = args[1] as RequestInit | undefined
        return (
          typeof url === 'string' &&
          url.includes('/api/runs/') &&
          !url.includes('/estimate') &&
          init?.method === 'POST'
        )
      })
      expect(submitted).toBe(true)
    })

    // Verify navigate was called with the runId returned by the mock (99)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/leads', { state: { runId: 99 } })
    })
  })
})

// ---------------------------------------------------------------------------
// Issue #0023: Source selector
// ---------------------------------------------------------------------------

describe('ConfigBuilder — source selector', () => {
  it('renders a Lead Source dropdown with all three options', () => {
    renderConfigBuilder()
    const select = screen.getByRole('combobox', { name: /lead source/i })
    expect(select).toBeInTheDocument()
    const options = Array.from((select as HTMLSelectElement).options).map(o => o.text)
    expect(options).toContain('Google Places API')
    expect(options).toContain('Apify — Google Maps Scraper')
    expect(options).toContain('Apify — Facebook Pages Scraper')
  })

  it('defaults to Google Places API', () => {
    renderConfigBuilder()
    const select = screen.getByRole('combobox', { name: /lead source/i }) as HTMLSelectElement
    expect(select.value).toBe('google_places')
  })

  it('switching to Apify Google Maps shows search term and state/city fields', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const select = screen.getByRole('combobox', { name: /lead source/i })
    await user.selectOptions(select, 'apify_google_maps')
    expect(screen.getByRole('textbox', { name: /search term/i })).toBeInTheDocument()
    // The Google Places business type section should be gone
    expect(screen.queryByText('Home Services')).not.toBeInTheDocument()
  })

  it('switching to Apify Facebook Pages shows keyword and location fields', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const select = screen.getByRole('combobox', { name: /lead source/i })
    await user.selectOptions(select, 'apify_facebook_pages')
    expect(screen.getByRole('textbox', { name: /keyword/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /location/i })).toBeInTheDocument()
    expect(screen.queryByText('Home Services')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Issue #0023: Business type chip grid
// ---------------------------------------------------------------------------

describe('ConfigBuilder — business type chip grid', () => {
  it('renders business types as chips rather than checkboxes', () => {
    renderConfigBuilder()
    // Chips use role="checkbox" + aria-checked for accessibility, same as before
    const plumbersChip = screen.getByRole('checkbox', { name: /plumbers/i })
    expect(plumbersChip).toBeInTheDocument()
    // But it should NOT be an <input type="checkbox"> element
    expect(plumbersChip.tagName.toLowerCase()).not.toBe('input')
  })

  it('selected chip is visually distinct — aria-checked true when selected', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()
    const chip = screen.getByRole('checkbox', { name: /plumbers/i })
    expect(chip).toHaveAttribute('aria-checked', 'false')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-checked', 'true')
  })
})

// ---------------------------------------------------------------------------
// Issue #0023: Config YAML shape
// ---------------------------------------------------------------------------

describe('ConfigBuilder — config YAML shape', () => {
  const mockEstimate = { query_count: 1, estimated_results: 10, estimated_cost_usd: 0.016 }

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/runs/estimate') && init?.method === 'POST') {
        return new Response(JSON.stringify(mockEstimate), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/runs/') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ id: 5, status: 'pending', total_leads: 0, config_yaml: '', error_message: null }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('Google Places YAML has nested source_config.queries', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()

    // Select plumbers + Austin TX
    await user.click(screen.getByRole('checkbox', { name: /plumbers/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /select state/i }), 'TX')
    await user.selectOptions(screen.getByRole('combobox', { name: /select city/i }), 'Austin')

    await user.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const estimateCall = calls.find((args: unknown[]) => {
        const url = args[0]
        return typeof url === 'string' && url.includes('/runs/estimate')
      })
      expect(estimateCall).toBeDefined()
      const body = JSON.parse((estimateCall![1] as RequestInit).body as string)
      const parsed = body.config_yaml
      expect(parsed).toContain('source: google_places')
      expect(parsed).toContain('source_config:')
      expect(parsed).toContain('queries:')
    })
  })

  it('Apify Google Maps YAML has source: apify_google_maps and source_config with search_term/city/state', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()

    await user.selectOptions(screen.getByRole('combobox', { name: /lead source/i }), 'apify_google_maps')
    await user.type(screen.getByRole('textbox', { name: /search term/i }), 'plumbers')
    await user.selectOptions(screen.getByRole('combobox', { name: /select state/i }), 'TX')
    await user.selectOptions(screen.getByRole('combobox', { name: /select city/i }), 'Austin')

    await user.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const estimateCall = calls.find((args: unknown[]) => {
        const url = args[0]
        return typeof url === 'string' && url.includes('/runs/estimate')
      })
      expect(estimateCall).toBeDefined()
      const body = JSON.parse((estimateCall![1] as RequestInit).body as string)
      const yaml = body.config_yaml
      expect(yaml).toContain('source: apify_google_maps')
      expect(yaml).toContain('source_config:')
      expect(yaml).toContain('search_term: plumbers')
      expect(yaml).toContain('city: Austin')
      expect(yaml).toContain('state: TX')
    })
  })

  it('Apify Facebook Pages YAML has source: apify_facebook_pages and source_config.query', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()

    await user.selectOptions(screen.getByRole('combobox', { name: /lead source/i }), 'apify_facebook_pages')
    await user.type(screen.getByRole('textbox', { name: /keyword/i }), 'plumbers Austin Texas')

    await user.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      const estimateCall = calls.find((args: unknown[]) => {
        const url = args[0]
        return typeof url === 'string' && url.includes('/runs/estimate')
      })
      expect(estimateCall).toBeDefined()
      const body = JSON.parse((estimateCall![1] as RequestInit).body as string)
      const yaml = body.config_yaml
      expect(yaml).toContain('source: apify_facebook_pages')
      expect(yaml).toContain('source_config:')
      expect(yaml).toContain('query: plumbers Austin Texas')
    })
  })
})

// ---------------------------------------------------------------------------
// Issue #0023: Apify confirm step — monthly budget
// ---------------------------------------------------------------------------

describe('ConfigBuilder — Apify confirm step shows monthly budget', () => {
  const mockEstimate = { query_count: 1, estimated_results: 10, estimated_cost_usd: 0.04 }
  const mockSpend = {
    google_places: { spent_usd: 1.0, budget_usd: 10.0, remaining_usd: 9.0 },
    apify: { spent_usd: 1.24, budget_usd: 5.0, remaining_usd: 3.76 },
  }

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/runs/monthly-spend')) {
        return new Response(JSON.stringify(mockSpend), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/runs/estimate') && init?.method === 'POST') {
        return new Response(JSON.stringify(mockEstimate), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('shows remaining Apify budget after estimated run cost', async () => {
    const user = userEvent.setup()
    renderConfigBuilder()

    await user.selectOptions(screen.getByRole('combobox', { name: /lead source/i }), 'apify_google_maps')
    await user.type(screen.getByRole('textbox', { name: /search term/i }), 'plumbers')
    await user.selectOptions(screen.getByRole('combobox', { name: /select state/i }), 'TX')
    await user.selectOptions(screen.getByRole('combobox', { name: /select city/i }), 'Austin')

    await user.click(screen.getByRole('button', { name: /^run$/i }))

    // Should show estimated cost and remaining budget info
    await waitFor(() =>
      expect(screen.getByText(/\$0\.04/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/remaining/i)).toBeInTheDocument()
  })

  it('shows a budget warning when estimated cost would exceed remaining Apify budget', async () => {
    const user = userEvent.setup()

    // Override: estimated cost exceeds remaining budget
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/runs/monthly-spend')) {
        return new Response(JSON.stringify({
          google_places: { spent_usd: 0, budget_usd: 10.0, remaining_usd: 10.0 },
          apify: { spent_usd: 4.95, budget_usd: 5.0, remaining_usd: 0.05 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/runs/estimate') && init?.method === 'POST') {
        return new Response(JSON.stringify({ query_count: 1, estimated_results: 50, estimated_cost_usd: 0.20 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    renderConfigBuilder()

    await user.selectOptions(screen.getByRole('combobox', { name: /lead source/i }), 'apify_google_maps')
    await user.type(screen.getByRole('textbox', { name: /search term/i }), 'plumbers')
    await user.selectOptions(screen.getByRole('combobox', { name: /select state/i }), 'TX')
    await user.selectOptions(screen.getByRole('combobox', { name: /select city/i }), 'Austin')

    await user.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert', { name: /budget/i })).toBeInTheDocument()
    )
    // "Confirm & start run" should still be enabled (warning, not block)
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
  })
})
