use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardConfig {
    pub dpi: u32,
    pub tamano_mm: f64,
    pub orientacion: String, // "horizontal" | "vertical"
    pub width_px: u32,
    pub height_px: u32,
}

impl Default for CardConfig {
    fn default() -> Self {
        let dpi = 300;
        let tamano_mm = 80.0;
        let inches = tamano_mm / 25.4;
        let px = (inches * dpi as f64) as u32;
        let (width_px, height_px) = (px * 16 / 10, px);
        Self {
            dpi,
            tamano_mm,
            orientacion: "horizontal".to_string(),
            width_px,
            height_px,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldPosition {
    pub nombre: String,
    pub etiqueta: String,
    pub x: u32,
    pub y: u32,
    pub font_size: u32,
    pub color: String, // hex, e.g., "#000000" or color name
    pub cara: String,  // "delantero" | "trasero"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoArea {
    pub id: String,
    pub cara: String, // "delantero" | "trasero"
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub campo_id: String,      // columna o id con el nombre de la foto (sin extensión)
    pub carpeta_fotos: String, // ruta a carpeta con imágenes
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrArea {
    pub id: String,
    pub cara: String, // "delantero" | "trasero"
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub campo_id: String, // columna del Excel
    pub base_url: String, // prefijo opcional para la URL
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateState {
    pub config: CardConfig,
    pub archivo_delantero: Option<String>,
    pub archivo_trasero: Option<String>,
    pub posiciones_campos: HashMap<String, FieldPosition>,
    pub posiciones_fotos: Vec<PhotoArea>,
    pub qr_areas: Vec<QrArea>,
    pub mapeo_campos: HashMap<String, String>, // campo_id -> columna_excel
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelSheetData {
    pub columns: Vec<String>,
    pub rows: Vec<HashMap<String, String>>,
    pub total_rows: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintingProfile {
    pub id: Option<i64>,
    pub nombre: String,
    pub creado: String,
    pub config_json: String,
}
