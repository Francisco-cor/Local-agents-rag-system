import asyncio
import sys
from unittest.mock import AsyncMock, MagicMock

# Mocking the ollama module before it's imported by the engine
mock_ollama = MagicMock()
sys.modules["ollama"] = mock_ollama

async def test_poetiq_flow():
    from app.orchestrator.advanced_engine import AdvancedEngine
    
    rag = MagicMock()
    rag.search.return_value = [{"text": "Sample Context", "metadata": {"source": "unit_test"}}]
    
    infer = MagicMock()
    # Mocking different responses for different steps
    async def mock_gen(model, prompt, options=None):
        if "Question:" in prompt:
            return "Initial Hypothesis Draft"
        if "Identify any factual errors" in prompt:
            return "Some flaws found."
        if "Rewrite the answer" in prompt:
            return "Final Refined Answer"
        return "Default"
    
    infer.async_generate = AsyncMock(side_effect=mock_gen)
    
    engine = AdvancedEngine(rag, infer)
    
    steps = []
    async for step in engine.run_poetiq_rag("Test Query", "mock-model"):
        steps.append(step["step"])
        print(f"Executed step: {step['step']}")

    expected_steps = ["retrieval", "hypothesis", "critique", "refinement", "final_output"]
    for step in expected_steps:
        assert step in steps, f"Step {step} missing from PoetIQ flow"
    
    print("\n✅ PoetIQ flow verification successful!")

if __name__ == "__main__":
    # Add project root to path
    import os
    sys.path.append(os.getcwd())
    asyncio.run(test_poetiq_flow())
