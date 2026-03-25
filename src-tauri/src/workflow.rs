use std::sync::Arc;
use tokio::sync::mpsc;
use crate::inference::{InferenceEngine, ChatMessage, ModelOptions};
use crate::rag::{RAGManager, RecursiveTextSplitter};
use crate::prompts::{PROMPT_PROVOCATEUR, PROMPT_CRITIC, PROMPT_SYNTHESIZER};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorkflowStep {
    pub step: String,
    pub status: String,
    pub message: Option<String>,
    pub content: Option<String>,
    pub model: Option<String>,
    pub chunk: Option<String>,
}

pub struct WorkflowManager {
    inference: Arc<InferenceEngine>,
    rag: Arc<RAGManager>,
}

impl WorkflowManager {
    pub fn new(inference: Arc<InferenceEngine>, rag: Arc<RAGManager>) -> Self {
        Self { inference, rag }
    }

    pub async fn run_swarm_flow(
        &self,
        query: String,
        model_name: String,
        options: Option<ModelOptions>,
        tx: mpsc::Sender<WorkflowStep>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 1. Retrieval
        let _ = tx.send(WorkflowStep {
            step: "retrieval".to_string(), status: "running".to_string(),
            message: Some("Searching knowledge base...".to_string()),
            content: None, model: None, chunk: None,
        }).await;

        let results = match self.rag.search(&query, 3).await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("RAG search failed: {}", e);
                let _ = tx.send(WorkflowStep {
                    step: "retrieval".to_string(), status: "warning".to_string(),
                    message: Some(format!("Knowledge base search failed: {}", e)),
                    content: None, model: None, chunk: None,
                }).await;
                Vec::new()
            }
        };
        let context_text = if results.is_empty() {
            "No relevant context found in knowledge base.".to_string()
        } else {
            results.iter().map(|r| format!("---\n{}", r.text)).collect::<Vec<_>>().join("\n")
        };

        let _ = tx.send(WorkflowStep {
            step: "retrieval".to_string(), status: "done".to_string(),
            message: None, content: Some(context_text.clone()), model: None, chunk: None,
        }).await;

        // 2. Provocateur
        let _ = tx.send(WorkflowStep {
            step: "provocateur".to_string(), status: "running".to_string(),
            message: Some("Provocateur drafting...".to_string()),
            content: None, model: None, chunk: None,
        }).await;

        let p_prompt = PROMPT_PROVOCATEUR.replace("{question}", &query).replace("{context}", &context_text);
        let draft = self.inference.generate(&model_name, &p_prompt, None, options.clone(), Some("0".to_string())).await?;

        let _ = tx.send(WorkflowStep {
            step: "provocateur".to_string(), status: "done".to_string(),
            message: None, content: Some(draft.clone()), model: None, chunk: None,
        }).await;

        // 3. Critic
        let _ = tx.send(WorkflowStep {
            step: "critic".to_string(), status: "running".to_string(),
            message: Some("Critic auditing...".to_string()),
            content: None, model: None, chunk: None,
        }).await;

        let c_prompt = PROMPT_CRITIC.replace("{draft}", &draft).replace("{context}", &context_text);
        let critique = self.inference.generate(&model_name, &c_prompt, None, options.clone(), Some("0".to_string())).await?;

        let _ = tx.send(WorkflowStep {
            step: "critic".to_string(), status: "done".to_string(),
            message: None, content: Some(critique.clone()), model: None, chunk: None,
        }).await;

        // 4. Synthesizer
        let _ = tx.send(WorkflowStep {
            step: "synthesizer".to_string(), status: "running".to_string(),
            message: Some("Synthesizing final answer...".to_string()),
            content: None, model: None, chunk: None,
        }).await;

        let s_prompt = PROMPT_SYNTHESIZER
            .replace("{question}", &query)
            .replace("{draft}", &draft)
            .replace("{critique}", &critique);
        let final_result = self.inference.generate(&model_name, &s_prompt, None, options, Some("0".to_string())).await?;

        let _ = tx.send(WorkflowStep {
            step: "synthesizer".to_string(), status: "done".to_string(),
            message: None, content: Some(final_result.clone()), model: None, chunk: None,
        }).await;
        let _ = tx.send(WorkflowStep {
            step: "final_output".to_string(), status: "done".to_string(),
            message: None, content: Some(final_result), model: None, chunk: None,
        }).await;

        Ok(())
    }

    pub async fn run_poetiq_flow(
        &self,
        query: String,
        model_name: String,
        options: Option<ModelOptions>,
        tx: mpsc::Sender<WorkflowStep>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let _ = tx.send(WorkflowStep {
            step: "retrieval".to_string(), status: "running".to_string(),
            message: Some("Searching knowledge base...".to_string()),
            content: None, model: None, chunk: None,
        }).await;

        let results = match self.rag.search(&query, 5).await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("RAG search failed: {}", e);
                let _ = tx.send(WorkflowStep {
                    step: "retrieval".to_string(), status: "warning".to_string(),
                    message: Some(format!("Knowledge base search failed: {}", e)),
                    content: None, model: None, chunk: None,
                }).await;
                Vec::new()
            }
        };
        let context_text = if results.is_empty() {
            "No relevant context found in knowledge base.".to_string()
        } else {
            results.iter().map(|r| format!("---\n{}", r.text)).collect::<Vec<_>>().join("\n")
        };

        let _ = tx.send(WorkflowStep {
            step: "retrieval".to_string(), status: "done".to_string(),
            message: None, content: Some(context_text.clone()), model: None, chunk: None,
        }).await;

        let _ = tx.send(WorkflowStep {
            step: "hypothesis".to_string(), status: "running".to_string(),
            message: Some("Generating initial hypothesis...".to_string()),
            content: None, model: None, chunk: None,
        }).await;

        let hypo_prompt = format!("Context:\n{}\n\nQuestion: {}", context_text, query);
        let hypothesis = self.inference.generate(&model_name, &hypo_prompt, None, options, Some("0".to_string())).await?;

        let _ = tx.send(WorkflowStep {
            step: "hypothesis".to_string(), status: "done".to_string(),
            message: None, content: Some(hypothesis.clone()), model: None, chunk: None,
        }).await;
        let _ = tx.send(WorkflowStep {
            step: "final_output".to_string(), status: "done".to_string(),
            message: None, content: Some(hypothesis), model: None, chunk: None,
        }).await;

        Ok(())
    }

    pub async fn run_raw_flow(
        &self,
        messages: Vec<ChatMessage>,
        model_name: String,
        options: Option<ModelOptions>,
        keep_alive: Option<String>,
        tx: mpsc::Sender<WorkflowStep>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let _ = tx.send(WorkflowStep {
            step: "final_output".to_string(), status: "running".to_string(),
            message: Some(format!("{} is thinking...", model_name)),
            content: None, model: None, chunk: None,
        }).await;

        let stream = self.inference.chat_stream(&model_name, messages, options, keep_alive).await?;
        tokio::pin!(stream);

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result?;
            let _ = tx.send(WorkflowStep {
                step: "final_output".to_string(), status: "streaming".to_string(),
                message: None, content: None,
                model: Some(model_name.clone()), chunk: Some(chunk),
            }).await;
        }

        let _ = tx.send(WorkflowStep {
            step: "final_output".to_string(), status: "done".to_string(),
            message: None, content: None, model: None, chunk: None,
        }).await;

        self.inference.unload(&model_name).await?;

        Ok(())
    }

    pub async fn run_battle_flow(
        &self,
        query: String,
        model_a: String,
        model_b: String,
        options_a: Option<ModelOptions>,
        options_b: Option<ModelOptions>,
        tx: mpsc::Sender<WorkflowStep>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Stream Model A
        let _ = tx.send(WorkflowStep {
            step: "battle".to_string(), status: "running".to_string(),
            model: Some(model_a.clone()),
            message: Some(format!("{} is generating...", model_a)),
            content: None, chunk: None,
        }).await;

        let messages_a = vec![ChatMessage { role: "user".to_string(), content: query.clone() }];
        let stream_a = self.inference.chat_stream(&model_a, messages_a, options_a, Some("0".to_string())).await?;
        tokio::pin!(stream_a);
        while let Some(chunk_result) = stream_a.next().await {
            let chunk = chunk_result?;
            let _ = tx.send(WorkflowStep {
                step: "battle".to_string(), status: "streaming".to_string(),
                model: Some(model_a.clone()), message: None, content: None, chunk: Some(chunk),
            }).await;
        }

        // Unload Model A
        let _ = tx.send(WorkflowStep {
            step: "battle".to_string(), status: "running".to_string(),
            model: Some("system".to_string()),
            message: Some(format!("Unloading {} from VRAM...", model_a)),
            content: None, chunk: None,
        }).await;
        self.inference.unload(&model_a).await?;

        // Stream Model B
        let _ = tx.send(WorkflowStep {
            step: "battle".to_string(), status: "running".to_string(),
            model: Some(model_b.clone()),
            message: Some(format!("{} is generating...", model_b)),
            content: None, chunk: None,
        }).await;

        let messages_b = vec![ChatMessage { role: "user".to_string(), content: query }];
        let stream_b = self.inference.chat_stream(&model_b, messages_b, options_b, Some("0".to_string())).await?;
        tokio::pin!(stream_b);
        while let Some(chunk_result) = stream_b.next().await {
            let chunk = chunk_result?;
            let _ = tx.send(WorkflowStep {
                step: "battle".to_string(), status: "streaming".to_string(),
                model: Some(model_b.clone()), message: None, content: None, chunk: Some(chunk),
            }).await;
        }

        let _ = tx.send(WorkflowStep {
            step: "battle".to_string(), status: "done".to_string(),
            model: None, message: Some("Battle generation complete.".to_string()),
            content: None, chunk: None,
        }).await;

        self.inference.unload(&model_b).await?;

        Ok(())
    }

    pub async fn ingest_file(&self, file_path: String) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let path = std::path::Path::new(&file_path);
        let filename = path.file_name().unwrap_or_default().to_str().unwrap_or("unknown");

        if file_path.to_lowercase().ends_with(".pdf") {
            return Err("PDF ingestion is not yet supported. Please convert the file to .txt or .md first.".into());
        }
        let content = std::fs::read_to_string(&file_path)?;

        let splitter = RecursiveTextSplitter::new(1000, 150);
        let chunks = splitter.split_text(&content);
        self.rag.add_documents(chunks.clone(), filename).await?;

        Ok(format!("Successfully ingested {} ({} chunks)", filename, chunks.len()))
    }
}
