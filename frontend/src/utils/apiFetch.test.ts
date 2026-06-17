import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch } from './apiFetch'

// ---------------------------------------------------------------------------
// apiFetch — Authorization header
// ---------------------------------------------------------------------------

describe('apiFetch - Authorization header', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('attaches Authorization: Bearer <token> when a token is in localStorage', async () => {
    localStorage.setItem('token', 'test-jwt-token')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('/api/leads/')

    const [, init] = mockFetch.mock.calls[0]
    // Headers API lowercases names per HTTP spec
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer test-jwt-token',
    })
  })

  it('does not attach Authorization header when no token in localStorage', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('/api/leads/')

    const [, init] = mockFetch.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string> | undefined
    expect(headers?.authorization).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// apiFetch — 401 handling
// ---------------------------------------------------------------------------

describe('apiFetch - 401 clears token and redirects', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'stale-token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('clears the token from localStorage on 401 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    ))

    // apiFetch never resolves on 401 (prevents callers flashing error state during redirect)
    await Promise.race([
      apiFetch('/api/leads/'),
      new Promise<void>(resolve => setTimeout(resolve, 50)),
    ])

    expect(localStorage.getItem('token')).toBeNull()
  })

  it('redirects to /login on 401 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    ))

    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })
    Object.defineProperty(window.location, 'href', {
      set: assignSpy,
      get: () => '',
      configurable: true,
    })

    // apiFetch never resolves on 401 (prevents callers flashing error state during redirect)
    await Promise.race([
      apiFetch('/api/leads/'),
      new Promise<void>(resolve => setTimeout(resolve, 50)),
    ])

    expect(assignSpy).toHaveBeenCalledWith('/login')
  })
})

// ---------------------------------------------------------------------------
// apiFetch — passes through options (method, body, headers)
// ---------------------------------------------------------------------------

describe('apiFetch - passes through options', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('merges caller-supplied headers with the Authorization header', async () => {
    localStorage.setItem('token', 'my-token')

    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    )
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('/api/leads/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    const [, init] = mockFetch.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer my-token')
    expect(headers['content-type']).toBe('application/json')
    expect((init as RequestInit).method).toBe('POST')
  })
})
