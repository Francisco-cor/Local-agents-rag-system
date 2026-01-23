import os
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import logging
import pypdf
from typing import List, Dict

class RAGManager:
    """
    Manages the CPU-bound RAG operations:
    1. Embedding generation (CPU model)
    2. Vector Database interaction (ChromaDB)
    3. Document retrieval
    
    Strictly NO LLM inference here.
    """
    def __init__(self, persist_directory: str = "./data/chroma_db", embedding_model_name: str = "nomic-ai/nomic-embed-text-v1.5"):
        self.logger = logging.getLogger("RAGManager")
        self.logger.setLevel(logging.INFO)
        
        self.logger.info(f"Initializing RAGManager with model: {embedding_model_name}")
        
        # Initialize Embedding Model (CPU)
        # trust_remote_code=True is often needed for newer models like nomic
        self.embedder = SentenceTransformer(embedding_model_name, device='cpu', trust_remote_code=True)
        
        # Initialize ChromaDB
        self.logger.info(f"Connecting to ChromaDB at {persist_directory}")
        self.client = chromadb.PersistentClient(path=persist_directory, settings=Settings(allow_reset=True))
        
        # Get or Create Collection
        self.collection = self.client.get_or_create_collection(name="local_knowledge_base")

    def parse_pdf(self, file_path: str) -> str:
        """Extract text from a PDF file."""
        text = ""
        try:
            reader = pypdf.PdfReader(file_path)
            for page in reader.pages:
                text += page.extract_text() + "\n"
        except Exception as e:
            self.logger.error(f"Error parsing PDF {file_path}: {e}")
            return ""
        return text

    def parse_text_file(self, file_path: str) -> str:
        """Extract text from a TXT/MD file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            self.logger.error(f"Error parsing text file {file_path}: {e}")
            return ""

    def embed_text(self, text: str):
        """Generate embedding for a single string."""
        embedding = self.embedder.encode(text)
        return embedding.tolist() if hasattr(embedding, 'tolist') else list(embedding)

    def add_document(self, text: str, metadata: dict, doc_id: str, embedding: List[float] = None):
        """Add a document chunk to the vector DB."""
        if not text:
            return False
            
        if embedding is None:
            embedding = self.embed_text(text)
        
        self.collection.add(
            documents=[text],
            embeddings=[embedding],
            metadatas=[metadata],
            ids=[doc_id]
        )
        return True

    def add_documents(self, texts: List[str], metadatas: List[dict], ids: List[str]):
        """Add multiple document chunks to the vector DB (Batch Ingestion)."""
        if not texts:
            return False
            
        # Batch embedding
        embeddings = self.embedder.encode(texts)
        if hasattr(embeddings, 'tolist'):
            embeddings = embeddings.tolist()
        else:
            embeddings = [e.tolist() if hasattr(e, 'tolist') else list(e) for e in embeddings]
        
        self.collection.add(
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
        return True

    def search(self, query: str, n_results: int = 5, query_embedding: List[float] = None):
        """Search for relevant documents."""
        if query_embedding is None:
            query_embedding = self.embedder.encode(query)
            if hasattr(query_embedding, 'tolist'):
                query_embedding = query_embedding.tolist()
            else:
                query_embedding = list(query_embedding)
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        
        # Chroma returns lists of lists. Flatten/Formatting:
        formatted_results = []
        if results['ids']:
            for i in range(len(results['ids'][0])):
                formatted_results.append({
                    "id": results['ids'][0][i],
                    "text": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "distance": results['distances'][0][i] if 'distances' in results else None
                })
                
        return formatted_results

    def reset_db(self):
        """Danger: Clear database."""
        self.client.reset()
