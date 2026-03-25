import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  Send, Bot, User, Sparkles, RotateCcw, History, Trash2, Clock,
  ShieldCheck, ChevronRight, ChevronLeft, Layout, Copy, CheckCheck
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ModelSelector from '../components/ModelSelector';
import ModelParamsPanel, { useModelConfig } from '../components/ModelParamsPanel';
import type { HardwareInfo, ModelOptions, WorkflowStep, Debate, DebateTurn } from '../types';

export default function TestingArena2() {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');
  const [modelC, setModelC] = useState('');
  const [loadingModels, setLoadingModels] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [debateTurns, setDebateTurns] = useState<DebateTurn[]>([]);
  const [isDebating, setIsDebating] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(-1);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  
  const [history, setHistory] = useState<Debate[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const turnsRef = useRef<DebateTurn[]>([]);
  const currentContentRef = useRef('');
  
  const configA = useModelConfig(modelA, hardware);
  const configB = useModelConfig(modelB, hardware);
  const configC = useModelConfig(modelC, hardware);

  useEffect(() => {
    invoke<HardwareInfo>('scan_hardware').then(setHardware).catch(() => {});
    fetchHistory();
  }, []);

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const modelList = await invoke<string[]>('get_models');
      setAvailableModels(modelList);
      if (modelList.length >= 3) {
        if (!modelA) setModelA(modelList[0]);
        if (!modelB) setModelB(modelList[1]);
        if (!modelC) setModelC(modelList[2]);
      } else {
        if (!modelA) setModelA(modelList[0] || '');
        if (!modelB) setModelB(modelList[0] || '');
        if (!modelC) setModelC(modelList[0] || '');
      }
    } catch (err) { console.error("Failed to fetch models", err); }
    finally { setLoadingModels(false); }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await invoke<Debate[]>('get_debate_history');
      setHistory(data.filter(d => d.modelC));
    } catch (err) { console.error("Failed to fetch history", err); }
    finally { setLoadingHistory(false); }
  };

  useEffect(() => { fetchModels(); }, []);

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

  const runTurn = async (index: number, currentPrompt: string, targetModel: string, role: 'A' | 'B' | 'Charlie', turnType: any, config: any): Promise<string> => {
    setCurrentTurnIndex(index);
    currentContentRef.current = '';
    setDebateTurns(prev => [...prev, {
      model: targetModel, role: role as any, turnType, content: '', iteration: index + 1
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
    if (!prompt.trim() || isDebating || !modelA || !modelB || !modelC) return;

    setIsDebating(true);
    setDebateTurns([]);
    turnsRef.current = [];

    // Turn 1: Alpha Original
    const p1 = `You are Agent Alpha, an expert analyst. Provide a direct, structured answer to the following question. State your conclusions clearly without excessive hedging.

Question: ${prompt}

Give your best answer with supporting reasoning. Be specific and factual.`;
    const res1 = await runTurn(0, p1, modelA, 'A', 'ORIGINAL', configA);

    // Turn 2: Bravo Original
    const p2 = `You are Agent Bravo, an expert analyst. Provide a direct, structured answer to the following question. State your conclusions clearly without excessive hedging.

Question: ${prompt}

Give your best answer with supporting reasoning. Be specific and factual.`;
    const res2 = await runTurn(1, p2, modelB, 'B', 'ORIGINAL', configB);

    // Turn 3: Charlie Initial Evaluation (impartial)
    const p3 = `You are Charlie, an impartial expert fact-checker and evaluator. Two AI agents have answered the following question:

Question: "${prompt}"

Agent Alpha's answer:
${res1}

Agent Bravo's answer:
${res2}

Evaluate both responses objectively. For each:
1. Identify specific factual errors or logical weaknesses
2. Note what they got right
3. Highlight what important aspects each missed

Give a balanced assessment. Do not declare a winner yet — this is a preliminary evaluation to inform the debate.`;
    const res3 = await runTurn(2, p3, modelC, 'Charlie', 'CRITIQUE', configC);

    // Turn 4: Bravo Critiques Alpha (informed by Charlie's eval)
    const p4 = `You are Agent Bravo. You have read Alpha's response and Charlie's preliminary evaluation.

Question: "${prompt}"

Alpha's response:
${res1}

Charlie's evaluation of both responses:
${res3}

Your task: Critically challenge Alpha's specific claims. Where does Alpha's reasoning fail? What did Alpha overlook or misstate? Use Charlie's evaluation as additional context, but form your own critique. Be precise and cite specific parts of Alpha's response.`;
    const res4 = await runTurn(3, p4, modelB, 'B', 'CRITIQUE', configB);

    // Turn 5: Alpha Critiques Bravo
    const p5 = `You are Agent Alpha. You have read Bravo's response and their critique of you.

Question: "${prompt}"

Bravo's response:
${res2}

Bravo's critique of you:
${res4}

Your task:
1. Rebut Bravo's critique — defend valid points, concede where they are right
2. Identify specific weaknesses in Bravo's reasoning or factual gaps in their original response
3. Be precise. Point to specific claims, not vague disagreements.`;
    const res5 = await runTurn(4, p5, modelA, 'A', 'CRITIQUE', configA);

    // Turn 6: Charlie Final Verdict
    const p6 = `You are Charlie, the Final Judge. A full debate has concluded on the topic: "${prompt}"

Here is the complete record:
1. Alpha's Original: ${res1}
2. Bravo's Original: ${res2}
3. Your Preliminary Evaluation: ${res3}
4. Bravo's Critique of Alpha: ${res4}
5. Alpha's Critique of Bravo: ${res5}

Deliver your final verdict:
- Which position had stronger factual support and logical consistency?
- Which critiques were most valid?
- What is the most defensible answer to the original question?
- Provide a clear, structured summary a neutral expert would endorse.

Be decisive. Declare which agent performed better overall or call a draw with explanation.`;
    await runTurn(5, p6, modelC, 'Charlie', 'SYNTHESIS', configC);

    // Save debate
    const finalTurns = turnsRef.current;
    try {
      await invoke('save_debate', {
        prompt, modelA, modelB, modelC,
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
      if (debate.modelC) setModelC(debate.modelC);
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
            <ShieldCheck size={20} style={{ color: '#10b981' }} />
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>Judged Debate Arena</h1>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '4px 12px', borderRadius: '100px', border: '1px solid var(--border-subtle)' }}>
            6-Turn Debate — Judged by Charlie
          </div>
        </div>

        {/* Input */}
        <div style={{ background: 'linear-gradient(160deg, rgba(15,15,25,0.8), rgba(8,8,15,0.9))', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '16px' }}>
          <form onSubmit={startDebate} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <User size={14} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)} disabled={isDebating} placeholder="Topic for the 3-model judged debate..."
                style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-default)', borderRadius: '12px', paddingLeft: '42px', paddingRight: '14px', height: '44px', color: 'var(--text-primary)', outline: 'none', fontSize: '0.875rem' }} />
            </div>
            <button type="submit" disabled={!prompt.trim() || isDebating || !modelA || !modelB || !modelC}
              style={{ padding: '0 24px', height: '44px', borderRadius: '12px', background: prompt.trim() && !isDebating ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isDebating ? <RotateCcw size={16} className="animate-spin" /> : <Send size={14} />}
              {isDebating ? 'Debating...' : 'Start Debate'}
            </button>
          </form>
        </div>

        {/* 3 Columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
          <Column label="Alpha" model={modelA} models={availableModels} onChange={setModelA}
            turns={debateTurns.filter(t => t.role === 'A')} color="#3b6ef8"
            isGenerating={isDebating && (currentTurnIndex === 0 || currentTurnIndex === 4)}
            config={configA} hardware={hardware} loading={loadingModels} />
          <Column label="Bravo" model={modelB} models={availableModels} onChange={setModelB}
            turns={debateTurns.filter(t => t.role === 'B')} color="#a855f7"
            isGenerating={isDebating && (currentTurnIndex === 1 || currentTurnIndex === 3)}
            config={configB} hardware={hardware} loading={loadingModels} />
          <Column label="Charlie (Judge)" model={modelC} models={availableModels} onChange={setModelC}
            turns={debateTurns.filter(t => t.role === 'Charlie')} color="#10b981"
            isGenerating={isDebating && (currentTurnIndex === 2 || currentTurnIndex === 5)}
            config={configC} hardware={hardware} loading={loadingModels} />
        </div>
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
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', border: '1px dashed var(--border-default)', borderRadius: '12px', padding: '20px' }}>
              No debates yet
            </div>
          ) : (
            history.map(d => (
              <div key={d.id} onClick={() => loadDebate(d)} style={{
                padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative'
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '20px' }}>{d.prompt}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: '#3b6ef8' }}>{d.modelA}</span>
                  <span>·</span>
                  <span style={{ color: '#a855f7' }}>{d.modelB}</span>
                  <span>·</span>
                  <span style={{ color: '#10b981' }}>{d.modelC}</span>
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

        {/* New Debate */}
        <button onClick={resetDebate} style={{
          width: '100%', padding: '11px', borderRadius: '10px',
          background: 'var(--accent-primary)', color: 'white',
          border: 'none', fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          fontSize: '0.85rem'
        }}>
          <Sparkles size={15} /> New Debate
        </button>
      </div>
    </div>
  );
}

function Column({ label, model, models, onChange, turns, color, isGenerating, config, hardware, loading }: any) {
  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden',
      background: 'rgba(15,15,25,0.4)', borderRadius: '20px', border: '1px solid var(--border-subtle)', padding: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={14} style={{ color }} />
          <span style={{ fontWeight: 700, color, fontSize: '0.8rem' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ModelSelector value={model} options={models} onChange={onChange} disabled={false} loading={loading} color={color} />
          {config && <ModelParamsPanel options={config.options} onChange={config.setOptions} caps={config.caps} hardware={hardware} recommended={config.recommended} loading={config.loading} color={color} />}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {turns.length === 0 && !isGenerating ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.1 }}><Layout size={40} /></div>
        ) : (
          turns.map((turn: any, i: number) => <TurnCard key={i} turn={turn} color={color} />)
        )}
        {isGenerating && (!turns.length || turns[turns.length-1].content) && (
          <div style={{ display: 'flex', gap: '4px', padding: '12px' }}>
            {[0,150,300].map(d => <div key={d} style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, animation: `bounce 1s infinite ${d}ms` }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function TurnCard({ turn, color }: any) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(turn.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const typeLabels: any = { ORIGINAL: 'Original', CRITIQUE: 'Critique', SYNTHESIS: 'Final Verdict', REVIEW: 'Review' };
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '12px', borderLeft: `2px solid ${color}`, position: 'relative' }}>
      <button onClick={handleCopy} style={{ position: 'absolute', right: '8px', top: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
        {copied ? <CheckCheck size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
      </button>
      <div style={{ fontSize: '0.55rem', fontWeight: 800, color: color, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {typeLabels[turn.turnType] || turn.turnType}
      </div>
      <div className="prose-chat" style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content || '...'}</ReactMarkdown>
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
