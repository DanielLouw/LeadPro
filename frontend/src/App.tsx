import { Link, Route, Routes, useLocation } from 'react-router-dom'
import ConfigBuilder from './pages/ConfigBuilder'
import LeadResults from './pages/LeadResults'
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
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<ConfigBuilder />} />
          <Route path="/leads" element={<LeadResults />} />
        </Routes>
      </main>
    </div>
  )
}
