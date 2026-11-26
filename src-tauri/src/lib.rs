pub mod cache;
pub mod mic;

use mic::{MicChunk, MicState};
use std::path::{Path, PathBuf};
use tauri::ipc::{Channel, InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State};

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app_data_dir: {e}"))
}

fn header_str<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .ok_or_else(|| format!("Missing required header: {name}"))?
        .to_str()
        .map_err(|e| format!("Invalid UTF-8 in header {name}: {e}"))
}

#[tauri::command]
fn cache_put(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let bucket = header_str(&request, "x-cache-bucket")?;
    let key = header_str(&request, "x-cache-key")?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.as_slice(),
        InvokeBody::Json(_) => return Err("Expected raw binary body for cache_put".to_string()),
    };
    let base = app_data_dir(&app)?;
    cache::write_cache_bytes(&base, bucket, key, bytes)
}

#[tauri::command]
fn cache_get(app: AppHandle, bucket: String, key: String) -> Result<Response, String> {
    let base = app_data_dir(&app)?;
    match cache::read_cache_bytes(&base, &bucket, &key)? {
        Some(bytes) => Ok(Response::new(bytes)),
        None => Err("CACHE_MISS".to_string()),
    }
}

#[tauri::command]
fn cache_has(app: AppHandle, bucket: String, key: String) -> Result<bool, String> {
    let base = app_data_dir(&app)?;
    cache::has_cache_entry(&base, &bucket, &key)
}

#[tauri::command]
fn cache_delete(app: AppHandle, bucket: String, key: String) -> Result<(), String> {
    let base = app_data_dir(&app)?;
    cache::delete_cache_entry(&base, &bucket, &key)
}

#[tauri::command]
fn kv_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let base = app_data_dir(&app)?;
    cache::read_kv(&base, &key)
}

#[tauri::command]
fn kv_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let base = app_data_dir(&app)?;
    cache::write_kv(&base, &key, &value)
}

#[tauri::command]
fn get_mushaf_page_path(app: AppHandle, page: u16) -> Result<String, String> {
    if !(1..=604).contains(&page) {
        return Err(format!("Invalid Mushaf page: {page} (expected 1..=604)"));
    }
    let filename = format!("{page:03}.gif");

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("mushaf").join("pages").join(&filename);
        if bundled.is_file() {
            let canonical = bundled.canonicalize().unwrap_or(bundled);
            return Ok(canonical.to_string_lossy().into_owned());
        }
    }

    if cfg!(debug_assertions) {
        let dev_candidates = [
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../public/mushaf/pages")
                .join(&filename),
            Path::new("../public/mushaf/pages").join(&filename),
        ];
        for candidate in dev_candidates {
            if candidate.is_file() {
                let canonical = candidate.canonicalize().unwrap_or(candidate);
                return Ok(canonical.to_string_lossy().into_owned());
            }
        }
    }

    Err(format!("Mushaf page {filename} not found"))
}

#[tauri::command]
fn mic_start(state: State<'_, MicState>, on_chunk: Channel<MicChunk>) -> Result<u32, String> {
    state.start(on_chunk)
}

#[tauri::command]
fn mic_stop(state: State<'_, MicState>) -> Result<(), String> {
    state.stop()
}

pub fn run() {
    tauri::Builder::default()
        .manage(MicState::default())
        .invoke_handler(tauri::generate_handler![
            cache_put,
            cache_get,
            cache_has,
            cache_delete,
            kv_get,
            kv_set,
            get_mushaf_page_path,
            mic_start,
            mic_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ayat desktop application");
}
