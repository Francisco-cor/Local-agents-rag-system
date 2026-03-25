import { useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';

import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Arena from './pages/Arena';
import TestingArena from './pages/TestingArena';
import Swarm from './pages/Swarm';
import Chat from './pages/Chat';

function AppContent() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const getTitle = (pathname: string) => {
    switch (pathname) {
      case '/': return 'Dashboard';
      case '/library': return 'Knowledge Library';
      case '/chat': return 'Direct Chat';
      case '/arena': return 'Arena Mode';
      case '/testing-arena': return 'Testing Arena';
      case '/swarm': return 'Swarm Mode';
      default: return 'Local Agents RAG';
    }
  };

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Ambient background orbs */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: '-15%', left: '-8%', width: '560px', height: '560px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.055) 0%, transparent 68%)',
          borderRadius: '50%', filter: 'blur(50px)'
        }} />
        <div style={{
          position: 'absolute', bottom: '-18%', right: '-8%', width: '640px', height: '640px',
          background: 'radial-gradient(circle, rgba(239,68,68,0.04) 0%, transparent 68%)',
          borderRadius: '50%', filter: 'blur(50px)'
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '20%', width: '300px', height: '300px',
          background: 'radial-gradient(circle, rgba(34,197,94,0.025) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(40px)'
        }} />
      </div>

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <header style={{
          height: '56px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: '12px',
          background: 'rgba(17,17,19,0.72)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          flexShrink: 0,
          zIndex: 20,
        }}>
          {/* Toggle button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '10px', border: '1px solid var(--border-default)',
              background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.2s ease', flexShrink: 0
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
          >
            <Menu size={16} />
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-default)' }} />

          {/* App name / Dynamic Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span key={location.pathname} style={{
              fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '-0.03em', animation: 'fadeSlideIn 0.3s ease forwards',
              fontFamily: "'Syne', sans-serif",
            }}>
              {getTitle(location.pathname)}
            </span>
            <span style={{
              fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--carbon-400)',
              background: 'rgba(245,245,248,0.04)', border: '1px solid var(--border-subtle)',
              padding: '2px 8px', borderRadius: '100px'
            }}>
              v2.0
            </span>
          </div>
        </header>

        {/* Page content */}
        <main style={{
          flex: 1,
          overflow: 'auto',
          padding: '32px',
          animation: 'fadeSlideUp 0.4s ease forwards'
        }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:conversationId" element={<Chat />} />
            <Route path="/arena" element={<Arena />} />
            <Route path="/testing-arena" element={<TestingArena />} />
            <Route path="/swarm" element={<Swarm />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
