import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  FileText, Upload, Search,
  Filter, Info, CheckCircle2, XCircle
} from 'lucide-react';

export default function Library() {
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const handleIngest = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Text Files', extensions: ['txt', 'md', 'pdf'] }]
      });

      if (selected && typeof selected === 'string') {
        setNotification(null);
        
        await invoke('ingest_data', { filePath: selected });
        
        setNotification({ type: 'success', message: 'File ingested successfully into vector database.' });
      }
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', message: 'Failed to ingest file. Check console for details.' });
    } finally {
      // Auto-hide notification
      setTimeout(() => setNotification(null), 5000);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', animation: 'fadeSlideUp 0.4s ease forwards' }}>
      

      {notification && (
        <div style={{
          marginBottom: '24px', padding: '12px 16px', borderRadius: '12px',
          background: notification.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: notification.type === 'success' ? '#10b981' : '#ef4444',
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', fontWeight: 500,
          animation: 'fadeSlideUp 0.3s ease'
        }}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {notification.message}
        </div>
      )}

      {/* Main UI */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(20,20,35,0.8), rgba(10,10,20,0.9))',
        border: '1px solid var(--border-subtle)',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: '16px',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search library documents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px 9px 36px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-default)',
                borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.85rem',
                outline: 'none', transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-default)'}
            />
          </div>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 14px', borderRadius: '10px',
            background: 'transparent', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500
          }}>
            <Filter size={14} />
            Filters
          </button>
        </div>

        {/* Empty State / Table */}
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <FileText size={28} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
            No documents found
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '320px', margin: '0 auto 24px' }}>
            Ingest files to build your local knowledge base for RAG-powered agent activities.
          </p>
          <button
            onClick={handleIngest}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            <Upload size={16} />
            Select file from system
          </button>
        </div>

        {/* Info Footer */}
        <div style={{
          padding: '16px 24px',
          background: 'rgba(59,110,248,0.03)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{
            padding: '6px', borderRadius: '8px', background: 'rgba(59,110,248,0.1)',
            color: '#3b6ef8'
          }}>
            <Info size={14} />
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>RAG Note:</strong> Documents are automatically chunked and embedded using Ollama's native embedding models.
          </p>
        </div>
      </div>
    </div>
  );
}

