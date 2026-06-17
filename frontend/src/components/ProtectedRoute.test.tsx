import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

afterEach(() => {
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// ProtectedRoute — authenticated
// ---------------------------------------------------------------------------

describe('ProtectedRoute - with token', () => {
  it('renders children when a token is present in localStorage', () => {
    localStorage.setItem('token', 'valid-token')

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <p>Protected content</p>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Protected content')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ProtectedRoute — unauthenticated
// ---------------------------------------------------------------------------

describe('ProtectedRoute - without token', () => {
  it('redirects to /login when no token is in localStorage', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <p>Protected content</p>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })
})
