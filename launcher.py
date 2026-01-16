import os
import subprocess
import sys

def main():
    print("========================================")
    print("   🤖 LOCAL AGENTS RAG SYSTEM v1.0")
    print("========================================")
    print("1. 🏟️  Start ARENA (Streamlit)")
    print("      > Compare models, check VRAM, Elo ratings.")
    print("")
    print("2. 🐝  Start SWARM / POETIQ (Chainlit)")
    print("      > Agentic chat, Deep Reasoning, Memory.")
    print("========================================")
    
    choice = input("Select mode [1/2]: ").strip()
    
    if choice == "1":
        print("\n🚀 Launching Streamlit Arena...")
        # Streamlit command
        cmd = [sys.executable, "-m", "streamlit", "run", "app/ui/streamlit_app.py"]
        subprocess.run(cmd)
        
    elif choice == "2":
        print("\n🚀 Launching Chainlit Swarm...")
        # Chainlit command
        cmd = [sys.executable, "-m", "chainlit", "run", "app/ui/chainlit_app.py", "-w"]
        subprocess.run(cmd)
        
    else:
        print("❌ Invalid selection. Exiting.")

if __name__ == "__main__":
    main()
