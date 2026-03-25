use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::error::Error;

// ─── Chat / Generate types ────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<serde_json::Value>,
    pub keep_alive: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ChatResponse {
    pub model: String,
    pub message: ChatMessage,
    pub done: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GenerateStreamResponse {
    pub model: String,
    pub response: String,
    pub done: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GenerateRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
    pub keep_alive: i32,
}

#[derive(Deserialize, Debug)]
pub struct ModelInfo {
    pub name: String,
    pub size: Option<u64>,
}

#[derive(Deserialize, Debug)]
pub struct ModelsResponse {
    pub models: Vec<ModelInfo>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct EmbeddingRequest {
    pub model: String,
    pub prompt: String,
}

#[derive(Deserialize, Debug)]
pub struct EmbeddingResponse {
    pub embedding: Vec<f32>,
}

// ─── Model options (forwarded to Ollama) ─────────────────────────────────────

/// Options forwarded verbatim to the Ollama `options` field.
/// All fields are optional — unset fields are omitted from the request.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ModelOptions {
    /// Context window size (tokens). Defaults to model's trained context.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_ctx: Option<u32>,
    /// GPU layers to offload. 0 = CPU-only, equals num_layers = fully on GPU.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_gpu: Option<i32>,
    /// CPU threads. None = Ollama auto-detects.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_thread: Option<u32>,
}

// ─── Model capabilities (returned by /api/show + /api/tags) ──────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ModelCapabilities {
    pub name: String,
    pub size_gb: f64,
    pub num_layers: u32,
    pub max_context: u32,
    pub architecture: String,
    pub parameter_size: String,
    pub quantization: String,
}

// ─── Hardware info ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HardwareInfo {
    pub total_ram_gb: f64,
    pub available_ram_gb: f64,
    pub cpu_cores: usize,
    pub cpu_name: String,
    pub gpu_vram_mb: u64,
    pub gpu_name: String,
}

// ─── InferenceEngine ─────────────────────────────────────────────────────────

pub struct InferenceEngine {
    client: Client,
    base_url: std::sync::RwLock<String>,
}

