pub mod inference;
pub mod prompts;
pub mod rag;
pub mod arena;
pub mod workflow;
pub mod db;

use std::sync::Arc;
use tauri::{Manager, State, Emitter};
use crate::inference::{InferenceEngine, ModelOptions, HardwareInfo, ModelCapabilities};
use crate::rag::RAGManager;
use crate::arena::BattleManager;
use crate::workflow::{WorkflowManager, WorkflowStep};
use crate::db::DbManager;
use tokio::sync::mpsc;

struct AppState {
    inference: Arc<InferenceEngine>,
    battle_manager: Arc<std::sync::Mutex<BattleManager>>,
    workflow: Arc<WorkflowManager>,
    db: Arc<std::sync::Mutex<DbManager>>,
}

// ─── Ollama URL ───────────────────────────────────────────────────────────────

#[tauri::command]
fn get_ollama_url(state: State<'_, AppState>) -> String {
    state.inference.get_base_url()
}

#[tauri::command]
fn set_ollama_url(url: String, state: State<'_, AppState>) {
    state.inference.set_base_url(url);
}

// ─── Hardware & Model capabilities ───────────────────────────────────────────

#[tauri::command]
async fn scan_hardware() -> Result<HardwareInfo, String> {
    Ok(tokio::task::spawn_blocking(inference::scan_hardware)
        .await
        .map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn get_model_capabilities(
    model: String,
    state: State<'_, AppState>,
) -> Result<ModelCapabilities, String> {
    state.inference.get_model_capabilities(&model).await.map_err(|e| e.to_string())
}

// ─── Models ───────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_models(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.inference.list_models().await.map_err(|e| e.to_string())
}

// ─── Swarm / PoetIQ / Raw / Battle ────────────────────────────────────────────

#[tauri::command]
async fn run_swarm(
    query: String,
    model: String,
    model_options: Option<ModelOptions>,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let (tx, mut rx) = mpsc::channel::<WorkflowStep>(64);
    let workflow = state.workflow.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = workflow.run_swarm_flow(query, model, model_options, tx).await {
            eprintln!("Workflow error: {}", e);
        }
    });

    while let Some(step) = rx.recv().await {
        let _ = window.emit("swarm-step", step);
    }
    Ok(())
}

#[tauri::command]
async fn run_poetiq(
    query: String,
    model: String,
    model_options: Option<ModelOptions>,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let (tx, mut rx) = mpsc::channel::<WorkflowStep>(64);
    let workflow = state.workflow.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = workflow.run_poetiq_flow(query, model, model_options, tx).await {
            eprintln!("Workflow error: {}", e);
        }
    });

    while let Some(step) = rx.recv().await {
        let _ = window.emit("poetiq-step", step);
    }
    Ok(())
}

#[tauri::command]
async fn run_raw(
    query: String,
    model: String,
    conversation_id: Option<i32>,
    model_options: Option<ModelOptions>,
    keep_alive: Option<String>,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let mut messages = Vec::new();

    if let Some(id) = conversation_id {
        let db = state.db.clone();
        let history = tokio::task::spawn_blocking(move || {
            db.lock()
                .map_err(|_| "DB lock poisoned".to_string())?
                .get_messages(id)
                .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())??;

        let start = if history.len() > 10 { history.len() - 10 } else { 0 };
        for msg in &history[start..] {
            messages.push(crate::inference::ChatMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }
    }

    if messages.is_empty() || messages.last().map(|m| &m.content) != Some(&query) {
        messages.push(crate::inference::ChatMessage {
            role: "user".to_string(),
            content: query,
        });
    }

    let (tx, mut rx) = mpsc::channel::<WorkflowStep>(64);
    let workflow = state.workflow.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = workflow.run_raw_flow(messages, model, model_options, keep_alive, tx).await {
            eprintln!("Workflow error: {}", e);
        }
    });

    while let Some(step) = rx.recv().await {
        let _ = window.emit("raw-step", step);
    }
    Ok(())
}

#[tauri::command]
async fn run_battle(
    query: String,
    model_a: String,
    model_b: String,
    options_a: Option<ModelOptions>,
    options_b: Option<ModelOptions>,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    let (tx, mut rx) = mpsc::channel::<WorkflowStep>(64);
    let workflow = state.workflow.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = workflow.run_battle_flow(query, model_a, model_b, options_a, options_b, tx).await {
            eprintln!("Workflow error: {}", e);
        }
    });

    while let Some(step) = rx.recv().await {
        let _ = window.emit("battle-step", step);
    }
    Ok(())
}

