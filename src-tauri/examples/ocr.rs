//! Imprime en JSON el texto que reconoce el OCR en una imagen.
//! Uso: cargo run --example ocr -- <imagen>

fn main() {
    let Some(ruta) = std::env::args().nth(1) else {
        eprintln!("Uso: cargo run --example ocr -- <imagen>");
        std::process::exit(2);
    };
    let bytes = std::fs::read(&ruta).unwrap_or_else(|e| {
        eprintln!("No se pudo abrir {ruta}: {e}");
        std::process::exit(1);
    });
    match control_pagos_lib::ocr::reconocer(&bytes) {
        Ok(r) => println!("{}", serde_json::to_string_pretty(&r).expect("JSON")),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}
