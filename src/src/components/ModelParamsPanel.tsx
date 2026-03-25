import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Cpu, Zap, Layers, Sparkles } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

import type { HardwareInfo, ModelOptions, ModelCapabilities } from '../types';

// Context window options (powers of 2, up to model max)
const CTX_OPTIONS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];

// ─── Recommendation logic ─────────────────────────────────────────────────────

function computeRecommended(caps: ModelCapabilities | null, hw: HardwareInfo | null): ModelOptions {
  if (!caps || !hw) return { num_ctx: null, num_gpu: null, num_thread: null };

  const vramGb = hw.gpu_vram_mb / 1024;
  const { num_layers, max_context, size_gb } = caps;

  let num_gpu = 0;
  if (vramGb >= 2) {
    if (size_gb <= vramGb * 0.85) {
      num_gpu = num_layers; // fits entirely in VRAM
    } else {
      num_gpu = Math.max(1, Math.floor((vramGb * 0.85 / size_gb) * num_layers));
    }
  }

  const fullyOnGpu = num_gpu >= num_layers;
  const targetCtx = fullyOnGpu ? 8192 : 2048;
  const num_ctx = CTX_OPTIONS.filter(c => c <= max_context).reverse().find(c => c <= targetCtx) ?? 2048;

  return { num_ctx, num_gpu, num_thread: null };
}

// ─── Hook: fetch hardware + model caps, compute recommendation ────────────────

export function useModelConfig(model: string, hardware: HardwareInfo | null) {
  const [caps, setCaps] = useState<ModelCapabilities | null>(null);
  const [options, setOptions] = useState<ModelOptions>({ num_ctx: null, num_gpu: null, num_thread: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!model) { setCaps(null); return; }
    setLoading(true);
    invoke<ModelCapabilities>('get_model_capabilities', { model })
      .then(c => { setCaps(c); })
      .catch(() => setCaps(null))
      .finally(() => setLoading(false));
  }, [model]);

  const recommended = computeRecommended(caps, hardware);

  const applyRecommended = () => setOptions(recommended);

  return { caps, options, setOptions, recommended, loading, applyRecommended };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ModelParamsPanelProps {
  options: ModelOptions;
  onChange: (opts: ModelOptions) => void;
  caps: ModelCapabilities | null;
  hardware: HardwareInfo | null;
  recommended: ModelOptions;
  loading?: boolean;
  color?: string;
}

