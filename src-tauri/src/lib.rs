mod backup;
mod envios;
pub mod ocr;
mod paquete;

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

/// Ruta de `auto-<today>.zip` exista o no: el respaldo al cerrar reemplaza el del día.
#[tauri::command]
fn auto_backup_path_hoy(app: AppHandle, today: String) -> Result<String, String> {
    if today.is_empty() || !today.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Fecha inválida".into());
    }
    Ok(paths(&app)?.backups.join(format!("auto-{today}.zip")).display().to_string())
}

/// Subcarpeta de esta instalación dentro de la carpeta espejo (nombre del equipo e identificador de la app).
#[tauri::command]
fn mirror_subfolder(app: AppHandle) -> String {
    backup::subcarpeta_espejo(&std::env::var("COMPUTERNAME").unwrap_or_default(), &app.config().identifier)
}

/// Copia un respaldo automático de la carpeta de respaldos a la subcarpeta de esta instalación dentro de la
/// carpeta espejo y poda allí (quedan 7).
#[tauri::command]
fn mirror_backup(app: AppHandle, zip_path: String, dir: String) -> Result<(), String> {
    let zip = Path::new(&zip_path);
    if !zip.starts_with(&paths(&app)?.backups) {
        return Err("El respaldo no está en la carpeta de respaldos".into());
    }
    backup::mirror(zip, Path::new(&dir), &mirror_subfolder(app), 7)
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

/// Copia al portapapeles, como archivo, `envios\<nombre>` (lo escribe JS antes) y borra los envíos de más de 7 días.
#[tauri::command]
fn copiar_envio(app: AppHandle, nombre: String) -> Result<(), String> {
    if !envios::nombre_valido(&nombre) {
        return Err("Nombre de archivo inválido".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("envios");
    let ruta = dir.join(&nombre);
    if !ruta.is_file() {
        return Err("No se encontró el archivo para enviar".into());
    }
    envios::copiar_al_portapapeles(&ruta)?;
    let _ = envios::podar(&dir, Duration::from_secs(7 * 24 * 60 * 60), SystemTime::now());
    Ok(())
}

/// Escribe un paquete `.cpagos`. `imagenes` llegan como "imagenes/x.jpg". Sin `ruta` va a `envios\<nombre>`; devuelve la ruta escrita.
#[tauri::command]
fn crear_paquete(app: AppHandle, datos: String, imagenes: Vec<String>, nombre: String, ruta: Option<String>) -> Result<String, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut nombres = Vec::with_capacity(imagenes.len());
    for i in &imagenes {
        let n = i.strip_prefix("imagenes/").unwrap_or(i);
        if !paquete::nombre_simple(n) {
            return Err(format!("Nombre de imagen inválido: {i}"));
        }
        nombres.push(n.to_string());
    }
    let dest = match ruta {
        Some(r) => PathBuf::from(r),
        None => {
            if !envios::nombre_valido(&nombre) {
                return Err("Nombre de archivo inválido".into());
            }
            let dir = data.join("envios");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            dir.join(&nombre)
        }
    };
    paquete::crear(&dest, &datos, &data.join("imagenes"), &nombres)?;
    Ok(dest.display().to_string())
}

/// Extrae un paquete a `recibidos\p<nanos>\` y devuelve esa carpeta relativa a AppData. El origen es `ruta` (absoluta)
/// o `recibidos\<recibido>`. Antes borra lo de `recibidos\` con más de 7 días.
#[tauri::command]
fn abrir_paquete(app: AppHandle, ruta: Option<String>, recibido: Option<String>) -> Result<String, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let recibidos = data.join("recibidos");
    std::fs::create_dir_all(&recibidos).map_err(|e| e.to_string())?;
    paquete::podar_recibidos(&recibidos, Duration::from_secs(7 * 24 * 60 * 60), SystemTime::now());
    let origen = match (ruta, recibido) {
        (Some(r), _) => PathBuf::from(r),
        (None, Some(n)) => {
            if !paquete::nombre_simple(&n) || !n.ends_with(".cpagos") {
                return Err("Nombre de archivo inválido".into());
            }
            recibidos.join(n)
        }
        (None, None) => return Err("Falta el archivo del paquete".into()),
    };
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let carpeta = format!("p{nanos}");
    paquete::abrir(&origen, &recibidos.join(&carpeta))?;
    Ok(format!("recibidos/{carpeta}"))
}

#[tauri::command]
fn tamano_imagenes(app: AppHandle, imagenes: Vec<String>) -> Result<u64, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let nombres: Vec<String> = imagenes
        .iter()
        .map(|i| i.strip_prefix("imagenes/").unwrap_or(i).to_string())
        .filter(|n| paquete::nombre_simple(n))
        .collect();
    Ok(paquete::tamano(&data.join("imagenes"), &nombres))
}

#[tauri::command]
fn nombre_equipo() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_default()
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
            auto_backup_path_hoy,
            mirror_backup,
            mirror_subfolder,
            prune_auto_backups,
            prune_safety_backups,
            clean_orphan_images,
            list_backups,
            restore_backup,
            copiar_envio,
            crear_paquete,
            abrir_paquete,
            tamano_imagenes,
            nombre_equipo,
            ocr_imagen
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
