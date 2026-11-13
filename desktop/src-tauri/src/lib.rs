use base64::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static INITIAL_DEEP_LINK: OnceLock<std::sync::Mutex<Option<String>>> = OnceLock::new();

fn set_deep_link(url: String) {
  let m = INITIAL_DEEP_LINK.get_or_init(|| std::sync::Mutex::new(None));
  if let Ok(mut lock) = m.lock() {
    *lock = Some(url);
  }
}

fn get_deep_link_value() -> Option<String> {
  INITIAL_DEEP_LINK
    .get_or_init(|| std::sync::Mutex::new(None))
    .lock()
    .ok()
    .and_then(|lock| lock.clone())
}

#[cfg(target_os = "windows")]
fn register_custom_protocol() {
  use std::os::windows::process::CommandExt;
  if let Ok(exe_path) = std::env::current_exe() {
    let exe_str = exe_path.to_string_lossy().to_string();
    let command = format!("\"{}\" \"%1\"", exe_str);
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Register beatflow:// protocol in HKCU (no administrator privileges needed)
    let _ = std::process::Command::new("reg")
      .args(&["add", "HKCU\\Software\\Classes\\beatflow", "/ve", "/d", "URL:BeatFlow Protocol", "/f"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
    let _ = std::process::Command::new("reg")
      .args(&["add", "HKCU\\Software\\Classes\\beatflow", "/v", "URL Protocol", "/d", "", "/f"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
    let _ = std::process::Command::new("reg")
      .args(&["add", "HKCU\\Software\\Classes\\beatflow\\DefaultIcon", "/ve", "/d", &format!("\"{}\",0", exe_str), "/f"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
    let _ = std::process::Command::new("reg")
      .args(&["add", "HKCU\\Software\\Classes\\beatflow\\shell\\open\\command", "/ve", "/d", &command, "/f"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
  }
}

#[cfg(not(target_os = "windows"))]
fn register_custom_protocol() {}

pub fn get_music_dir() -> PathBuf {
  let base_music = dirs::audio_dir()
    .or_else(|| dirs::home_dir().map(|h| h.join("Music")))
    .unwrap_or_else(|| PathBuf::from("."));

  let subfolder = if cfg!(debug_assertions) {
    "BeatFlow Dev"
  } else {
    "BeatFlow"
  };

  let dir = base_music.join(subfolder);
  let _ = fs::create_dir_all(&dir);
  dir
}

fn open_in_file_manager(path: &Path) {
  #[cfg(target_os = "windows")]
  {
    let _ = std::process::Command::new("explorer").arg(path).spawn();
  }
  #[cfg(target_os = "macos")]
  {
    let _ = std::process::Command::new("open").arg(path).spawn();
  }
  #[cfg(target_os = "linux")]
  {
    let _ = std::process::Command::new("xdg-open").arg(path).spawn();
  }
}

fn sanitize_stem(raw: &str) -> String {
  let illegal = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
  let clean: String = raw
    .chars()
    .map(|c| if illegal.contains(&c) || c.is_control() { ' ' } else { c })
    .collect();
  let collapsed = clean.split_whitespace().collect::<Vec<_>>().join(" ");
  let trimmed = collapsed.trim().trim_matches('.');
  if trimmed.is_empty() {
    "Track".to_string()
  } else if trimmed.chars().count() > 120 {
    trimmed.chars().take(120).collect()
  } else {
    trimmed.to_string()
  }
}

fn url_decode(input: &str) -> String {
  let mut bytes = Vec::new();
  let mut iter = input.bytes();
  while let Some(b) = iter.next() {
    if b == b'%' {
      if let (Some(h1), Some(h2)) = (iter.next(), iter.next()) {
        if let Ok(val) = u8::from_str_radix(&format!("{}{}", h1 as char, h2 as char), 16) {
          bytes.push(val);
          continue;
        }
      }
    } else if b == b'+' {
      bytes.push(b' ');
      continue;
    }
    bytes.push(b);
  }
  String::from_utf8_lossy(&bytes).into_owned()
}

fn url_encode(input: &str) -> String {
  let mut encoded = String::new();
  for b in input.bytes() {
    if (b >= b'a' && b <= b'z')
      || (b >= b'A' && b <= b'Z')
      || (b >= b'0' && b <= b'9')
      || b == b'-'
      || b == b'_'
      || b == b'.'
      || b == b'~'
    {
      encoded.push(b as char);
    } else {
      encoded.push_str(&format!("%{:02X}", b));
    }
  }
  encoded
}

fn is_audio_ext(ext: &str) -> bool {
  matches!(
    ext.to_lowercase().as_str(),
    "mp3" | "m4a" | "flac" | "wav" | "ogg" | "opus" | "aac" | "webm" | "3gp" | "eac3" | "ec3" | "ac3" | "alac" | "aiff" | "aif"
  )
}

fn mime_for_ext(ext: &str) -> &'static str {
  match ext.to_lowercase().as_str() {
    "mp3" => "audio/mpeg",
    "m4a" | "aac" => "audio/mp4",
    "flac" => "audio/flac",
    "wav" => "audio/wav",
    "ogg" | "opus" => "audio/ogg",
    "webm" => "audio/webm",
    "3gp" => "audio/3gpp",
    "eac3" | "ec3" => "audio/eac3",
    "ac3" => "audio/ac3",
    "alac" => "audio/alac",
    "aiff" | "aif" => "audio/aiff",
    _ => "application/octet-stream",
  }
}

fn client() -> &'static reqwest::Client {
  HTTP_CLIENT.get_or_init(|| {
    reqwest::Client::builder()
      .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
      .build()
      .expect("failed to create reqwest client")
  })
}

#[derive(Debug, Deserialize)]
struct FetchParams {
  url: String,
  #[serde(default)]
  method: Option<String>,
  #[serde(default)]
  headers: Option<HashMap<String, String>>,
  #[serde(default)]
  body: Option<String>,
  #[serde(rename = "bodyEncoding", default)]
  body_encoding: Option<String>,
}

#[derive(Debug, Serialize)]
struct FetchResult {
  status: u16,
  headers: HashMap<String, String>,
  body: String,
  #[serde(rename = "bodyEncoding")]
  body_encoding: String,
  url: String,
}

async fn execute_http_request(params: FetchParams, is_youtube: bool) -> Result<FetchResult, String> {
  let method_str = params.method.as_deref().unwrap_or("GET").to_uppercase();
  let method = match method_str.as_str() {
    "POST" => reqwest::Method::POST,
    "HEAD" => reqwest::Method::HEAD,
    "PUT" => reqwest::Method::PUT,
    "DELETE" => reqwest::Method::DELETE,
    _ => reqwest::Method::GET,
  };

  let mut req = client().request(method, &params.url);

  // Faithful mirroring of web/extension/lib/rules.ts:
  // 1. /youtubei/ on music.youtube.com gets music.youtube.com origin/referer/x-origin
  // 2. /youtubei/ on www.youtube.com gets www.youtube.com origin/referer/x-origin
  // 3. googlevideo.com gets www.youtube.com origin/referer (unless c=VISIONOS)
  // 4. api/stats gets music.youtube.com origin/referer
  // 5. sw.js_data, iframe_api, and s/player/* MUST NOT have Origin or X-Origin headers,
  //    otherwise YouTube returns HTTP 400 Bad Request.
  let is_yt = is_youtube || params.url.contains("youtube.com") || params.url.contains("googlevideo.com");
  let is_apple = params.url.contains("amp-api.music.apple.com");
  let is_musixmatch = params.url.contains("musixmatch.com");
  if params.url.contains("music.youtube.com/youtubei/") {
    req = req
      .header("Origin", "https://music.youtube.com")
      .header("Referer", "https://music.youtube.com/")
      .header("X-Origin", "https://music.youtube.com");
  } else if params.url.contains("youtube.com/youtubei/") {
    req = req
      .header("Origin", "https://www.youtube.com")
      .header("Referer", "https://www.youtube.com/")
      .header("X-Origin", "https://www.youtube.com");
  } else if params.url.contains("googlevideo.com") {
    if !params.url.contains("c=VISIONOS") {
      req = req
        .header("Origin", "https://www.youtube.com")
        .header("Referer", "https://www.youtube.com/");
    }
  } else if params.url.contains("/api/stats/") {
    req = req
      .header("Origin", "https://music.youtube.com")
      .header("Referer", "https://music.youtube.com/");
  } else if is_apple {
    req = req
      .header("Origin", "https://music.apple.com")
      .header("Referer", "https://music.apple.com/");
  } else if is_musixmatch {
    req = req.header("Cookie", "mxm_bab=AB");
  }

  if let Some(headers) = params.headers {
    for (k, v) in headers {
      // If this is a YouTube request, drop the page's identity/origin headers
      // (origin, referer, x-origin, host, content-length) so they don't override or conflict.
      if k.eq_ignore_ascii_case("host") || k.eq_ignore_ascii_case("content-length") {
        continue;
      }
      if is_yt
        && (k.eq_ignore_ascii_case("origin")
          || k.eq_ignore_ascii_case("referer")
          || k.eq_ignore_ascii_case("x-origin"))
      {
        continue;
      }
      if is_apple
        && (k.eq_ignore_ascii_case("origin")
          || k.eq_ignore_ascii_case("referer"))
      {
        continue;
      }
      req = req.header(k, v);
    }
  }

  if let Some(body) = params.body {
    if params.body_encoding.as_deref() == Some("base64") {
      if let Ok(bytes) = BASE64_STANDARD.decode(&body) {
        req = req.body(bytes);
      } else {
        req = req.body(body);
      }
    } else {
      req = req.body(body);
    }
  }

  let resp = req.send().await.map_err(|e| e.to_string())?;
  let final_url = resp.url().to_string();
  let status = resp.status().as_u16();

  println!("[Rust Bridge] HTTP {} {} -> {}", method_str, status, params.url);

  let mut resp_headers = HashMap::new();
  let mut content_type = String::new();
  for (k, v) in resp.headers().iter() {
    if let Ok(val) = v.to_str() {
      if k.as_str().eq_ignore_ascii_case("content-type") {
        content_type = val.to_string();
      }
      resp_headers.insert(k.as_str().to_string(), val.to_string());
    }
  }

  let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
  let is_textual = content_type.contains("json")
    || content_type.contains("text")
    || content_type.contains("javascript")
    || content_type.contains("xml");

  let (body_str, body_encoding) = if is_textual {
    match String::from_utf8(bytes.to_vec()) {
      Ok(s) => (s, "text".to_string()),
      Err(_) => (BASE64_STANDARD.encode(&bytes), "base64".to_string()),
    }
  } else {
    (BASE64_STANDARD.encode(&bytes), "base64".to_string())
  };

  Ok(FetchResult {
    status,
    headers: resp_headers,
    body: body_str,
    body_encoding,
    url: final_url,
  })
}

#[tauri::command]
async fn bridge_call(method: String, params: Value) -> Result<Value, String> {
  println!("[Rust Bridge] IPC bridge_call: {}", method);
  match method.as_str() {
    "ping" => Ok(json!({
      "version": "1.9.2",
      "protocol": 1,
      "browser": "chromium",
      "capabilities": ["yt", "yt.auth", "yt.stats", "addon", "lyrics", "spotify", "discord"]
    })),
    "yt.fetch" => {
      let fetch_params: FetchParams = serde_json::from_value(params).map_err(|e| e.to_string())?;
      let res = execute_http_request(fetch_params, true).await?;
      serde_json::to_value(res).map_err(|e| e.to_string())
    }
    "lyrics.fetch" | "addon.fetch" => {
      let fetch_params: FetchParams = serde_json::from_value(params).map_err(|e| e.to_string())?;
      let res = execute_http_request(fetch_params, false).await?;
      serde_json::to_value(res).map_err(|e| e.to_string())
    }
    "lyrics.permissions" => {
      let origins = params.get("origins").cloned().unwrap_or_else(|| json!([]));
      Ok(json!({
        "allowed": origins,
        "granted": origins,
        "denied": []
      }))
    }
    "lyrics.requestPermissions" => Ok(json!({ "granted": true })),
    "yt.authState" => Ok(json!({
      "browserSignedIn": false,
      "connected": false,
      "signedIn": false,
      "accounts": [],
      "active": null,
      "problem": null
    })),
    "yt.selectChannel" | "yt.setConnected" => Ok(json!({
      "browserSignedIn": false,
      "connected": false,
      "signedIn": false,
      "accounts": [],
      "active": null,
      "problem": null
    })),
    "spotify.authState" => Ok(json!({
      "browserSignedIn": false,
      "connected": false,
      "signedIn": false,
      "user": null,
      "problem": null
    })),
    "spotify.setConnected" | "spotify.signIn" => Ok(json!({
      "browserSignedIn": false,
      "connected": false,
      "signedIn": false,
      "user": null,
      "problem": null
    })),
    "spotify.canvas" => Ok(json!({ "url": null })),
    "discord.state" => Ok(json!({
      "available": false,
      "connected": false,
      "enabled": false,
      "user": null,
      "gateway": "off",
      "problem": null
    })),
    "discord.presence" | "discord.connect" | "discord.disconnect" | "discord.setEnabled" => {
      Ok(json!({}))
    }
    "app.getDeepLink" => {
      let url = get_deep_link_value();
      Ok(json!({ "url": url }))
    }
    "app.openDeepLink" => {
      let url = params.get("url").and_then(|u| u.as_str()).unwrap_or_default();
      set_deep_link(url.to_string());
      Ok(json!({ "handled": true, "url": url }))
    }
    "downloads.getFolder" => {
      let dir = get_music_dir();
      Ok(json!({
        "path": dir.to_string_lossy(),
        "isDev": cfg!(debug_assertions),
        "folderName": if cfg!(debug_assertions) { "BeatFlow Dev" } else { "BeatFlow" }
      }))
    }
    "downloads.openFolder" => {
      let dir = get_music_dir();
      open_in_file_manager(&dir);
      Ok(json!({ "opened": true }))
    }
    "downloads.list" => {
      let dir = get_music_dir();
      let mut items = Vec::new();
      if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
          let path = entry.path();
          if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if is_audio_ext(ext) {
              let file_name = path.file_name().and_then(|f| f.to_str()).unwrap_or("").to_string();
              let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
              let (artist, title) = if let Some((a, t)) = stem.split_once(" - ") {
                (a.trim().to_string(), t.trim().to_string())
              } else {
                ("".to_string(), stem.trim().to_string())
              };
              let meta = entry.metadata().ok();
              let file_size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
              let modified_ms = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

              let local_url = format!("beatflow://local/{}", file_name);

              items.push(json!({
                "id": format!("local_{}", file_name),
                "videoId": format!("local_{}", file_name),
                "fileName": file_name,
                "filePath": path.to_string_lossy(),
                "title": title,
                "artist": artist,
                "extension": ext,
                "sizeBytes": file_size,
                "modifiedMs": modified_ms,
                "localUrl": local_url
              }));
            }
          }
        }
      }
      items.sort_by(|a, b| {
        let ma = a.get("modifiedMs").and_then(|v| v.as_u64()).unwrap_or(0);
        let mb = b.get("modifiedMs").and_then(|v| v.as_u64()).unwrap_or(0);
        mb.cmp(&ma)
      });
      Ok(json!(items))
    }
    "downloads.downloadTrack" => {
      let audio_url = params.get("audioUrl").and_then(|v| v.as_str()).ok_or("Missing audioUrl")?;
      let title_raw = params.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown Title");
      let artist_raw = params.get("artist").and_then(|v| v.as_str()).unwrap_or("");
      let video_id = params.get("videoId").and_then(|v| v.as_str()).unwrap_or("");
      let ext_param = params.get("extension").and_then(|v| v.as_str()).unwrap_or("m4a");

      let artist_clean = sanitize_stem(artist_raw);
      let title_clean = sanitize_stem(title_raw);
      let file_stem = if artist_clean.is_empty() || artist_clean == "Track" {
        title_clean
      } else {
        format!("{} - {}", artist_clean, title_clean)
      };
      let ext = if ext_param.is_empty() { "m4a" } else { ext_param.trim_start_matches('.') };
      let file_name = format!("{}.{}", file_stem, ext);
      let dir = get_music_dir();
      let file_path = dir.join(&file_name);

      println!("[Rust Bridge] Downloading track '{}' to {:?}", file_name, file_path);

      let resp = client().get(audio_url).send().await.map_err(|e| e.to_string())?;
      if !resp.status().is_success() {
        return Err(format!("Download failed with HTTP {}", resp.status()));
      }
      let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
      fs::write(&file_path, &bytes).map_err(|e| e.to_string())?;

      let local_url = format!("beatflow://local/{}", file_name);
      Ok(json!({
        "success": true,
        "fileName": file_name,
        "filePath": file_path.to_string_lossy(),
        "localUrl": local_url,
        "videoId": video_id,
        "bytesDownloaded": bytes.len()
      }))
    }
    "downloads.deleteTrack" => {
      let file_name = params.get("fileName").and_then(|v| v.as_str()).ok_or("Missing fileName")?;
      let dir = get_music_dir();
      let file_path = dir.join(file_name);
      if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
        Ok(json!({ "deleted": true, "fileName": file_name }))
      } else {
        Ok(json!({ "deleted": false, "reason": "not found" }))
      }
    }
    "downloads.checkExists" => {
      let title_raw = params.get("title").and_then(|v| v.as_str()).unwrap_or("");
      let artist_raw = params.get("artist").and_then(|v| v.as_str()).unwrap_or("");
      let file_name_param = params.get("fileName").and_then(|v| v.as_str()).unwrap_or("");

      let dir = get_music_dir();
      let mut found = false;
      let mut found_file = String::new();

      if !file_name_param.is_empty() && dir.join(file_name_param).exists() {
        found = true;
        found_file = file_name_param.to_string();
      } else if let Ok(entries) = fs::read_dir(&dir) {
        let artist_clean = sanitize_stem(artist_raw).to_lowercase();
        let title_clean = sanitize_stem(title_raw).to_lowercase();
        for entry in entries.flatten() {
          let name = entry.file_name().to_string_lossy().to_lowercase();
          if is_audio_ext(entry.path().extension().and_then(|e| e.to_str()).unwrap_or("")) {
            if !title_clean.is_empty() && name.contains(&title_clean) && (artist_clean.is_empty() || name.contains(&artist_clean)) {
              found = true;
              found_file = entry.file_name().to_string_lossy().to_string();
              break;
            }
          }
        }
      }

      Ok(json!({
        "exists": found,
        "fileName": if found { Some(found_file) } else { None }
      }))
    }
    "addon.manifest" => {
      let base_url = params.get("baseUrl").and_then(|v| v.as_str()).ok_or("Missing baseUrl")?;
      let base = base_url.trim_end_matches('/');
      let manifest_url = if base.ends_with("/manifest.json") {
        base.to_string()
      } else {
        format!("{}/manifest.json", base)
      };
      let resp = client().get(&manifest_url).send().await.map_err(|e| e.to_string())?;
      if !resp.status().is_success() {
        return Err(format!("Addon manifest returned HTTP {}", resp.status()));
      }
      let text = resp.text().await.map_err(|e| e.to_string())?;
      let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("Invalid JSON manifest: {e}"))?;
      Ok(parsed)
    }
    "addon.search" => {
      let base_url = params.get("baseUrl").and_then(|v| v.as_str()).ok_or("Missing baseUrl")?;
      let query = params.get("query").and_then(|v| v.as_str()).unwrap_or("");
      let quality = params.get("quality").and_then(|v| v.as_str()).unwrap_or("high");
      let base = base_url.trim_end_matches('/').trim_end_matches("/manifest.json");
      let search_url = format!("{}/search?q={}&quality={}", base, url_encode(query), quality);
      let resp = client().get(&search_url).send().await.map_err(|e| e.to_string())?;
      if !resp.status().is_success() {
        return Err(format!("Addon search returned HTTP {}", resp.status()));
      }
      let text = resp.text().await.map_err(|e| e.to_string())?;
      let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("Invalid JSON from search: {e}"))?;
      Ok(parsed)
    }
    "addon.stream" => {
      let base_url = params.get("baseUrl").and_then(|v| v.as_str()).ok_or("Missing baseUrl")?;
      let track_id = params.get("trackId").and_then(|v| v.as_str()).ok_or("Missing trackId")?;
      let quality = params.get("quality").and_then(|v| v.as_str()).unwrap_or("high");
      let base = base_url.trim_end_matches('/').trim_end_matches("/manifest.json");
      let stream_url = format!("{}/stream/{}?quality={}", base, track_id, quality);
      let resp = client().get(&stream_url).send().await.map_err(|e| e.to_string())?;
      if !resp.status().is_success() {
        return Err(format!("Addon stream returned HTTP {}", resp.status()));
      }
      let text = resp.text().await.map_err(|e| e.to_string())?;
      let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("Invalid JSON from stream: {e}"))?;
      Ok(parsed)
    }
    "addons.loadConfig" => {
      let dir = get_music_dir();
      let config_file = dir.join("addons.json");
      if config_file.exists() {
        let content = fs::read_to_string(&config_file).map_err(|e| e.to_string())?;
        let parsed: Value = serde_json::from_str(&content).unwrap_or(json!([]));
        Ok(parsed)
      } else {
        Ok(json!([]))
      }
    }
    "addons.saveConfig" => {
      let dir = get_music_dir();
      let config_file = dir.join("addons.json");
      let addons_val = params.get("addons").cloned().unwrap_or(json!([]));
      let formatted = serde_json::to_string_pretty(&addons_val).map_err(|e| e.to_string())?;
      fs::write(&config_file, formatted).map_err(|e| e.to_string())?;
      Ok(json!({ "saved": true, "path": config_file.to_string_lossy() }))
    }
    _ => Err(format!("Unknown bridge method: {method}")),
  }
}

