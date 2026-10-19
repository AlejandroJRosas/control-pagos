mod backup;
pub mod ocr;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

struct Paths {
    db: PathBuf,
    images: PathBuf,
    backups: PathBuf,
}

/// tauri-plugin-sql resuelve "sqlite:control-pagos.db" relativo a app_config_dir.
fn paths(app: &AppHandle) -> Result<Paths, String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backups = data.join("respaldos");
    std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    Ok(Paths {
        db: config.join(backup::DB_NAME),
        images: data.join("imagenes"),
        backups,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DataPaths {
    db_path: String,
    images_dir: String,
    backups_dir: String,
}

#[tauri::command]
fn data_paths(app: AppHandle) -> Result<DataPaths, String> {
    let p = paths(&app)?;
    Ok(DataPaths {
        db_path: p.db.display().to_string(),
        images_dir: p.images.display().to_string(),
        backups_dir: p.backups.display().to_string(),
    })
}

#[tauri::command]
fn create_backup(app: AppHandle, snapshot_path: String, dest_path: String) -> Result<(), String> {
    let p = paths(&app)?;
    let snapshot = Path::new(&snapshot_path);
    if !snapshot.starts_with(&p.backups) {
        return Err("Snapshot fuera de la carpeta de respaldos".into());
    }
    let result = backup::create_zip(snapshot, &p.images, Path::new(&dest_path));
    let _ = std::fs::remove_file(snapshot);
    result
}

#[tauri::command]
fn auto_backup_path(app: AppHandle, today: String) -> Result<Option<String>, String> {
    if today.is_empty() || !today.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Fecha inválida".into());
    }
    let dest = paths(&app)?.backups.join(format!("auto-{today}.zip"));
    Ok(if dest.exists() {
        None
    } else {
        Some(dest.display().to_string())
    })
}

#[tauri::command]
fn prune_auto_backups(app: AppHandle) -> Result<(), String> {
    backup::prune_auto(&paths(&app)?.backups, 7)
}

/// Respaldos `antes-de-*`: se conservan los 5 más recientes y cualquiera de los últimos 30 días.
#[tauri::command]
fn prune_safety_backups(app: AppHandle) -> Result<usize, String> {
    backup::prune_antes(
        &paths(&app)?.backups,
        5,
        Duration::from_secs(30 * 24 * 60 * 60),
        SystemTime::now(),
    )
}

/// `usadas`: nombres de archivo de `imagenes\` que todavía referencia la BD. Lo demás, con más de un día, se borra.
#[tauri::command]
fn clean_orphan_images(app: AppHandle, usadas: Vec<String>) -> Result<usize, String> {
    let usadas: HashSet<String> = usadas.into_iter().collect();
    backup::limpiar_huerfanas(
        &paths(&app)?.images,
        &usadas,
        Duration::from_secs(24 * 60 * 60),
        SystemTime::now(),
    )
}

#[tauri::command]
fn list_backups(app: AppHandle) -> Result<Vec<backup::BackupInfo>, String> {
    backup::list(&paths(&app)?.backups)
}

/// La BD debe estar cerrada desde JS (closeDb) antes de llamar a este comando.
#[tauri::command]
fn restore_backup(app: AppHandle, zip_path: String) -> Result<(), String> {
    let p = paths(&app)?;
    if p.db.exists() {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        backup::create_zip(
            &p.db,
            &p.images,
            &p.backups.join(format!("antes-de-restaurar-{secs}.zip")),
        )?;
    }
    backup::restore_zip(Path::new(&zip_path), &p.db, &p.images)
}

/// Recibe los bytes de la imagen como cuerpo crudo del invoke.
#[tauri::command]
async fn ocr_imagen(request: tauri::ipc::Request<'_>) -> Result<ocr::OcrResultado, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Se esperaba la imagen en bytes".into());
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || ocr::reconocer(&bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// El WebView2 toma el idioma de Windows: sin esto, en un Windows en inglés el calendario de los
/// campos de fecha sale en inglés. Respeta otros argumentos que ya vengan en la variable.
fn webview_en_espanol() {
    const VAR: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
    let actuales = std::env::var(VAR).unwrap_or_default();
    if !actuales.contains("--lang") {
        // SAFETY: se llama al inicio de `run`, antes de crear hilos.
        unsafe { std::env::set_var(VAR, format!("{actuales} --lang=es").trim()) };
    }
}

pub fn run() {
    webview_en_espanol();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            data_paths,
            create_backup,
            auto_backup_path,
            prune_auto_backups,
            prune_safety_backups,
            clean_orphan_images,
            list_backups,
            restore_backup,
            ocr_imagen
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
