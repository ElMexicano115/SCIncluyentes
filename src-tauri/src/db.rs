use crate::models::PrintingProfile;
use rusqlite::{params, Connection, Result};
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS perfiles_impresion (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT UNIQUE NOT NULL,
                creado TEXT NOT NULL,
                config_json TEXT NOT NULL
            )",
            [],
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn save_profile(&self, nombre: &str, config_json: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let ahora = chrono_lite_now();
        
        conn.execute(
            "INSERT INTO perfiles_impresion (nombre, creado, config_json) 
             VALUES (?1, ?2, ?3)
             ON CONFLICT(nombre) DO UPDATE SET creado=?2, config_json=?3",
            params![nombre, ahora, config_json],
        )
        .map_err(|e| e.to_string())?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_profiles(&self) -> Result<Vec<PrintingProfile>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, nombre, creado, config_json FROM perfiles_impresion ORDER BY id DESC")
            .map_err(|e| e.to_string())?;

        let profiles_iter = stmt
            .query_map([], |row| {
                Ok(PrintingProfile {
                    id: Some(row.get(0)?),
                    nombre: row.get(1)?,
                    creado: row.get(2)?,
                    config_json: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for p in profiles_iter {
            if let Ok(prof) = p {
                list.push(prof);
            }
        }
        Ok(list)
    }

    pub fn delete_profile(&self, nombre: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM perfiles_impresion WHERE nombre = ?1", params![nombre])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn chrono_lite_now() -> String {
    // Simple string timestamp without heavy chrono crate
    let now = std::time::SystemTime::now();
    format!("{:?}", now)
}
