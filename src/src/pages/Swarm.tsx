import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BrainCircuit, Bot, User, Network, CheckCircle2, Loader2, Sparkles, CornerDownLeft } from 'lucide-react';
import type { WorkflowStep } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ModelSelector from '../components/ModelSelector';

interface SwarmMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  steps?: string[];
  currentStep?: string;
}

export default function Swarm() {
  const [messages, setMessages] = useState<SwarmMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      try {
        const modelList = await invoke<string[]>('get_models');
        setAvailableModels(modelList);
        if (modelList.length > 0) setSelectedModel(modelList[0]);
      } catch (err) {
        console.error("Failed to fetch models", err);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

  useEffect(() => {
    const unlisten = listen<WorkflowStep>('swarm-step', (event) => {
      const payload = event.payload;
      
      setMessages(prev => {
        const last = prev[prev.length - 1];
        const newText = payload.chunk || payload.content || '';
        
        if (last && last.role === 'assistant') {
          if (payload.status === 'done') {
            setIsTyping(false);
            return prev;
          }

          const newSteps = [...(last.steps || [])];
          if (payload.step && !newSteps.includes(payload.step)) {
            newSteps.push(payload.step);
          }

          return [
            ...prev.slice(0, -1),
            { 
              ...last, 
              content: last.content + newText,
              steps: newSteps,
              currentStep: payload.step || last.currentStep
            }
          ];
        } else {
          return [
            ...prev,
            { 
              role: 'assistant', 
              content: newText, 
              id: Date.now().toString(),
              steps: payload.step ? [payload.step] : [],
              currentStep: payload.step
            }
          ];
        }
      });

      if (payload.status === 'done') {
        setIsTyping(false);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping || !selectedModel || loadingModels) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage, id: Date.now().toString() }]);
    setInput('');
    setIsTyping(true);

    try {
      await invoke('run_swarm', { query: userMessage, model: selectedModel });
    } catch (err) {
      console.error("Swarm execution failed", err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: Failed to initiate swarm pipeline.", id: Date.now().toString() }]);
      setIsTyping(false);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '900px', margin: '0 auto',
      animation: 'fadeSlideUp 0.4s ease forwards'
    }}>
      {/* Mini control bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: '0 4px', marginBottom: '12px'
      }}>
        <ModelSelector 
          value={selectedModel} 
          options={availableModels} 
          onChange={setSelectedModel} 
          loading={loadingModels}
          color="#a1a1aa"
        />
      </div>

      {/* Chat container */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(160deg, rgba(15,15,25,0.8), rgba(8,8,15,0.9))',
        border: '1px solid var(--border-subtle)',
        borderRadius: '20px',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Accent line */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }} />

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', textAlign: 'center', padding: '40px',
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '20px', marginBottom: '16px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'floatY 4s ease-in-out infinite',
              }}>
                <BrainCircuit size={28} style={{ color: '#71717a', opacity: 0.8 }} />
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Multi-agent pipeline ready
              </div>
              <div style={{ fontSize: '0.78rem', maxWidth: '300px', lineHeight: 1.6 }}>
                Queries are routed through specialized agents — RAG retrieval, synthesis, and response generation.
              </div>

              {/* Mini pipeline diagram */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
                {[
                  { label: 'Query', icon: User, delay: 0 },
                  { label: 'Router', icon: Network, delay: 200 },
                  { label: 'RAG', icon: BrainCircuit, delay: 400 },
                  { label: 'Response', icon: Bot, delay: 600 },
                ].map((step, i) => (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {i > 0 && (
                      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}>→</div>
                    )}
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                      animation: `fadeSlideUp 0.5s ease ${step.delay}ms both`,
                    }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '9px',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <step.icon size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                      </div>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500 }}>{step.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <SwarmBubble key={msg.id} msg={msg} />
          ))}

          {isTyping && (messages.length === 0 || messages[messages.length - 1].role === 'user') && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BrainCircuit size={14} style={{ color: '#a1a1aa' }} />
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px 16px 16px 16px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#a1a1aa',
              }}>
                <Loader2 size={13} style={{ animation: 'spin-slow 1s linear infinite' }} />
                {messages[messages.length - 1]?.currentStep || "Routing through agents..."}
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{
              flex: 1,
              background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-default)',
              borderRadius: '14px', transition: 'border-color 0.2s',
            }}
            onFocusCapture={e => (e.currentTarget as unknown as HTMLElement).style.borderColor = 'rgba(59,110,247,0.4)'}
            onBlurCapture={e => (e.currentTarget as unknown as HTMLElement).style.borderColor = 'var(--border-default)'}
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={isTyping}
                placeholder="Message your local agents..."
                style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif',
                  padding: '12px 14px',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={!input.trim() || isTyping || !selectedModel || loadingModels}
              style={{
                width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                background: input.trim() && !isTyping ? 'linear-gradient(135deg, #52525b, #3f3f46)' : 'rgba(255,255,255,0.05)',
                border: '1px solid ' + (input.trim() && !isTyping ? 'rgba(255,255,255,0.2)' : 'var(--border-default)'),
                color: input.trim() && !isTyping ? 'white' : 'var(--text-muted)',
                cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: input.trim() && !isTyping ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {isTyping ? <Sparkles size={18} style={{ animation: 'pulse 1.5s infinite' }} /> : <CornerDownLeft size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SwarmBubble({ msg }: { msg: SwarmMessage }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse', alignItems: 'flex-start', animation: 'fadeSlideUp 0.3s ease forwards' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
          background: 'linear-gradient(135deg, #3b6ef8, #5b8aff)', border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          <User size={14} style={{ color: 'white' }} />
        </div>
        <div style={{
          maxWidth: '70%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px 4px 16px 16px', padding: '12px 16px',
          fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)',
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', animation: 'fadeSlideUp 0.3s ease forwards' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BrainCircuit size={14} style={{ color: '#a1a1aa' }} />
      </div>

      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {msg.steps && msg.steps.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {msg.steps.map((step, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '3px 8px', fontSize: '0.6rem', color: '#a1a1aa',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}>
                <CheckCircle2 size={10} /> {step}
              </div>
            ))}
          </div>
        )}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
          borderRadius: '4px 16px 16px 16px', padding: '12px 16px',
        }}>
          <div className="prose-chat" style={{ margin: 0 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
