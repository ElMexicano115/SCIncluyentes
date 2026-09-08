pub mod db;
pub mod excel;
pub mod generator;
pub mod models;
pub mod pdf;
pub mod qr;

use db::Database;
use excel::read_excel_file;
use generator::{create_blank_template, generate_batch_cards};
use models::{ExcelSheetData, PrintingProfile, TemplateState};
use pdf::generate_cards_pdf;
use qr::generate_qr_base64;
use std::collections::HashMap;
use std::fs;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub db: Database,
}

#[tauri::command]
async fn cmd_select_excel_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    println!("[DEBUG Rust] Invocando selector nativo de archivos (asíncrono)...");
    
    let file_path = app
        .dialog()
        .file()
        .add_filter("Archivos Excel (*.xlsx, *.xls)", &["xlsx", "xls"])
        .blocking_pick_file();

    match file_path {
        Some(path) => {
            let p_str = path.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string();
            println!("[DEBUG Rust] Archivo seleccionado con éxito: {}", p_str);
            Ok(Some(p_str))
        }
        None => {
            println!("[DEBUG Rust] Selección de archivo cancelada por el usuario.");
            Ok(None)
        }
    }
}

#[tauri::command]
async fn cmd_select_image_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    println!("[DEBUG Rust] Invocando selector nativo de imágenes...");
    let file_path = app
        .dialog()
        .file()
        .add_filter("Imágenes (*.png, *.jpg, *.jpeg)", &["png", "jpg", "jpeg", "PNG", "JPG", "JPEG"])
        .blocking_pick_file();

    match file_path {
        Some(path) => {
            let p_str = path.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string();
            println!("[DEBUG Rust] Imagen seleccionada con éxito: {}", p_str);
            Ok(Some(p_str))
        }
        None => {
            println!("[DEBUG Rust] Selección de imagen cancelada por el usuario.");
            Ok(None)
        }
    }
}

#[tauri::command]
async fn cmd_read_file_base64(path: String) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    println!("[DEBUG Rust] Obteniendo base64 para vista previa de imagen: {}", path);
    let bytes = fs::read(&path).map_err(|e| format!("Error al leer archivo {}: {}", path, e))?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };

    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)))
}

#[tauri::command]
async fn cmd_read_excel(path: String) -> Result<ExcelSheetData, String> {
    println!("[DEBUG Rust] Leyendo archivo Excel desde la ruta: {}", path);
    match read_excel_file(&path) {
        Ok(data) => {
            println!("[DEBUG Rust] Lectura exitosa: {} registros, {} columnas: {:?}", data.total_rows, data.columns.len(), data.columns);
            Ok(data)
        }
        Err(err) => {
            println!("[DEBUG Rust] ERROR al leer Excel: {}", err);
            Err(err)
        }
    }
}

#[tauri::command]
async fn cmd_create_blank_template(
    width: u32,
    height: u32,
    color_hex: String,
    filename: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("sc_incluyentes");
    let _ = std::fs::create_dir_all(&temp_dir);
    let full_path = temp_dir.join(&filename).to_string_lossy().to_string();

    println!("[DEBUG Rust] Creando plantilla en blanco de {}x{}px color {} en {}", width, height, color_hex, full_path);
    create_blank_template(width, height, &color_hex, &full_path)?;
    Ok(full_path)
}

#[tauri::command]
async fn cmd_generate_batch_cards(
    state: TemplateState,
    rows: Vec<HashMap<String, String>>,
    output_dir: String,
) -> Result<usize, String> {
    println!("[DEBUG Rust] Iniciando generación masiva de {} tarjetas en {}", rows.len(), output_dir);
    let count = generate_batch_cards(state, rows, output_dir)?;
    println!("[DEBUG Rust] Generación completada con éxito. Se crearon {} tarjetas.", count);
    Ok(count)
}

#[tauri::command]
async fn cmd_generate_cards_pdf(
    image_paths: Vec<String>,
    output_pdf_path: String,
) -> Result<(), String> {
    println!("[DEBUG Rust] Exportando PDF con {} imágenes a {}", image_paths.len(), output_pdf_path);
    generate_cards_pdf(image_paths, &output_pdf_path, 8)
}

#[tauri::command]
async fn cmd_save_profile(
    app_state: State<'_, AppState>,
    nombre: String,
    config_json: String,
) -> Result<i64, String> {
    println!("[DEBUG Rust] Guardando perfil de impresión: {}", nombre);
    app_state.db.save_profile(&nombre, &config_json)
}

#[tauri::command]
async fn cmd_get_profiles(app_state: State<'_, AppState>) -> Result<Vec<PrintingProfile>, String> {
    println!("[DEBUG Rust] Obteniendo perfiles guardados...");
    app_state.db.get_profiles()
}

#[tauri::command]
async fn cmd_delete_profile(app_state: State<'_, AppState>, nombre: String) -> Result<(), String> {
    println!("[DEBUG Rust] Eliminando perfil: {}", nombre);
    app_state.db.delete_profile(&nombre)
}

#[tauri::command]
async fn cmd_generate_qr_preview(content: String, width: u32, height: u32) -> Result<String, String> {
    println!("[DEBUG Rust] Generando vista previa de QR para: {}", content);
    generate_qr_base64(&content, width, height)
}

#[tauri::command]
async fn cmd_select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    println!("[DEBUG Rust] Invocando selector nativo de carpetas...");
    let folder_path = app
        .dialog()
        .file()
        .blocking_pick_folder();

    match folder_path {
        Some(path) => {
            let p_str = path.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string();
            println!("[DEBUG Rust] Carpeta seleccionada con éxito: {}", p_str);
            Ok(Some(p_str))
        }
        None => {
            println!("[DEBUG Rust] Selección de carpeta cancelada por el usuario.");
            Ok(None)
        }
    }
}

#[tauri::command]
async fn cmd_get_photo_base64(folder: String, photo_id: String) -> Result<Option<String>, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use std::path::Path;

    if folder.is_empty() || photo_id.is_empty() {
        return Ok(None);
    }

    let exts = [".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG", ".webp", ".WEBP"];
    for ext in &exts {
        let candidate = Path::new(&folder).join(format!("{}{}", photo_id, ext));
        if candidate.exists() {
            if let Ok(bytes) = std::fs::read(&candidate) {
                let mime = match ext.to_lowercase().as_str() {
                    ".jpg" | ".jpeg" => "image/jpeg",
                    ".webp" => "image/webp",
                    _ => "image/png",
                };
                return Ok(Some(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes))));
            }
        }
    }
    Ok(None)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("[DEBUG Rust] Inicializando aplicación SCIncluyentes en Rust...");
    let db = Database::new("tarjetas.db").expect("Error al inicializar la base de datos SQLite");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState { db })
        .invoke_handler(tauri::generate_handler![
            cmd_select_excel_file,
            cmd_select_image_file,
            cmd_select_folder,
            cmd_read_file_base64,
            cmd_read_excel,
            cmd_create_blank_template,
            cmd_generate_batch_cards,
            cmd_generate_cards_pdf,
            cmd_save_profile,
            cmd_get_profiles,
            cmd_delete_profile,
            cmd_generate_qr_preview,
            cmd_get_photo_base64,
        ])
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Tauri");
}
