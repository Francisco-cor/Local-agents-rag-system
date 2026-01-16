from app.cpu.rag_manager import RAGManager
from app.gpu.inference_engine import InferenceEngine
import logging

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

    def ingest_text_document(self, text: str, source_name: str):
        """
        Simple ingestion wrapper.
        Real implementation will handle chunking.
        """
        # Simple chunking for now (e.g. by paragraphs or fixed size)
        # TODO: Use a proper TextSplitter in Phase 1.1
        import uuid
        chunks = [text] # Placeholder for chunking logic
        
        count = 0
        for chunk in chunks:
            chunk_id = f"{source_name}_chunk_{uuid.uuid4().hex[:8]}"
            self.rag.add_document(
                text=chunk, 
                metadata={"source": source_name}, 
                doc_id=chunk_id
            )
            count += 1
            
        return count