const DESKTOP_BRIDGE_INIT: &str = r#"
(function() {
  if (window.__BEATFLOW_DESKTOP__) return;
  window.__BEATFLOW_DESKTOP__ = true;

  window.__BEATFLOW_CALL__ = function(method, params) {
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      return window.__TAURI_INTERNALS__.invoke('bridge_call', { method: method, params: params || {} });
    }
    return Promise.reject(new Error('Tauri IPC invoke not ready'));
  };

  window.addEventListener('message', function(event) {
    if (!event.data || event.data.channel !== 'bitchord-bridge' || event.data.direction !== 'to-extension') return;
    var req = event.data;
    if (window.__BEATFLOW_CALL__) {
      window.__BEATFLOW_CALL__(req.method, req.params).then(function(result) {
        window.postMessage({
          channel: 'bitchord-bridge',
          protocol: 1,
          direction: 'from-extension',
          id: req.id,
          ok: true,
          result: result
        }, '*');
      }).catch(function(err) {
        window.postMessage({
          channel: 'bitchord-bridge',
          protocol: 1,
          direction: 'from-extension',
          id: req.id,
          ok: false,
          error: { code: 'unavailable', message: String(err) }
        }, '*');
      });
    }
  });

  window.__BEATFLOW_WINDOW__ = {
    minimize: function() {
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        return window.__TAURI_INTERNALS__.invoke('window_minimize');
      }
    },
    toggleMaximize: function() {
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        return window.__TAURI_INTERNALS__.invoke('window_toggle_maximize');
      }
    },
    close: function() {
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        return window.__TAURI_INTERNALS__.invoke('window_close');
      }
    },
    isMaximized: function() {
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        return window.__TAURI_INTERNALS__.invoke('window_is_maximized');
      }
      return Promise.resolve(false);
    }
  };

  window.__BEATFLOW_DEEP_LINK__ = {
    get: function() {
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        return window.__TAURI_INTERNALS__.invoke('get_deep_link');
      }
      return Promise.resolve(window.__BEATFLOW_INITIAL_DEEPLINK__ || null);
    },
    open: function(url) {
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        return window.__TAURI_INTERNALS__.invoke('open_deep_link', { url: url });
      }
      return Promise.resolve();
    }
  };
})();
"#;

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
  window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<bool, String> {
  let is_max = window.is_maximized().map_err(|e| e.to_string())?;
  if is_max {
    window.unmaximize().map_err(|e| e.to_string())?;
    Ok(false)
  } else {
    window.maximize().map_err(|e| e.to_string())?;
    Ok(true)
  }
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
  window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
  window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_deep_link() -> Option<String> {
  get_deep_link_value()
}

#[tauri::command]
fn open_deep_link(window: tauri::WebviewWindow, url: String) -> Result<(), String> {
  set_deep_link(url.clone());
  let json = serde_json::to_string(&url).map_err(|e| e.to_string())?;
  let script = format!(
    "window.__BEATFLOW_INITIAL_DEEPLINK__ = {json}; window.dispatchEvent(new CustomEvent('beatflow:deeplink', {{ detail: {json} }}));"
  );
  window.eval(&script).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  for arg in std::env::args().skip(1) {
    if arg.starts_with("beatflow://") {
      set_deep_link(arg);
      break;
    }
  }

  tauri::Builder::default()
    .register_uri_scheme_protocol("beatflow", |_app, req| {
      let uri = req.uri().to_string();
      log::info!("Handling beatflow protocol request: {}", uri);

      // Handle beatflow://local/<filename> or beatflow://localhost/local/<filename>
      if uri.contains("/local/") || uri.starts_with("beatflow://local/") {
        let raw_file = if let Some(idx) = uri.find("/local/") {
          &uri[idx + 7..]
        } else {
          uri.trim_start_matches("beatflow://local/")
        };
        let file_name = url_decode(raw_file);
        let music_dir = get_music_dir();
        let target_file = music_dir.join(&file_name);

        if target_file.exists() && target_file.is_file() {
          if let Ok(mut f) = fs::File::open(&target_file) {
            let file_size = f.metadata().map(|m| m.len()).unwrap_or(0);
            let ext = target_file.extension().and_then(|e| e.to_str()).unwrap_or("");
            let mime = mime_for_ext(ext);

            // Handle range header for seekable media
            let range_header = req.headers().get("range").and_then(|v| v.to_str().ok());
            if let Some(range_str) = range_header {
              if let Some(range_part) = range_str.strip_prefix("bytes=") {
                let parts: Vec<&str> = range_part.split('-').collect();
                let start: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                let end: u64 = parts
                  .get(1)
                  .and_then(|s| s.parse().ok())
                  .unwrap_or(file_size.saturating_sub(1));
                let end = end.min(file_size.saturating_sub(1));

                if start <= end && start < file_size {
                  let chunk_len = end - start + 1;
                  let mut buffer = vec![0u8; chunk_len as usize];
                  if f.seek(SeekFrom::Start(start)).is_ok() && f.read_exact(&mut buffer).is_ok() {
                    return tauri::http::Response::builder()
                      .status(206)
                      .header("Content-Type", mime)
                      .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size))
                      .header("Content-Length", chunk_len.to_string())
                      .header("Accept-Ranges", "bytes")
                      .header("Access-Control-Allow-Origin", "*")
                      .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                      .body(buffer)
                      .unwrap();
                  }
                }
              }
            }

            // Full content
            let mut buffer = Vec::new();
            if f.read_to_end(&mut buffer).is_ok() {
              return tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Content-Length", buffer.len().to_string())
                .header("Accept-Ranges", "bytes")
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                .body(buffer)
                .unwrap();
            }
          }
        }

        return tauri::http::Response::builder()
          .status(404)
          .header("Access-Control-Allow-Origin", "*")
          .header("Content-Type", "text/plain")
          .body("File not found in BeatFlow music folder".as_bytes().to_vec())
          .unwrap();
      }

      let json = json!({
        "status": "ok",
        "uri": uri,
        "scheme": "beatflow"
      });
      let body = serde_json::to_vec(&json).unwrap_or_default();
      tauri::http::Response::builder()
        .status(200)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Content-Type", "application/json")
        .body(body)
        .unwrap()
    })
    .invoke_handler(tauri::generate_handler![
      bridge_call,
      window_minimize,
      window_toggle_maximize,
      window_close,
      window_is_maximized,
      get_deep_link,
      open_deep_link,
    ])
    .on_page_load(|window, _payload| {
      let _ = window.eval(DESKTOP_BRIDGE_INIT);
      if let Some(url) = get_deep_link_value() {
        if let Ok(json) = serde_json::to_string(&url) {
          let script = format!(
            "window.__BEATFLOW_INITIAL_DEEPLINK__ = {json}; window.dispatchEvent(new CustomEvent('beatflow:deeplink', {{ detail: {json} }}));"
          );
          let _ = window.eval(&script);
        }
      }
    })
    .setup(|app| {
      register_custom_protocol();
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
