import asyncio
import time
from app.gpu.inference_engine import InferenceEngine

async def verify_persistence():
    engine = InferenceEngine()
    model = "gemma:2b"

    
    print(f"--- First Call (Model Loading) ---")
    start = time.time()
    res1 = await engine.async_generate(model, "Say 'Hello'")
    print(f"Response 1 ({time.time() - start:.2f}s): {res1}")
    
    print(f"\n--- Second Call (Should be fast - cached) ---")
    start = time.time()
    res2 = await engine.async_generate(model, "Say 'Ready'")
    print(f"Response 2 ({time.time() - start:.2f}s): {res2}")
    
    if (time.time() - start) < 2.0:
        print("\n✅ PERSISTENCE VERIFIED: Second call was fast.")
    else:
        print("\n❌ PERSISTENCE FAILED: Second call was slow.")

if __name__ == "__main__":
    asyncio.run(verify_persistence())
