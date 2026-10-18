use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const DB_NAME: &str = "control-pagos.db";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
}

fn s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn create_zip(db: &Path, images_dir: &Path, dest: &Path) -> Result<(), String> {
    use zip::write::SimpleFileOptions;
    let mut zip = zip::ZipWriter::new(fs::File::create(dest).map_err(s)?);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(DB_NAME, opts).map_err(s)?;
    io::copy(&mut fs::File::open(db).map_err(s)?, &mut zip).map_err(s)?;
    if images_dir.exists() {
        for entry in fs::read_dir(images_dir).map_err(s)? {
            let entry = entry.map_err(s)?;
            if entry.file_type().map_err(s)?.is_file() {
                zip.start_file(format!("imagenes/{}", entry.file_name().to_string_lossy()), opts)
                    .map_err(s)?;
                io::copy(&mut fs::File::open(entry.path()).map_err(s)?, &mut zip).map_err(s)?;
            }
        }
    }
    zip.finish().map_err(s)?;
    Ok(())
}

fn extract_to(zip_path: &Path, tmp: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(s)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|_| "El archivo no es un respaldo válido".to_string())?;
    fs::create_dir_all(tmp.join("imagenes")).map_err(s)?;
    let mut has_db = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(s)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        let target = if name == DB_NAME {
            has_db = true;
            tmp.join(DB_NAME)
        } else if let Some(file) = name.strip_prefix("imagenes/") {
            if file.is_empty() || file.contains('/') || file.contains("..") || file.contains(':') {
                return Err(format!("El respaldo contiene una ruta no permitida: {name}"));
            }
            tmp.join("imagenes").join(file)
        } else {
            continue;
        };
        let mut out = fs::File::create(&target).map_err(s)?;
        io::copy(&mut entry, &mut out).map_err(s)?;
    }
    if !has_db {
        return Err("El respaldo no contiene la base de datos".into());
    }
    Ok(())
}

pub fn restore_zip(zip_path: &Path, db_path: &Path, images_dir: &Path) -> Result<(), String> {
    let parent = images_dir.parent().ok_or("Ruta de imágenes inválida")?;
    fs::create_dir_all(parent).map_err(s)?;
    let tmp = parent.join("restaurando-tmp");
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(s)?;
    }
    if let Err(e) = extract_to(zip_path, &tmp) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    // A partir de aquí el contenido es válido: reemplazar.
    if let Some(p) = db_path.parent() {
        fs::create_dir_all(p).map_err(s)?;
    }
    for suffix in ["-wal", "-shm", "-journal"] {
        let _ = fs::remove_file(PathBuf::from(format!("{}{suffix}", db_path.display())));
    }
    fs::copy(tmp.join(DB_NAME), db_path).map_err(s)?;
    if images_dir.exists() {
        fs::remove_dir_all(images_dir).map_err(s)?;
    }
    fs::rename(tmp.join("imagenes"), images_dir).map_err(s)?;
    let _ = fs::remove_dir_all(&tmp);
    Ok(())
}

pub fn prune_auto(dir: &Path, keep: usize) -> Result<(), String> {
    let mut autos: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(s)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("auto-") && n.ends_with(".zip"))
                .unwrap_or(false)
        })
        .collect();
    autos.sort();
    autos.reverse();
    for p in autos.into_iter().skip(keep) {
        fs::remove_file(p).map_err(s)?;
    }
    Ok(())
}

