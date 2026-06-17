import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ detail: 'Login failed' }))
        setError(data.detail ?? 'Login failed')
        return
      }

      const data = await resp.json()
      localStorage.setItem('token', data.access_token)
      navigate('/')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form
        onSubmit={handleSubmit}
        className="lp-card"
        style={{ width: '100%', maxWidth: '360px' }}
      >
        <h1 className="lp-page-title" style={{ marginBottom: '24px' }}>LeadPro</h1>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="password" className="lp-label">Password</label>
          <input
            id="password"
            type="password"
            className="lp-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            autoFocus
          />
        </div>

        {error && (
          <p role="alert" className="lp-error" style={{ marginBottom: '12px' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !password}
          style={{ width: '100%' }}
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
