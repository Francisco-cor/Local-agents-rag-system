use rusqlite::{Connection, Result, params};
use std::path::PathBuf;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Workspace {
    pub id: i32,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Folder {
    pub id: i32,
    pub workspace_id: i32,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Conversation {
    pub id: i32,
    pub folder_id: i32,
    pub title: String,
    pub model_used: Option<String>,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Message {
    pub id: i32,
    pub conversation_id: i32,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ArenaBattle {
    pub id: i32,
    pub prompt: String,
    pub model_a: String,
    pub model_b: String,
    pub model_c: Option<String>,
    pub response_a: String,
    pub response_b: String,
    pub response_c: Option<String>,
    pub winner: Option<String>,
    pub timestamp: String,
}

pub struct DbManager {
    pub conn: Connection,
}

impl DbManager {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        // Asegurar que el directorio existe antes de abrir la DB
        if !data_dir.exists() {
            std::fs::create_dir_all(&data_dir).map_err(|e| {
                rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error { code: rusqlite::ffi::ErrorCode::CannotOpen, extended_code: 14 },
                    Some(format!("Failed to create AppData directory: {}", e))
                )
            })?;
        }

        let db_path = data_dir.join("agents_history.db");
        let conn = Connection::open(db_path)?;

        // WAL mode: allows readers and writer to run concurrently without stalling.
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        // Activar llaves foráneas
        conn.execute("PRAGMA foreign_keys = ON;", [])?;

        // Crear tablas (Esquema relacional)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS workspaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )", [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
            )", [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                model_used TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
            )", [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
            )", [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS arena_battles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                model_a TEXT NOT NULL,
                model_b TEXT NOT NULL,
                model_c TEXT,
                response_a TEXT NOT NULL,
                response_b TEXT NOT NULL,
                response_c TEXT,
                winner TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )", [],
        )?;

        // Robust migration check
        let columns = {
            let mut stmt = conn.prepare("PRAGMA table_info(arena_battles)")?;
            let names: Vec<String> = stmt.query_map([], |row| row.get(1))?
                .filter_map(|r| r.ok())
                .collect();
            names
        };

        if !columns.contains(&"model_c".to_string()) {
            println!("DB: Adding model_c to arena_battles");
            let _ = conn.execute("ALTER TABLE arena_battles ADD COLUMN model_c TEXT", []);
        }
        if !columns.contains(&"response_c".to_string()) {
            println!("DB: Adding response_c to arena_battles");
            let _ = conn.execute("ALTER TABLE arena_battles ADD COLUMN response_c TEXT", []);
        }

        Ok(Self { conn })
    }

    // Workspaces
    pub fn get_workspaces(&self) -> Result<Vec<Workspace>> {
        let mut stmt = self.conn.prepare("SELECT id, name, created_at FROM workspaces ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn create_workspace(&self, name: String) -> Result<i32> {
        self.conn.execute("INSERT INTO workspaces (name) VALUES (?1)", params![name])?;
        Ok(self.conn.last_insert_rowid() as i32)
    }

    // Folders
    pub fn get_folders(&self, workspace_id: i32) -> Result<Vec<Folder>> {
        let mut stmt = self.conn.prepare("SELECT id, workspace_id, name FROM folders WHERE workspace_id = ?1")?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(Folder {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn create_folder(&self, workspace_id: i32, name: String) -> Result<i32> {
        self.conn.execute("INSERT INTO folders (workspace_id, name) VALUES (?1, ?2)", params![workspace_id, name])?;
        Ok(self.conn.last_insert_rowid() as i32)
    }

    pub fn ensure_default_context(&self) -> Result<i32> {
        // Buscar carpeta "General" en workspace "Main"
        let mut stmt = self.conn.prepare(
            "SELECT f.id FROM folders f 
             JOIN workspaces w ON f.workspace_id = w.id 
             WHERE w.name = 'Main' AND f.name = 'General' LIMIT 1"
        )?;
        let mut rows = stmt.query_map([], |row| row.get::<_, i32>(0))?;
        
        if let Some(folder_id) = rows.next() {
            return Ok(folder_id?);
        }

        // Si no existe, crear Workspace "Main"
        let ws_id = self.create_workspace("Main".to_string())?;
        // Crear Carpeta "General"
        let folder_id = self.create_folder(ws_id, "General".to_string())?;
        
        Ok(folder_id)
    }

    // Conversations
    pub fn get_conversations_by_folder(&self, folder_id: i32) -> Result<Vec<Conversation>> {
        let mut stmt = self.conn.prepare("SELECT id, folder_id, title, model_used, updated_at FROM conversations WHERE folder_id = ?1 ORDER BY updated_at DESC")?;
        let rows = stmt.query_map(params![folder_id], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                title: row.get(2)?,
                model_used: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn create_conversation(&self, folder_id: i32, title: String, model_used: Option<String>) -> Result<i32> {
        self.conn.execute(
            "INSERT INTO conversations (folder_id, title, model_used) VALUES (?1, ?2, ?3)",
            params![folder_id, title, model_used],
        )?;
        Ok(self.conn.last_insert_rowid() as i32)
    }

    pub fn get_all_conversations(&self) -> Result<Vec<Conversation>> {
        let mut stmt = self.conn.prepare("SELECT id, folder_id, title, model_used, updated_at FROM conversations ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                title: row.get(2)?,
                model_used: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    // Messages
    pub fn get_messages(&self, conversation_id: i32) -> Result<Vec<Message>> {
        let mut stmt = self.conn.prepare("SELECT id, conversation_id, role, content, timestamp FROM messages WHERE conversation_id = ?1 ORDER BY timestamp ASC")?;
        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn save_message(&self, conversation_id: i32, role: String, content: String) -> Result<()> {
        self.conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?1, ?2, ?3)",
            params![conversation_id, role, content],
        )?;
        // Actualizar el timestamp de la conversación
        self.conn.execute(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![conversation_id],
        )?;
        Ok(())
    }

    // Arena Battles
    pub fn save_arena_battle(
        &self,
        prompt: String,
        model_a: String,
        model_b: String,
        model_c: Option<String>,
        response_a: String,
        response_b: String,
        response_c: Option<String>,
        winner: Option<String>,
    ) -> Result<()> {
        println!("DB: Saving arena battle. Prompt: {}, A: {}, B: {}, Winner: {:?}", prompt, model_a, model_b, winner);
        self.conn.execute(
            "INSERT INTO arena_battles (prompt, model_a, model_b, model_c, response_a, response_b, response_c, winner)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![prompt, model_a, model_b, model_c, response_a, response_b, response_c, winner],
        )?;
        Ok(())
    }

    pub fn get_arena_history(&self) -> Result<Vec<ArenaBattle>> {
        println!("DB: Fetching arena history...");
        let mut stmt = self.conn.prepare(
            "SELECT id, prompt, model_a, model_b, model_c, response_a, response_b, response_c, winner, timestamp 
             FROM arena_battles ORDER BY timestamp DESC LIMIT 50"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ArenaBattle {
                id: row.get(0)?,
                prompt: row.get(1)?,
                model_a: row.get(2)?,
                model_b: row.get(3)?,
                model_c: row.get(4)?,
                response_a: row.get(5)?,
                response_b: row.get(6)?,
                response_c: row.get(7)?,
                winner: row.get(8)?,
                timestamp: row.get(9)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}
