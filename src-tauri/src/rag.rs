use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use crate::inference::InferenceEngine;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

// ─── RecursiveTextSplitter ─────────────────────────────────────────────────────

pub struct RecursiveTextSplitter {
    chunk_size: usize,
    chunk_overlap: usize,
}

impl RecursiveTextSplitter {
    pub fn new(chunk_size: usize, chunk_overlap: usize) -> Self {
        Self { chunk_size, chunk_overlap }
    }

    pub fn split_text(&self, text: &str) -> Vec<String> {
        let mut chunks = Vec::new();
        let mut start = 0;

        while start < text.len() {
            let mut end = start + self.chunk_size;
            if end >= text.len() {
                chunks.push(text[start..].to_string());
                break;
            }

            if let Some(pos) = text[start..end].rfind('\n') {
                end = start + pos;
            } else if let Some(pos) = text[start..end].rfind(' ') {
                end = start + pos;
            }

            chunks.push(text[start..end].trim().to_string());
            start = end - self.chunk_overlap.min(end - start);
        }
        chunks
    }
}

// ─── RAGManager (SQLite-backed, zero external tool requirements) ───────────────

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub id: String,
    pub text: String,
    pub source: String,
    pub chunk_index: i32,
    pub score: f32,
}

pub struct RAGManager {
    conn: Arc<Mutex<Connection>>,
    inference: Arc<InferenceEngine>,
}

impl RAGManager {
    pub fn new(
        db_dir: PathBuf,
        inference: Arc<InferenceEngine>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        std::fs::create_dir_all(&db_dir)?;
        let conn = Connection::open(db_dir.join("rag.db"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS knowledge_base (
                id          TEXT PRIMARY KEY,
                text        TEXT NOT NULL,
                source      TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                embedding   BLOB NOT NULL
            )",
            [],
        )?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            inference,
        })
    }

    pub async fn add_documents(
        &self,
        texts: Vec<String>,
        source: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        for (i, text) in texts.iter().enumerate() {
            let embedding = self.inference.get_embeddings("nomic-embed-text", text).await?;
            let bytes = embedding_to_bytes(&embedding);
            let id = Uuid::new_v4().to_string();
            let conn = self.conn.lock().map_err(|_| "RAG connection lock poisoned")?;
            conn.execute(
                "INSERT OR REPLACE INTO knowledge_base (id, text, source, chunk_index, embedding)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, text, source, i as i32, bytes],
            )?;
        }
        Ok(())
    }

    pub async fn search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>, Box<dyn std::error::Error + Send + Sync>> {
        let query_embedding = self.inference.get_embeddings("nomic-embed-text", query).await?;

        let conn = self.conn.lock().map_err(|_| "RAG connection lock poisoned")?;
        let mut stmt = conn.prepare(
            "SELECT id, text, source, chunk_index, embedding FROM knowledge_base",
        )?;

        let mut scored: Vec<(f32, SearchResult)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i32>(3)?,
                    row.get::<_, Vec<u8>>(4)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .map(|(id, text, source, chunk_index, bytes)| {
                let embedding = bytes_to_embedding(&bytes);
                let score = cosine_similarity(&query_embedding, &embedding);
                (score, SearchResult { id, text, source, chunk_index, score })
            })
            .collect();

        // total_cmp handles NaN deterministically (NaN sorts last) without panicking.
        scored.sort_by(|a, b| b.0.total_cmp(&a.0));
        Ok(scored.into_iter().take(limit).map(|(_, r)| r).collect())
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn bytes_to_embedding(bytes: &[u8]) -> Vec<f32> {
    debug_assert!(
        bytes.len() % 4 == 0,
        "Embedding BLOB length {} is not divisible by 4 — trailing bytes will be silently dropped",
        bytes.len()
    );
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}
