export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('token')

  const h = new Headers(options.headers)
  if (token) {
    h.set('Authorization', `Bearer ${token}`)
  }
  const headers = Object.fromEntries(h.entries())

  const response = await fetch(url, { ...options, headers })

  if (response.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    // Never resolve so callers don't flash an error banner while the page navigates
    return new Promise<Response>(() => {})
  }

  return response
}
