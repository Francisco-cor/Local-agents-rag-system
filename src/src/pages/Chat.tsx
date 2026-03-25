import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Bot, User, Copy, CheckCheck, ChevronDown, Sparkles, Brain, CornerDownLeft, Trash2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ModelSelector from '../components/ModelSelector';
import ModelParamsPanel, { useModelConfig } from '../components/ModelParamsPanel';
import type { HardwareInfo, WorkflowStep } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  model?: string;
  timestamp?: string;
}

interface DbMessage {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  timestamp: string;
}

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [models, setModels] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantMsgRef = useRef<string>('');
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const { caps, options, setOptions, recommended, loading: capsLoading, applyRecommended } = useModelConfig(selectedModel, hardware);

  useEffect(() => {
    invoke<HardwareInfo>('scan_hardware').then(setHardware).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const modelList = await invoke<string[]>('get_models');
        setModels(modelList);
        if (modelList.length > 0 && !selectedModel) {
          setSelectedModel(modelList[0]);
        }
      } catch (err) {
        console.error("Failed to fetch models", err);
      }
    };
    fetchModels();
  }, []);

  useEffect(() => {
    if (conversationId) {
      loadHistory(parseInt(conversationId));
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  const loadHistory = async (id: number) => {
    try {
      const dbMessages = await invoke<DbMessage[]>('get_messages', { conversationId: id });
      const formattedMessages: Message[] = dbMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        id: m.id.toString(),
        timestamp: m.timestamp
      }));
      setMessages(formattedMessages);
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  useEffect(() => {
    const unlisten = listen<WorkflowStep>('raw-step', async (event) => {
      const payload = event.payload;
      
      const newText = payload.chunk || (payload.status === 'done' ? '' : payload.content) || '';
      if (!newText) {
        if (payload.status === 'done') {
          handleStreamDone();
        }
        return;
      }

      assistantMsgRef.current += newText;

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            { ...last, content: assistantMsgRef.current }
          ];
        } else {
          return [
            ...prev,
            { role: 'assistant', content: newText, model: selectedModel, id: Date.now().toString() }
          ];
        }
      });

      if (payload.status === 'done') {
        handleStreamDone();
      }
    });

    return () => {
      unlisten.then(fn => fn());
      // Reset the accumulation buffer so stale content doesn't bleed into the
      // next render cycle if the component remounts before the stream finishes.
      assistantMsgRef.current = '';
    };
  }, [selectedModel, conversationId]);

  const handleStreamDone = async () => {
    setIsStreaming(false);
    if (conversationId && assistantMsgRef.current) {
      try {
        await invoke('save_message', {
          conversationId: parseInt(conversationId),
          role: 'assistant',
          content: assistantMsgRef.current
        });
      } catch (err) {
        console.error("Failed to save assistant message", err);
      }
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !selectedModel || isStreaming) return;

    const userMessage = input.trim();
    const tempId = Date.now().toString();
    setMessages(prev => [...prev, { role: 'user', content: userMessage, id: tempId }]);
    setInput('');
    setIsStreaming(true);
    assistantMsgRef.current = '';

    let currentConvId = conversationId;

    if (!currentConvId) {
      try {
        // Asegurar que existe un contexto (Main/General)
        const folderId = await invoke<number>('ensure_default_folder');
        // Crear nueva conversación automáticamente
        const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
        const newId = await invoke<number>('create_conversation', { folderId, title, modelUsed: selectedModel });
        currentConvId = newId.toString();
        // Navegar silenciosamente (o no, pero para que se actualice la URL)
        navigate(`/chat/${newId}`, { replace: true });
      } catch (err) {
        console.error("Failed to auto-create conversation", err);
      }
    }

    if (currentConvId) {
      try {
        await invoke('save_message', {
          conversationId: parseInt(currentConvId),
          role: 'user',
          content: userMessage
        });
      } catch (err) {
        console.error("Failed to save user message", err);
      }
    }

    try {
      // Build model options — only include fields the user explicitly set
      const modelOptions = (options.num_ctx !== null || options.num_gpu !== null || options.num_thread !== null)
        ? options : null;

      await invoke('run_raw', {
        query: userMessage,
        model: selectedModel,
        conversationId: currentConvId ? parseInt(currentConvId) : null,
        modelOptions,
        keepAlive: null
      });
    } catch (err) {
      console.error("Failed to send message", err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: Failed to connect to local engine.", id: Date.now().toString() }]);
      setIsStreaming(false);
    }
  };

  const copyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{
      maxWidth: '900px', margin: '0 auto', height: 'calc(100vh - 124px)',
      display: 'flex', flexDirection: 'column', gap: '20px',
      animation: 'fadeSlideUp 0.4s ease forwards'
    }}>

      {/* Mini control bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 4px', marginBottom: '-8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ModelSelector
            value={selectedModel}
            options={models}
            onChange={setSelectedModel}
            color="#7ba3ff"
          />
          <ModelParamsPanel
            options={options}
            onChange={setOptions}
            caps={caps}
            hardware={hardware}
            recommended={recommended}
            loading={capsLoading}
            color="#7ba3ff"
          />
        </div>

        <button
          onClick={() => setMessages([])}
          title="Clear chat view"
          style={{
            width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '8px', border: '1px solid var(--border-subtle)',
            background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)';
            (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Chat container */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(160deg, rgba(15,15,25,0.8), rgba(8,8,15,0.9))',
        border: '1px solid var(--border-subtle)',
        borderRadius: '20px',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={e => {
            const el = e.currentTarget;
            setShowScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 100);
          }}
          style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          {messages.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', textAlign: 'center'
            }}>
              <Brain size={48} style={{ marginBottom: '20px', opacity: 0.2 }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                How can I help you today?
              </h2>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px' }}>
                {conversationId ? "History loaded. Continue the conversation." : "Select a conversation or start a new one."}
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={m.id || i}
                style={{
                  display: 'flex', gap: '16px',
                  flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                  animation: 'fadeSlideUp 0.3s ease forwards'
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(59,110,248,0.1)',
                  border: '1px solid rgba(59,110,248,0.2)',
                  marginTop: '4px'
                }}>
                  {m.role === 'user' ? <User size={14} style={{ color: '#3b6ef8' }} /> : <Bot size={14} style={{ color: '#7ba3ff' }} />}
                </div>

                <div style={{ maxWidth: '80%', position: 'relative' }}>
                  <div style={{
                    padding: '14px 18px', borderRadius: '14px',
                    background: m.role === 'user' ? 'rgba(59,110,248,0.05)' : 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    {m.role === 'assistant' && (m.model || m.timestamp) && (
                      <div style={{
                        position: 'absolute', top: '-18px', left: '0',
                        fontSize: '0.6rem', fontWeight: 700, color: '#7ba3ff',
                        textTransform: 'uppercase', letterSpacing: '0.05em'
                      }}>
                        {m.model || `Message history (${m.timestamp})`}
                      </div>
                    )}
                    <div className="prose-chat">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {m.role === 'assistant' && (
                    <button
                      onClick={() => copyMessage(m.content, m.id)}
                      style={{
                        position: 'absolute', top: '8px', right: '-36px',
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-default)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {copiedId === m.id ? <CheckCheck size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          {isStreaming && (messages.length === 0 || messages[messages.length - 1].role === 'user') && (
            <div style={{ display: 'flex', gap: '16px', animation: 'fadeSlideUp 0.3s ease forwards' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
              }}>
                <Bot size={14} style={{ color: '#10b981' }} />
              </div>
              <div style={{
                padding: '14px 18px', borderRadius: '14px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
                display: 'flex', gap: '6px', alignItems: 'center'
              }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7ba3ff', animation: 'bounce 1s infinite' }} />
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7ba3ff', animation: 'bounce 1s infinite 0.2s' }} />
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7ba3ff', animation: 'bounce 1s infinite 0.4s' }} />
              </div>
            </div>
          )}
        </div>

        {/* Scroll down button */}
        {showScrollDown && (
          <button
            onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
            style={{
              position: 'absolute', bottom: '100px', right: '20px',
              width: '34px', height: '34px', borderRadius: '50%',
              background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#818cf8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)', animation: 'scaleIn 0.2s ease forwards', zIndex: 10
            }}
          >
            <ChevronDown size={16} />
          </button>
        )}

        {/* Input wrapper */}
        <div style={{
          padding: '16px', borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <form
            onSubmit={handleSendMessage}
            style={{
              position: 'relative',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-default)',
              borderRadius: '16px',
              padding: '4px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center'
            }}
            onFocusCapture={e => (e.currentTarget as unknown as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'}
            onBlurCapture={e => (e.currentTarget as unknown as HTMLElement).style.borderColor = 'var(--border-default)'}
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={selectedModel ? `Message ${selectedModel}...` : "Select a model to start chat..."}
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                padding: '12px 16px', color: 'var(--text-primary)',
                fontSize: '0.9rem', outline: 'none', resize: 'none',
                maxHeight: '200px'
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || !selectedModel || isStreaming}
              style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: input.trim() && !isStreaming ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                border: 'none', color: 'white', cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease', margin: '2px'
              }}
            >
              {isStreaming ? (
                <Sparkles size={18} style={{ animation: 'pulse 1.5s infinite' }} />
              ) : (
                <CornerDownLeft size={18} />
              )}
            </button>
          </form>
          <div style={{
            marginTop: '10px', display: 'flex', justifyContent: 'center',
            fontSize: '0.65rem', color: 'var(--text-muted)', gap: '12px'
          }}>
            <span><strong>Shift + Enter</strong> for new line</span>
            <span><strong>Enter</strong> to send</span>
          </div>
        </div>
      </div>
    </div>
  );
}
