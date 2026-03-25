import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  Send, Bot, User, Sparkles, RotateCcw, History, X, Trash2, Clock,
  ChevronRight, ChevronLeft
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ModelSelector from '../components/ModelSelector';
import ModelParamsPanel, { useModelConfig } from '../components/ModelParamsPanel';
import type { HardwareInfo, ModelOptions, WorkflowStep, Debate, DebateTurn } from '../types';

export default function TestingArena() {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');
  const [loadingModels, setLoadingModels] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [debateTurns, setDebateTurns] = useState<DebateTurn[]>([]);
  const [isDebating, setIsDebating] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(-1);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  
  // History state
  const [history, setHistory] = useState<Debate[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const turnsRef = useRef<DebateTurn[]>([]);
  const currentContentRef = useRef('');
  
  const configA = useModelConfig(modelA, hardware);
  const configB = useModelConfig(modelB, hardware);

  useEffect(() => {
    invoke<HardwareInfo>('scan_hardware').then(setHardware).catch(() => {});
    fetchHistory();
  }, []);

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const modelList = await invoke<string[]>('get_models');
      setAvailableModels(modelList);
      if (modelList.length >= 2) {
        if (!modelA) setModelA(modelList[0]);
        if (!modelB) setModelB(modelList[1]);
      } else if (modelList.length === 1) {
        if (!modelA) setModelA(modelList[0]);
        if (!modelB) setModelB(modelList[0]);
      }
    } catch (err) { console.error("Failed to fetch models", err); }
    finally { setLoadingModels(false); }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await invoke<Debate[]>('get_debate_history');
      // Testing 1 = 2-model debates (no model C)
      setHistory(data.filter(d => !d.modelC));
    } catch (err) { console.error("Failed to fetch history", err); }
    finally { setLoadingHistory(false); }
  };

  useEffect(() => { 
    fetchModels(); 
  }, []);

  useEffect(() => {
    turnsRef.current = debateTurns;
  }, [debateTurns]);

  useEffect(() => {
    const unlisten = listen<WorkflowStep>('raw-step', (event) => {
      const payload = event.payload;
      if (payload.status === 'streaming' || payload.chunk) {
        const chunk = payload.chunk || '';
        currentContentRef.current += chunk;
        setDebateTurns(prev => {
          if (prev.length === 0) return prev;
          const last = [...prev];
          last[last.length - 1] = { ...last[last.length - 1], content: currentContentRef.current };
          return last;
        });
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const runTurn = async (index: number, currentPrompt: string, targetModel: string, role: 'A' | 'B', turnType: DebateTurn['turnType'], config: any): Promise<string> => {
    setCurrentTurnIndex(index);
    currentContentRef.current = '';
    setDebateTurns(prev => [...prev, {
      model: targetModel, role, turnType, content: '', iteration: index + 1
    }]);

    const toOpts = (o: ModelOptions) =>
      (o.num_ctx !== null || o.num_gpu !== null || o.num_thread !== null) ? o : null;

    try {
      await invoke('run_raw', {
        query: currentPrompt,
        model: targetModel,
        conversationId: null,
        modelOptions: toOpts(config.options),
        keepAlive: "5m"
      });
    } catch (err) {
      console.error(`Turn ${index} failed`, err);
      setDebateTurns(prev => {
        const last = [...prev];
        last[last.length - 1].content = "Error: Model execution failed.";
        return last;
      });
    }
    return currentContentRef.current;
  };

  const startDebate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isDebating || !modelA || !modelB) return;

    setIsDebating(true);
    setDebateTurns([]);
    turnsRef.current = [];

    // Turn 1: Alpha Original Response
    const p1 = `You are Agent Alpha, an expert AI analyst. Answer the following question directly and thoroughly. State your position clearly.

Question: ${prompt}

Provide a structured, factual response. Do not hedge excessively. Commit to a clear answer.`;
    const res1 = await runTurn(0, p1, modelA, 'A', 'ORIGINAL', configA);

    // Turn 2: Bravo Original Response
    const p2 = `You are Agent Bravo, an expert AI analyst. Answer the following question directly and thoroughly. State your position clearly.

Question: ${prompt}

Provide a structured, factual response. Do not hedge excessively. Commit to a clear answer.`;
    const res2 = await runTurn(1, p2, modelB, 'B', 'ORIGINAL', configB);

    // Turn 3: Bravo Critiques Alpha
    const p3 = `You are Agent Bravo. You have read Agent Alpha's response to: "${prompt}"

Agent Alpha's response:
${res1}

Your own response was:
${res2}

Now critically evaluate Alpha's response. Identify:
1. Specific factual errors or logical fallacies
2. Important points Alpha missed or understated
3. Where Alpha's reasoning is weakest

Be direct and specific. Do not restate your own answer — focus entirely on critiquing Alpha's reasoning.`;
    const res3 = await runTurn(2, p3, modelB, 'B', 'CRITIQUE', configB);

    // Turn 4: Alpha Critiques Bravo
    const p4 = `You are Agent Alpha. You have read Agent Bravo's response and their critique of yours.

Original question: "${prompt}"

Bravo's response:
${res2}

Bravo's critique of you:
${res3}

Your tasks:
1. Rebut Bravo's critique — defend your position where correct, concede where they are right
2. Identify specific flaws in Bravo's own reasoning or gaps in their response
3. Be precise and cite particular claims, not vague disagreements`;
    const res4 = await runTurn(3, p4, modelA, 'A', 'CRITIQUE', configA);

    // Turn 5: Alpha Final Synthesis
    const p5 = `You are Agent Alpha. Having now heard Bravo's full response and their critique of you, synthesize your final answer.

Original question: "${prompt}"

Your original response: ${res1}
Bravo's original response: ${res2}
Bravo's critique of you: ${res3}
Your critique of Bravo: ${res4}

Now produce a refined, definitive answer that:
- Incorporates valid points raised in the debate
- Clearly states what the debate established vs. what remains uncertain
- Provides a single, coherent conclusion
Do not rehash the debate — deliver the best possible final answer.`;
    const res5 = await runTurn(4, p5, modelA, 'A', 'SYNTHESIS', configA);

    // Turn 6: Bravo Final Review
    const p6 = `You are Agent Bravo. Alpha has issued their synthesis after the full debate on: "${prompt}"

Alpha's final synthesis:
${res5}

Your role: deliver a final factual summary. Determine:
1. Which claims from the debate are well-supported vs. disputed
2. Where Alpha's synthesis is strong and where it falls short
3. A one-paragraph consensus conclusion that a neutral expert would endorse

Be objective. This is the final word on the debate.`;
    await runTurn(5, p6, modelB, 'B', 'REVIEW', configB);

    // Save — read from turnsRef to get latest state
    const finalTurns = turnsRef.current;
    try {
      await invoke('save_debate', {
        prompt,
        modelA,
        modelB,
        modelC: null,
        turns: finalTurns.map(t => ({
          model: t.model,
          role: t.role,
          turnType: t.turnType,
          content: t.content,
          iteration: t.iteration,
        }))
      });
      fetchHistory();
    } catch (err) { console.error("Failed to save debate", err); }

    setIsDebating(false);
    setCurrentTurnIndex(-1);
  };

  const loadDebate = async (debate: Debate) => {
    setLoadingModels(true);
    try {
      const turns = await invoke<DebateTurn[]>('get_debate_turns', { debateId: debate.id });
      setDebateTurns(turns);
      setPrompt(debate.prompt);
      setModelA(debate.modelA);
      setModelB(debate.modelB);
    } catch (err) { console.error("Failed to load debate turns", err); }
    finally { setLoadingModels(false); }
  };

  const deleteDebate = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await invoke('delete_debate', { debateId: id });
      setHistory(prev => prev.filter(d => d.id !== id));
    } catch (err) { console.error("Failed to delete debate", err); }
  };

  const resetDebate = () => {
    setDebateTurns([]);
    setPrompt('');
    setIsDebating(false);
    setCurrentTurnIndex(-1);
  };

  return (
    <div style={{ 
      width: '100%', maxWidth: 'none', padding: '0 24px',
      animation: 'fadeSlideUp 0.4s ease forwards',
      display: 'flex', gap: '24px', height: 'calc(100vh - 120px)',
      position: 'relative',
      paddingRight: showSidebar ? '320px' : '40px',
      transition: 'padding-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Sparkles size={20} style={{ color: '#7ba3ff' }} />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>Recursive Debate Arena</h1>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '4px 12px', borderRadius: '100px', border: '1px solid var(--border-subtle)' }}>
            6-Turn Mutual Evaluation
          </div>
        </div>

        {/* Model Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <ModelHeader label="Agent Alpha" model={modelA} models={availableModels}
            onChange={(v: string) => setModelA(v)} disabled={isDebating}
            color="#3b6ef8" active={[0, 3, 4].includes(currentTurnIndex) && isDebating} loading={loadingModels}
            config={configA} hardware={hardware} />
          <ModelHeader label="Agent Bravo" model={modelB} models={availableModels}
            onChange={(v: string) => setModelB(v)} disabled={isDebating}
            color="#a855f7" active={[1, 2, 5].includes(currentTurnIndex) && isDebating} loading={loadingModels}
            config={configB} hardware={hardware} />
        </div>

        {/* Input */}
        <div style={{
          background: 'linear-gradient(160deg, rgba(15,15,25,0.8), rgba(8,8,15,0.9))',
          border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '16px',
        }}>
          <form onSubmit={startDebate} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <User size={14} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)} disabled={isDebating || loadingModels} placeholder="Enter a topic for the mutual debate..."
                style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-default)', borderRadius: '12px', paddingLeft: '42px', paddingRight: '14px', paddingTop: '12px', paddingBottom: '12px', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none' }} />
            </div>
            <button type="submit" disabled={!prompt.trim() || isDebating || !modelA || !modelB}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '12px 20px', borderRadius: '12px', background: prompt.trim() && !isDebating ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
              {isDebating ? <RotateCcw size={16} className="animate-spin" /> : <Send size={14} />}
              {isDebating ? 'Debating...' : 'Start Debate'}
            </button>
          </form>
        </div>

        {/* Debate Feed */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
          {debateTurns.length === 0 && !isDebating ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-subtle)', borderRadius: '24px', color: 'var(--text-muted)', minHeight: '200px' }}>
              <Bot size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
              <p>Select models and start a debate to begin</p>
            </div>
          ) : (
            debateTurns.map((turn, i) => <DebateTurnCard key={i} turn={turn} isLatest={i === debateTurns.length - 1} />)
          )}
        </div>

        {!isDebating && debateTurns.length > 0 && (
          <div style={{ alignSelf: 'center' }}>
            <button onClick={resetDebate} style={{ padding: '10px 24px', borderRadius: '100px', background: 'rgba(8,8,12,0.9)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={14} /> New Debate
            </button>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '300px',
        background: 'rgba(10,10,18,0.85)', backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        transform: showSidebar ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 100, padding: '24px 20px', gap: '20px'
      }}>
        {/* Toggle */}
        <button onClick={() => setShowSidebar(!showSidebar)} style={{
          position: 'absolute', left: '-32px', top: '20px',
          width: '32px', height: '32px',
          background: 'rgba(10,10,18,0.85)', backdropFilter: 'blur(20px)',
          border: '1px solid var(--border-subtle)', borderRight: 'none',
          borderRadius: '10px 0 0 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s ease'
        }}>
          {showSidebar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={16} style={{ color: '#7ba3ff' }} />
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Debate History</h2>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '2px' }}>
          {loadingHistory ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '40px', fontSize: '0.8rem' }}>Loading...</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '40px', fontSize: '0.75rem', border: '1px dashed var(--border-default)', borderRadius: '12px', padding: '20px' }}>
              No debates yet
            </div>
          ) : (
            history.map(d => (
              <div key={d.id} onClick={() => loadDebate(d)} style={{
                padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
                border: '1px solid var(--border-subtle)', cursor: 'pointer',
                transition: 'all 0.2s ease', position: 'relative'
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '20px' }}>
                  {d.prompt}
                </div>
                <div style={{ display: 'flex', gap: '6px', fontSize: '0.65rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span style={{ color: '#3b6ef8' }}>{d.modelA}</span>
                  <span>vs</span>
                  <span style={{ color: '#a855f7' }}>{d.modelB}</span>
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={10} /> {new Date(d.timestamp).toLocaleDateString()}
                </div>
                <button onClick={(e) => deleteDebate(e, d.id)} style={{
                  position: 'absolute', right: '8px', top: '10px', background: 'none', border: 'none',
                  color: 'var(--accent-danger)', opacity: 0.5, cursor: 'pointer', transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.5'}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* New Debate Button */}
        <button onClick={resetDebate} style={{
          width: '100%', padding: '11px', borderRadius: '10px',
          background: 'var(--accent-primary)', color: 'white',
          border: 'none', fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          fontSize: '0.85rem', transition: 'opacity 0.2s'
        }}>
          <Sparkles size={15} /> New Debate
        </button>
      </div>
    </div>
  );
}

function DebateTurnCard({ turn, isLatest }: { turn: DebateTurn; isLatest: boolean }) {
  const color = turn.role === 'A' ? '#3b6ef8' : '#a855f7';
  const typeLabels: any = { 
    ORIGINAL: 'Original Response', 
    CRITIQUE: 'Analytical Critique', 
    SYNTHESIS: 'Final Synthesis', 
    REVIEW: 'Peer Review' 
  };
  return (
    <div style={{ background: 'rgba(15,15,25,0.4)', borderLeft: `3px solid ${color}`, borderRadius: '4px 16px 16px 4px', padding: '20px', animation: 'fadeSlideRight 0.4s ease forwards', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color }}>
          <span style={{ background: color, color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem' }}>{turn.turnType}</span>
          <span>{turn.role === 'A' ? 'Alpha' : 'Bravo'} — {turn.model}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>{typeLabels[turn.turnType] || turn.turnType}</span>
          {isLatest && !turn.content && <span style={{ color: '#7ba3ff', animation: 'pulse 1s infinite' }}>GENERATING...</span>}
        </div>
      </div>
      <div className="prose-chat" style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content || '...'}</ReactMarkdown>
      </div>
    </div>
  );
}

function ModelHeader({ label, model, models, onChange, disabled, color, active, loading, config, hardware }: any) {
  return (
    <div style={{ background: active ? `rgba(${hexToRgb(color)},0.08)` : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? `rgba(${hexToRgb(color)},0.25)` : 'var(--border-subtle)'}`, borderRadius: '16px', padding: '8px 12px', transition: 'all 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {active && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, animation: 'pulse-ring 1.5s ease-out infinite' }} />}
          <Bot size={14} style={{ color }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color, whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ModelSelector value={model} options={models} onChange={onChange} disabled={disabled} loading={loading} color={color} />
          {config && <ModelParamsPanel options={config.options} onChange={config.setOptions} caps={config.caps} hardware={hardware} recommended={config.recommended} loading={config.loading} color={color} />}
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  if (!hex || hex.length < 7) return '255,255,255';
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '255,255,255';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}
