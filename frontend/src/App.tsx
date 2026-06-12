import { useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import AllLeads from './pages/AllLeads'
import ConfigBuilder from './pages/ConfigBuilder'
import LeadResults from './pages/LeadResults'
import SettingsPage from './pages/SettingsPage'
import RunTrackerWidget from './components/RunTrackerWidget'
import { applyTheme, getAppliedTheme, persistTheme, type Theme } from './theme'
import './App.css'

export default function App() {
  const { pathname } = useLocation()
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
    <div className="app">
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
            onClick={toggleTheme}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<ConfigBuilder />} />
          <Route path="/leads" element={<LeadResults />} />
          <Route path="/all-leads" element={<AllLeads />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
