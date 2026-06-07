import { Link, Route, Routes, useLocation } from 'react-router-dom'
import ConfigBuilder from './pages/ConfigBuilder'
import LeadResults from './pages/LeadResults'
import SettingsPage from './pages/SettingsPage'
import RunTrackerWidget from './components/RunTrackerWidget'
import './App.css'

export default function App() {
  const { pathname } = useLocation()

  return (
    <div className="app">
      <nav className="nav">
        <span className="nav-logo">LeadPro</span>
        <div className="nav-links">
          <Link to="/" className={pathname === '/' ? 'active' : ''}>Config Builder</Link>
          <Link to="/leads" className={pathname === '/leads' ? 'active' : ''}>Lead Results</Link>
          <Link to="/settings" className={pathname === '/settings' ? 'active' : ''}>Settings</Link>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <RunTrackerWidget />
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<ConfigBuilder />} />
          <Route path="/leads" element={<LeadResults />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
