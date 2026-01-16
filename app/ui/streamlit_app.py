import streamlit as st
import time
import psutil
from app.orchestrator.workflow_manager import WorkflowManager

# Page Config
st.set_page_config(layout="wide", page_title="Local RAG Arena", page_icon="🏟️")

# Initialize Backend
if "workflow" not in st.session_state:
    st.session_state.workflow = WorkflowManager()

# Sidebar: System Monitor
st.sidebar.title("🖥️ System Monitor")
cpu_usage = st.sidebar.progress(0, text="CPU Usage")
ram_usage = st.sidebar.progress(0, text="RAM Usage")

def update_metrics():
    cpu = psutil.cpu_percent()
    ram = psutil.virtual_memory().percent
    cpu_usage.progress(cpu / 100, text=f"CPU: {cpu}%")
    ram_usage.progress(ram / 100, text=f"RAM: {ram}%")

update_metrics()

# Main Area: The Arena
st.title("🏟️ LLM Arena")
st.markdown("Compare local models side-by-side with RAG context.")

col1, col2 = st.columns(2)

with col1:
    st.header("🥊 Model A")
    model_a = st.selectbox("Select Model A", ["gemma-3-4b", "qwen3", "ministral-3b"], key="model_a")
    
with col2:
    st.header("🥊 Model B")
    model_b = st.selectbox("Select Model B", ["gemma-3-4b", "qwen3", "ministral-3b"], index=1, key="model_b")

query = st.text_input("Enter your challenge question:", placeholder="Explain Quantum Entanglement...")

if st.button("FIGHT!") and query:
    st.divider()
    
    # Retrieve once for fairness
    with st.spinner("Retrieving fair context..."):
        # We use a dummy search just to show retrieval works for now
        # Real implementation matches what the WorkflowManager does
        workflow = st.session_state.workflow
        context_results = workflow.rag.search(query)
        
    c1, c2 = st.columns(2)
    
    with c1:
        st.info(f"Generating with {model_a}...")
        start = time.time()
        res_a = workflow.process_query(query, model_name=model_a)
        duration = time.time() - start
        st.success(f"Finished in {duration:.2f}s")
        st.write(res_a["response"])
        with st.expander("Context Used"):
            st.code(res_a["context_used"])

    with c2:
        st.info(f"Generating with {model_b}...")
        start = time.time()
        res_b = workflow.process_query(query, model_name=model_b)
        duration = time.time() - start
        st.success(f"Finished in {duration:.2f}s")
        st.write(res_b["response"])
        with st.expander("Context Used"):
            st.code(res_b["context_used"])

    st.divider()
    st.write("### 🏆 Vote for the winner")
    b1, b2, b3 = st.columns([1,1,1])
    if b1.button(f"{model_a} Wins"):
        st.toast(f"Voted for {model_a}!")
    if b2.button("Tie"):
        st.toast("It's a Tie!")
    if b3.button(f"{model_b} Wins"):
        st.toast(f"Voted for {model_b}!")
