use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);
static KV_LOCK: Mutex<()> = Mutex::new(());

fn validate_segment(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty() || value == "." || value == ".." {
        return Err(format!("Invalid cache {label}: '{value}'"));
    }
    let valid = value
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'));
    if !valid {
        return Err(format!(
            "Invalid cache {label}: must contain only [A-Za-z0-9._:-]"
        ));
    }
    Ok(())
}

pub fn safe_cache_path(base: &Path, bucket: &str, key: &str) -> Result<PathBuf, String> {
    validate_segment("bucket", bucket)?;
    validate_segment("key", key)?;
    Ok(base.join("cache").join(bucket).join(key))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Target path has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;

    let seq = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp_name = format!(".tmp-{}-{seq}", std::process::id());
    let tmp_path = parent.join(tmp_name);

    let write_res = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        Ok(())
    })();

    if let Err(e) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed to write temp file: {e}"));
    }

    if let Err(e) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed to rename temp file: {e}"));
    }

    Ok(())
}

pub fn write_cache_bytes(base: &Path, bucket: &str, key: &str, bytes: &[u8]) -> Result<(), String> {
    let path = safe_cache_path(base, bucket, key)?;
    atomic_write(&path, bytes)
}

pub fn read_cache_bytes(
    base: &Path,
    bucket: &str,
    key: &str,
) -> Result<Option<Vec<u8>>, String> {
    let path = safe_cache_path(base, bucket, key)?;
    match fs::read(&path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Failed to read cache entry: {e}")),
    }
}

pub fn has_cache_entry(base: &Path, bucket: &str, key: &str) -> Result<bool, String> {
    let path = safe_cache_path(base, bucket, key)?;
    Ok(path.is_file())
}

pub fn delete_cache_entry(base: &Path, bucket: &str, key: &str) -> Result<(), String> {
    let path = safe_cache_path(base, bucket, key)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to delete cache entry: {e}")),
    }
}

fn load_kv_map(path: &Path) -> Result<BTreeMap<String, String>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| format!("Corrupt KV store: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(format!("Failed to read KV store: {e}")),
    }
}

pub fn read_kv(base: &Path, key: &str) -> Result<Option<String>, String> {
    let _guard = KV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let map = load_kv_map(&base.join("user.json"))?;
    Ok(map.get(key).cloned())
}

pub fn write_kv(base: &Path, key: &str, value: &str) -> Result<(), String> {
    let _guard = KV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = base.join("user.json");
    let mut map = load_kv_map(&path)?;
    map.insert(key.to_string(), value.to_string());
    let serialized =
        serde_json::to_vec(&map).map_err(|e| format!("Failed to serialize KV store: {e}"))?;
    atomic_write(&path, &serialized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "ayat-test-{prefix}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn test_rejects_path_traversal_keys() {
        let base = Path::new("/tmp/ayat-cache-test");
        assert!(safe_cache_path(base, "audio", "../secret").is_err());
        assert!(safe_cache_path(base, "../etc", "a").is_err());
        assert!(safe_cache_path(base, "audio", "a/b").is_err());
        assert!(safe_cache_path(base, "audio", "a\\b").is_err());
        assert!(safe_cache_path(base, "audio", ".").is_err());
        assert!(safe_cache_path(base, "audio", "..").is_err());
        assert!(safe_cache_path(base, "audio", "a\0b").is_err());
        assert!(safe_cache_path(base, "", "key").is_err());
        assert!(safe_cache_path(base, "audio", "").is_err());

        let valid = safe_cache_path(base, "audio", "001001.mp3").expect("valid key");
        assert_eq!(valid, base.join("cache").join("audio").join("001001.mp3"));
    }

    #[test]
    fn test_disk_cache_roundtrip() {
        let base = unique_temp_dir("cache");
        let payload = b"bismillah-raw-bytes-1234";

        assert_eq!(read_cache_bytes(&base, "audio", "missing").unwrap(), None);
        assert!(!has_cache_entry(&base, "audio", "001001.mp3").unwrap());

        write_cache_bytes(&base, "audio", "001001.mp3", payload).unwrap();
        assert!(has_cache_entry(&base, "audio", "001001.mp3").unwrap());
        assert_eq!(
            read_cache_bytes(&base, "audio", "001001.mp3").unwrap(),
            Some(payload.to_vec())
        );

        delete_cache_entry(&base, "audio", "001001.mp3").unwrap();
        assert!(!has_cache_entry(&base, "audio", "001001.mp3").unwrap());
        assert_eq!(read_cache_bytes(&base, "audio", "001001.mp3").unwrap(), None);

        // Deleting a missing key should be idempotent
        delete_cache_entry(&base, "audio", "001001.mp3").unwrap();

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_kv_roundtrip() {
        let base = unique_temp_dir("kv");

        assert_eq!(read_kv(&base, "theme").unwrap(), None);
        write_kv(&base, "theme", "sepia").unwrap();
        write_kv(&base, "lastPage", "42").unwrap();
        assert_eq!(read_kv(&base, "theme").unwrap(), Some("sepia".to_string()));
        assert_eq!(read_kv(&base, "lastPage").unwrap(), Some("42".to_string()));

        let _ = fs::remove_dir_all(&base);
    }
}
