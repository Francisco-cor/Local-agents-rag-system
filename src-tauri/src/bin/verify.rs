use app_lib::inference::InferenceEngine;
use app_lib::rag::RAGManager;
use app_lib::arena::BattleManager;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Starting Verification...");

    let inference = Arc::new(InferenceEngine::new(None));

    // 1. Ollama connectivity
    println!("\n1. Verifying Ollama Connectivity...");
    let models = inference.list_models().await?;
    println!("Available models: {:?}", models);

    let test_model = models.first().expect("No models found in Ollama").clone();
    println!("Using model '{}' for tests.", test_model);

    if !models.iter().any(|m| m.contains("nomic-embed-text")) {
        println!("WARNING: 'nomic-embed-text' not found. RAG tests will fail.");
        println!("Run: ollama pull nomic-embed-text");
    }

    // 2. RAG (SQLite-backed)
    println!("\n2. Verifying RAG (SQLite vector store)...");
    let temp_dir = std::env::current_dir()?.join("temp_verify_rag");
    let rag = Arc::new(RAGManager::new(temp_dir.clone(), inference.clone())?);

    let test_texts = vec![
        "The capital of France is Paris.".to_string(),
        "Rust is a systems programming language focused on safety and performance.".to_string(),
    ];

    println!("Ingesting test documents...");
    rag.add_documents(test_texts, "test_source").await?;

    println!("Searching 'What is Rust?'...");
    let results = rag.search("What is Rust?", 1).await?;
    if let Some(res) = results.first() {
        println!("Top match (score {:.3}): {}", res.score, res.text);
        println!("RAG verified.");
    } else {
        eprintln!("RAG search returned no results.");
    }

    // 3. Arena ELO
    println!("\n3. Verifying Arena & ELO...");
    let arena_dir = std::env::current_dir()?.join("temp_verify_arena");
    let mut bm = BattleManager::new(arena_dir.clone());

    let leaderboard = bm.record_match("ModelA".to_string(), "ModelB".to_string(), "A");
    for entry in &leaderboard {
        println!("{}: {:.2}", entry.model, entry.elo);
    }

    let model_a = bm.get_leaderboard().into_iter().find(|m| m.model == "ModelA");
    match model_a {
        Some(a) if a.elo > 1000.0 => println!("ELO updated correctly."),
        _ => eprintln!("ELO update failed"),
    }

    println!("\nVerification Complete!");

    // Cleanup
    let _ = std::fs::remove_dir_all(temp_dir);
    let _ = std::fs::remove_dir_all(arena_dir);

    Ok(())
}
