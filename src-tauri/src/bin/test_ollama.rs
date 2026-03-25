use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    message: ChatMessage,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    println!("📡 Testing Ollama Connectivity...");
    
    let res = client.get("http://localhost:11434/api/tags").send().await?;
    println!("Tags Response: {}", res.status());
    
    let body: serde_json::Value = res.json().await?;
    println!("Available Models: {}", serde_json::to_string_pretty(&body)?);

    let model = if let Some(models) = body.get("models") {
        models.as_array().and_then(|a| a.get(0)).and_then(|m| m.get("name")).and_then(|n| n.as_str()).unwrap_or("llama3")
    } else {
        "llama3"
    };

    println!("\n🤖 Testing Inference with model '{}'...", model);
    
    let request = ChatRequest {
        model: model.to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Say hello in one word.".to_string(),
        }],
        stream: false,
    };

    let res = client.post("http://localhost:11434/api/chat")
        .json(&request)
        .send()
        .await?;

    if res.status().is_success() {
        let chat_res: ChatResponse = res.json().await?;
        println!("Ollama says: {}", chat_res.message.content);
        println!("✅ Inference Verified!");
    } else {
        println!("❌ Inference Failed: {}", res.status());
    }

    Ok(())
}