// ─── Arena / ELO ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_leaderboard(state: State<'_, AppState>) -> Result<Vec<arena::ModelRating>, String> {
    let bm = state.battle_manager.clone();
    tokio::task::spawn_blocking(move || {
        bm.lock()
            .map_err(|_| "Battle manager lock poisoned".to_string())
            .map(|b| b.get_leaderboard())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn record_battle(
    model_a: String,
    model_b: String,
    outcome: String,
    state: State<'_, AppState>,
) -> Result<Vec<arena::ModelRating>, String> {
    let bm = state.battle_manager.clone();
    tokio::task::spawn_blocking(move || {
        bm.lock()
            .map_err(|_| "Battle manager lock poisoned".to_string())
            .map(|mut b| b.record_match(model_a, model_b, &outcome))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_arena_battle(
    prompt: String,
    model_a: String,
    model_b: String,
    model_c: Option<String>,
    response_a: String,
    response_b: String,
    response_c: Option<String>,
    winner: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .save_arena_battle(prompt, model_a, model_b, model_c, response_a, response_b, response_c, winner)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_arena_history(state: State<'_, AppState>) -> Result<Vec<db::ArenaBattle>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .get_arena_history()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── RAG Ingestion ────────────────────────────────────────────────────────────

#[tauri::command]
async fn ingest_data(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.workflow.ingest_file(file_path).await.map_err(|e| e.to_string())
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_workspaces(state: State<'_, AppState>) -> Result<Vec<db::Workspace>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .get_workspaces()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_workspace(name: String, state: State<'_, AppState>) -> Result<i32, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .create_workspace(name)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── Folders ──────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_folders(workspace_id: i32, state: State<'_, AppState>) -> Result<Vec<db::Folder>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .get_folders(workspace_id)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_folder(workspace_id: i32, name: String, state: State<'_, AppState>) -> Result<i32, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .create_folder(workspace_id, name)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── Conversations ────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_conversations_by_folder(folder_id: i32, state: State<'_, AppState>) -> Result<Vec<db::Conversation>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .get_conversations_by_folder(folder_id)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_conversation(
    folder_id: i32,
    title: String,
    model_used: Option<String>,
    state: State<'_, AppState>,
) -> Result<i32, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .create_conversation(folder_id, title, model_used)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_conversations(state: State<'_, AppState>) -> Result<Vec<db::Conversation>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .get_all_conversations()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ensure_default_folder(state: State<'_, AppState>) -> Result<i32, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .ensure_default_context()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── Messages ─────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_messages(conversation_id: i32, state: State<'_, AppState>) -> Result<Vec<db::Message>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .get_messages(conversation_id)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_message(
    conversation_id: i32,
    role: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.lock()
            .map_err(|_| "DB lock poisoned".to_string())?
            .save_message(conversation_id, role, content)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── App Entry Point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");

            let inference = Arc::new(InferenceEngine::new(None));
            let rag = Arc::new(
                RAGManager::new(app_data_dir.join("rag_db"), inference.clone())
                    .expect("Failed to init RAGManager"),
            );
            let battle_manager = Arc::new(std::sync::Mutex::new(BattleManager::new(app_data_dir.clone())));
            let workflow = Arc::new(WorkflowManager::new(inference.clone(), rag));
            let db = Arc::new(std::sync::Mutex::new(
                DbManager::new(app_data_dir).expect("Failed to init SQLite"),
            ));

            app.manage(AppState { inference, battle_manager, workflow, db });

            app.handle().plugin(tauri_plugin_shell::init())?;
            app.handle().plugin(tauri_plugin_dialog::init())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_ollama_url,
            set_ollama_url,
            scan_hardware,
            get_model_capabilities,
            get_models,
            run_swarm,
            run_poetiq,
            run_raw,
            run_battle,
            get_leaderboard,
            record_battle,
            ingest_data,
            get_workspaces,
            create_workspace,
            get_folders,
            create_folder,
            get_conversations_by_folder,
            create_conversation,
            get_messages,
            get_conversations,
            ensure_default_folder,
            save_message,
            save_arena_battle,
            get_arena_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
