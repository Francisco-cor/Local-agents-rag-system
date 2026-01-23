import os
import uuid
import logging
from typing import Generator, Dict, Any, AsyncGenerator
from app.cpu.rag_manager import RAGManager
from app.gpu.inference_engine import InferenceEngine
from app.orchestrator.agent_prompts import PROMPT_PROVOCATEUR, PROMPT_CRITIC, PROMPT_SYNTHESIZER
from app.orchestrator.advanced_engine import AdvancedEngine
from app.cpu.cache_manager import SemanticCache

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
        self.advanced = AdvancedEngine(self.rag, self.engine)
        self.cache = SemanticCache(self.rag)

    async def process_query(self, query: str, model_name: str = "gemma-3-4b"):
        """
        Standard RAG Flow:
        1. Check Cache (and get embedding)
        2. Retrieve context (CPU)
        3. Format prompt
        4. Generate response (GPU)
        """
        # 0. Check Semantic Cache (Fast Path) - REUSES EMBEDDING
        cached, embedding = self.cache.get_cached_response(query, model_name)
        if cached:
            return {
                "response": cached,
                "sources": [{"source": "Semantic Cache"}],
                "context_used": f"Fetched directly from Memory for {model_name} (0ms latency)"
            }
            
        # 0. Intercept for PoetIQ Variant
        if "(PoetIQ)" in model_name:
            # Strip the tag to get the base model
            base_model = model_name.replace(" (PoetIQ)", "")
            self.logger.info(f"Routing to Refined PoetIQ Flow for {base_model}")
            
            final_res = ""
            sources = []
            context_used = ""
            
            # Use async generator
            async for step in self.run_poetiq_flow(query, base_model):
                if step["step"] == "retrieval" and step["status"] == "done":
                    context_used = step["content"]
                    sources = step.get("sources", [])
                if step["step"] == "final_output":
                    final_res = step["content"]
            
            return {
                "response": final_res,
                "sources": sources,
                "context_used": context_used + "\n[Processed via Refined PoetIQ System]"
            }

        # 1. Retrieval - USE PRE-COMPUTED EMBEDDING
        self.logger.info(f"Retrieving context for: {query}")
        results = self.rag.search(query, n_results=3, query_embedding=embedding)
        
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
        
        # 3. Generation (Async)
        self.logger.info(f"Generating response with model: {model_name}")
        response = await self.engine.async_generate(
            model=model_name,
            prompt=query,
            system_context=system_prompt
        )
        
        # 4. Cache Update
        self.cache.cache_response(query, response, model_name)
        
        return {
            "response": response,
            "sources": sources,
            "context_used": context_text
        }

    def ingest_file(self, file_path: str):
        """
        Ingest a file (PDF or TXT) into the vector DB using Batch Insertion.
        """
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
            
        # Recursive Chunking
        from app.cpu.rag_manager import RecursiveTextSplitter
        splitter = RecursiveTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = splitter.split_text(text)
            
        # Prepare Batch
        texts = []
        metadatas = []
        ids = []
        
        for i, chunk in enumerate(chunks):
            chunk_id = f"{filename}_chunk_{i}_{uuid.uuid4().hex[:8]}"
            texts.append(chunk)
            metadatas.append({"source": filename, "chunk_index": i})
            ids.append(chunk_id)
            
        # Batch Ingest
        self.rag.add_documents(texts=texts, metadatas=metadatas, ids=ids)
            
        self.logger.info(f"Ingested {len(chunks)} chunks from {filename} using Recursive Splitter")
        return f"Successfully ingested {filename} ({len(chunks)} chunks)"

    async def run_swarm_flow(self, query: str, model_name: str = "gemma-3-4b") -> AsyncGenerator[Dict[str, Any], None]:
        """
        Executes the Swarm Agentic Loop (Asynchronous):
        1. Retrieval
        2. Provocateur (Draft)
        3. Critic (Audit)
        4. Synthesizer (Final Polish)
        """
        # Step 1: Retrieval
        yield {"step": "retrieval", "status": "running", "message": "Searching knowledge base..."}
        
        # We also optimize retrieval here (cache check could be added if needed, but keeping swarm pure for now)
        results = self.rag.search(query, n_results=3)
        self.logger.info(f"Swarm: Retrieved {len(results)} chunks.")
        context_text = ""
        for res in results:
            context_text += f"---\n{res['text']}\n"
        
        yield {"step": "retrieval", "status": "done", "content": context_text, "sources": [r['metadata'] for r in results]}
        
        # Step 2: Provocateur (The Provocateur drafts an initial response)
        yield {"step": "provocateur", "status": "running", "message": "Provocateur is drafting initial response..."}
        prompt_p = PROMPT_PROVOCATEUR.format(question=query, context=context_text)
        draft = await self.engine.async_generate(model=model_name, prompt=prompt_p, options={"temperature": 0.8})
        yield {"step": "provocateur", "status": "done", "content": draft}
        
        # Step 3: Critic (The Critic performs an audit of the initial draft)
        yield {"step": "critic", "status": "running", "message": "Critic is auditing the draft..."}
        prompt_c = PROMPT_CRITIC.format(draft=draft, context=context_text)
        critique = await self.engine.async_generate(model=model_name, prompt=prompt_c, options={"temperature": 0.1})
        yield {"step": "critic", "status": "done", "content": critique}
        
        # Step 4: Synthesizer (The Synthesizer compiles the final response)
        yield {"step": "synthesizer", "status": "running", "message": "Synthesizer is writing final response..."}
        prompt_s = PROMPT_SYNTHESIZER.format(question=query, draft=draft, critique=critique)
        final_response = await self.engine.async_generate(model=model_name, prompt=prompt_s, options={"temperature": 0.3})
        yield {"step": "synthesizer", "status": "done", "content": final_response}

    async def run_poetiq_flow(self, query: str, model_name: str = "gemma-3-4b") -> AsyncGenerator[Dict[str, Any], None]:
        """
        Wrapper for PoetIQ flow.
        """
        async for step in self.advanced.run_poetiq_rag(query, model_name):
            yield step

    async def run_simple_flow(self, query: str, model_name: str = "gemma-3-4b") -> AsyncGenerator[Dict[str, Any], None]:
        """
        Standard RAG Flow as an AsyncGenerator for UI:
        1. Retrieval
        2. Generation
        """
        # Step 1: Retrieval
        yield {"step": "retrieval", "status": "running", "message": "Searching knowledge base..."}
        
        results = self.rag.search(query, n_results=3)
        self.logger.info(f"Simple: Retrieved {len(results)} chunks.")
        context_text = ""
        for res in results:
            context_text += f"---\n{res['text']}\n"
        
        yield {"step": "retrieval", "status": "done", "content": context_text, "sources": [r['metadata'] for r in results]}
        
        # Step 2: Generation
        yield {"step": "final_output", "status": "running", "message": f"{model_name} is generating answer..."}
        
        system_prompt = (
            "You are a helpful assistant. Use the following context to answer the user's question. "
            "If the answer is not in the context, say so."
            f"\n\nCONTEXT:\n{context_text}"
        )
        
        response = await self.engine.async_generate(
            model=model_name,
            prompt=query,
            system_context=system_prompt
        )
        
    async def run_raw_flow(self, query: str, model_name: str = "gemma-3-4b") -> AsyncGenerator[Dict[str, Any], None]:
        """
        Pure Model Inference without RAG or Cache (Asynchronous Generator for UI).
        Used for Arena evaluations.
        """
        yield {"step": "final_output", "status": "running", "message": f"{model_name} is thinking..."}
        
        full_response = ""
        async for chunk in self.engine.async_generate_stream(model=model_name, prompt=query):
            full_response += chunk
            # We yield the partial response so UI can stream it
            yield {"step": "final_output", "status": "streaming", "content": full_response}
        
        yield {"step": "final_output", "status": "done", "content": full_response}
