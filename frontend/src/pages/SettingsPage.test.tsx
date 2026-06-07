import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from './SettingsPage'

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetchGet(data: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  } as unknown as Response)
}

function mockFetchPatch(data: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  } as unknown as Response)
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Renders current budget values loaded from GET /settings
// ---------------------------------------------------------------------------

describe('SettingsPage - renders budget values', () => {
  it('shows the google places and apify budget fields', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchGet({
        google_places_monthly_budget_usd: 200,
        apify_monthly_budget_usd: 5,
      })
    )

    renderSettings()

    await waitFor(() => {
      expect(screen.getByLabelText(/google places monthly budget/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/apify monthly budget/i)).toBeInTheDocument()
    })
  })

  it('pre-fills inputs with values from GET /settings', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchGet({
        google_places_monthly_budget_usd: 150,
        apify_monthly_budget_usd: 25,
      })
    )

    renderSettings()

    await waitFor(() => {
      const googleInput = screen.getByLabelText(/google places monthly budget/i) as HTMLInputElement
      const apifyInput = screen.getByLabelText(/apify monthly budget/i) as HTMLInputElement
      expect(googleInput.value).toBe('150')
      expect(apifyInput.value).toBe('25')
    })
  })
})

// ---------------------------------------------------------------------------
// Saves via PATCH /settings on submit
// ---------------------------------------------------------------------------

describe('SettingsPage - saves settings', () => {
  it('calls PATCH /settings when Save is clicked', async () => {
    const user = userEvent.setup()

    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      callCount++
      if (options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              google_places_monthly_budget_usd: 300,
              apify_monthly_budget_usd: 5,
            }),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            google_places_monthly_budget_usd: 200,
            apify_monthly_budget_usd: 5,
          }),
      } as unknown as Response)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderSettings()

    await waitFor(() => {
      expect(screen.getByLabelText(/google places monthly budget/i)).toBeInTheDocument()
    })

    const googleInput = screen.getByLabelText(/google places monthly budget/i)
    await user.clear(googleInput)
    await user.type(googleInput, '300')

    const saveButton = screen.getByRole('button', { name: /save/i })
    await user.click(saveButton)

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, opts]) => opts?.method === 'PATCH'
      )
      expect(patchCall).toBeDefined()
      const body = JSON.parse(patchCall![1].body as string)
      expect(body.google_places_monthly_budget_usd).toBe(300)
    })
  })
})
