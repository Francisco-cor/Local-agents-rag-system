import asyncio
import ollama
import time

async def test_async_ollama():
    print("Testing synchronous list...")
    try:
        models = ollama.list()
        print(f"Models: {[m.get('name', '') for m in models.get('models', [])]}")
    except Exception as e:
        print(f"Sync list failed: {e}")

    print("\nTesting synchronous chat...")
    start_time = time.time()
    try:
        response = ollama.chat(
            model="qwen3-vl:4b",
            messages=[{'role': 'user', 'content': 'Hi'}],
            keep_alive=0
        )
        print(f"Sync response received in {time.time() - start_time:.2f}s")
    except Exception as e:
        print(f"Sync chat failed: {e}")

    print("\nTesting asynchronous client (with 60s timeout)...")
    client = ollama.AsyncClient(host="http://localhost:11434")
    
    start_time = time.time()
    try:
        print("Sending async chat request...")
        response = await asyncio.wait_for(
            client.chat(
                model="qwen3-vl:4b",
                messages=[{'role': 'user', 'content': 'Hi'}],
                keep_alive=0
            ),
            timeout=60.0
        )
        print(f"Async response received in {time.time() - start_time:.2f}s")
    except asyncio.TimeoutError:
        print(f"Async timed out after 60s")
    except Exception as e:
        print(f"Async chat failed: {e}")


if __name__ == "__main__":
    asyncio.run(test_async_ollama())
