use crate::models::ExcelSheetData;
use calamine::{open_workbook_auto, Data, Reader};
use std::collections::HashMap;
use std::path::Path;

pub fn read_excel_file(path: &str) -> Result<ExcelSheetData, String> {
    let path_obj = Path::new(path);
    if !path_obj.exists() {
        return Err(format!("El archivo no existe en la ruta: {}", path));
    }

    let mut workbook = open_workbook_auto(path).map_err(|e| format!("Error al abrir archivo Excel: {}", e))?;
    
    let sheet_name = match workbook.sheet_names().first() {
        Some(name) => name.clone(),
        None => return Err("El archivo Excel no contiene hojas de trabajo.".to_string()),
    };

    let range = match workbook.worksheet_range(&sheet_name) {
        Ok(range) => range,
        Err(e) => return Err(format!("Error al leer la hoja '{}': {}", sheet_name, e)),
    };

    let mut rows_iter = range.rows();
    
    // Find the header row (first row with non-empty cells)
    let mut header_row_data = None;
    for row in rows_iter.by_ref() {
        let non_empty = row.iter().filter(|c| !matches!(c, Data::Empty)).count();
        if non_empty > 0 {
            header_row_data = Some(row);
            break;
        }
    }

    let header_row = match header_row_data {
        Some(row) => row,
        None => return Err("El archivo Excel está completamente vacío.".to_string()),
    };

    let mut columns: Vec<String> = Vec::new();
    let mut col_counts: HashMap<String, usize> = HashMap::new();

    for (idx, cell) in header_row.iter().enumerate() {
        let mut name = match cell {
            Data::String(s) => s.trim().to_string(),
            Data::Int(i) => i.to_string(),
            Data::Float(f) => f.to_string(),
            Data::Bool(b) => b.to_string(),
            _ => cell.to_string().trim().to_string(),
        };

        if name.is_empty() {
            name = format!("Columna_{}", idx + 1);
        }

        let count = col_counts.entry(name.clone()).or_insert(0);
        *count += 1;
        if *count > 1 {
            name = format!("{}_{}", name, count);
        }

        columns.push(name);
    }

    let mut data_rows = Vec::new();

    for row in rows_iter {
        let mut row_map: HashMap<String, String> = HashMap::new();
        let mut has_any_value = false;

        for (idx, col_name) in columns.iter().enumerate() {
            if let Some(cell) = row.get(idx) {
                let val_str = match cell {
                    Data::String(s) => s.trim().to_string(),
                    Data::Int(i) => i.to_string(),
                    Data::Float(f) => {
                        if f.fract() == 0.0 {
                            format!("{:.0}", f)
                        } else {
                            f.to_string()
                        }
                    }
                    Data::Bool(b) => b.to_string(),
                    Data::DateTime(d) => format!("{:.2}", d),
                    Data::DateTimeIso(iso) => iso.clone(),
                    Data::DurationIso(dur) => dur.clone(),
                    Data::Empty => String::new(),
                    Data::Error(_) => String::new(),
                };
                if !val_str.is_empty() {
                    has_any_value = true;
                }
                row_map.insert(col_name.clone(), val_str);
            } else {
                row_map.insert(col_name.clone(), String::new());
            }
        }

        if has_any_value {
            data_rows.push(row_map);
        }
    }

    let total = data_rows.len();

    Ok(ExcelSheetData {
        columns,
        rows: data_rows,
        total_rows: total,
    })
}
