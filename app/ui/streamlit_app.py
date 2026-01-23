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
st.sidebar.dataframe(df.set_index("rank"), hide_index=False, width="stretch")

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
start_btn = st.button("Initiate Evaluation", type="primary", width="stretch")

if start_btn and query:
        if current_model_a == current_model_b:
            st.warning("Please select distinct models for a valid comparison.")
        else:
            st.divider()
            workflow = st.session_state.workflow
            
            # Response Generation (Sequential for VRAM optimization, but in a single loop)
            c1, c2 = st.columns(2)
            
            with c1:
                st.subheader(f"{current_model_a}")
                inner_placeholder_a = st.empty()
                inner_placeholder_a.info(f"{current_model_a} is thinking...")

            with c2:
                st.subheader(f"{current_model_b}")
                inner_placeholder_b = st.empty()
                inner_placeholder_b.info(f"{current_model_b} is thinking...")

            async def run_arena_sequential():
                # Task A
                start_a = time.time()
                full_res_a = ""
                async for event in workflow.run_raw_flow(query, model_name=current_model_a):
                    if event["status"] == "streaming":
                        full_res_a = event["content"]
                        inner_placeholder_a.markdown(full_res_a + "▌")
                    elif event["status"] == "done":
                        full_res_a = event["content"]
                        inner_placeholder_a.markdown(full_res_a)
                time_a = time.time() - start_a
                
                # Task B
                start_b = time.time()
                full_res_b = ""
                inner_placeholder_b.info(f"{current_model_b} is thinking...")
                async for event in workflow.run_raw_flow(query, model_name=current_model_b):
                    if event["status"] == "streaming":
                        full_res_b = event["content"]
                        inner_placeholder_b.markdown(full_res_b + "▌")
                    elif event["status"] == "done":
                        full_res_b = event["content"]
                        inner_placeholder_b.markdown(full_res_b)
                time_b = time.time() - start_b
                
                return (full_res_a, time_a), (full_res_b, time_b)

            # Single asyncio.run to keep life cycle simple
            (full_res_a, time_a), (full_res_b, time_b) = asyncio.run(run_arena_sequential())
            
            with c1: st.caption(f"Inference Time: {time_a:.2f}s")
            with c2: st.caption(f"Inference Time: {time_b:.2f}s")

            # Update Session State for evaluation ranking
            st.session_state.last_battle = {
                "query": query,
                "model_a": current_model_a,
                "model_b": current_model_b,
                "res_a": {"response": full_res_a},
                "res_b": {"response": full_res_b},
                "time_a": time_a,
                "time_b": time_b,
                "voted": False
            }

# Render Evaluation Results & Voting
if st.session_state.last_battle:
    battle = st.session_state.last_battle
    
    # If already voted, we need to re-render the static content
    if battle["voted"]:
        c1, c2 = st.columns(2)
        with c1:
            st.subheader(f"{battle['model_a']}")
            st.markdown(battle['res_a']['response'])
        with c2:
            st.subheader(f"{battle['model_b']}")
            st.markdown(battle['res_b']['response'])

    # Evaluation Recording Section
    st.divider()
    if not battle["voted"]:
        st.write("### Record Evaluation Result")
        b1, b2, b3 = st.columns([1,1,1])
        
        if b1.button(f"{battle['model_a']} Superior", width="stretch"):
            st.session_state.battle_manager.record_match(battle['model_a'], battle['model_b'], "A")
            battle["voted"] = True
            st.rerun()
            
        if b2.button("Equivalent Performance", width="stretch"):
            st.session_state.battle_manager.record_match(battle['model_a'], battle['model_b'], "tie")
            battle["voted"] = True
            st.rerun()
            
        if b3.button(f"{battle['model_b']} Superior", width="stretch"):
            st.session_state.battle_manager.record_match(battle['model_a'], battle['model_b'], "B")
            battle["voted"] = True
            st.rerun()
    else:
        st.success("Evaluation recorded successfully. Data persisted to leaderboard.")
        if st.button("Start New Evaluation"):
            st.session_state.last_battle = None
            st.rerun()
