import ollama
import logging
from typing import List, Generator, Dict, Any

class InferenceEngine:
    """
    Manages the GPU-bound Inference operations:
    1. Interaction with Ollama API
    2. Model context management
    3. Generation handling
    
    Strictly NO Vector DB logic here.
    """
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.logger = logging.getLogger("InferenceEngine")
        self.logger.setLevel(logging.INFO)
        # Ollama python client uses specific environment variables or defaults. 
        # Ideally we configure the client, but the current library is a simple wrapper.
        # We assume Ollama is running externally.
        self.base_url = base_url
        # We don't store the async client here because it's tied to an event loop.
        # Streamlit creates multiple event loops with asyncio.run().

    def generate(self, model: str, prompt: str, system_context: str = "", options: Dict[str, Any] = None) -> str:
        """
        Single-shot generation (Synchronous).
        """
        if options is None:
            options = {"temperature": 0.7, "num_ctx": 4096}
            
        messages = []
        if system_context:
            messages.append({'role': 'system', 'content': system_context})
        messages.append({'role': 'user', 'content': prompt})
        
        try:
            self.logger.info(f"Generating (sync) with {model}...")
            response = ollama.chat(
                model=model,
                messages=messages,
                options=options,
                keep_alive="5m"
            )
            return response['message']['content']
        except Exception as e:
            self.logger.error(f"Inference Error: {e}")
            return f"Error computing response: {str(e)}"

    async def async_generate(self, model: str, prompt: str, system_context: str = "", options: Dict[str, Any] = None) -> str:
        """
        Single-shot generation (Asynchronous).
        """
        if options is None:
            options = {"temperature": 0.7, "num_ctx": 4096}
            
        messages = []
        if system_context:
            messages.append({'role': 'system', 'content': system_context})
        messages.append({'role': 'user', 'content': prompt})
        
        try:
            self.logger.info(f"Generating (async) with {model}...")
            client = ollama.AsyncClient(host=self.base_url)
            response = await client.chat(
                model=model,
                messages=messages,
                options=options,
                keep_alive="5m"
            )
            return response['message']['content']
        except Exception as e:
            self.logger.error(f"Async Inference Error: {e}")
            return f"Error computing response: {str(e)}"


    def generate_stream(self, model: str, prompt: str, system_context: str = "", options: Dict[str, Any] = None) -> Generator[str, None, None]:
        """
        Streaming generation (Synchronous).
        """
        if options is None:
            options = {"temperature": 0.7, "num_ctx": 4096}
            
        messages = []
        if system_context:
            messages.append({'role': 'system', 'content': system_context})
        messages.append({'role': 'user', 'content': prompt})
        
        try:
            self.logger.info(f"Streaming (sync) with {model}...")
            stream = ollama.chat(
                model=model,
                messages=messages,
                options=options,
                stream=True,
                keep_alive="5m"
            )
            
            for chunk in stream:
                content = chunk['message']['content']
                yield content
                
        except Exception as e:
            self.logger.error(f"Inference Stream Error: {e}")
            yield f"Error computing stream: {str(e)}"

    async def async_generate_stream(self, model: str, prompt: str, system_context: str = "", options: Dict[str, Any] = None):
        """
        Streaming generation (Asynchronous).
        """
        if options is None:
            options = {"temperature": 0.7, "num_ctx": 4096}
            
        messages = []
        if system_context:
            messages.append({'role': 'system', 'content': system_context})
        messages.append({'role': 'user', 'content': prompt})
        
        try:
            self.logger.info(f"Streaming (async) with {model}...")
            client = ollama.AsyncClient(host=self.base_url)
            stream = await client.chat(
                model=model,
                messages=messages,
                options=options,
                stream=True,
                keep_alive="5m"
            )
            
            async for chunk in stream:
                content = chunk['message']['content']
                yield content
                
        except Exception as e:
            self.logger.error(f"Async Inference Stream Error: {e}")
            yield f"Error computing stream: {str(e)}"

            
    def get_available_models(self) -> List[str]:
        """
        Returns a list of model names available in Ollama.
        """
        try:
            models_info = ollama.list()
            # Handle different Ollama client response formats
            if isinstance(models_info, dict) and 'models' in models_info:
                return [m.get('name', m.get('model', '')) for m in models_info['models'] if m.get('name') or m.get('model')]
            elif hasattr(models_info, 'models'):
                return [getattr(m, 'name', getattr(m, 'model', '')) for m in models_info.models]
            return []
        except Exception as e:
            self.logger.error(f"Error listing models: {e}")
            # Fallback defaults if offline
            return ["gemma-3-4b", "qwen3", "ministral-3b"]
