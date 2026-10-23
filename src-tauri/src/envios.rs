//! Archivos para enviar por WhatsApp (PDF o Excel del estado de cuenta): JS los escribe en `envios\` y aquí se copian
//! al portapapeles como archivo, igual que al copiar en el Explorador, para pegarlos en el chat con Ctrl+V.

use std::path::Path;
use std::time::{Duration, SystemTime};

/// Solo un nombre de archivo simple (sin carpetas) con extensión .pdf, .xlsx o .cpagos.
pub fn nombre_valido(nombre: &str) -> bool {
    let (base, ext) = match nombre.rsplit_once('.') {
        Some(p) => p,
        None => return false,
    };
    !base.is_empty()
        && base.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && matches!(ext, "pdf" | "xlsx" | "cpagos")
}

/// Borra los envíos con más de `edad` (WhatsApp lee el archivo al pegarlo, así que el recién copiado se queda).
pub fn podar(dir: &Path, edad: Duration, ahora: SystemTime) -> Result<usize, String> {
    let mut borrados = 0;
    let Ok(entradas) = std::fs::read_dir(dir) else { return Ok(0) };
    for e in entradas.flatten() {
        let viejo = e
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| ahora.duration_since(t).unwrap_or_default() > edad)
            .unwrap_or(false);
        if viejo && e.path().is_file() && std::fs::remove_file(e.path()).is_ok() {
            borrados += 1;
        }
    }
    Ok(borrados)
}

#[cfg(windows)]
pub fn copiar_al_portapapeles(ruta: &Path) -> Result<(), String> {
    use clipboard_win::{formats, Clipboard, Setter};
    let ruta = ruta.to_str().ok_or("Ruta inválida")?;
    let error = |e| format!("No se pudo copiar el archivo al portapapeles: {e}");
    let _abierto = Clipboard::new_attempts(10).map_err(error)?;
    formats::FileList.write_clipboard(&[ruta][..]).map_err(error)
}

#[cfg(not(windows))]
pub fn copiar_al_portapapeles(_ruta: &Path) -> Result<(), String> {
    Err("Copiar archivos al portapapeles solo funciona en Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acepta_solo_nombres_simples_de_pdf_o_excel() {
        assert!(nombre_valido("estado-de-cuenta-ana-julio-2026-10-21.pdf"));
        assert!(nombre_valido("ana_julio.xlsx"));
        assert!(nombre_valido("consolidar-marzo-pc-2026-10-23.cpagos"));
        assert!(!nombre_valido("..\\control-pagos.db"));
        assert!(!nombre_valido("a/b.pdf"));
        assert!(!nombre_valido("ana.exe"));
        assert!(!nombre_valido(".pdf"));
        assert!(!nombre_valido("ana"));
    }

    #[test]
    fn poda_solo_los_viejos() {
        let dir = tempfile::tempdir().unwrap();
        let nuevo = dir.path().join("nuevo.pdf");
        std::fs::write(&nuevo, b"x").unwrap();
        let viejo = dir.path().join("viejo.pdf");
        std::fs::write(&viejo, b"x").unwrap();
        let hace_un_rato = SystemTime::now() + Duration::from_secs(60);
        // Con "ahora" 8 días adelante ambos son viejos; con 1 minuto, ninguno.
        assert_eq!(podar(dir.path(), Duration::from_secs(7 * 24 * 3600), hace_un_rato).unwrap(), 0);
        let futuro = SystemTime::now() + Duration::from_secs(8 * 24 * 3600);
        assert_eq!(podar(dir.path(), Duration::from_secs(7 * 24 * 3600), futuro).unwrap(), 2);
        assert!(!nuevo.exists() && !viejo.exists());
    }

    #[test]
    fn sin_carpeta_no_falla() {
        assert_eq!(podar(Path::new("no-existe-envios"), Duration::ZERO, SystemTime::now()).unwrap(), 0);
    }
}
