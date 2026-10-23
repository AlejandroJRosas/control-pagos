//! Paquete `.cpagos` para consolidar una campaña entre instalaciones: zip con `paquete.json` e `imagenes/<archivo>`.

use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::time::{Duration, SystemTime};

const INVALIDO: &str = "El archivo no es un paquete de Control de Pagos válido";

/// `[A-Za-z0-9_-]+\.[a-z0-9]+`, sin separadores de ruta.
pub fn nombre_simple(n: &str) -> bool {
    let Some((base, ext)) = n.rsplit_once('.') else { return false };
    !base.is_empty()
        && base.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && !ext.is_empty()
        && ext.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

/// Suma de los tamaños de las imágenes que existen.
pub fn tamano(imagenes_dir: &Path, imagenes: &[String]) -> u64 {
    imagenes
        .iter()
        .filter_map(|n| fs::metadata(imagenes_dir.join(n)).ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

fn escribir(dest: &Path, datos: &str, imagenes_dir: &Path, imagenes: &[String]) -> Result<(), String> {
    use zip::write::SimpleFileOptions;
    let s = |e: &dyn std::fmt::Display| e.to_string();
    let mut zip = zip::ZipWriter::new(fs::File::create(dest).map_err(|e| s(&e))?);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("paquete.json", opts).map_err(|e| s(&e))?;
    zip.write_all(datos.as_bytes()).map_err(|e| s(&e))?;
    for nombre in imagenes {
        let ruta = imagenes_dir.join(nombre);
        if !ruta.is_file() {
            continue;
        }
        zip.start_file(format!("imagenes/{nombre}"), opts).map_err(|e| s(&e))?;
        zip.write_all(&fs::read(&ruta).map_err(|e| s(&e))?).map_err(|e| s(&e))?;
    }
    zip.finish().map_err(|e| s(&e))?;
    Ok(())
}

/// Escribe `<dest>.part` con `paquete.json` + `imagenes/<nombre>` y lo renombra a `dest`.
pub fn crear(dest: &Path, datos: &str, imagenes_dir: &Path, imagenes: &[String]) -> Result<(), String> {
    let mut part = dest.as_os_str().to_owned();
    part.push(".part");
    let part = std::path::PathBuf::from(part);
    let r = escribir(&part, datos, imagenes_dir, imagenes).and_then(|_| fs::rename(&part, dest).map_err(|e| e.to_string()));
    if r.is_err() {
        let _ = fs::remove_file(&part);
    }
    r
}

/// Extrae `paquete.json` e `imagenes/*` a `destino` y devuelve el texto del JSON.
pub fn abrir(zip: &Path, destino: &Path) -> Result<String, String> {
    let file = fs::File::open(zip).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| INVALIDO.to_string())?;
    let s = |e: &dyn std::fmt::Display| e.to_string();
    let mut json: Option<String> = None;
    for i in 0..archive.len() {
        let mut entrada = archive.by_index(i).map_err(|_| INVALIDO.to_string())?;
        let nombre = entrada.name().to_string();
        if nombre == "paquete.json" {
            let mut texto = String::new();
            entrada.read_to_string(&mut texto).map_err(|_| INVALIDO.to_string())?;
            json = Some(texto);
        } else if let Some(resto) = nombre.strip_prefix("imagenes/") {
            if resto.is_empty() {
                continue;
            }
            if resto.contains(['/', '\\', ':']) || resto.contains("..") {
                return Err(format!("El archivo contiene una ruta no permitida: {nombre}"));
            }
            let carpeta = destino.join("imagenes");
            fs::create_dir_all(&carpeta).map_err(|e| s(&e))?;
            let mut out = fs::File::create(carpeta.join(resto)).map_err(|e| s(&e))?;
            std::io::copy(&mut entrada, &mut out).map_err(|e| s(&e))?;
        }
    }
    let json = json.ok_or_else(|| INVALIDO.to_string())?;
    fs::create_dir_all(destino).map_err(|e| s(&e))?;
    fs::write(destino.join("paquete.json"), &json).map_err(|e| s(&e))?;
    Ok(json)
}

/// Borra archivos y carpetas de `dir` con más de `edad`.
pub fn podar_recibidos(dir: &Path, edad: Duration, ahora: SystemTime) {
    let Ok(entradas) = fs::read_dir(dir) else { return };
    for e in entradas.flatten() {
        let viejo = e
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| ahora.duration_since(t).unwrap_or_default() > edad)
            .unwrap_or(false);
        if viejo {
            let p = e.path();
            let _ = if p.is_dir() { fs::remove_dir_all(&p) } else { fs::remove_file(&p) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn imagenes_de_prueba(dir: &Path) {
        fs::write(dir.join("a.jpg"), b"contenido-a").unwrap();
    }

    #[test]
    fn crear_y_abrir_ida_y_vuelta() {
        let t = tempfile::tempdir().unwrap();
        let imgs = t.path().join("imgs");
        fs::create_dir_all(&imgs).unwrap();
        imagenes_de_prueba(&imgs);
        fs::write(imgs.join("b.png"), b"contenido-b").unwrap();
        let dest = t.path().join("x.cpagos");
        let lista = vec!["a.jpg".to_string(), "no-existe.jpg".to_string(), "b.png".to_string()];
        crear(&dest, "{\"formato\":1}", &imgs, &lista).unwrap();
        let salida = t.path().join("salida");
        assert_eq!(abrir(&dest, &salida).unwrap(), "{\"formato\":1}");
        assert_eq!(fs::read(salida.join("imagenes/a.jpg")).unwrap(), b"contenido-a");
        assert_eq!(fs::read(salida.join("imagenes/b.png")).unwrap(), b"contenido-b");
        assert!(!salida.join("imagenes/no-existe.jpg").exists());
        assert!(salida.join("paquete.json").is_file());
        assert_eq!(tamano(&imgs, &lista), 22);
    }

    #[test]
    fn no_deja_part() {
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("x.cpagos");
        crear(&dest, "{}", t.path(), &[]).unwrap();
        assert!(dest.is_file());
        assert!(!t.path().join("x.cpagos.part").exists());
    }

    fn zip_con(path: &Path, nombres: &[&str]) {
        use zip::write::SimpleFileOptions;
        let mut z = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for n in nombres {
            z.start_file(*n, SimpleFileOptions::default()).unwrap();
            z.write_all(b"x").unwrap();
        }
        z.finish().unwrap();
    }

    #[test]
    fn rechaza_rutas_peligrosas() {
        let t = tempfile::tempdir().unwrap();
        for malo in ["imagenes/../x.jpg", "imagenes/a\\b.jpg", "imagenes/c:x.jpg"] {
            let z = t.path().join("m.cpagos");
            zip_con(&z, &["paquete.json", malo]);
            let e = abrir(&z, &t.path().join("out")).unwrap_err();
            assert!(e.contains("ruta no permitida"), "{malo}: {e}");
        }
        assert!(!t.path().join("x.jpg").exists());
    }

    #[test]
    fn rechaza_zip_sin_paquete() {
        let t = tempfile::tempdir().unwrap();
        let z = t.path().join("m.cpagos");
        zip_con(&z, &["otro.txt"]);
        assert_eq!(abrir(&z, &t.path().join("out")).unwrap_err(), INVALIDO);
        let basura = t.path().join("b.cpagos");
        fs::write(&basura, b"no soy un zip").unwrap();
        assert_eq!(abrir(&basura, &t.path().join("out2")).unwrap_err(), INVALIDO);
    }

    #[test]
    fn nombres_simples() {
        assert!(nombre_simple("abc-1_2.jpg"));
        assert!(!nombre_simple("a/b.jpg"));
        assert!(!nombre_simple("..\\a.jpg"));
        assert!(!nombre_simple("a.JPG"));
        assert!(!nombre_simple("sinext"));
    }

    #[test]
    fn poda_recibidos_carpetas_y_archivos() {
        let t = tempfile::tempdir().unwrap();
        fs::create_dir_all(t.path().join("p1/imagenes")).unwrap();
        fs::write(t.path().join("a.cpagos"), b"x").unwrap();
        podar_recibidos(t.path(), Duration::from_secs(7 * 86400), SystemTime::now());
        assert!(t.path().join("p1").exists() && t.path().join("a.cpagos").exists());
        podar_recibidos(t.path(), Duration::from_secs(7 * 86400), SystemTime::now() + Duration::from_secs(8 * 86400));
        assert!(!t.path().join("p1").exists() && !t.path().join("a.cpagos").exists());
    }
}
