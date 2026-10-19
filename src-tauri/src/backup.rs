use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const DB_NAME: &str = "control-pagos.db";
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

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

fn with_suffix(p: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{suffix}", p.display()))
}

/// Escribe en `<dest>.part` y renombra al terminar: nunca queda un zip a medias con el nombre final.
pub fn create_zip(db: &Path, images_dir: &Path, dest: &Path) -> Result<(), String> {
    let part = with_suffix(dest, ".part");
    let result = write_zip(db, images_dir, &part).and_then(|_| fs::rename(&part, dest).map_err(s));
    if result.is_err() {
        let _ = fs::remove_file(&part);
    }
    result
}

fn write_zip(db: &Path, images_dir: &Path, dest: &Path) -> Result<(), String> {
    use zip::write::SimpleFileOptions;
    let mut db_file = fs::File::open(db).map_err(s)?;
    let mut zip = zip::ZipWriter::new(fs::File::create(dest).map_err(s)?);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(DB_NAME, opts).map_err(s)?;
    io::copy(&mut db_file, &mut zip).map_err(s)?;
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
    let mut header = [0u8; 16];
    let valid = io::Read::read_exact(&mut fs::File::open(tmp.join(DB_NAME)).map_err(s)?, &mut header).is_ok()
        && &header == SQLITE_HEADER;
    if !valid {
        return Err("La base de datos del respaldo no es válida".into());
    }
    Ok(())
}

const ANTERIOR: &str = ".anterior";
const DB_SIDE_FILES: [&str; 3] = ["-wal", "-shm", "-journal"];

/// Mueve `from` a `to` solo si `from` existe. Devuelve si se movió.
fn move_if_exists(from: &Path, to: &Path) -> Result<bool, String> {
    if !from.exists() {
        return Ok(false);
    }
    if to.exists() {
        if to.is_dir() {
            fs::remove_dir_all(to).map_err(s)?;
        } else {
            fs::remove_file(to).map_err(s)?;
        }
    }
    fs::rename(from, to).map_err(s)?;
    Ok(true)
}

/// Reemplaza BD e imágenes por las del respaldo. Todo se prepara y valida antes; el cambio se hace
/// con renombres y, si alguno falla, se deshacen los anteriores: o queda todo nuevo o todo como estaba.
pub fn restore_zip(zip_path: &Path, db_path: &Path, images_dir: &Path) -> Result<(), String> {
    let parent = images_dir.parent().ok_or("Ruta de imágenes inválida")?;
    fs::create_dir_all(parent).map_err(s)?;
    let db_dir = db_path.parent().ok_or("Ruta de la base de datos inválida")?;
    fs::create_dir_all(db_dir).map_err(s)?;
    let tmp = parent.join("restaurando-tmp");
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(s)?;
    }
    let staged_db = with_suffix(db_path, ".nuevo");
    let cleanup = |tmp: &Path, staged: &Path| {
        let _ = fs::remove_dir_all(tmp);
        let _ = fs::remove_file(staged);
    };
    let prepared = extract_to(zip_path, &tmp).and_then(|_| fs::copy(tmp.join(DB_NAME), &staged_db).map(|_| ()).map_err(s));
    if let Err(e) = prepared {
        cleanup(&tmp, &staged_db);
        return Err(e);
    }

    let old_images = with_suffix(images_dir, ANTERIOR);
    let images_moved = match move_if_exists(images_dir, &old_images) {
        Ok(m) => m,
        Err(e) => {
            cleanup(&tmp, &staged_db);
            return Err(format!("No se pudieron mover las imágenes actuales: {e}"));
        }
    };
    let rollback_images = || {
        let _ = fs::remove_dir_all(images_dir);
        if images_moved {
            let _ = fs::rename(&old_images, images_dir);
        }
    };
    if let Err(e) = fs::rename(tmp.join("imagenes"), images_dir) {
        rollback_images();
        cleanup(&tmp, &staged_db);
        return Err(s(e));
    }

    // Archivo principal y archivos auxiliares de SQLite (el WAL viejo no debe aplicarse a la BD nueva).
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    let rollback_db = |moved: &Vec<(PathBuf, PathBuf)>| {
        for (orig, aside) in moved.iter().rev() {
            let _ = fs::rename(aside, orig);
        }
    };
    let mut targets = vec![db_path.to_path_buf()];
    targets.extend(DB_SIDE_FILES.iter().map(|suf| with_suffix(db_path, suf)));
    for orig in targets {
        let aside = with_suffix(&orig, ANTERIOR);
        match move_if_exists(&orig, &aside) {
            Ok(true) => moved.push((orig, aside)),
            Ok(false) => {}
            Err(e) => {
                rollback_db(&moved);
                rollback_images();
                cleanup(&tmp, &staged_db);
                return Err(format!("No se pudo reemplazar la base de datos: {e}"));
            }
        }
    }
    if let Err(e) = fs::rename(&staged_db, db_path) {
        rollback_db(&moved);
        rollback_images();
        cleanup(&tmp, &staged_db);
        return Err(s(e));
    }

    for (_, aside) in &moved {
        let _ = fs::remove_file(aside);
    }
    let _ = fs::remove_dir_all(&old_images);
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

