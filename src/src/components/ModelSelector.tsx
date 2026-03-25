import { useState, useRef, useEffect } from 'react';
import { Bot, ChevronDown, Check } from 'lucide-react';

interface ModelSelectorProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  color?: string;
  loading?: boolean;
}

export default function ModelSelector({ value, options, onChange, disabled, color = '#7ba3ff', loading }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '180px' }}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${isOpen ? 'rgba(59, 110, 248, 0.4)' : 'var(--border-subtle)'}`,
          borderRadius: '100px',
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          outline: 'none',
          backdropFilter: 'blur(8px)',
        }}
        onMouseEnter={e => {
          if (!disabled && !isOpen) {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.2)';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.06)';
          }
        }}
        onMouseLeave={e => {
          if (!disabled && !isOpen) {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.03)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={14} style={{ color: loading ? 'var(--text-muted)' : color }} />
          <span style={{ 
            maxWidth: '120px', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap',
            color: loading ? 'var(--text-muted)' : 'inherit'
          }}>
            {loading ? 'Loading models...' : value || 'Select model'}
          </span>
        </div>
        <ChevronDown 
          size={14} 
          style={{ 
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }} 
        />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          background: 'rgba(15, 15, 22, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '6px',
          zIndex: 1000,
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          animation: 'scaleIn 0.2s ease-out forwards',
          maxHeight: '260px',
          overflowY: 'auto'
        }}>
          {options.length === 0 ? (
            <div style={{ padding: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              No models available
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: value === option ? 'rgba(59, 110, 248, 0.1)' : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  color: value === option ? 'var(--blue-bright)' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: value === option ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  marginBottom: '2px'
                }}
                onMouseEnter={e => {
                  if (value !== option) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.04)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={e => {
                  if (value !== option) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {option}
                </span>
                {value === option && <Check size={12} style={{ marginLeft: '8px' }} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
