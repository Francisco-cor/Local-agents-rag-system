import React, { useState, useEffect } from 'react';
import {
  Library as LibraryIcon, Swords,
  BrainCircuit, MessageSquareText, Settings, ChevronRight,
  Cpu, Zap, Folder, FolderOpen, Plus, ChevronDown, ListTree, FlaskConical, ShieldCheck
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface Workspace {
  id: number;
  name: string;
  created_at: string;
}

interface FolderData {
  id: number;
  workspace_id: number;
  name: string;
}

interface Conversation {
  id: number;
  folder_id: number;
  title: string;
  model_used?: string;
  updated_at: string;
}

const NAV_ITEMS = [
  { icon: MessageSquareText, label: 'New Chat',   to: '/chat',    color: '#3b82f6' },  // blue
  { icon: FlaskConical,      label: 'Testing',    to: '/testing-arena', color: '#fbbf24' },  // amber
  { icon: ShieldCheck,       label: 'Testing 2',  to: '/testing-arena-2', color: '#10b981' }, // green/emerald
  { icon: Swords,            label: 'Arena Mode', to: '/arena',   color: '#ef4444' },  // red
  { icon: BrainCircuit,      label: 'Swarm Mode', to: '/swarm',   color: '#818cf8' },  // indigo
  { icon: LibraryIcon,       label: 'Library',    to: '/library', color: '#22c55e' },  // green
];

const Sidebar = ({ isOpen }: SidebarProps) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<number, boolean>>({});
  const [folders, setFolders] = useState<Record<number, FolderData[]>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [conversations, setConversations] = useState<Record<number, Conversation[]>>({});
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchWorkspaces();
    fetchRecentConversations();
  }, [location.pathname]);

  const fetchWorkspaces = async () => {
    try {
      const data = await invoke<Workspace[]>('get_workspaces');
      setWorkspaces(data);
    } catch (err) {
      console.error("Failed to fetch workspaces", err);
    }
  };

  const fetchRecentConversations = async () => {
    try {
      const data = await invoke<Conversation[]>('get_conversations');
      setRecentConversations(data);
    } catch (err) {
      console.error("Failed to fetch recent conversations", err);
    }
  };

  const toggleWorkspace = async (wsId: number) => {
    setExpandedWorkspaces(prev => ({ ...prev, [wsId]: !prev[wsId] }));
    if (!expandedWorkspaces[wsId]) {
      try {
        const data = await invoke<FolderData[]>('get_folders', { workspaceId: wsId });
        setFolders(prev => ({ ...prev, [wsId]: data }));
      } catch (err) {
        console.error("Failed to fetch folders", err);
      }
    }
  };

  const toggleFolder = async (folderId: number) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    if (!expandedFolders[folderId]) {
      try {
        const data = await invoke<Conversation[]>('get_conversations_by_folder', { folderId });
        setConversations(prev => ({ ...prev, [folderId]: data }));
      } catch (err) {
        console.error("Failed to fetch conversations", err);
      }
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      const name = `Workspace ${workspaces.length + 1}`;
      await invoke('create_workspace', { name });
      fetchWorkspaces();
    } catch (err) {
      console.error("Failed to create workspace", err);
    }
  };

  const handleCreateFolder = async (e: React.MouseEvent, wsId: number) => {
    e.stopPropagation();
    try {
      const name = `Folder ${Object.values(folders[wsId] || []).length + 1}`;
      await invoke('create_folder', { workspaceId: wsId, name });
      const data = await invoke<FolderData[]>('get_folders', { workspaceId: wsId });
      setFolders(prev => ({ ...prev, [wsId]: data }));
      setExpandedWorkspaces(prev => ({ ...prev, [wsId]: true }));
    } catch (err) {
      console.error("Failed to create folder", err);
    }
  };

  const handleCreateConversation = async (e: React.MouseEvent, folderId: number) => {
    e.stopPropagation();
    try {
      const title = `Chat ${Object.values(conversations[folderId] || []).length + 1}`;
      const id = await invoke<number>('create_conversation', { folderId, title });
      const data = await invoke<Conversation[]>('get_conversations_by_folder', { folderId });
      setConversations(prev => ({ ...prev, [folderId]: data }));
      setExpandedFolders(prev => ({ ...prev, [folderId]: true }));
      navigate(`/chat/${id}`);
    } catch (err) {
      console.error("Failed to create conversation", err);
    }
  };

  const displayedRecent = showAllRecent ? recentConversations : recentConversations.slice(0, 6);

  return (
    <aside
      className="sidebar-transition h-full flex-shrink-0 flex flex-col relative"
      style={{
        width: isOpen ? '260px' : '0px',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(18,18,21,0.97) 0%, rgba(14,14,17,0.99) 100%)',
        borderRight: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
      }}
    >
      <div style={{ width: '260px', height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 12px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', marginBottom: '28px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 12px rgba(59,130,246,0.35)',
          }}>
            <Zap size={15} color="white" fill="white" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--carbon-white)', letterSpacing: '-0.03em', fontFamily: "'Syne', sans-serif" }}>Agent Station</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--carbon-400)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Local RAG · v2</div>
          </div>
        </div>

        {/* Static Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px' }}>
          <NavItem {...NAV_ITEMS[0]} /> {/* New Chat */}
          
          {/* Recent Conversations */}
          {recentConversations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px', marginTop: '4px' }}>
               <div style={{
                fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px'
              }}>
                Recent
              </div>
              {displayedRecent.map(chat => (
                <Link
                  key={chat.id}
                  to={`/chat/${chat.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                    borderRadius: '8px', textDecoration: 'none', transition: 'all 0.2s',
                    color: location.pathname === `/chat/${chat.id}` ? '#93c5fd' : 'var(--carbon-300)',
                    fontSize: '0.75rem',
                    background: location.pathname === `/chat/${chat.id}` ? 'rgba(59,130,246,0.1)' : 'transparent'
                  }}
                  className="sidebar-subitem-hover"
                >
                  <MessageSquareText size={12} style={{ opacity: 0.7 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chat.title}
                  </span>
                </Link>
              ))}
              {recentConversations.length > 6 && (
                <button
                  onClick={() => setShowAllRecent(!showAllRecent)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px',
                    background: 'transparent', border: 'none', color: 'var(--text-muted)',
                    fontSize: '0.7rem', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  <ListTree size={12} />
                  <span>{showAllRecent ? 'Show less' : 'View more...'}</span>
                </button>
              )}
            </div>
          )}

          <NavItem {...NAV_ITEMS[1]} /> 
          <NavItem {...NAV_ITEMS[2]} /> 
          <NavItem {...NAV_ITEMS[3]} /> 
          <NavItem {...NAV_ITEMS[4]} />
          <NavItem {...NAV_ITEMS[5]} />
        </nav>

        {/* Dynamic History Section */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 10px', marginBottom: '12px'
          }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Workspaces
            </span>
            <button
              onClick={handleCreateWorkspace}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center'
              }}
            >
              <Plus size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {workspaces.map(ws => (
              <div key={ws.id}>
                <div
                  onClick={() => toggleWorkspace(ws.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                    borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                    color: 'var(--text-secondary)', fontSize: '0.8rem'
                  }}
                  className="sidebar-item-hover"
                >
                  {expandedWorkspaces[ws.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <ListTree size={14} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
                  <Plus size={12} onClick={(e) => handleCreateFolder(e, ws.id)} />
                </div>

                {expandedWorkspaces[ws.id] && (
                  <div style={{ marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                    {(folders[ws.id] || []).map(folder => (
                      <div key={folder.id}>
                        <div
                          onClick={() => toggleFolder(folder.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
                            borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                            color: 'var(--text-muted)', fontSize: '0.75rem'
                          }}
                          className="sidebar-item-hover"
                        >
                          {expandedFolders[folder.id] ? <FolderOpen size={13} /> : <Folder size={13} />}
                          <span style={{ flex: 1 }}>{folder.name}</span>
                          <Plus size={11} onClick={(e) => handleCreateConversation(e, folder.id)} />
                        </div>

                        {expandedFolders[folder.id] && (
                          <div style={{ marginLeft: '16px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            {(conversations[folder.id] || []).map(chat => (
                              <Link
                                key={chat.id}
                                to={`/chat/${chat.id}`}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
                                  borderRadius: '4px', textDecoration: 'none', transition: 'all 0.2s',
                                  color: location.pathname === `/chat/${chat.id}` ? '#7ba3ff' : 'var(--text-muted)', 
                                  fontSize: '0.72rem',
                                  background: location.pathname === `/chat/${chat.id}` ? 'rgba(59,110,248,0.1)' : 'transparent'
                                }}
                                className="sidebar-subitem-hover"
                              >
                                <MessageSquareText size={11} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {chat.title}
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom section */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* System stats mini widget / Dashboard Link */}
          <Link 
            to="/" 
            style={{
              background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)',
              borderRadius: '11px', padding: '10px 12px', marginBottom: '4px',
              textDecoration: 'none', display: 'block', transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
            className="system-widget-hover"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Cpu size={11} style={{ color: '#86efac' }} />
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                System Status
              </span>
            </div>
            <div style={{ fontSize: '0.67rem', color: 'var(--carbon-300)' }}>
              Local inference active
            </div>
          </Link>

          <NavItem icon={Settings} label="Settings" to="/settings" color="#8888aa" />
        </div>
      </div>
      <style>{`
        .sidebar-item-hover:hover { background: rgba(245,245,248,0.05); color: var(--carbon-white) !important; }
        .sidebar-subitem-hover:hover { background: rgba(59,130,246,0.1); color: #93c5fd !important; }
        .sidebar-transition { transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .system-widget-hover:hover { background: rgba(34,197,94,0.1) !important; border-color: rgba(34,197,94,0.25) !important; }
      `}</style>
    </aside>
  );
};

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  color: string;
}

const NavItem = ({ icon: Icon, label, to, color }: NavItemProps) => {
  const location = useLocation();
  const active = location.pathname === to;
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 10px', borderRadius: '10px', textDecoration: 'none',
        transition: 'all 0.2s ease',
        background: active
          ? `rgba(${hexToRgb(color)}, 0.1)`
          : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: `1px solid ${active ? `rgba(${hexToRgb(color)}, 0.2)` : 'transparent'}`,
        color: active ? color : hovered ? 'var(--carbon-white)' : 'var(--carbon-200)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {active && (
        <div style={{
          position: 'absolute', left: 0, top: '20%', bottom: '20%',
          width: '3px', borderRadius: '0 4px 4px 0',
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }} />
      )}
      <div style={{
        width: '28px', height: '28px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        background: active ? `rgba(${hexToRgb(color)}, 0.15)` : 'transparent',
      }}>
        <Icon size={15} style={{ color: active ? color : hovered ? 'var(--carbon-white)' : 'var(--carbon-300)' }} />
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: active ? 600 : 500, whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
      {active && <ChevronRight size={12} style={{ color, opacity: 0.5 }} />}
    </Link>
  );
};

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '255,255,255';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

export default Sidebar;
