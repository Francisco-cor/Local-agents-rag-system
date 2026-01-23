import streamlit as st
import time
import psutil
import pandas as pd
import asyncio
from app.orchestrator.workflow_manager import WorkflowManager
from app.orchestrator.battle_manager import BattleManager

# Page Configuration
st.set_page_config(layout="wide", page_title="Local RAG Arena")

# Custom CSS for Professional UI
st.markdown("""
<style>
    .reportview-container {
        background: #0E1117;
    }
    .stButton>button {
        width: 100%;
        border-radius: 5px;
        font-weight: bold;
    }
    .win-btn-a { border: 2px solid #4CAF50 !important; color: #4CAF50 !important; }
    .win-btn-b { border: 2px solid #2196F3 !important; color: #2196F3 !important; }
    .tie-btn { border: 2px solid #9E9E9E !important; color: #9E9E9E !important; }
</style>
""", unsafe_allow_html=True)

# Initialize Session State
if "workflow" not in st.session_state:
    st.session_state.workflow = WorkflowManager()
if "battle_manager" not in st.session_state:
    st.session_state.battle_manager = BattleManager()
if "last_battle" not in st.session_state:
    st.session_state.last_battle = None # Stores {query, response_a, response_b, model_a, model_b}

# Sidebar: Leaderboard & Resource Statistics
st.sidebar.title("Leaderboard")
leaderboard = st.session_state.battle_manager.get_leaderboard()
df = pd.DataFrame(leaderboard)
st.sidebar.dataframe(df.set_index("rank"), hide_index=False, use_container_width=True)

st.sidebar.divider()
st.sidebar.subheader("System Resources")
cpu_bar = st.sidebar.progress(0, text="CPU Usage")
ram_bar = st.sidebar.progress(0, text="RAM Usage")
gpu_bar = st.sidebar.empty() # Placeholder for GPU Statistics

# Initialize GPU monitoring
try:
    import GPUtil
    gpus = GPUtil.getGPUs()
    gpu_available = len(gpus) > 0
except ImportError:
    gpu_available = False

cpu_percent = psutil.cpu_percent()
ram_percent = psutil.virtual_memory().percent
cpu_bar.progress(min(cpu_percent / 100.0, 1.0), text=f"CPU: {cpu_percent}%")
ram_bar.progress(min(ram_percent / 100.0, 1.0), text=f"RAM: {ram_percent}%")

if gpu_available:
    try:
        gpu = GPUtil.getGPUs()[0] # Monitor Primary GPU
        vram_percent = (gpu.memoryUsed / gpu.memoryTotal)
        gpu_bar.progress(min(vram_percent, 1.0), text=f"GPU VRAM: {gpu.memoryUsed:.0f}MB / {gpu.memoryTotal:.0f}MB")
    except Exception:
        gpu_bar.text("GPU Monitoring Error")
else:
    gpu_bar.text("GPU Monitoring: Not Available")

# Main Arena Interface
st.title("Local Model Evaluation Arena")
st.caption("Perform detailed RAG comparisons and update Elo ratings.")

# Retrieve Dynamic Model List from Ollama
with st.spinner("Synchronizing with Ollama..."):
    base_models = st.session_state.workflow.engine.get_available_models()
    # Populate PoetIQ variants
    poetiq_variants = [f"{m} (PoetIQ)" for m in base_models]
    all_models = base_models + poetiq_variants

col_a, col_b = st.columns(2)

with col_a:
    st.info("Contender A")
    # Set default selections
    idx_a = 0
    current_model_a = st.selectbox("Select Model", all_models, index=idx_a, key="model_a_select", label_visibility="collapsed")
    
with col_b:
    st.info("Contender B")
    idx_b = 1 if len(all_models) > 1 else 0
    current_model_b = st.selectbox("Select Model", all_models, index=idx_b, key="model_b_select", label_visibility="collapsed")

query = st.text_input("Enter Challenge Prompt:", placeholder="e.g., Explain the core principles of quantum computing...")
start_btn = st.button("Initiate Evaluation", type="primary", use_container_width=True)

if start_btn and query:
    if current_model_a == current_model_b:
        st.warning("Please select distinct models for a valid comparison.")
    else:
        st.divider()
        workflow = st.session_state.workflow
        
        # 1. Retrieval (Shared Context Extraction)
        with st.status("Retrieving shared context...", expanded=False) as status:
            context_results = workflow.rag.search(query)
            status.update(label="Context Retrieval Complete", state="complete")
        
        # 2. Response Generation (Sequential execution for VRAM optimization)
        
        # Contender A Generation
        status_a = st.empty()
        status_a.info(f"Generating response from {current_model_a}...")
        start_a = time.time()
        res_a = asyncio.run(workflow.process_query(query, model_name=current_model_a))
        time_a = time.time() - start_a
        status_a.empty()

        # Contender B Generation
        status_b = st.empty()
        status_b.info(f"Generating response from {current_model_b}...")
        start_b = time.time()
        res_b = asyncio.run(workflow.process_query(query, model_name=current_model_b))
        time_b = time.time() - start_b
        status_b.empty()

        # Update Session State for evaluation
        st.session_state.last_battle = {
            "query": query,
            "model_a": current_model_a,
            "model_b": current_model_b,
            "res_a": res_a,
            "res_b": res_b,
            "time_a": time_a,
            "time_b": time_b,
            "voted": False
        }

# Render Evaluation Results & Voting
if st.session_state.last_battle:
    battle = st.session_state.last_battle
    
    c1, c2 = st.columns(2)
    
    with c1:
        st.subheader(f"{battle['model_a']}")
        st.caption(f"Inference Time: {battle['time_a']:.2f}s")
        st.markdown(battle['res_a']['response'])
        with st.expander("Reference Context"):
            st.json(battle['res_a']['sources'])

    with c2:
        st.subheader(f"{battle['model_b']}")
        st.caption(f"Inference Time: {battle['time_b']:.2f}s")
        st.markdown(battle['res_b']['response'])
        with st.expander("Reference Context"):
            st.json(battle['res_b']['sources'])
            
    # Evaluation Recording Section
    st.divider()
    if not battle["voted"]:
        st.write("### Record Evaluation Result")
        b1, b2, b3 = st.columns([1,1,1])
        
        if b1.button(f"{battle['model_a']} Superior"):
            st.session_state.battle_manager.record_match(battle['model_a'], battle['model_b'], "A")
            battle["voted"] = True
            st.rerun()
            
        if b2.button("Equivalent Performance"):
            st.session_state.battle_manager.record_match(battle['model_a'], battle['model_b'], "tie")
            battle["voted"] = True
            st.rerun()
            
        if b3.button(f"{battle['model_b']} Superior"):
            st.session_state.battle_manager.record_match(battle['model_a'], battle['model_b'], "B")
            battle["voted"] = True
            st.rerun()
    else:
        st.success("Evaluation recorded successfully. Data persisted to leaderboard.")
        if st.button("Start New Evaluation"):
            st.session_state.last_battle = None
            st.rerun()
