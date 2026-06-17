import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  mockNavigate.mockClear()
})

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('LoginPage - render', () => {
  it('renders a password input and submit button', () => {
    renderLogin()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('does not render a username field', () => {
    renderLogin()
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Successful login
// ---------------------------------------------------------------------------

describe('LoginPage - successful login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'my-jwt' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ))
  })

  it('stores the token in localStorage on success', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('my-jwt')
    })
  })

  it('navigates to / on success', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('calls POST /api/auth/login with the password', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/auth/login')
      expect((init as RequestInit).method).toBe('POST')
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.password).toBe('secret123')
    })
  })
})

// ---------------------------------------------------------------------------
// Failed login
// ---------------------------------------------------------------------------

describe('LoginPage - failed login', () => {
  it('shows an error message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Incorrect password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    ))

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/password/i), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/incorrect password/i)
  })

  it('does not store a token on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Incorrect password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    ))

    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText(/password/i), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(localStorage.getItem('token')).toBeNull()
  })
})
