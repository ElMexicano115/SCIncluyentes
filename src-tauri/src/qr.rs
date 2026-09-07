use image::{DynamicImage, Rgb, RgbImage};
use qrcode::QrCode;

pub fn generate_qr_image(content: &str, width: u32, height: u32) -> Result<DynamicImage, String> {
    let code = QrCode::new(content.as_bytes()).map_err(|e| format!("Error al crear QR: {}", e))?;
    let qr_size = code.width() as u32;
    let colors = code.to_colors();

    let mut img = RgbImage::new(qr_size, qr_size);
    for (i, color) in colors.iter().enumerate() {
        let x = (i as u32) % qr_size;
        let y = (i as u32) / qr_size;
        let pixel = match color {
            qrcode::Color::Dark => Rgb([0, 0, 0]),
            qrcode::Color::Light => Rgb([255, 255, 255]),
        };
        img.put_pixel(x, y, pixel);
    }

    let dynamic = DynamicImage::ImageRgb8(img);
    let resized = dynamic.resize_exact(width, height, image::imageops::FilterType::Nearest);
    Ok(resized)
}

pub fn generate_qr_base64(content: &str, width: u32, height: u32) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use std::io::Cursor;

    let img = generate_qr_image(content, width, height)?;
    let mut bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut bytes);

    img.write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(format!("data:image/png;base64,{}", STANDARD.encode(&bytes)))
}
