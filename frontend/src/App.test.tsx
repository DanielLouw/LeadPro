import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// Mock fetch so RunTrackerWidget doesn't error
function mockFetchOk() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } })
  ))
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Unauthenticated routing
// ---------------------------------------------------------------------------

describe('App routing - unauthenticated', () => {
  it('redirects / to /login when no token is present', () => {
    mockFetchOk()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders LoginPage at /login', () => {
    mockFetchOk()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Authenticated routing
// ---------------------------------------------------------------------------

describe('App routing - authenticated', () => {
  it('renders the nav and config builder at / when token is present', async () => {
    localStorage.setItem('token', 'valid-token')
    mockFetchOk()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    expect(screen.getByText('LeadPro')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Logout button
// ---------------------------------------------------------------------------

describe('App - logout button', () => {
  it('shows a logout button in the nav when authenticated', () => {
    localStorage.setItem('token', 'valid-token')
    mockFetchOk()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('clicking logout clears the token from localStorage', async () => {
    localStorage.setItem('token', 'valid-token')
    mockFetchOk()
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /log out/i }))
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('clicking logout navigates to /login', async () => {
    localStorage.setItem('token', 'valid-token')
    mockFetchOk()
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })
  })
})
