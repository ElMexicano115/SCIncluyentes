use ::image::open;
use printpdf::{Image, ImageTransform, Mm, PdfDocument};
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

pub fn generate_cards_pdf(
    image_paths: Vec<String>,
    output_pdf_path: &str,
    cards_per_page: usize,
) -> Result<(), String> {
    if image_paths.is_empty() {
        return Err("No hay imágenes para incluir en el PDF.".to_string());
    }

    let (doc, page1, layer1) = PdfDocument::new("Credenciales Generadas", Mm(210.0), Mm(297.0), "Layer 1");
    let mut current_layer = doc.get_page(page1).get_layer(layer1);

    let card_w = Mm(85.6);
    let card_h = Mm(54.0);
    let margin_x = Mm(15.0);
    let margin_y = Mm(15.0);
    let spacing_x = Mm(10.0);
    let spacing_y = Mm(10.0);

    let cols = 2;
    let rows_per_page = 4;
    let max_per_page = if cards_per_page > 0 { cards_per_page } else { cols * rows_per_page };

    let mut count_on_page = 0;

    for path_str in &image_paths {
        if !Path::new(path_str).exists() {
            continue;
        }

        if count_on_page >= max_per_page {
            let (page_idx, layer_idx) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
            current_layer = doc.get_page(page_idx).get_layer(layer_idx);
            count_on_page = 0;
        }

        let row = count_on_page / cols;
        let col = count_on_page % cols;

        let x = margin_x + Mm(col as f32 * (card_w.0 + spacing_x.0));
        let y = Mm(297.0) - margin_y - Mm((row + 1) as f32 * (card_h.0 + spacing_y.0));

        if let Ok(dyn_img) = open(path_str) {
            let (w, h) = (dyn_img.width(), dyn_img.height());
            let pdf_img = Image::from_dynamic_image(&dyn_img);
            
            pdf_img.add_to_layer(
                current_layer.clone(),
                ImageTransform {
                    translate_x: Some(x),
                    translate_y: Some(y),
                    rotate: None,
                    scale_x: Some(card_w.0 / (w as f32 / 3.7795)),
                    scale_y: Some(card_h.0 / (h as f32 / 3.7795)),
                    dpi: Some(300.0),
                },
            );
        }

        count_on_page += 1;
    }

    let file = File::create(output_pdf_path).map_err(|e| format!("Error creando PDF: {}", e))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer).map_err(|e| format!("Error guardando PDF: {}", e))?;

    Ok(())
}
