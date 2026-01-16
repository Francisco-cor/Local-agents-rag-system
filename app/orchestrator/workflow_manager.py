from app.cpu.rag_manager import RAGManager
from app.gpu.inference_engine import InferenceEngine
from app.orchestrator.agent_prompts import PROMPT_PROVOCATEUR, PROMPT_CRITIC, PROMPT_SYNTHESIZER
import logging
from typing import Generator, Dict, Any

class WorkflowManager:
    """
    The Orchestrator that connects the CPU Brain and the GPU Engine.
    """
    def __init__(self):
        self.logger = logging.getLogger("WorkflowManager")
        self.logger.setLevel(logging.INFO)
        
        self.logger.info("Initializing Workflow Manager...")
        self.rag = RAGManager()
        self.engine = InferenceEngine()

    def process_query(self, query: str, model_name: str = "gemma-3-4b"):
        """
        Standard RAG Flow:
        1. Retrieve context (CPU)
        2. Format prompt
        3. Generate response (GPU)
        """
        # 1. Retrieval
        self.logger.info(f"Retrieving context for: {query}")
        results = self.rag.search(query, n_results=3)
        
        context_text = ""
        sources = []
        for res in results:
            context_text += f"---\n{res['text']}\n"
            sources.append(res['metadata'])
            
        # 2. Prompt Construction
        system_prompt = (
            "You are a helpful assistant. Use the following context to answer the user's question. "
            "If the answer is not in the context, say so."
            f"\n\nCONTEXT:\n{context_text}"
        )
        
        # 3. Generation
        self.logger.info(f"Generating response with model: {model_name}")
        response = self.engine.generate(
            model=model_name,
            prompt=query,
            system_context=system_prompt
        )
        
        return {
            "response": response,
            "sources": sources,
            "context_used": context_text
        }

    def ingest_file(self, file_path: str):
        """
        Ingest a file (PDF or TXT) into the vector DB.
        """
        import os
        filename = os.path.basename(file_path)
        text = ""
        
        if file_path.lower().endswith('.pdf'):
            self.logger.info(f"Parsing PDF: {filename}")
            text = self.rag.parse_pdf(file_path)
        elif file_path.lower().endswith(('.txt', '.md')):
            self.logger.info(f"Parsing Text File: {filename}")
            text = self.rag.parse_text_file(file_path)
        else:
            return f"Unsupported file type: {filename}"
            
        if not text:
            return f"No text extracted from {filename}"
            
        # Recursive Chunking (Basic)
        # TODO: Replace with LangChain's RecursiveCharacterTextSplitter for better results
        chunk_size = 1000
        overlap = 100
        chunks = []
        for i in range(0, len(text), chunk_size - overlap):
            chunks.append(text[i:i + chunk_size])
            
        count = 0
        import uuid
        for i, chunk in enumerate(chunks):
            chunk_id = f"{filename}_chunk_{i}_{uuid.uuid4().hex[:8]}"
            self.rag.add_document(
                text=chunk, 
                metadata={"source": filename, "chunk_index": i}, 
                doc_id=chunk_id
            )
            count += 1
            
        self.logger.info(f"Ingested {count} chunks from {filename}")
        return f"Successfully ingested {filename} ({count} chunks)"

    def run_swarm_flow(self, query: str, model_name: str = "gemma-3-4b") -> Generator[Dict[str, Any], None, None]:
        """
        Executes the Swarm Agentic Loop:
        1. Retrieval
        2. Provocateur (Draft)
        3. Critic (Audit)
        4. Synthesizer (Final Polish)
        
        Yields intermediate steps for UI visualization.
        """
        # Step 1: Retrieval
        yield {"step": "retrieval", "status": "running", "message": "Searching knowledge base..."}
        results = self.rag.search(query, n_results=3)
        context_text = ""
        for res in results:
            context_text += f"---\n{res['text']}\n"
        
        yield {"step": "retrieval", "status": "done", "content": context_text, "sources": [r['metadata'] for r in results]}
        
        # Step 2: Provocateur
        yield {"step": "provocateur", "status": "running", "message": "🧠 Provocateur is brainstorming..."}
        prompt_p = PROMPT_PROVOCATEUR.format(question=query, context=context_text)
        draft = self.engine.generate(model=model_name, prompt=prompt_p, options={"temperature": 0.8}) # High temp for creativity
        yield {"step": "provocateur", "status": "done", "content": draft}
        
        # Step 3: Critic
        yield {"step": "critic", "status": "running", "message": "🧐 Critic is auditing the draft..."}
        prompt_c = PROMPT_CRITIC.format(draft=draft, context=context_text)
        critique = self.engine.generate(model=model_name, prompt=prompt_c, options={"temperature": 0.1}) # Low temp for precision
        yield {"step": "critic", "status": "done", "content": critique}
        
        # Step 4: Synthesizer
        yield {"step": "synthesizer", "status": "running", "message": "✍️ Synthesizer is writing final response..."}
        prompt_s = PROMPT_SYNTHESIZER.format(question=query, draft=draft, critique=critique)
        final_response = self.engine.generate(model=model_name, prompt=prompt_s, options={"temperature": 0.3}) # Balanced
        yield {"step": "synthesizer", "status": "done", "content": final_response}
