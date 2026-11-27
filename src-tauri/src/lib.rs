pub mod cache;
#[cfg(not(mobile))]
pub mod mic;

#[cfg(not(mobile))]
use mic::{MicChunk, MicState};
use std::path::{Path, PathBuf};
#[cfg(not(mobile))]
use tauri::ipc::Channel;
use tauri::ipc::{InvokeBody, Request, Response};
#[cfg(not(mobile))]
use tauri::State;
use tauri::{AppHandle, Manager};

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
    let base = app_data_dir(&app)?;
    match request.body() {
        InvokeBody::Raw(bytes) => {
            let bucket = header_str(&request, "x-cache-bucket")?;
            let key = header_str(&request, "x-cache-key")?;
            cache::write_cache_bytes(&base, bucket, key, bytes.as_slice())
        }
        InvokeBody::Json(val) => {
            if let Some(arr) = val.as_array() {
                let bucket = header_str(&request, "x-cache-bucket")?;
                let key = header_str(&request, "x-cache-key")?;
                let mut bytes = Vec::with_capacity(arr.len());
                for item in arr {
                    let n = item
                        .as_u64()
                        .and_then(|v| u8::try_from(v).ok())
                        .ok_or_else(|| "Invalid byte in cache_put JSON array".to_string())?;
                    bytes.push(n);
                }
                cache::write_cache_bytes(&base, bucket, key, &bytes)
            } else if let Some(obj) = val.as_object() {
                let bucket = obj
                    .get("bucket")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "Missing bucket in cache_put payload".to_string())?;
                let key = obj
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "Missing key in cache_put payload".to_string())?;
                let data_b64 = obj
                    .get("dataB64")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "Missing dataB64 in cache_put payload".to_string())?;
                let bytes = cache::decode_base64(data_b64)?;
                cache::write_cache_bytes(&base, bucket, key, &bytes)
            } else {
                Err("Expected raw binary or JSON payload for cache_put".to_string())
            }
        }
    }
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
fn cache_list(app: AppHandle, bucket: String) -> Result<Vec<(String, u64)>, String> {
    let base = app_data_dir(&app)?;
    cache::list_cache_entries(&base, &bucket)
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

fn strip_verbatim_prefix(path: &str) -> String {
    path.strip_prefix(r"\\?\").unwrap_or(path).to_string()
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
            return Ok(strip_verbatim_prefix(&bundled.to_string_lossy()));
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
                return Ok(strip_verbatim_prefix(&canonical.to_string_lossy()));
            }
        }
    }

    Err(format!("Mushaf page {filename} not found"))
}

#[cfg(not(mobile))]
#[tauri::command]
async fn mic_start(state: State<'_, MicState>, on_chunk: Channel<MicChunk>) -> Result<u32, String> {
    let mic = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || mic.start(on_chunk))
        .await
        .map_err(|e| format!("Mic start task failed: {e}"))?
}

#[cfg(not(mobile))]
#[tauri::command]
async fn mic_stop(state: State<'_, MicState>) -> Result<(), String> {
    let mic = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || mic.stop())
        .await
        .map_err(|e| format!("Mic stop task failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(not(mobile))]
    let builder = builder
        .manage(MicState::default())
        .invoke_handler(tauri::generate_handler![
            cache_put,
            cache_get,
            cache_has,
            cache_delete,
            cache_list,
            kv_get,
            kv_set,
            get_mushaf_page_path,
            mic_start,
            mic_stop,
        ]);

    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        cache_put,
        cache_get,
        cache_has,
        cache_delete,
        cache_list,
        kv_get,
        kv_set,
        get_mushaf_page_path,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running Kafi application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_verbatim_prefix() {
        assert_eq!(
            strip_verbatim_prefix(r"\\?\C:\Users\me\Ayat\public\mushaf\pages\001.gif"),
            r"C:\Users\me\Ayat\public\mushaf\pages\001.gif"
        );
        assert_eq!(
            strip_verbatim_prefix("/Users/me/Ayat/public/mushaf/pages/001.gif"),
            "/Users/me/Ayat/public/mushaf/pages/001.gif"
        );
    }
}
