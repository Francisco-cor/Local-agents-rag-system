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

    def generate(self, model: str, prompt: str, system_context: str = "", options: Dict[str, Any] = None) -> str:
        """
        Single-shot generation.
        """
        if options is None:
            options = {
                "temperature": 0.7,
                "num_ctx": 4096
            }
            
        messages = []
        if system_context:
            messages.append({'role': 'system', 'content': system_context})
        messages.append({'role': 'user', 'content': prompt})
        
        try:
            response = ollama.chat(
                model=model,
                messages=messages,
                options=options,
                keep_alive=0 # Free VRAM after use? Or keep it? The user code had keep_alive=0
            )
            return response['message']['content']
        except Exception as e:
            self.logger.error(f"Inference Error: {e}")
            return f"Error computing response: {str(e)}"

    def generate_stream(self, model: str, prompt: str, system_context: str = "", options: Dict[str, Any] = None) -> Generator[str, None, None]:
        """
        Streaming generation.
        """
        if options is None:
            options = {
                "temperature": 0.7,
                "num_ctx": 4096
            }
            
        messages = []
        if system_context:
            messages.append({'role': 'system', 'content': system_context})
        messages.append({'role': 'user', 'content': prompt})
        
        try:
            stream = ollama.chat(
                model=model,
                messages=messages,
                options=options,
                stream=True,
                keep_alive=0
            )
            
            for chunk in stream:
                content = chunk['message']['content']
                yield content
                
        except Exception as e:
            self.logger.error(f"Inference Stream Error: {e}")
            yield f"Error computing stream: {str(e)}"
            
    def get_available_models(self) -> List[str]:
        """
        Returns a list of model names available in Ollama.
        """
        try:
            models_info = ollama.list()
            # Ollama list structure: {'models': [{'name': 'gemma:latest', ...}, ...]}
            # Or simplified list depending on version. We handle the dict response.
            if 'models' in models_info:
                return [m['name'] for m in models_info['models']]
            return []
        except Exception as e:
            self.logger.error(f"Error listing models: {e}")
            # Fallback defaults if offline
            return ["gemma-3-4b", "qwen3", "ministral-3b"]
