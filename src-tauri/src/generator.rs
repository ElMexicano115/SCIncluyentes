use crate::models::TemplateState;
use crate::qr::generate_qr_image;
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb, RgbImage, Rgba};
use imageproc::drawing::draw_text_mut;
use rayon::prelude::*;
use rusttype::{Font, Scale};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const FALLBACK_FONT_BYTES: &[u8] = include_bytes!("../fonts/DejaVuSans.ttf");

pub fn parse_color(hex: &str) -> Rgba<u8> {
    let hex = hex.trim_start_matches('#');
    if hex.len() == 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
        Rgba([r, g, b, 255])
    } else {
        match hex.to_lowercase().as_str() {
            "white" | "blanco" => Rgba([255, 255, 255, 255]),
            "red" | "rojo" => Rgba([255, 0, 0, 255]),
            "blue" | "azul" => Rgba([0, 0, 255, 255]),
            "green" | "verde" => Rgba([0, 128, 0, 255]),
            "yellow" | "amarillo" => Rgba([255, 255, 0, 255]),
            _ => Rgba([0, 0, 0, 255]),
        }
    }
}

pub fn create_blank_template(
    width: u32,
    height: u32,
    color_hex: &str,
    save_path: &str,
) -> Result<(), String> {
    let color = parse_color(color_hex);
    let rgb_color = Rgb([color[0], color[1], color[2]]);

    let img: RgbImage = ImageBuffer::from_pixel(width, height, rgb_color);
    img.save(save_path)
        .map_err(|e| format!("Error al guardar plantilla en blanco: {}", e))?;
    Ok(())
}

pub fn render_single_card(
    state: &TemplateState,
    row_data: &HashMap<String, String>,
    card_index: usize,
    output_dir: &str,
) -> Result<(String, String), String> {
    let config = &state.config;
    let target_size = (config.width_px, config.height_px);

    // 1. Load or create front background image
    let mut front_img = match &state.archivo_delantero {
        Some(path) if Path::new(path).exists() => {
            let loaded = image::open(path).map_err(|e| format!("Error abriendo frontal: {}", e))?;
            if loaded.dimensions() != target_size {
                loaded.resize_exact(target_size.0, target_size.1, image::imageops::FilterType::Lanczos3)
            } else {
                loaded
            }
        }
        _ => {
            let bg: RgbImage = ImageBuffer::from_pixel(target_size.0, target_size.1, Rgb([255, 255, 255]));
            DynamicImage::ImageRgb8(bg)
        }
    };

    // 2. Load or create back background image
    let mut back_img = match &state.archivo_trasero {
        Some(path) if Path::new(path).exists() => {
            let loaded = image::open(path).map_err(|e| format!("Error abriendo trasero: {}", e))?;
            if loaded.dimensions() != target_size {
                loaded.resize_exact(target_size.0, target_size.1, image::imageops::FilterType::Lanczos3)
            } else {
                loaded
            }
        }
        _ => {
            let bg: RgbImage = ImageBuffer::from_pixel(target_size.0, target_size.1, Rgb([255, 255, 255]));
            DynamicImage::ImageRgb8(bg)
        }
    };

    // 3. Paste photo areas
    for area in &state.posiciones_fotos {
        let photo_id = match state.mapeo_campos.get(&area.campo_id) {
            Some(col) => row_data.get(col).cloned().unwrap_or_default(),
            None => row_data.get(&area.campo_id).cloned().unwrap_or_default(),
        };

        if photo_id.is_empty() {
            continue;
        }

        let exts = [".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"];
        let mut photo_path: Option<PathBuf> = None;
        for ext in &exts {
            let candidate = Path::new(&area.carpeta_fotos).join(format!("{}{}", photo_id, ext));
            if candidate.exists() {
                photo_path = Some(candidate);
                break;
            }
        }

        if let Some(path) = photo_path {
            if let Ok(photo) = image::open(&path) {
                let resized = photo.resize_exact(area.width, area.height, image::imageops::FilterType::Lanczos3);
                let target = if area.cara == "delantero" { &mut front_img } else { &mut back_img };
                image::imageops::overlay(target, &resized, area.x as i64, area.y as i64);
            }
        }
    }

    // 4. Paste QR areas
    for qr_cfg in &state.qr_areas {
        let value = match state.mapeo_campos.get(&qr_cfg.campo_id) {
            Some(col) => row_data.get(col).cloned().unwrap_or_default(),
            None => row_data.get(&qr_cfg.campo_id).cloned().unwrap_or_default(),
        };

        if value.is_empty() {
            continue;
        }

        let full_content = format!("{}{}", qr_cfg.base_url, value);
        if let Ok(qr_img) = generate_qr_image(&full_content, qr_cfg.width, qr_cfg.height) {
            let target = if qr_cfg.cara == "delantero" { &mut front_img } else { &mut back_img };
            image::imageops::overlay(target, &qr_img, qr_cfg.x as i64, qr_cfg.y as i64);
        }
    }

    // 5. Draw text fields
    let font = Font::try_from_bytes(FALLBACK_FONT_BYTES).ok_or_else(|| "Error al cargar la fuente TTF".to_string())?;

    for (campo, props) in &state.posiciones_campos {
        let text_value = match state.mapeo_campos.get(campo) {
            Some(col) => row_data.get(col).cloned().unwrap_or_default(),
            None => row_data.get(campo).cloned().unwrap_or_default(),
        };

        let val_to_draw = if !text_value.is_empty() {
            text_value
        } else {
            props.etiqueta.clone()
        };

        if val_to_draw.is_empty() {
            continue;
        }

        let color = parse_color(&props.color);
        let scale = Scale::uniform(props.font_size as f32);

        let target = if props.cara == "delantero" { &mut front_img } else { &mut back_img };
        let mut rgba_target = target.to_rgba8();

        draw_text_mut(
            &mut rgba_target,
            color,
            props.x as i32,
            props.y as i32,
            scale,
            &font,
            &val_to_draw,
        );

        *target = DynamicImage::ImageRgba8(rgba_target);
    }

    // 6. Save outputs
    let id_suffix = row_data
        .get("id")
        .or_else(|| row_data.get("ID"))
        .or_else(|| row_data.get("nombre"))
        .cloned()
        .unwrap_or_else(|| format!("{:04}", card_index + 1));

    let front_filename = format!("tarjeta_{}_delantero.png", id_suffix);
    let back_filename = format!("tarjeta_{}_trasero.png", id_suffix);

    let front_out_path = Path::new(output_dir).join(&front_filename);
    let back_out_path = Path::new(output_dir).join(&back_filename);

    front_img
        .save(&front_out_path)
        .map_err(|e| format!("Error guardando {}: {}", front_filename, e))?;

    back_img
        .save(&back_out_path)
        .map_err(|e| format!("Error guardando {}: {}", back_filename, e))?;

    Ok((
        front_out_path.to_string_lossy().to_string(),
        back_out_path.to_string_lossy().to_string(),
    ))
}

pub fn generate_batch_cards(
    state: TemplateState,
    rows: Vec<HashMap<String, String>>,
    output_dir: String,
) -> Result<usize, String> {
    fs::create_dir_all(&output_dir).map_err(|e| format!("Error al crear directorio de salida: {}", e))?;

    let results: Vec<Result<(String, String), String>> = rows
        .par_iter()
        .enumerate()
        .map(|(idx, row)| render_single_card(&state, row, idx, &output_dir))
        .collect();

    let mut success_count = 0;
    for res in results {
        if res.is_ok() {
            success_count += 1;
        }
    }

    Ok(success_count)
}
