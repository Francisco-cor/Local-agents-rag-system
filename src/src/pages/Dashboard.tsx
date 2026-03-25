import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity, Server, Cpu, HardDrive, Zap,
  ArrowUpRight, MemoryStick, MonitorSpeaker
} from 'lucide-react';
import type { HardwareInfo } from '../types';

export default function Dashboard() {
  const [models, setModels] = useState<string[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);

  const fetchStatus = async () => {
    try {
      const modelList = await invoke<string[]>('get_models');
      setModels(modelList);
    } catch (err) {
      console.error("Failed to fetch status", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    invoke<HardwareInfo>('scan_hardware').then(setHardware).catch(() => {});
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = models.length > 0;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', animation: 'fadeSlideUp 0.4s ease forwards' }}>


      {/* Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          icon={<Activity size={18} />}
          label="Backend Status"
          value="Native"
          sub="Direct IPC (Ollama)"
          status="green"
          delay={0}
        />
        <StatCard
          icon={<Server size={18} />}
          label="Ollama Engine"
          value={isOnline ? 'Active' : 'Awaiting'}
          sub={models.length > 0 ? `${models.length} model${models.length !== 1 ? 's' : ''} ready` : 'Scanning models...'}
          status={isOnline ? 'green' : 'zinc'}
          delay={60}
        />
        <StatCard
          icon={<Cpu size={18} />}
          label="Model Registry"
          value={`${models.length}`}
          sub={models.length > 0 ? 'Models indexed and ready' : 'No models pulled'}
          status={models.length > 0 ? 'blue' : 'zinc'}
          delay={120}
        />
      </div>

      {/* Hardware Panel */}
      {hardware && (
        <div style={{
          marginBottom: '28px',
          background: 'linear-gradient(160deg, rgba(30,30,33,0.8), rgba(20,20,23,0.9))',
          border: '1px solid var(--border-subtle)', borderRadius: '15px', padding: '18px 20px',
          animation: 'fadeSlideUp 0.5s ease 180ms both',
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--carbon-400)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px', fontFamily: "'DM Sans', sans-serif" }}>
            Hardware
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <HwStat icon={<Cpu size={14} />} label="CPU" value={hardware.cpu_name} sub={`${hardware.cpu_cores} cores`} />
            <HwStat
              icon={<MemoryStick size={14} />}
              label="RAM"
              value={`${hardware.available_ram_gb.toFixed(1)} GB free`}
              sub={`of ${hardware.total_ram_gb.toFixed(1)} GB total`}
              bar={1 - hardware.available_ram_gb / hardware.total_ram_gb}
              barColor="#3b82f6"
            />
            <HwStat
              icon={<MonitorSpeaker size={14} />}
              label="GPU"
              value={hardware.gpu_name}
              sub={hardware.gpu_vram_mb > 0 ? `${(hardware.gpu_vram_mb / 1024).toFixed(1)} GB VRAM` : 'No dedicated GPU'}
            />
            <HwStat
              icon={<Zap size={14} />}
              label="Offload"
              value={hardware.gpu_vram_mb > 0 ? 'GPU + CPU' : 'CPU only'}
              sub={hardware.gpu_vram_mb > 0 ? 'Hybrid inference available' : 'GPU offload unavailable'}
              color={hardware.gpu_vram_mb > 0 ? '#34d399' : '#f59e0b'}
            />
          </div>
        </div>
      )}

      {/* Model Library section */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '7px',
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <HardDrive size={14} style={{ color: '#93c5fd' }} />
            </div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
              Local Models
            </h2>
          </div>
          {models.length > 0 && (
            <span style={{
              fontSize: '0.68rem', color: 'var(--carbon-400)', fontWeight: 500
            }}>
              {models.length} detected
            </span>
          )}
        </div>

        {models.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {models.map((name, i) => (
              <ModelCard key={name} name={name} index={i} />
            ))}
          </div>
        ) : (
          <EmptyModels />
        )}
      </div>

      {/* Quick actions */}
      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontWeight: 700, color: 'var(--carbon-400)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.09em', fontSize: '0.62rem', fontFamily: "'DM Sans', sans-serif" }}>
          Quick Actions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <QuickAction
            title="Start a Chat"
            desc="Talk directly to a local model"
            to="/chat"
            color="#3b82f6"
          />
          <QuickAction
            title="Enter Arena"
            desc="Battle models side by side"
            to="/arena"
            color="#ef4444"
          />
          <QuickAction
            title="Ingest Documents"
            desc="Add to the knowledge library"
            to="/library"
            color="#22c55e"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, status, delay }: {
  icon: React.ReactNode, label: string, value: string,
  sub: string, status: 'blue' | 'green' | 'red' | 'zinc', delay: number
}) {
  const colors: Record<string, { bg: string, border: string, text: string, dot: string }> = {
    green: { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  text: '#86efac', dot: '#22c55e' },
    blue:  { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', text: '#93c5fd', dot: '#3b82f6' },
    red:   { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  text: '#fca5a5', dot: '#ef4444' },
    zinc:  { bg: 'rgba(245,245,248,0.03)',border: 'var(--border-subtle)',  text: 'var(--carbon-300)', dot: '#52525a' },
  };
  const c = colors[status];

  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(35,35,38,0.75), rgba(22,22,25,0.88))',
      border: '1px solid var(--border-subtle)',
      borderRadius: '15px',
      padding: '20px',
      animation: `fadeSlideUp 0.5s ease ${delay}ms both`,
      transition: 'all 0.3s ease',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)';
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 18px 40px rgba(0,0,0,0.45)';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)';
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--carbon-400)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          {label}
        </span>
        <div style={{
          background: c.bg, border: `1px solid ${c.border}`,
          borderRadius: '8px', padding: '6px',
          color: c.text,
        }}>
          {icon}
        </div>
      </div>

      <div style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '6px', fontFamily: "'Syne', sans-serif" }}>
        {value}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        fontSize: '0.73rem', color: c.text, fontWeight: 500,
      }}>
        <span className="status-dot status-dot-pulse" style={{ background: c.dot, flexShrink: 0 }} />
        {sub}
      </div>
    </div>
  );
}

