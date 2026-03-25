import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  ThumbsUp, Send, Trophy, Bot, User, Crown, Sparkles, 
  RotateCcw, History, ChevronRight, ChevronLeft, Calendar,
  Copy, CheckCheck
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ModelSelector from '../components/ModelSelector';
import ModelParamsPanel, { useModelConfig } from '../components/ModelParamsPanel';
import type { HardwareInfo, ModelOptions, ModelCapabilities, WorkflowStep, ModelRating, ArenaBattle } from '../types';

export default function Arena() {
  const [leaderboard, setLeaderboard] = useState<ModelRating[]>([]);
  const [battleHistory, setBattleHistory] = useState<ArenaBattle[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');
  const [loadingModels, setLoadingModels] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [responseA, setResponseA] = useState('');
  const [responseB, setResponseB] = useState('');
  const [isBattling, setIsBattling] = useState(false);
  const [battleComplete, setBattleComplete] = useState(false);
  const [currentGenerating, setCurrentGenerating] = useState<'A' | 'B' | 'none'>('none');
  const [winner, setWinner] = useState<'A' | 'B' | 'tie' | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [copiedA, setCopiedA] = useState(false);
  const [copiedB, setCopiedB] = useState(false);
  const [modelC, setModelC] = useState('');
  const [responseC, setResponseC] = useState('');
  const [isJudging, setIsJudging] = useState(false);
  const [copiedC, setCopiedC] = useState(false);
  
  const resARef = useRef('');
  const resBRef = useRef('');
  
  const configA = useModelConfig(modelA, hardware);
  const configB = useModelConfig(modelB, hardware);
  const configC = useModelConfig(modelC, hardware);

  useEffect(() => {
    invoke<HardwareInfo>('scan_hardware').then(setHardware).catch(() => {});
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const data = await invoke<ModelRating[]>('get_leaderboard');
      setLeaderboard(data);
    } catch (err) { console.error("Failed to fetch leaderboard", err); }
  };

  const fetchHistory = async () => {
    try {
      const data = await invoke<ArenaBattle[]>('get_arena_history');
      console.log("DB: History fetched", data.length, "items");
      setBattleHistory(data);
    } catch (err) { console.error("Failed to fetch history", err); }
  };

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

  useEffect(() => { 
    fetchLeaderboard(); 
    fetchModels(); 
    fetchHistory();
  }, []);

  useEffect(() => {
    const unlisten = listen<WorkflowStep>('battle-step', (event) => {
      const payload = event.payload;
      
      if (payload.status === 'streaming') {
        if (payload.model === modelA) { 
          const chunk = payload.chunk || '';
          setResponseA(p => p + chunk); 
          resARef.current += chunk;
          setCurrentGenerating('A'); 
        } else if (payload.model === modelB) { 
          const chunk = payload.chunk || '';
          setResponseB(p => p + chunk); 
          resBRef.current += chunk;
          setCurrentGenerating('B'); 
        }
      } else if (payload.status === 'done') {
        setIsBattling(false); 
        setBattleComplete(true); 
        setCurrentGenerating('none');
        
        if (modelC) {
          console.log("Arena: Triggering judge...");
          handleJudge(prompt, resARef.current, resBRef.current);
        }
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [modelA, modelB, modelC, prompt]); // prompt is needed here only if handleJudge uses it from state

  useEffect(() => {
    const unlisten = listen<WorkflowStep>('raw-step', (event) => {
      const payload = event.payload;
      if (isJudging && payload.model === modelC) {
        if (payload.status === 'streaming' || payload.chunk) {
          setResponseC(p => p + (payload.chunk || ''));
        } else if (payload.status === 'done') {
          setIsJudging(false);
        }
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [isJudging, modelC]);

  const resetBattle = () => {
    setResponseA(''); setResponseB(''); setResponseC('');
    resARef.current = ''; resBRef.current = '';
    setPrompt(''); setWinner(null);
    setBattleComplete(false); setCurrentGenerating('none');
    setIsJudging(false);
  };

  const handleBattle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isBattling || !modelA || !modelB) return;

    setResponseA(''); setResponseB(''); setResponseC('');
    resARef.current = ''; resBRef.current = '';
    setIsBattling(true); setBattleComplete(false); setIsJudging(false);
    setCurrentGenerating('A'); setWinner(null);

    const toOpts = (o: ModelOptions) =>
      (o.num_ctx !== null || o.num_gpu !== null || o.num_thread !== null) ? o : null;

    try {
      await invoke('run_battle', {
        query: prompt, modelA, modelB,
        optionsA: toOpts(configA.options),
        optionsB: toOpts(configB.options),
      });
    } catch (err) {
      console.error("Battle execution failed", err);
      setIsBattling(false); setCurrentGenerating('none');
    }
  };

  const handleVote = async (outcome: string) => {
    setLoading(true);
    setWinner(outcome as 'A' | 'B' | 'tie');
    try {
      await invoke('record_battle', { modelA: modelA, modelB: modelB, outcome });
      console.log("DB: Saving arena battle...", { prompt, modelA, modelB, winner: outcome });
      await invoke('save_arena_battle', {
        prompt,
        modelA,
        modelB,
        modelC: modelC || null,
        responseA: resARef.current || responseA,
        responseB: resBRef.current || responseB,
        responseC: responseC || null, // Judge might still be generating, but we save what we have
        winner: outcome
      });
      console.log("DB: Save successful");
      await fetchLeaderboard();
      await fetchHistory();
      
      setTimeout(() => {
        setBattleComplete(false); 
        setResponseA(''); 
        setResponseB(''); 
        setPrompt('');
        setWinner(null);
      }, 1500);
    } catch (err) { console.error("Failed to record vote", err); }
    finally { setLoading(false); }
  };
  const handleCopy = async (text: string, side: 'A' | 'B' | 'C') => {
    try {
      await navigator.clipboard.writeText(text);
      if (side === 'A') {
        setCopiedA(true);
        setTimeout(() => setCopiedA(false), 2000);
      } else if (side === 'B') {
        setCopiedB(true);
        setTimeout(() => setCopiedB(false), 2000);
      } else {
        setCopiedC(true);
        setTimeout(() => setCopiedC(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const handleJudge = async (prompt_text: string, resA: string, resB: string) => {
    if (!modelC) return;
    setIsJudging(true);
    setResponseC('');
    
    const judgePrompt = `You are an impartial judge. Your task is to evaluate the responses provided by two different AI models (Alpha and Bravo) to the same user prompt.

User Prompt:
${prompt_text}

Response Alpha:
${resA}

Response Bravo:
${resB}

Analyze both responses based on accuracy, completeness, tone, and helpfulness. 
Provide a clear verdict on which model performed better, or if it was a tie. 
Structure your response briefly and clearly.`;

    try {
      const toOpts = (o: ModelOptions) =>
        (o.num_ctx !== null || o.num_gpu !== null || o.num_thread !== null) ? o : null;

      await invoke('run_raw', {
        query: judgePrompt,
        model: modelC,
        conversationId: null,
        modelOptions: toOpts(configC.options),
        keepAlive: "0"
      });
    } catch (err) {
      console.error("Judging failed", err);
      setIsJudging(false);
    }
  };


  return (
    <div style={{ 
      width: '100%', 
      maxWidth: 'none',
      padding: '0 24px',
      animation: 'fadeSlideUp 0.4s ease forwards',
      display: 'flex',
      gap: '24px',
      height: 'calc(100vh - 120px)',
      position: 'relative',
      paddingRight: showSidebar ? '320px' : '40px',
      transition: 'padding-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>

      {/* Main Battle Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, overflowY: 'auto', paddingRight: '4px' }}>
        {/* Prompt input */}
        <div style={{
          background: 'linear-gradient(160deg, rgba(15,15,25,0.8), rgba(8,8,15,0.9))',
          border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '16px',
        }}>
          <form onSubmit={handleBattle} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <User size={14} style={{
                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none'
              }} />
              <input
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                disabled={isBattling || loadingModels || availableModels.length === 0}
                placeholder={loadingModels ? "Scanning models..." : availableModels.length === 0 ? "No models detected. Pull a model to start." : "Enter a prompt to battle the models..."}
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-default)', borderRadius: '12px',
                  paddingLeft: '42px', paddingRight: '14px', paddingTop: '12px', paddingBottom: '12px',
                  color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.3)'}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border-default)'}
              />
            </div>
            <button
              type="submit"
              disabled={!prompt.trim() || isBattling}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '12px 20px', borderRadius: '12px', flexShrink: 0,
                background: prompt.trim() && !isBattling
                  ? 'linear-gradient(135deg, #52525b, #3f3f46)'
                  : 'rgba(255,255,255,0.05)',
                border: '1px solid ' + (prompt.trim() && !isBattling ? 'rgba(255,255,255,0.2)' : 'var(--border-subtle)'),
                color: prompt.trim() && !isBattling ? 'white' : 'var(--text-muted)',
                fontSize: '0.82rem', fontWeight: 700, cursor: prompt.trim() && !isBattling ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                boxShadow: prompt.trim() && !isBattling ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {isBattling ? <Sparkles size={16} style={{ animation: 'pulse 1.5s infinite' }} /> : <Send size={14} />}
              {isBattling ? 'Battling...' : 'Start Battle'}
            </button>
          </form>
        </div>

        {/* VS Header */}
        <div style={{ display: 'grid', gridTemplateColumns: modelC ? '1fr auto 1fr auto 1fr' : '1fr auto 1fr', gap: '12px', alignItems: 'center' }}>
          <ModelHeader label="Alpha" model={modelA} models={availableModels}
            onChange={(v: string) => setModelA(v)} disabled={isBattling}
            color="#3b6ef8" active={currentGenerating === 'A'} loading={loadingModels}
            config={configA} hardware={hardware} />
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 800, color: '#a1a1aa',
          }}>
            VS
          </div>
          <ModelHeader label="Bravo" model={modelB} models={availableModels}
            onChange={(v: string) => setModelB(v)} disabled={isBattling}
            color="#3b6ef8" active={currentGenerating === 'B'} loading={loadingModels}
            config={configB} hardware={hardware} />
          
          {modelC && (
            <>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.02)', border: '2px solid rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 800, color: '#a1a1aa',
                opacity: 0.5
              }}>
                BY
              </div>
              <ModelHeader label="Judge" model={modelC} models={availableModels}
                onChange={(v: string) => setModelC(v)} disabled={isBattling || isJudging}
                color="#7ba3ff" active={isJudging} loading={loadingModels}
                config={configC} hardware={hardware} />
            </>
          )}

          {!modelC && (
             <button 
              onClick={() => setModelC(availableModels[0] || '')}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '16px', padding: '8px 16px',
                color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer'
              }}
             >
               + Add Judge
             </button>
          )}
        </div>

        {/* Battle panels */}
        {(responseA || responseB || responseC || isBattling || isJudging) ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: modelC ? '1fr 1fr 1fr' : '1fr 1fr', 
            gap: '16px', flex: 1, minHeight: '400px' 
          }}>
            <BattlePanel
              response={responseA}
              color="#3b6ef8"
              isGenerating={currentGenerating === 'A'}
              isComplete={battleComplete}
              won={winner === 'A'}
              onVote={() => handleVote('A')}
              loading={loading}
              voteLabel={`Vote Alpha`}
              onCopy={() => handleCopy(responseA, 'A')}
              isCopied={copiedA}
            />
            <BattlePanel
              response={responseB}
              color="#3b6ef8"
              isGenerating={currentGenerating === 'B'}
              isComplete={battleComplete}
              won={winner === 'B'}
              onVote={() => handleVote('B')}
              loading={loading}
              voteLabel={`Vote Bravo`}
              onCopy={() => handleCopy(responseB, 'B')}
              isCopied={copiedB}
            />
            {modelC && (
              <BattlePanel
                response={responseC}
                color="#7ba3ff"
                isGenerating={isJudging}
                isComplete={battleComplete && !isJudging && !!responseC}
                won={false}
                onVote={() => {}}
                loading={false}
                voteLabel=""
                onCopy={() => handleCopy(responseC, 'C')}
                isCopied={copiedC}
              />
            )}
          </div>
        ) : (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed var(--border-subtle)',
            borderRadius: '24px',
            color: 'var(--text-muted)'
          }}>
            <Bot size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
            <p style={{ fontSize: '0.9rem' }}>Select models and enter a prompt to start an Arena battle</p>
          </div>
        )}

        {/* Actions / Tie button */}
        {battleComplete && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => handleVote('tie')}
              disabled={loading || !!winner}
              style={{
                padding: '11px 24px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600,
                cursor: (loading || winner) ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              🤝 It's a Tie
            </button>
            
            <button
              onClick={resetBattle}
              disabled={loading}
              style={{
                padding: '11px 24px', borderRadius: '12px',
                background: 'rgba(59,110,248,0.1)', border: '1px solid rgba(59,110,248,0.2)',
                color: '#7ba3ff', fontSize: '0.82rem', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              <RotateCcw size={14} /> New Battle
            </button>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '300px',
        background: 'rgba(10,10,18,0.85)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        transform: showSidebar ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 100,
        padding: '24px 20px',
        gap: '24px'
      }}>
        {/* Toggle Button */}
        <button 
          onClick={() => setShowSidebar(!showSidebar)}
          style={{
            position: 'absolute',
            left: '-32px',
            top: '20px',
            width: '32px',
            height: '32px',
            background: 'rgba(10,10,18,0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border-subtle)',
            borderRight: 'none',
            borderRadius: '10px 0 0 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {showSidebar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Leaderboard Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '40%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={16} style={{ color: '#7ba3ff' }} />
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Leaderboard</h2>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
            {leaderboard.map((item, i) => (
              <LeaderboardRow key={item.model} item={item} index={i} />
            ))}
            {leaderboard.length === 0 && (
              <div style={{
                padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem',
                border: '1px dashed var(--border-default)', borderRadius: '12px',
              }}>
                No rankings yet
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        <div style={{ height: '1px', background: 'var(--border-subtle)', opacity: 0.5 }} />

        {/* History Section */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} style={{ color: '#7ba3ff' }} />
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Battle History</h2>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
            {battleHistory.map((battle) => (
              <HistoryCard key={battle.id} battle={battle} />
            ))}
            {battleHistory.length === 0 && (
              <div style={{
                padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem',
                border: '1px dashed var(--border-default)', borderRadius: '12px',
              }}>
                No battles recorded
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ battle }: { battle: ArenaBattle }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(battle.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '12px',
      padding: '12px',
      fontSize: '0.75rem',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      position: 'relative',
      overflow: 'hidden'
    }}
    onClick={() => setExpanded(!expanded)}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', opacity: 0.6, fontSize: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={10} />
          {date}
        </div>
        <div style={{ fontWeight: 700, color: battle.winner === 'tie' ? 'var(--text-muted)' : '#7ba3ff' }}>
          {battle.winner === 'tie' ? "🤝 TIED" : battle.winner === 'A' ? "🏆 ALPHA" : "🏆 BRAVO"}
        </div>
      </div>
      
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>
        {battle.prompt}
      </div>
      
      <div style={{ display: 'flex', gap: '8px', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
        <span style={{ color: battle.winner === 'A' ? '#7ba3ff' : 'inherit' }}>A: {battle.model_a}</span>
        <span>•</span>
        <span style={{ color: battle.winner === 'B' ? '#7ba3ff' : 'inherit' }}>B: {battle.model_b}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
           <div className="prose-chat">
             <div style={{ color: '#3b6ef8', fontWeight: 700, marginBottom: '4px', fontSize: '0.65rem' }}>RESPONSE ALPHA</div>
             <ReactMarkdown remarkPlugins={[remarkGfm]}>{battle.response_a}</ReactMarkdown>
           </div>
           <div className="prose-chat">
             <div style={{ color: '#3b6ef8', fontWeight: 700, marginBottom: '4px', fontSize: '0.65rem' }}>RESPONSE BRAVO</div>
             <ReactMarkdown remarkPlugins={[remarkGfm]}>{battle.response_b}</ReactMarkdown>
           </div>
           {battle.response_c && (
             <div className="prose-chat" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '8px', paddingTop: '8px' }}>
               <div style={{ color: '#7ba3ff', fontWeight: 700, marginBottom: '4px', fontSize: '0.65rem' }}>JUDGE EVALUATION ({battle.model_c})</div>
               <ReactMarkdown remarkPlugins={[remarkGfm]}>{battle.response_c}</ReactMarkdown>
             </div>
           )}
        </div>
      )}
    </div>
  );
}

interface ModelConfig {
  options: ModelOptions;
  setOptions: React.Dispatch<React.SetStateAction<ModelOptions>>;
  caps: ModelCapabilities | null;
  recommended: ModelOptions;
  loading: boolean;
  applyRecommended: () => void;
}

interface ModelHeaderProps {
  label: string;
  model: string;
  models: string[];
  onChange: (v: string) => void;
  disabled: boolean;
  color: string;
  active: boolean;
  loading: boolean;
  config: ModelConfig;
  hardware: HardwareInfo | null;
}

function ModelHeader({ label, model, models, onChange, disabled, color, active, loading, config, hardware }: ModelHeaderProps) {
  return (
    <div style={{
      background: active ? `rgba(${hexToRgb(color)},0.08)` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${active ? `rgba(${hexToRgb(color)},0.25)` : 'var(--border-subtle)'}`,
      borderRadius: '16px', padding: '8px 12px',
      transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {active && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, animation: 'pulse-ring 1.5s ease-out infinite' }} />}
          <Bot size={14} style={{ color }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color, whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ModelSelector
            value={model}
            options={models}
            onChange={onChange}
            disabled={disabled}
            loading={loading}
            color={color}
          />
          {config && (
            <ModelParamsPanel
              options={config.options}
              onChange={config.setOptions}
              caps={config.caps}
              hardware={hardware}
              recommended={config.recommended}
              loading={config.loading}
              color={color}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface BattlePanelProps {
  response: string;
  color: string;
  isGenerating: boolean;
  isComplete: boolean;
  won: boolean;
  onVote: () => void;
  loading: boolean;
  voteLabel: string;
  onCopy: () => void;
  isCopied: boolean;
}

function BattlePanel({ response, color, isGenerating, isComplete, won, onVote, loading, voteLabel, onCopy, isCopied }: BattlePanelProps) {
  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(15,15,25,0.8), rgba(8,8,15,0.9))',
      border: `1px solid ${isGenerating ? `rgba(${hexToRgb(color)},0.3)` : won ? `rgba(${hexToRgb(color)},0.4)` : 'var(--border-subtle)'}`,
      borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      transition: 'border-color 0.4s ease',
      boxShadow: won ? `0 0 40px rgba(${hexToRgb(color)},0.1)` : 'none',
      position: 'relative'
    }}>
      {/* Top accent */}
      <div style={{
        height: '2px',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: isGenerating ? 1 : 0.3,
        transition: 'opacity 0.3s',
      }} />

      {/* Copy Button */}
      {response && (
        <button
          onClick={onCopy}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '6px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-subtle)',
            color: isCopied ? '#22c55e' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
          title="Copy response"
        >
          {isCopied ? <CheckCheck size={14} /> : <Copy size={14} />}
        </button>
      )}

      {/* Content */}
      <div className="prose-chat" style={{ flex: 1, padding: '16px', overflowY: 'auto', fontSize: '0.85rem', lineHeight: 1.65 }}>
        {won && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
            color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <Crown size={13} /> Winner
          </div>
        )}
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {response + (isGenerating ? ' ▋' : '')}
        </ReactMarkdown>
        {isGenerating && !response && (
          <div style={{ display: 'flex', gap: '5px', padding: '4px 0' }}>
            {[0,150,300].map(d => <div key={d} style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, animation: `bounce 1s ease infinite ${d}ms` }} />)}
          </div>
        )}
      </div>

      {/* Vote button */}
      {isComplete && !won && (
        <div style={{ padding: '12px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}>
          <button
            onClick={onVote} disabled={loading}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              padding: '11px', borderRadius: '10px',
              background: `linear-gradient(135deg, rgba(${hexToRgb(color)},0.2), rgba(${hexToRgb(color)},0.1))`,
              border: `1px solid rgba(${hexToRgb(color)},0.25)`,
              color, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease',
            }}
          >
            <ThumbsUp size={14} /> {voteLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ item, index }: { item: ModelRating; index: number }) {
  const color = index < 3 ? '#7ba3ff' : 'var(--text-muted)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
      borderRadius: '10px', padding: '10px 12px',
      animation: `fadeSlideUp 0.4s ease ${index * 60}ms both`,
    }}>
      <div style={{
        width: '24px', height: '24px', flexShrink: 0, borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: index < 3 ? `rgba(${hexToRgb(color)},0.15)` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${index < 3 ? `rgba(${hexToRgb(color)},0.25)` : 'var(--border-subtle)'}`,
        fontSize: '0.65rem', fontWeight: 800, color,
      }}>
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.model}
        </div>
        <div style={{ fontSize: '0.62rem', color: '#7ba3ff', opacity: 0.8, fontWeight: 600, marginTop: '1px' }}>
          ELO {Math.round(item.elo)}
        </div>
      </div>
      {index === 0 && <Crown size={11} style={{ color: '#7ba3ff', flexShrink: 0 }} />}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '255,255,255';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}
