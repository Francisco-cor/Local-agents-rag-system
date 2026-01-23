import os
import subprocess
import sys

def main():
    print("========================================")
    print("   LOCAL AGENTS RAG SYSTEM v1.0")
    print("========================================")
    print("1. Start ARENA (Streamlit)")
    print("   > Compare models, monitor VRAM, and update Elo ratings.")
    print("")
    print("2. Start SWARM / POETIQ (Chainlit)")
    print("   > Agentic chat, Deep Reasoning, and persistent memory.")
    print("========================================")
    
    choice = input("Select operation mode [1/2]: ").strip()
    
    if choice == "1":
        print("\nLaunching Streamlit Arena...")
        # Execute Streamlit interface
        cmd = [sys.executable, "-m", "streamlit", "run", "app/ui/streamlit_app.py"]
        subprocess.run(cmd)
        
    elif choice == "2":
        print("\nLaunching Chainlit Swarm...")
        # Execute Chainlit interface with auto-reload enabled
        cmd = [sys.executable, "-m", "chainlit", "run", "app/ui/chainlit_app.py", "-w"]
        subprocess.run(cmd)
        
    else:
        print("Invalid selection. Operation terminated.")

if __name__ == "__main__":
    main()
