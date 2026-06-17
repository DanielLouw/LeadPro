import { useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import AllLeads from './pages/AllLeads'
import ConfigBuilder from './pages/ConfigBuilder'
import LeadResults from './pages/LeadResults'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'
import RunTrackerWidget from './components/RunTrackerWidget'
import { applyTheme, getAppliedTheme, persistTheme, type Theme } from './theme'
import './App.css'

function NavBar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <nav className="nav">
      <span className="nav-logo">LeadPro</span>
      <div className="nav-links">
        <Link to="/" className={pathname === '/' ? 'active' : ''}>Config Builder</Link>
        <Link to="/leads" className={pathname === '/leads' ? 'active' : ''}>Lead Results</Link>
        <Link to="/all-leads" className={pathname === '/all-leads' ? 'active' : ''}>All Leads</Link>
        <Link to="/settings" className={pathname === '/settings' ? 'active' : ''}>Settings</Link>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <RunTrackerWidget />
        <button
          type="button"
          className="nav-theme-toggle"
          aria-label="Toggle color theme"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          type="button"
          className="nav-theme-toggle"
          aria-label="Log out"
          onClick={handleLogout}
        >
          Log out
        </button>
      </div>
    </nav>
  )
}

export default function App() {
  // main.tsx applies the resolved theme to <html> before render; read it back
  // rather than re-deriving, so there is one source of truth.
  const [theme, setTheme] = useState<Theme>(getAppliedTheme)

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    persistTheme(next)
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="app">
              <NavBar theme={theme} onToggleTheme={toggleTheme} />
              <main className="main">
                <Routes>
                  <Route path="/" element={<ConfigBuilder />} />
                  <Route path="/leads" element={<LeadResults />} />
                  <Route path="/all-leads" element={<AllLeads />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