impl InferenceEngine {
    pub fn new(base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: std::sync::RwLock::new(
                base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
            ),
        }
    }

    pub fn get_base_url(&self) -> String {
        self.base_url
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn set_base_url(&self, url: String) {
        *self.base_url.write().unwrap_or_else(|e| e.into_inner()) = url;
    }

    fn url(&self) -> String {
        self.get_base_url()
    }

    // ─── Chat / Generate ─────────────────────────────────────────────────────

    pub async fn generate(
        &self,
        model: &str,
        prompt: &str,
        system_context: Option<&str>,
        options: Option<ModelOptions>,
        keep_alive: Option<String>,
    ) -> Result<String, Box<dyn Error + Send + Sync>> {
        let mut messages = Vec::new();
        if let Some(ctx) = system_context {
            messages.push(ChatMessage { role: "system".to_string(), content: ctx.to_string() });
        }
        messages.push(ChatMessage { role: "user".to_string(), content: prompt.to_string() });

        let request = ChatRequest {
            model: model.to_string(),
            messages,
            stream: false,
            options: options.map(|o| serde_json::to_value(o).unwrap_or(serde_json::Value::Null)),
            keep_alive: keep_alive.unwrap_or_else(|| "5m".to_string()),
        };

        let res = self.client
            .post(format!("{}/api/chat", self.url()))
            .json(&request)
            .send()
            .await?
            .json::<ChatResponse>()
            .await?;

        Ok(res.message.content)
    }

    pub async fn chat_stream(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        options: Option<ModelOptions>,
        keep_alive: Option<String>,
    ) -> Result<impl futures_util::Stream<Item = Result<String, Box<dyn Error + Send + Sync>>>, Box<dyn Error + Send + Sync>> {
        let request = ChatRequest {
            model: model.to_string(),
            messages,
            stream: true,
            options: options.map(|o| serde_json::to_value(o).unwrap_or(serde_json::Value::Null)),
            keep_alive: keep_alive.unwrap_or_else(|| "5m".to_string()),
        };

        let response = self.client
            .post(format!("{}/api/chat", self.url()))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Ollama error: {}", response.status()).into());
        }

        let stream = response.bytes_stream();

        // Each Ollama /api/chat streaming line is a JSON object terminated by '\n'.
        // The loop always advances the buffer past each line (parsed or not) so that
        // a malformed/empty line never blocks processing of subsequent valid lines.
        let token_stream = futures_util::stream::unfold(
            (stream, String::new()),
            move |(mut stream, mut buffer)| async move {
                use futures_util::StreamExt;

                loop {
                    // Drain any complete lines already sitting in the buffer.
                    if let Some(newline_idx) = buffer.find('\n') {
                        let line = buffer[..newline_idx].trim().to_string();
                        buffer = buffer[newline_idx + 1..].to_string(); // always advance

                        if line.is_empty() {
                            continue; // skip blank separators
                        }
                        if let Ok(res) = serde_json::from_str::<ChatResponse>(&line) {
                            if !res.message.content.is_empty() {
                                return Some((Ok(res.message.content), (stream, buffer)));
                            }
                            // done=true sends an empty content — skip it and let the
                            // stream terminate naturally when bytes_stream returns None.
                            continue;
                        }
                        // Non-parseable line (status, error text, etc.): skip.
                        continue;
                    }

                    // Buffer has no complete line — fetch more bytes.
                    match stream.next().await {
                        Some(Ok(bytes)) => match std::str::from_utf8(&bytes) {
                            Ok(s) => buffer.push_str(s),
                            Err(e) => return Some((Err(format!("UTF-8 decode error: {e}").into()), (stream, buffer))),
                        },
                        Some(Err(e)) => return Some((Err(Box::new(e) as Box<dyn Error + Send + Sync>), (stream, buffer))),
                        None => return None,
                    }
                }
            },
        );

        Ok(token_stream)
    }

    pub async fn unload(&self, model: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        println!("System: Unloading model {}...", model);
        let request = GenerateRequest {
            model: model.to_string(),
            prompt: "".to_string(),
            stream: false,
            keep_alive: 0,
        };
        self.client
            .post(format!("{}/api/generate", self.url()))
            .json(&request)
            .send()
            .await?;
        Ok(())
    }

    pub async fn get_embeddings(&self, model: &str, prompt: &str) -> Result<Vec<f32>, Box<dyn Error + Send + Sync>> {
        let request = EmbeddingRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
        };
        let res = self.client
            .post(format!("{}/api/embeddings", self.url()))
            .json(&request)
            .send()
            .await?
            .json::<EmbeddingResponse>()
            .await?;
        Ok(res.embedding)
    }

    pub async fn list_models(&self) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
        let res = self.client
            .get(format!("{}/api/tags", self.url()))
            .send()
            .await?
            .json::<ModelsResponse>()
            .await?;
        Ok(res.models.into_iter().map(|m| m.name).collect())
    }

    // ─── Model capabilities ───────────────────────────────────────────────────

    /// Fetches model metadata from Ollama: layer count, context length,
    /// architecture, quantization, and file size (bytes).
    pub async fn get_model_capabilities(&self, model: &str) -> Result<ModelCapabilities, Box<dyn Error + Send + Sync>> {
        // /api/show → architecture, layers, context
        let show_body = serde_json::json!({ "model": model });
        let show: serde_json::Value = self.client
            .post(format!("{}/api/show", self.url()))
            .json(&show_body)
            .send()
            .await?
            .json()
            .await?;

        let details = show.get("details").cloned().unwrap_or(serde_json::Value::Null);
        let model_info = show.get("model_info").cloned().unwrap_or(serde_json::Value::Null);

        let architecture = details.get("family")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let parameter_size = details.get("parameter_size")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let quantization = details.get("quantization_level")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        // block_count key varies by architecture: "llama.block_count", "qwen2.block_count", etc.
        let num_layers = model_info.as_object()
            .and_then(|obj| obj.iter().find(|(k, _)| k.ends_with("block_count")))
            .and_then(|(_, v)| v.as_u64())
            .unwrap_or(32) as u32;

        let max_context = model_info.as_object()
            .and_then(|obj| obj.iter().find(|(k, _)| k.ends_with("context_length")))
            .and_then(|(_, v)| v.as_u64())
            .unwrap_or(4096) as u32;

        // /api/tags → size_bytes for this model
        let tags: ModelsResponse = self.client
            .get(format!("{}/api/tags", self.url()))
            .send()
            .await?
            .json()
            .await?;

        let size_bytes = tags.models.iter()
            .find(|m| m.name == model || m.name.starts_with(model))
            .and_then(|m| m.size)
            .unwrap_or(0);

        Ok(ModelCapabilities {
            name: model.to_string(),
            size_gb: size_bytes as f64 / 1_073_741_824.0,
            num_layers,
            max_context,
            architecture,
            parameter_size,
            quantization,
        })
    }
}

// ─── Hardware scan (no async needed) ─────────────────────────────────────────

pub fn scan_hardware() -> HardwareInfo {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_gb = sys.total_memory() as f64 / 1_073_741_824.0;
    let available_ram_gb = sys.available_memory() as f64 / 1_073_741_824.0;
    let cpu_cores = sys.cpus().len();
    let cpu_name = sys.cpus().first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    let (gpu_name, gpu_vram_mb) = detect_gpu();

    HardwareInfo { total_ram_gb, available_ram_gb, cpu_cores, cpu_name, gpu_vram_mb, gpu_name }
}

fn detect_gpu() -> (String, u64) {
    // Try nvidia-smi first (NVIDIA GPUs)
    if let Ok(out) = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
    {
        if let Ok(stdout) = String::from_utf8(out.stdout) {
            // Output: "NVIDIA GeForce RTX 4070, 12288"
            let line = stdout.lines().next().unwrap_or("").trim();
            if let Some((name, vram_str)) = line.rsplit_once(',') {
                let name = name.trim().to_string();
                let vram_mb = vram_str.trim().parse::<u64>().unwrap_or(0);
                if vram_mb > 0 {
                    return (name, vram_mb);
                }
            }
        }
    }

    // Windows fallback: WMIC (catches AMD/Intel iGPU too)
    #[cfg(target_os = "windows")]
    if let Ok(out) = std::process::Command::new("wmic")
        .args(["path", "Win32_VideoController", "get", "Name,AdapterRAM", "/format:csv"])
        .output()
    {
        if let Ok(stdout) = String::from_utf8(out.stdout) {
            for line in stdout.lines().skip(2) {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 3 {
                    let ram_bytes = parts[1].trim().parse::<u64>().unwrap_or(0);
                    let name = parts[2].trim().to_string();
                    if ram_bytes > 0 && !name.is_empty() {
                        return (name, ram_bytes / 1_048_576);
                    }
                }
            }
        }
    }

    ("No dedicated GPU detected".to_string(), 0)
}