pub fn list(dir: &Path) -> Result<Vec<BackupInfo>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(s)? {
        let entry = entry.map_err(s)?;
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("zip") {
            continue;
        }
        let meta = entry.metadata().map_err(s)?;
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(BackupInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.display().to_string(),
            size_bytes: meta.len(),
            modified_ms,
        });
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn write(p: &Path, content: &[u8]) {
        if let Some(d) = p.parent() {
            fs::create_dir_all(d).unwrap();
        }
        fs::write(p, content).unwrap();
    }

    fn zip_with(path: &Path, entries: &[(&str, &[u8])]) {
        let mut z = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for (name, data) in entries {
            z.start_file(*name, SimpleFileOptions::default()).unwrap();
            z.write_all(data).unwrap();
        }
        z.finish().unwrap();
    }

    struct Destino {
        _dir: tempfile::TempDir,
        db: PathBuf,
        imgs: PathBuf,
    }

    fn destino_con_datos() -> Destino {
        let dir = tempdir().unwrap();
        let db = dir.path().join("cfg").join(DB_NAME);
        let imgs = dir.path().join("data").join("imagenes");
        write(&db, b"DB-VIEJA");
        write(&imgs.join("vieja.png"), b"X");
        Destino { _dir: dir, db, imgs }
    }

    fn intactos(d: &Destino) {
        assert_eq!(fs::read(&d.db).unwrap(), b"DB-VIEJA");
        assert!(d.imgs.join("vieja.png").exists());
        assert!(!d.imgs.parent().unwrap().join("restaurando-tmp").exists());
    }

    #[test]
    fn zip_y_restaurar_ida_y_vuelta() {
        let src = tempdir().unwrap();
        let snap = src.path().join("snap.db");
        write(&snap, b"DB-ORIGINAL");
        let imgs = src.path().join("imagenes");
        write(&imgs.join("a.png"), b"IMG-A");
        let zip_path = src.path().join("r.zip");
        create_zip(&snap, &imgs, &zip_path).unwrap();

        let d = destino_con_datos();
        restore_zip(&zip_path, &d.db, &d.imgs).unwrap();
        assert_eq!(fs::read(&d.db).unwrap(), b"DB-ORIGINAL");
        assert_eq!(fs::read(d.imgs.join("a.png")).unwrap(), b"IMG-A");
        assert!(!d.imgs.join("vieja.png").exists());
    }

    #[test]
    fn crea_zip_aunque_no_exista_la_carpeta_de_imagenes() {
        let src = tempdir().unwrap();
        let snap = src.path().join("snap.db");
        write(&snap, b"DB");
        let zip_path = src.path().join("r.zip");
        create_zip(&snap, &src.path().join("no-existe"), &zip_path).unwrap();
        let d = destino_con_datos();
        restore_zip(&zip_path, &d.db, &d.imgs).unwrap();
        assert_eq!(fs::read(&d.db).unwrap(), b"DB");
        assert!(d.imgs.exists());
    }

    #[test]
    fn zip_sin_bd_no_toca_los_datos() {
        let src = tempdir().unwrap();
        let zip_path = src.path().join("r.zip");
        zip_with(&zip_path, &[("otra.txt", b"hola")]);
        let d = destino_con_datos();
        assert!(restore_zip(&zip_path, &d.db, &d.imgs).is_err());
        intactos(&d);
    }

    #[test]
    fn archivo_que_no_es_zip_no_toca_los_datos() {
        let src = tempdir().unwrap();
        let bad = src.path().join("r.zip");
        write(&bad, b"esto no es un zip");
        let d = destino_con_datos();
        assert!(restore_zip(&bad, &d.db, &d.imgs).is_err());
        intactos(&d);
    }

    #[test]
    fn rechaza_rutas_peligrosas_sin_tocar_los_datos() {
        let src = tempdir().unwrap();
        let zip_path = src.path().join("r.zip");
        zip_with(&zip_path, &[(DB_NAME, b"DB"), ("imagenes/../../evil.txt", b"x")]);
        let d = destino_con_datos();
        assert!(restore_zip(&zip_path, &d.db, &d.imgs).is_err());
        intactos(&d);
    }

    #[test]
    fn prune_conserva_los_mas_recientes() {
        let dir = tempdir().unwrap();
        for i in 1..=9 {
            write(&dir.path().join(format!("auto-2026-01-0{i}.zip")), b"z");
        }
        write(&dir.path().join("manual.zip"), b"z");
        prune_auto(dir.path(), 7).unwrap();
        let mut names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names.len(), 8);
        assert!(!names.contains(&"auto-2026-01-01.zip".to_string()));
        assert!(!names.contains(&"auto-2026-01-02.zip".to_string()));
        assert!(names.contains(&"manual.zip".to_string()));
    }

    #[test]
    fn lista_solo_zips() {
        let dir = tempdir().unwrap();
        write(&dir.path().join("a.zip"), b"12345");
        write(&dir.path().join("snapshot-x.db"), b"z");
        let l = list(dir.path()).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name, "a.zip");
        assert_eq!(l[0].size_bytes, 5);
    }
}