/// Copia un respaldo automático (`auto-*.zip`) a la carpeta espejo (p. ej. una de Google Drive) y poda allí
/// los viejos. Escribe en `.part` y renombra; si la carpeta no está, no crea nada.
pub fn mirror(zip: &Path, dir: &Path, keep: usize) -> Result<(), String> {
    let name = zip
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| n.starts_with("auto-") && n.ends_with(".zip"))
        .ok_or_else(|| "Solo se copian respaldos automáticos".to_string())?;
    if !dir.is_dir() {
        return Err(format!(
            "La carpeta de Google Drive no está disponible (¿Google Drive está abierto?): {}",
            dir.display()
        ));
    }
    let dest = dir.join(name);
    let part = with_suffix(&dest, ".part");
    let result = fs::copy(zip, &part)
        .map_err(s)
        .and_then(|_| fs::rename(&part, &dest).map_err(s));
    if result.is_err() {
        let _ = fs::remove_file(&part);
    }
    result?;
    prune_auto(dir, keep)
}

fn antiguedad(p: &Path, now: SystemTime) -> Result<Duration, String> {
    let modified = fs::metadata(p).and_then(|m| m.modified()).map_err(s)?;
    Ok(now.duration_since(modified).unwrap_or(Duration::ZERO))
}

/// Respaldos de seguridad (`antes-de-*.zip`): siempre quedan los `keep` más recientes; del resto se borran
/// los que tienen más de `max_age`.
pub fn prune_antes(dir: &Path, keep: usize, max_age: Duration, now: SystemTime) -> Result<usize, String> {
    let mut zips: Vec<(PathBuf, Duration)> = Vec::new();
    for entry in fs::read_dir(dir).map_err(s)? {
        let p = entry.map_err(s)?.path();
        let es_seguridad = p
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with("antes-de-") && n.ends_with(".zip"))
            .unwrap_or(false);
        if es_seguridad && p.is_file() {
            let edad = antiguedad(&p, now)?;
            zips.push((p, edad));
        }
    }
    zips.sort_by_key(|(_, edad)| *edad);
    let mut borrados = 0;
    for (p, edad) in zips.into_iter().skip(keep) {
        if edad > max_age {
            fs::remove_file(p).map_err(s)?;
            borrados += 1;
        }
    }
    Ok(borrados)
}