export default function ModelParamsPanel({
  options, onChange, caps, hardware, recommended, loading = false, color = '#7ba3ff',
}: ModelParamsPanelProps) {
  const [open, setOpen] = useState(false);

  const vramGb = hardware ? hardware.gpu_vram_mb / 1024 : 0;
  const maxLayers = caps?.num_layers ?? 32;
  const maxCtxOptions = caps
    ? CTX_OPTIONS.filter(c => c <= caps.max_context)
    : CTX_OPTIONS.slice(0, 5);

  const gpuLayers = options.num_gpu ?? recommended.num_gpu ?? 0;
  const ctxValue = options.num_ctx ?? recommended.num_ctx ?? 2048;
  const threads = options.num_thread ?? null;

  const isDefault = options.num_ctx === null && options.num_gpu === null && options.num_thread === null;
  const hasChanges = !isDefault;

  const gpuPct = maxLayers > 0 ? Math.round((gpuLayers / maxLayers) * 100) : 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Configure model parameters"
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '5px 10px', borderRadius: '8px',
          background: hasChanges ? `rgba(${hexToRgb(color)},0.12)` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${hasChanges ? `rgba(${hexToRgb(color)},0.3)` : 'var(--border-subtle)'}`,
          color: hasChanges ? color : 'var(--text-muted)',
          fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
        }}
      >
        <Layers size={12} />
        {loading ? 'Loading...' : hasChanges ? 'Custom' : 'Params'}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 200,
          width: '300px',
          background: 'linear-gradient(160deg, rgba(18,18,28,0.98), rgba(10,10,18,0.99))',
          border: `1px solid rgba(${hexToRgb(color)},0.2)`,
          borderRadius: '14px', padding: '16px',
          boxShadow: `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(${hexToRgb(color)},0.05)`,
          backdropFilter: 'blur(20px)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Model Parameters
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {hasChanges && (
                <button
                  onClick={() => onChange({ num_ctx: null, num_gpu: null, num_thread: null })}
                  style={miniBtn}
                >
                  Reset
                </button>
              )}
              <button
                onClick={() => onChange(recommended)}
                style={{ ...miniBtn, background: `rgba(${hexToRgb(color)},0.15)`, color, borderColor: `rgba(${hexToRgb(color)},0.3)` }}
              >
                <Sparkles size={10} /> Auto
              </button>
            </div>
          </div>

          {/* Hardware summary */}
          {hardware && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px',
              marginBottom: '14px', padding: '10px',
              background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
            }}>
              <HwChip icon={<Cpu size={10} />} label="RAM" value={`${hardware.available_ram_gb.toFixed(1)}/${hardware.total_ram_gb.toFixed(1)} GB`} />
              <HwChip icon={<Zap size={10} />} label="VRAM" value={vramGb > 0 ? `${vramGb.toFixed(1)} GB` : 'None'} />
            </div>
          )}

          {/* Context window */}
          <ParamRow label="Context Window" hint={`Max: ${caps?.max_context?.toLocaleString() ?? '?'} tokens`}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {maxCtxOptions.map(c => (
                <button
                  key={c}
                  onClick={() => onChange({ ...options, num_ctx: c === ctxValue && options.num_ctx !== null ? null : c })}
                  style={{
                    ...ctxBtn,
                    background: ctxValue === c && options.num_ctx !== null
                      ? `rgba(${hexToRgb(color)},0.2)` : 'rgba(255,255,255,0.04)',
                    color: ctxValue === c && options.num_ctx !== null ? color : 'var(--text-muted)',
                    borderColor: ctxValue === c && options.num_ctx !== null
                      ? `rgba(${hexToRgb(color)},0.4)` : 'var(--border-subtle)',
                  }}
                >
                  {c >= 1024 ? `${c / 1024}k` : c}
                </button>
              ))}
            </div>
            {options.num_ctx === null && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Using model default ({recommended.num_ctx?.toLocaleString() ?? 'auto'} recommended)
              </div>
            )}
          </ParamRow>

          {/* GPU Offloading */}
          <ParamRow
            label="GPU Layers"
            hint={caps ? `${gpuLayers} / ${maxLayers} layers (${gpuPct}% GPU)` : 'Loading...'}
          >
            {caps ? (
              <>
                <input
                  type="range"
                  min={0}
                  max={maxLayers}
                  value={gpuLayers}
                  onChange={e => onChange({ ...options, num_gpu: parseInt(e.target.value) })}
                  style={{ width: '100%', accentColor: color, cursor: 'pointer', marginBottom: '6px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  <span>CPU only (0)</span>
                  {gpuPct > 0 && gpuPct < 100 && (
                    <span style={{ color: '#f59e0b' }}>Hybrid ({gpuPct}%)</span>
                  )}
                  {gpuPct === 100 && <span style={{ color: '#34d399' }}>Full GPU</span>}
                  <span>Full GPU ({maxLayers})</span>
                </div>
                {vramGb === 0 && (
                  <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '4px' }}>
                    No GPU detected — CPU-only mode
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Select a model to configure GPU layers
              </div>
            )}
          </ParamRow>

          {/* CPU Threads */}
          <ParamRow label="CPU Threads" hint={`Available: ${hardware?.cpu_cores ?? '?'} cores`}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={() => onChange({ ...options, num_thread: null })}
                style={{
                  ...ctxBtn,
                  background: threads === null ? `rgba(${hexToRgb(color)},0.2)` : 'rgba(255,255,255,0.04)',
                  color: threads === null ? color : 'var(--text-muted)',
                  borderColor: threads === null ? `rgba(${hexToRgb(color)},0.4)` : 'var(--border-subtle)',
                }}
              >
                Auto
              </button>
              {hardware && [
                Math.max(1, Math.floor(hardware.cpu_cores / 4)),
                Math.max(1, Math.floor(hardware.cpu_cores / 2)),
                hardware.cpu_cores,
              ].filter((v, i, arr) => arr.indexOf(v) === i).map(n => (
                <button
                  key={n}
                  onClick={() => onChange({ ...options, num_thread: n === threads ? null : n })}
                  style={{
                    ...ctxBtn,
                    background: threads === n ? `rgba(${hexToRgb(color)},0.2)` : 'rgba(255,255,255,0.04)',
                    color: threads === n ? color : 'var(--text-muted)',
                    borderColor: threads === n ? `rgba(${hexToRgb(color)},0.4)` : 'var(--border-subtle)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </ParamRow>

          {/* Model info */}
          {caps && (
            <div style={{
              marginTop: '10px', padding: '8px 10px',
              background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.65rem', color: 'var(--text-muted)',
              display: 'flex', gap: '12px', flexWrap: 'wrap',
            }}>
              <span>{caps.architecture}</span>
              <span>{caps.parameter_size}</span>
              <span>{caps.quantization}</span>
              <span>{caps.size_gb.toFixed(2)} GB</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ParamRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
        {hint && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function HwChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const miniBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 600,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)', cursor: 'pointer',
};

const ctxBtn: React.CSSProperties = {
  padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 600,
  border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
};

function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return '255,255,255';
  return `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}`;
}
