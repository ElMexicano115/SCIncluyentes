use crate::models::TemplateState;
use crate::pdf::generate_single_card_pdf;
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

pub fn wrap_text_lines(font: &Font, text: &str, font_size: f32, max_width: u32) -> Vec<String> {
    if text.is_empty() {
        return vec![];
    }
    let scale = Scale::uniform(font_size);
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut lines = Vec::new();
    let mut current_line = String::new();

    for word in words {
        let test_line = if current_line.is_empty() {
            word.to_string()
        } else {
            format!("{} {}", current_line, word)
        };

        let glyphs_width: f32 = font
            .layout(&test_line, scale, rusttype::point(0.0, 0.0))
            .map(|g| g.unpositioned().h_metrics().advance_width)
            .sum();

        if glyphs_width > max_width as f32 && !current_line.is_empty() {
            lines.push(current_line);
            current_line = word.to_string();
        } else {
            current_line = test_line;
        }
    }

    if !current_line.is_empty() {
        lines.push(current_line);
    }

    lines
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
    let target_w = config.width_px;
    let target_h = config.height_px;

    // 1. Create base RGBA canvas (#101411) for front and back
    let mut front_canvas = DynamicImage::ImageRgba8(ImageBuffer::from_pixel(target_w, target_h, Rgba([16, 20, 17, 255])));
    let mut back_canvas = DynamicImage::ImageRgba8(ImageBuffer::from_pixel(target_w, target_h, Rgba([16, 20, 17, 255])));

    let render_photo = |area: &crate::models::PhotoArea| -> Option<(DynamicImage, u32, u32, String)> {
        let photo_path: Option<PathBuf> = if area.es_especifica.unwrap_or(false) && area.foto_especifica.is_some() {
            area.foto_especifica.as_ref().map(PathBuf::from)
        } else {
            let photo_id = match state.mapeo_campos.get(&area.campo_id) {
                Some(col) => row_data.get(col).cloned().unwrap_or_default(),
                None => row_data.get(&area.campo_id).cloned().unwrap_or_default(),
            };

            if photo_id.is_empty() {
                None
            } else {
                let exts = [".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG", ".webp", ".WEBP"];
                let mut found = None;
                for ext in &exts {
                    let candidate = Path::new(&area.carpeta_fotos).join(format!("{}{}", photo_id, ext));
                    if candidate.exists() {
                        found = Some(candidate);
                        break;
                    }
                }
                found
            }
        };

        if let Some(path) = photo_path {
            if let Ok(photo) = image::open(&path) {
                let resized = photo.resize_exact(area.width, area.height, image::imageops::FilterType::Lanczos3);
                return Some((resized, area.x, area.y, area.cara.clone()));
            }
        }
        None
    };

    // 2. Layer 1: Draw photos configured with por_detras == Some(true)
    for area in &state.posiciones_fotos {
        if area.por_detras == Some(true) {
            if let Some((img, x, y, cara)) = render_photo(area) {
                let target = if cara == "delantero" { &mut front_canvas } else { &mut back_canvas };
                image::imageops::overlay(target, &img, x as i64, y as i64);
            }
        }
    }

    // 3. Layer 2: Overlay background template image (front & back)
    if let Some(path) = &state.archivo_delantero {
        if Path::new(path).exists() {
            if let Ok(loaded) = image::open(path) {
                let resized = if loaded.dimensions() != (target_w, target_h) {
                    loaded.resize_exact(target_w, target_h, image::imageops::FilterType::Lanczos3)
                } else {
                    loaded
                };
                image::imageops::overlay(&mut front_canvas, &resized, 0, 0);
            }
        }
    }

    if let Some(path) = &state.archivo_trasero {
        if Path::new(path).exists() {
            if let Ok(loaded) = image::open(path) {
                let resized = if loaded.dimensions() != (target_w, target_h) {
                    loaded.resize_exact(target_w, target_h, image::imageops::FilterType::Lanczos3)
                } else {
                    loaded
                };
                image::imageops::overlay(&mut back_canvas, &resized, 0, 0);
            }
        }
    }

    // 4. Layer 3: Draw photos configured with por_detras != Some(true) (in front of background)
    for area in &state.posiciones_fotos {
        if area.por_detras != Some(true) {
            if let Some((img, x, y, cara)) = render_photo(area) {
                let target = if cara == "delantero" { &mut front_canvas } else { &mut back_canvas };
                image::imageops::overlay(target, &img, x as i64, y as i64);
            }
        }
    }

    let mut front_img = front_canvas;
    let mut back_img = back_canvas;

    // 4. Paste QR areas
    for qr_cfg in &state.qr_areas {
        let full_content = if qr_cfg.es_personalizado.unwrap_or(false) && qr_cfg.qr_personalizado.is_some() {
            qr_cfg.qr_personalizado.clone().unwrap_or_default()
        } else {
            let value = match state.mapeo_campos.get(&qr_cfg.campo_id) {
                Some(col) => row_data.get(col).cloned().unwrap_or_default(),
                None => row_data.get(&qr_cfg.campo_id).cloned().unwrap_or_default(),
            };

            if value.is_empty() {
                String::new()
            } else {
                format!("{}{}", qr_cfg.base_url, value)
            }
        };

        if full_content.is_empty() {
            continue;
        }

        if let Ok(qr_img) = generate_qr_image(&full_content, qr_cfg.width, qr_cfg.height) {
            let target = if qr_cfg.cara == "delantero" { &mut front_img } else { &mut back_img };
            image::imageops::overlay(target, &qr_img, qr_cfg.x as i64, qr_cfg.y as i64);
        }
    }

    // 5. Draw text fields with multi-line word wrapping
    let font = Font::try_from_bytes(FALLBACK_FONT_BYTES).ok_or_else(|| "Error al cargar la fuente TTF".to_string())?;

    for (campo, props) in &state.posiciones_campos {
        let val_to_draw = if props.es_personalizado.unwrap_or(false) && props.texto_personalizado.is_some() {
            props.texto_personalizado.clone().unwrap_or_default()
        } else {
            let text_value = match state.mapeo_campos.get(campo) {
                Some(col) => row_data.get(col).cloned().unwrap_or_default(),
                None => row_data.get(campo).cloned().unwrap_or_default(),
            };
            if !text_value.is_empty() {
                text_value
            } else {
                props.etiqueta.clone()
            }
        };

        if val_to_draw.is_empty() {
            continue;
        }

        let font_size = props.font_size as f32;
        let max_width = props.width.unwrap_or(300);
        let line_height = (font_size * 1.15) as i32;

        let lines = wrap_text_lines(&font, &val_to_draw, font_size, max_width);
        let color = parse_color(&props.color);
        let scale = Scale::uniform(font_size);

        let target = if props.cara == "delantero" { &mut front_img } else { &mut back_img };
        let mut rgba_target = target.to_rgba8();

        for (line_idx, line_str) in lines.iter().enumerate() {
            let line_y = (props.y as i32) + (line_idx as i32 * line_height);
            draw_text_mut(
                &mut rgba_target,
                color,
                props.x as i32,
                line_y,
                scale,
                &font,
                line_str,
            );
        }

        *target = DynamicImage::ImageRgba8(rgba_target);
    }

    // 6. Save temporary raster images and build output PDF
    let temp_dir = std::env::temp_dir().join("sc_incluyentes_pdf_temp");
    let _ = fs::create_dir_all(&temp_dir);

    let id_suffix = row_data
        .get("id")
        .or_else(|| row_data.get("ID"))
        .or_else(|| row_data.get("nombre"))
        .or_else(|| row_data.get("Nombre"))
        .cloned()
        .unwrap_or_else(|| format!("{:04}", card_index + 1));

    let front_temp_path = temp_dir.join(format!("temp_{}_front.png", card_index));
    let back_temp_path = temp_dir.join(format!("temp_{}_back.png", card_index));

    front_img
        .save(&front_temp_path)
        .map_err(|e| format!("Error guardando imagen temporal frontal: {}", e))?;

    let has_back = state.archivo_trasero.is_some();
    if has_back {
        back_img
            .save(&back_temp_path)
            .map_err(|e| format!("Error guardando imagen temporal trasera: {}", e))?;
    }

    let pdf_filename = format!("credencial_{}.pdf", id_suffix);
    let pdf_out_path = Path::new(output_dir).join(&pdf_filename);

    let card_w_mm = if config.orientacion == "vertical" {
        config.tamano_mm / 1.585
    } else {
        config.tamano_mm
    };
    let card_h_mm = (target_h as f64 / target_w as f64) * card_w_mm;

    let front_str = front_temp_path.to_string_lossy().to_string();
    let back_str = back_temp_path.to_string_lossy().to_string();
    let pdf_str = pdf_out_path.to_string_lossy().to_string();

    generate_single_card_pdf(
        Some(&front_str),
        if has_back { Some(&back_str) } else { None },
        &pdf_str,
        card_w_mm,
        card_h_mm,
    )?;

    Ok((
        pdf_str.clone(),
        pdf_str,
    ))
}

pub fn generate_batch_cards(
    state: TemplateState,
    rows: Vec<HashMap<String, String>>,
    output_dir: String,
) -> Result<usize, String> {
    let out_path = Path::new(&output_dir);
    let resolved_out_dir = if out_path.is_relative() {
        let cwd = std::env::current_dir().unwrap_or_default();
        if cwd.ends_with("src-tauri") {
            cwd.parent().unwrap_or(&cwd).join(out_path)
        } else {
            cwd.join(out_path)
        }
    } else {
        out_path.to_path_buf()
    };

    let target_dir_str = resolved_out_dir.to_string_lossy().to_string();
    fs::create_dir_all(&target_dir_str).map_err(|e| format!("Error al crear directorio de salida: {}", e))?;

    let results: Vec<Result<(String, String), String>> = rows
        .par_iter()
        .enumerate()
        .map(|(idx, row)| render_single_card(&state, row, idx, &target_dir_str))
        .collect();

    let mut pdf_paths = Vec::new();
    let mut success_count = 0;
    for res in results {
        if let Ok((pdf_path, _)) = res {
            pdf_paths.push(pdf_path);
            success_count += 1;
        }
    }

    Ok(success_count)
}