function ModelCard({ name, index }: { name: string, index: number }) {
  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(33,33,36,0.65), rgba(20,20,23,0.82))',
      border: '1px solid var(--border-subtle)',
      borderRadius: '13px',
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: '13px',
      animation: `fadeSlideUp 0.5s ease ${index * 45}ms both`,
      transition: 'all 0.25s ease',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(59,130,246,0.28)';
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)';
      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
    }}
    >
      <div style={{
        width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0,
        background: 'rgba(59,130,246,0.1)',
        border: '1px solid rgba(59,130,246,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Zap size={15} style={{ color: '#93c5fd' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.83rem', fontWeight: 600, color: 'var(--carbon-50)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {name}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--carbon-400)', marginTop: '2px' }}>
          Local Engine
        </div>
      </div>
    </div>
  );
}

function EmptyModels() {
  return (
    <div style={{
      border: '1px dashed var(--border-default)',
      borderRadius: '16px',
      padding: '48px',
      textAlign: 'center',
      color: 'var(--text-muted)',
      animation: 'fadeSlideUp 0.4s ease 200ms both',
    }}>
      <HardDrive size={32} style={{ margin: '0 auto 14px', opacity: 0.3 }} />
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
        No models detected
      </div>
      <div style={{ fontSize: '0.8rem' }}>
        Run <code style={{
          background: 'rgba(59,110,248,0.1)', border: '1px solid rgba(59,110,248,0.15)',
          borderRadius: '4px', padding: '1px 6px', fontSize: '0.78rem', color: '#93b4ff'
        }}>ollama pull &lt;model&gt;</code> to get started
      </div>
    </div>
  );
}

function HwStat({ icon, label, value, sub, bar, barColor, color }: {
  icon: React.ReactNode, label: string, value: string, sub: string,
  bar?: number, barColor?: string, color?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'var(--text-muted)' }}>
        {icon}
        <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{
        fontSize: '0.8rem', fontWeight: 600, color: color ?? 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px',
      }}>
        {value}
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: bar !== undefined ? '6px' : 0 }}>
        {sub}
      </div>
      {bar !== undefined && (
        <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(bar * 100)}%`, background: barColor ?? '#7ba3ff', borderRadius: '2px', transition: 'width 0.5s ease' }} />
        </div>
      )}
    </div>
  );
}

function QuickAction({ title, desc, to, color }: { title: string, desc: string, to: string, color: string }) {
  const [hovered, setHovered] = useState(false);
  const r = parseInt(color.slice(1,3),16);
  const g = parseInt(color.slice(3,5),16);
  const b = parseInt(color.slice(5,7),16);

  return (
    <a
      href={`#${to}`}
      onClick={e => { e.preventDefault(); window.location.hash = to; }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        background: hovered ? `rgba(${r},${g},${b},0.06)` : 'rgba(245,245,248,0.02)',
        border: hovered ? `1px solid rgba(${r},${g},${b},0.28)` : '1px solid var(--border-subtle)',
        borderRadius: '13px', padding: '16px 18px',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered ? `0 8px 24px rgba(${r},${g},${b},0.1)` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '0.83rem', fontWeight: 600, color: hovered ? 'var(--carbon-white)' : 'var(--carbon-200)', transition: 'color 0.2s' }}>
          {title}
        </span>
        <ArrowUpRight size={14} style={{ color: hovered ? color : 'var(--carbon-500)', transition: 'color 0.2s' }} />
      </div>
      <p style={{ fontSize: '0.73rem', color: 'var(--carbon-400)', margin: 0 }}>
        {desc}
      </p>
    </a>
  );
}