/// Borra de `images_dir` los archivos que no están en `usadas` (nombres de archivo) y tienen más de `min_age`
/// (margen para una imagen recién guardada cuyo registro aún no existe). Devuelve cuántos borró.
pub fn limpiar_huerfanas(images_dir: &Path, usadas: &HashSet<String>, min_age: Duration, now: SystemTime) -> Result<usize, String> {
    if !images_dir.is_dir() {
        return Ok(0);
    }
    let mut borrados = 0;
    for entry in fs::read_dir(images_dir).map_err(s)? {
        let p = entry.map_err(s)?.path();
        if !p.is_file() {
            continue;
        }
        let Some(nombre) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if usadas.contains(nombre) || antiguedad(&p, now)? <= min_age {
            continue;
        }
        fs::remove_file(&p).map_err(s)?;
        borrados += 1;
    }
    Ok(borrados)
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
        write(&snap, &sqlite(b"DB-ORIGINAL"));
        let imgs = src.path().join("imagenes");
        write(&imgs.join("a.png"), b"IMG-A");
        let zip_path = src.path().join("r.zip");
        create_zip(&snap, &imgs, &zip_path).unwrap();

        let d = destino_con_datos();
        restore_zip(&zip_path, &d.db, &d.imgs).unwrap();
        assert_eq!(fs::read(&d.db).unwrap(), sqlite(b"DB-ORIGINAL"));
        assert_eq!(fs::read(d.imgs.join("a.png")).unwrap(), b"IMG-A");
        assert!(!d.imgs.join("vieja.png").exists());
    }

    #[test]
    fn crea_zip_aunque_no_exista_la_carpeta_de_imagenes() {
        let src = tempdir().unwrap();
        let snap = src.path().join("snap.db");
        write(&snap, &sqlite(b"DB"));
        let zip_path = src.path().join("r.zip");
        create_zip(&snap, &src.path().join("no-existe"), &zip_path).unwrap();
        let d = destino_con_datos();
        restore_zip(&zip_path, &d.db, &d.imgs).unwrap();
        assert_eq!(fs::read(&d.db).unwrap(), sqlite(b"DB"));
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
    fn rechaza_bd_que_no_es_sqlite_sin_tocar_los_datos() {
        let src = tempdir().unwrap();
        let zip_path = src.path().join("r.zip");
        zip_with(&zip_path, &[(DB_NAME, b"no soy sqlite")]);
        let d = destino_con_datos();
        assert!(restore_zip(&zip_path, &d.db, &d.imgs).is_err());
        intactos(&d);
    }

    #[test]
    fn zip_fallido_no_deja_archivo_a_medias() {
        let src = tempdir().unwrap();
        let dest = src.path().join("auto-2026-01-01.zip");
        assert!(create_zip(&src.path().join("no-existe.db"), &src.path().join("imgs"), &dest).is_err());
        assert!(!dest.exists());
        assert_eq!(fs::read_dir(src.path()).unwrap().count(), 0);
    }

    #[test]
    fn restauracion_fallida_deja_todo_como_estaba() {
        let src = tempdir().unwrap();
        let snap = src.path().join("snap.db");
        write(&snap, &sqlite(b"NUEVA"));
        let imgs = src.path().join("imagenes");
        write(&imgs.join("a.png"), b"IMG-A");
        let zip_path = src.path().join("r.zip");
        create_zip(&snap, &imgs, &zip_path).unwrap();

        let d = destino_con_datos();
        // Un archivo bloqueado (abierto sin compartir) impide mover/borrar la carpeta de imágenes en Windows.
        let _lock = bloquear(&d.imgs.join("vieja.png"));
        let r = restore_zip(&zip_path, &d.db, &d.imgs);
        drop(_lock);
        match r {
            Ok(()) => {
                assert_eq!(fs::read(&d.db).unwrap(), sqlite(b"NUEVA"));
                assert!(d.imgs.join("a.png").exists());
            }
            Err(_) => intactos(&d),
        }
    }

    #[cfg(windows)]
    fn bloquear(p: &Path) -> fs::File {
        use std::os::windows::fs::OpenOptionsExt;
        fs::OpenOptions::new().read(true).share_mode(0).open(p).unwrap()
    }

    #[cfg(not(windows))]
    fn bloquear(p: &Path) -> fs::File {
        fs::File::open(p).unwrap()
    }

    fn sqlite(rest: &[u8]) -> Vec<u8> {
        let mut v = SQLITE_HEADER.to_vec();
        v.extend_from_slice(rest);
        v
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

    const DIA: Duration = Duration::from_secs(24 * 60 * 60);

    fn nombres(dir: &Path) -> Vec<String> {
        let mut n: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        n.sort();
        n
    }

    #[test]
    fn prune_antes_conserva_los_recientes_y_los_mas_nuevos() {
        let dir = tempdir().unwrap();
        for i in 1..=4 {
            write(&dir.path().join(format!("antes-de-restaurar-{i}.zip")), b"z");
        }
        write(&dir.path().join("antes-de-eliminar-campana-9.zip"), b"z");
        write(&dir.path().join("auto-2026-01-01.zip"), b"z");
        write(&dir.path().join("manual.zip"), b"z");

        // Recién creados: nada supera la antigüedad máxima.
        assert_eq!(prune_antes(dir.path(), 2, 30 * DIA, SystemTime::now()).unwrap(), 0);
        assert_eq!(nombres(dir.path()).len(), 7);

        // 40 días después: quedan solo 2 de seguridad, y los demás zips intactos.
        let despues = SystemTime::now() + 40 * DIA;
        assert_eq!(prune_antes(dir.path(), 2, 30 * DIA, despues).unwrap(), 3);
        let n = nombres(dir.path());
        assert_eq!(n.iter().filter(|x| x.starts_with("antes-de-")).count(), 2);
        assert!(n.contains(&"auto-2026-01-01.zip".to_string()));
        assert!(n.contains(&"manual.zip".to_string()));
    }

    #[test]
    fn limpia_solo_imagenes_huerfanas_con_margen() {
        let dir = tempdir().unwrap();
        let imgs = dir.path().join("imagenes");
        write(&imgs.join("usada.png"), b"i");
        write(&imgs.join("huerfana.jpg"), b"i");
        fs::create_dir_all(imgs.join("subcarpeta")).unwrap();
        let usadas: HashSet<String> = ["usada.png".to_string()].into();

        assert_eq!(limpiar_huerfanas(&imgs, &usadas, DIA, SystemTime::now()).unwrap(), 0);
        assert_eq!(limpiar_huerfanas(&imgs, &usadas, DIA, SystemTime::now() + 2 * DIA).unwrap(), 1);
        assert_eq!(nombres(&imgs), vec!["subcarpeta".to_string(), "usada.png".to_string()]);
        assert_eq!(limpiar_huerfanas(&dir.path().join("no-existe"), &usadas, DIA, SystemTime::now()).unwrap(), 0);
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

#[cfg(test)]
mod espejo_tests {
    use super::*;
    use tempfile::tempdir;

    fn nombres(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn espejo_copia_y_reemplaza() {
        let local = tempdir().unwrap();
        let espejo = tempdir().unwrap();
        let zip = local.path().join("auto-2026-10-19.zip");
        fs::write(&zip, b"a").unwrap();
        mirror(&zip, espejo.path(), 7).unwrap();
        fs::write(&zip, b"b").unwrap();
        mirror(&zip, espejo.path(), 7).unwrap();
        assert_eq!(fs::read(espejo.path().join("auto-2026-10-19.zip")).unwrap(), b"b");
        assert_eq!(nombres(espejo.path()), vec!["auto-2026-10-19.zip".to_string()]);
    }

    #[test]
    fn espejo_carpeta_inexistente_falla_sin_tocar_nada() {
        let local = tempdir().unwrap();
        let zip = local.path().join("auto-2026-10-19.zip");
        fs::write(&zip, b"a").unwrap();
        let falta = local.path().join("no-existe");
        let err = mirror(&zip, &falta, 7).unwrap_err();
        assert!(err.contains("Google Drive"), "{err}");
        assert!(!falta.exists());
        assert!(zip.exists());
    }

    #[test]
    fn poda_espejo_solo_toca_auto() {
        let local = tempdir().unwrap();
        let espejo = tempdir().unwrap();
        for i in 1..=9 {
            fs::write(espejo.path().join(format!("auto-2026-01-0{i}.zip")), b"z").unwrap();
        }
        fs::write(espejo.path().join("notas.txt"), b"x").unwrap();
        fs::write(espejo.path().join("antes-de-x.zip"), b"x").unwrap();
        let zip = local.path().join("auto-2026-01-10.zip");
        fs::write(&zip, b"n").unwrap();
        mirror(&zip, espejo.path(), 7).unwrap();
        let n = nombres(espejo.path());
        assert_eq!(n.iter().filter(|x| x.starts_with("auto-")).count(), 7);
        assert!(n.contains(&"auto-2026-01-10.zip".to_string()));
        assert!(!n.contains(&"auto-2026-01-03.zip".to_string()));
        assert!(n.contains(&"auto-2026-01-04.zip".to_string()));
        assert!(n.contains(&"notas.txt".to_string()));
        assert!(n.contains(&"antes-de-x.zip".to_string()));
    }

    #[test]
    fn espejo_rechaza_lo_que_no_es_auto() {
        let local = tempdir().unwrap();
        let espejo = tempdir().unwrap();
        let zip = local.path().join("antes-de-x.zip");
        fs::write(&zip, b"a").unwrap();
        assert!(mirror(&zip, espejo.path(), 7).is_err());
        assert!(nombres(espejo.path()).is_empty());
    }

    #[test]
    fn create_zip_reemplaza_un_destino_existente() {
        let dir = tempdir().unwrap();
        let db = dir.path().join(DB_NAME);
        fs::write(&db, b"DB1").unwrap();
        let dest = dir.path().join("auto-2026-10-19.zip");
        fs::write(&dest, b"viejo").unwrap();
        create_zip(&db, &dir.path().join("imagenes"), &dest).unwrap();
        assert_ne!(fs::read(&dest).unwrap(), b"viejo");
        assert!(!with_suffix(&dest, ".part").exists());
    }
}
