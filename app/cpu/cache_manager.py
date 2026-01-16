import chromadb
from chromadb.config import Settings
import logging
import hashlib
from typing import Optional

class SemanticCache:
    """
    Caches Query -> Response pairs using cosine similarity.
    If a user asks a similar question (threshold > 0.9), return the cached answer.
    """
    def __init__(self, rag_manager):
        self.logger = logging.getLogger("SemanticCache")
        self.logger.setLevel(logging.INFO)
        self.rag = rag_manager
        
        # We reuse the RAG client but different collection
        self.client = self.rag.client
        self.collection = self.client.get_or_create_collection(
            name="semantic_cache",
            metadata={"hnsw:space": "cosine"}
        )
        self.threshold = 0.25 # Chroma distance (cosine distance). Lower is closer. 0.25 ~ 0.87 similarity? 
        # Note: Chroma uses Distance, not Similarity. 0 = identical. 
        # 0.1 is very close. 0.3 is loosely related.
        
    def get_cached_response(self, query: str) -> Optional[str]:
        """Check cache for similar query."""
        embedding = self.rag.embed_text(query)
        
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=1
        )
        
        if not results['ids'] or not results['ids'][0]:
            return None
            
        distance = results['distances'][0][0]
        cached_content = results['documents'][0][0]
        
        self.logger.info(f"Cache check: distance={distance:.4f}")
        
        if distance < self.threshold:
            self.logger.info("⚡ Cache Hit!")
            return cached_content
        
        return None

    def cache_response(self, query: str, response: str):
        """Store valid response in cache."""
        embedding = self.rag.embed_text(query)
        # Use simple hash for ID
        doc_id = hashlib.md5(query.encode()).hexdigest()
        
        self.collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[response],
            metadatas=[{"original_query": query}]
        )
        self.logger.info("Stored response in cache.")
