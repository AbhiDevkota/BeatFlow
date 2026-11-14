use base64::prelude::*;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

pub mod hires;
pub mod dash;
pub mod engine;

use engine::{BeatflowEngine, TrackPayload};
use hires::InstalledAddon;

static ENGINE: OnceLock<BeatflowEngine> = OnceLock::new();

pub fn engine() -> &'static BeatflowEngine {
  ENGINE.get_or_init(BeatflowEngine::new)
}

pub fn load_addons_from_disk() -> Vec<InstalledAddon> {
  let config_file = get_addons_config_path();
  if config_file.exists() {
    if let Ok(content) = fs::read_to_string(&config_file) {
      if let Ok(addons) = serde_json::from_str::<Vec<InstalledAddon>>(&content) {
        return addons;
      }
    }
  }
  Vec::new()
}

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static INITIAL_DEEP_LINK: OnceLock<std::sync::Mutex<Option<String>>> = OnceLock::new();
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

fn sha1_hex(data: &[u8]) -> String {
  let mut h0: u32 = 0x67452301;
  let mut h1: u32 = 0xEFCDAB89;
  let mut h2: u32 = 0x98BADCFE;
  let mut h3: u32 = 0x10325476;
  let mut h4: u32 = 0xC3D2E1F0;

  let mut msg = data.to_vec();
  let bit_len = (msg.len() as u64) * 8;
  msg.push(0x80);
  while (msg.len() % 64) != 56 {
    msg.push(0);
  }
  msg.extend_from_slice(&bit_len.to_be_bytes());

  for chunk in msg.chunks_exact(64) {
    let mut w = [0u32; 80];
    for i in 0..16 {
      w[i] = u32::from_be_bytes(chunk[i * 4..(i + 1) * 4].try_into().unwrap());
    }
    for i in 16..80 {
      w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
    }
    let mut a = h0;
    let mut b = h1;
    let mut c = h2;
    let mut d = h3;
    let mut e = h4;
    for i in 0..80 {
      let (f, k) = match i {
        0..=19 => ((b & c) | ((!b) & d), 0x5A827999),
        20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
        40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
        _ => (b ^ c ^ d, 0xCA62C1D6),
      };
      let temp = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(w[i]);
      e = d;
      d = c;
      c = b.rotate_left(30);
      b = a;
      a = temp;
    }
    h0 = h0.wrapping_add(a);
    h1 = h1.wrapping_add(b);
    h2 = h2.wrapping_add(c);
    h3 = h3.wrapping_add(d);
    h4 = h4.wrapping_add(e);
  }
  format!("{:08x}{:08x}{:08x}{:08x}{:08x}", h0, h1, h2, h3, h4)
}

fn compute_youtube_authorization(cookies: &str, origin: &str) -> Option<String> {
  let ts = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();

  let get_cookie_val = |target: &str| -> Option<&str> {
    for part in cookies.split(';') {
      let trimmed = part.trim();
      if let Some(rest) = trimmed.strip_prefix(target) {
        if let Some(val) = rest.strip_prefix('=') {
          return Some(val.trim());
        }
      }
    }
    None
  };

  let schemes = [
    ("SAPISIDHASH", "SAPISID"),
    ("SAPISID1PHASH", "__Secure-1PAPISID"),
    ("SAPISID3PHASH", "__Secure-3PAPISID"),
  ];

  let mut parts = Vec::new();
  for (scheme, cookie_name) in schemes {
    if let Some(secret) = get_cookie_val(cookie_name) {
      if !secret.is_empty() {
        let to_hash = format!("{} {} {}", ts, secret, origin);
        let hash = sha1_hex(to_hash.as_bytes());
        parts.push(format!("{} {}_{}", scheme, ts, hash));
      }
    }
  }

  if parts.is_empty() {
    None
  } else {
    Some(parts.join(" "))
  }
}

#[allow(dead_code)]
fn compute_sapisid_hash(sapisid: &str, origin: &str) -> String {
  let ts = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let to_hash = format!("{} {} {}", ts, sapisid, origin);
  let hash = sha1_hex(to_hash.as_bytes());
  format!("SAPISIDHASH {}_{}", ts, hash)
}

#[cfg(target_os = "windows")]
pub fn extract_webview2_cookies(window: &tauri::WebviewWindow) -> Option<String> {
  extract_webview2_cookies_for_url(window, "https://music.youtube.com")
}

#[cfg(target_os = "windows")]
pub fn extract_webview2_cookies_for_url(window: &tauri::WebviewWindow, target_url: &str) -> Option<String> {
  use webview2_com::Microsoft::Web::WebView2::Win32::*;
  use webview2_com::GetCookiesCompletedHandler;
  use windows_core::{Interface, HSTRING, PCWSTR, PWSTR};

  let (tx, rx) = std::sync::mpsc::channel();
  let target = target_url.to_string();
  let res = window.with_webview(move |wv| {
    let controller = wv.controller();
    unsafe {
      let core = match controller.CoreWebView2() {
        Ok(c) => c,
        Err(_) => {
          let _ = tx.send(None);
          return;
        }
      };
      let core2: ICoreWebView2_2 = match core.cast() {
        Ok(c) => c,
        Err(_) => {
          let _ = tx.send(None);
          return;
        }
      };
      let cookie_manager = match core2.CookieManager() {
        Ok(cm) => cm,
        Err(_) => {
          let _ = tx.send(None);
          return;
        }
      };

      let is_spotify = target.contains("spotify.com");
      let tx_inner = tx.clone();
      let handler = GetCookiesCompletedHandler::create(Box::new(move |res, list_opt| {
        if res.is_err() {
          let _ = tx_inner.send(None);
          return Ok(());
        }
        let list = match list_opt {
          Some(l) => l,
          None => {
            let _ = tx_inner.send(None);
            return Ok(());
          }
        };
        let mut count = 0u32;
        let _ = list.Count(&mut count);
        let mut parts = Vec::new();
        for i in 0..count {
          if let Ok(cookie) = list.GetValueAtIndex(i) {
            let mut name_pwstr = PWSTR::null();
            let mut val_pwstr = PWSTR::null();
            let mut dom_pwstr = PWSTR::null();
            let _ = cookie.Name(&mut name_pwstr);
            let _ = cookie.Value(&mut val_pwstr);
            let _ = cookie.Domain(&mut dom_pwstr);
            let name = name_pwstr.to_string().unwrap_or_default();
            let val = val_pwstr.to_string().unwrap_or_default();
            let dom = dom_pwstr.to_string().unwrap_or_default();
            let matched = if is_spotify {
              dom.contains("spotify.com")
            } else {
              dom.contains("youtube.com") || dom.contains("google.com")
            };
            if matched && !name.is_empty() && !val.is_empty() {
              parts.push(format!("{}={}", name, val));
            }
          }
        }
        let _ = tx_inner.send(Some(parts.join("; ")));
        Ok(())
      }));

      let url_hstring = HSTRING::from(target.as_str());
      let pcwstr = PCWSTR::from_raw(url_hstring.as_ptr());
      let _ = cookie_manager.GetCookies(pcwstr, &handler);
    }
  });

  if res.is_err() {
    return None;
  }
  rx.recv_timeout(std::time::Duration::from_secs(3)).ok().flatten()
}

#[cfg(target_os = "windows")]
pub fn clear_webview2_cookies_by_filter(window: &tauri::WebviewWindow, domain_keywords: &[&str]) {
  use webview2_com::Microsoft::Web::WebView2::Win32::*;
  use webview2_com::GetCookiesCompletedHandler;
  use windows_core::{Interface, HSTRING, PCWSTR, PWSTR};

  let filter = domain_keywords.iter().map(|s| s.to_string()).collect::<Vec<_>>();
  let _ = window.with_webview(move |wv| {
    let controller = wv.controller();
    unsafe {
      let core = match controller.CoreWebView2() {
        Ok(c) => c,
        Err(_) => return,
      };
      let core2: ICoreWebView2_2 = match core.cast() {
        Ok(c) => c,
        Err(_) => return,
      };
      let cookie_manager = match core2.CookieManager() {
        Ok(cm) => cm,
        Err(_) => return,
      };

      let is_spotify = filter.iter().any(|f| f.contains("spotify"));
      let target_urls: &[&str] = if is_spotify {
        &[
          "",
          "https://accounts.spotify.com",
          "https://open.spotify.com",
          "https://spotify.com",
        ]
      } else {
        &[
          "",
          "https://accounts.google.com",
          "https://music.youtube.com",
          "https://www.youtube.com",
          "https://google.com",
          "https://myaccount.google.com",
        ]
      };

      for &target_url in target_urls {
        let cm_clone = cookie_manager.clone();
        let filter_clone = filter.clone();
        let handler = GetCookiesCompletedHandler::create(Box::new(move |res, list_opt| {
          if res.is_err() {
            return Ok(());
          }
          if let Some(list) = list_opt {
            let mut count = 0u32;
            let _ = list.Count(&mut count);
            for i in 0..count {
              if let Ok(cookie) = list.GetValueAtIndex(i) {
                let mut dom_pwstr = PWSTR::null();
                let _ = cookie.Domain(&mut dom_pwstr);
                let dom = dom_pwstr.to_string().unwrap_or_default();
                if filter_clone.iter().any(|f| dom.contains(f)) {
                  let _ = cm_clone.DeleteCookie(&cookie);
                }
              }
            }
          }
          Ok(())
        }));

        let url_hstring = HSTRING::from(target_url);
        let pcwstr = if target_url.is_empty() {
          PCWSTR::null()
        } else {
          PCWSTR::from_raw(url_hstring.as_ptr())
        };
        let _ = cookie_manager.GetCookies(pcwstr, &handler);
      }
    }
  });
}

#[cfg(not(target_os = "windows"))]
pub fn extract_webview2_cookies(_window: &tauri::WebviewWindow) -> Option<String> {
  None
}

#[cfg(not(target_os = "windows"))]
pub fn extract_webview2_cookies_for_url(_window: &tauri::WebviewWindow, _target_url: &str) -> Option<String> {
  None
}

#[cfg(not(target_os = "windows"))]
pub fn clear_webview2_cookies_by_filter(_window: &tauri::WebviewWindow, _domain_keywords: &[&str]) {}

fn find_preferred_browser() -> Option<(&'static str, PathBuf)> {
  #[cfg(target_os = "windows")]
  {
    let local = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("C:\\Users\\Default\\AppData\\Local"));
    let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("C:\\Program Files"));
    let program_files_x86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("C:\\Program Files (x86)"));

    let candidates = [
      ("Edge", program_files_x86.join("Microsoft\\Edge\\Application\\msedge.exe")),
      ("Edge", program_files.join("Microsoft\\Edge\\Application\\msedge.exe")),
      ("Edge", local.join("Microsoft\\Edge\\Application\\msedge.exe")),
      ("Chrome", program_files.join("Google\\Chrome\\Application\\chrome.exe")),
      ("Chrome", program_files_x86.join("Google\\Chrome\\Application\\chrome.exe")),
      ("Chrome", local.join("Google\\Chrome\\Application\\chrome.exe")),
      ("Brave", program_files.join("BraveSoftware\\Brave-Browser\\Application\\brave.exe")),
      ("Brave", local.join("BraveSoftware\\Brave-Browser\\Application\\brave.exe")),
    ];

    for (name, path) in candidates {
      if path.is_file() {
        return Some((name, path));
      }
    }
  }
  None
}

async fn capture_cdp_cookies(port: u16, ws_path: &str) -> Option<String> {
  use tokio::io::{AsyncReadExt, AsyncWriteExt};
  let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.ok()?;
  let handshake = format!(
    "GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
    ws_path, port
  );
  stream.write_all(handshake.as_bytes()).await.ok()?;

  let mut buf = vec![0u8; 4096];
  let n = stream.read(&mut buf).await.ok()?;
  let resp = String::from_utf8_lossy(&buf[..n]);
  if !resp.contains("101 Switching Protocols") {
    return None;
  }

  // Send {"id":1,"method":"Storage.getCookies"}
  let cmd = r#"{"id":1,"method":"Storage.getCookies"}"#;
  let len = cmd.len();
  let mut frame = Vec::with_capacity(6 + len);
  frame.push(0x81);
  frame.push(0x80 | (len as u8));
  frame.extend_from_slice(&[0, 0, 0, 0]);
  frame.extend_from_slice(cmd.as_bytes());
  stream.write_all(&frame).await.ok()?;

  let mut received = Vec::new();
  let mut read_buf = vec![0u8; 16384];
  for _ in 0..20 {
    tokio::select! {
      res = stream.read(&mut read_buf) => {
        if let Ok(n) = res {
          if n > 0 {
            received.extend_from_slice(&read_buf[..n]);
            let text = String::from_utf8_lossy(&received);
            if text.contains(r#""id":1"#) {
              if let Some(start) = text.find('{') {
                if let Ok(val) = serde_json::from_str::<Value>(&text[start..]) {
                  if let Some(cookies) = val.get("result").and_then(|r| r.get("cookies")).and_then(|c| c.as_array()) {
                    let mut parts = Vec::new();
                    for c in cookies {
                      let domain = c.get("domain").and_then(|d| d.as_str()).unwrap_or("");
                      if domain.contains("youtube.com") || domain.contains("google.com") {
                        if let (Some(n), Some(v)) = (c.get("name").and_then(|s| s.as_str()), c.get("value").and_then(|s| s.as_str())) {
                          if !n.is_empty() && !v.is_empty() {
                            parts.push(format!("{}={}", n, v));
                          }
                        }
                      }
                    }
                    if !parts.is_empty() {
                      return Some(parts.join("; "));
                    }
                  }
                }
              }
            }
          }
        }
      }
      _ = tokio::time::sleep(std::time::Duration::from_millis(300)) => {}
    }
  }
  None
}

fn start_interactive_browser_sign_in(url: &str) -> bool {
  #[cfg(target_os = "windows")]
  {
    if let Some((browser_name, browser_path)) = find_preferred_browser() {
      let profile_dir = get_config_dir().join("browser_sign_in").join(browser_name);
      let _ = fs::create_dir_all(&profile_dir);
      let port_file = profile_dir.join("DevToolsActivePort");
      let _ = fs::remove_file(&port_file);

      let target_url = if url.is_empty() {
        "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F".to_string()
      } else {
        url.to_string()
      };

      let mut sign_in_process = match std::process::Command::new(&browser_path)
        .arg(format!("--user-data-dir={}", profile_dir.display()))
        .arg("--disable-background-mode")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--new-window")
        .arg(&target_url)
        .spawn()
      {
        Ok(child) => child,
        Err(e) => {
          eprintln!("[BeatFlow Browser Auth] Failed to launch {}: {}", browser_name, e);
          open_in_browser(&target_url);
          return false;
        }
      };

      println!("[BeatFlow Browser Auth] Launched {} for Google sign-in", browser_name);

      tauri::async_runtime::spawn(async move {
        let _ = tokio::task::spawn_blocking(move || {
          let _ = sign_in_process.wait();
        }).await;

        println!("[BeatFlow Browser Auth] Browser window closed, starting headless capture pass...");
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;

        let port_file = profile_dir.join("DevToolsActivePort");
        let _ = fs::remove_file(&port_file);

        let mut reader = match std::process::Command::new(&browser_path)
          .arg(format!("--user-data-dir={}", profile_dir.display()))
          .arg("--headless=new")
          .arg("--disable-background-mode")
          .arg("--remote-debugging-port=0")
          .arg("--remote-debugging-address=127.0.0.1")
          .arg("about:blank")
          .spawn()
        {
          Ok(child) => child,
          Err(e) => {
            eprintln!("[BeatFlow Browser Auth] Failed to launch headless reader: {}", e);
            return;
          }
        };

        let mut endpoint: Option<(u16, String)> = None;
        for _ in 0..40 {
          if port_file.is_file() {
            if let Ok(content) = fs::read_to_string(&port_file) {
              let lines: Vec<&str> = content.lines().collect();
              if lines.len() >= 2 {
                if let Ok(port) = lines[0].trim().parse::<u16>() {
                  let path = lines[1].trim().to_string();
                  endpoint = Some((port, path));
                  break;
                }
              }
            }
          }
          tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        if let Some((port, ws_path)) = endpoint {
          println!("[BeatFlow Browser Auth] Connecting to CDP port {} path {}", port, ws_path);
          if let Some(cookies) = capture_cdp_cookies(port, &ws_path).await {
            if cookies.contains("SAPISID=") {
              println!("[BeatFlow Browser Auth] Successfully captured cookies from browser!");
              let payload = json!({
                "cookies": cookies,
                "name": format!("{} User", browser_name),
                "authUser": "0"
              });
              let _ = handle_auth_callback(&payload.to_string()).await;
            } else {
              println!("[BeatFlow Browser Auth] Captured cookies did not contain SAPISID");
            }
          }
        }

        let _ = reader.kill();
        let _ = reader.wait();
      });

      return true;
    }
  }

  open_in_browser(url);
  false
}

async fn handle_manual_session_import(raw: &str) -> Result<Value, String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Err("No cookie or session data provided".into());
  }

  let cookies = if trimmed.starts_with('{') {
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
      if let Some(c) = v.get("cookies").or_else(|| v.get("cookie")).and_then(|s| s.as_str()) {
        c.to_string()
      } else {
        trimmed.to_string()
      }
    } else {
      trimmed.to_string()
    }
  } else if let Some(stripped) = trimmed.strip_prefix("Cookie:").or_else(|| trimmed.strip_prefix("cookie:")) {
    stripped.trim().to_string()
  } else {
    trimmed.to_string()
  };

  let has_sapisid = cookies.contains("SAPISID=")
    || cookies.contains("__Secure-3PAPISID=")
    || cookies.contains("__Secure-1PAPISID=");
  if !has_sapisid {
    return Err("Provided cookies do not contain SAPISID. Make sure you copy cookies from YouTube Music.".into());
  }

  let payload = json!({
    "cookies": cookies,
    "name": "YouTube Account",
    "authUser": "0"
  });

  handle_auth_callback(&payload.to_string()).await
}

pub fn get_yt_auth_path() -> PathBuf {
  get_config_dir().join("yt_auth.json")
}

pub fn load_yt_auth() -> Option<Value> {
  let path = get_yt_auth_path();
  if path.exists() {
    if let Ok(content) = fs::read_to_string(&path) {
      if let Ok(val) = serde_json::from_str::<Value>(&content) {
        let has_cookies = val
          .get("cookies")
          .and_then(|c| c.as_str())
          .map(|c| c.contains("SAPISID=") || c.contains("__Secure-3PAPISID=") || c.contains("__Secure-1PAPISID="))
          .unwrap_or(false);
        if has_cookies {
          return Some(val);
        }
      }
    }
  }
  None
}

pub fn save_yt_auth(val: &Value) {
  let has_cookies = val
    .get("cookies")
    .and_then(|c| c.as_str())
    .map(|c| c.contains("SAPISID=") || c.contains("__Secure-3PAPISID=") || c.contains("__Secure-1PAPISID="))
    .unwrap_or(false);
  if !has_cookies {
    println!("[BeatFlow Auth] ⚠️ Refusing to save yt_auth without valid SAPISID cookie");
    return;
  }
  let path = get_yt_auth_path();
  if let Ok(content) = serde_json::to_string_pretty(val) {
    let _ = fs::write(&path, content);
  }
}

pub fn get_spotify_auth_path() -> PathBuf {
  get_config_dir().join("spotify_auth.json")
}

pub fn load_spotify_auth() -> Option<Value> {
  let path = get_spotify_auth_path();
  if path.exists() {
    if let Ok(content) = fs::read_to_string(&path) {
      if let Ok(val) = serde_json::from_str::<Value>(&content) {
        let has_sp_dc = val
          .get("sp_dc")
          .and_then(|c| c.as_str())
          .map(|c| !c.is_empty())
          .unwrap_or(false);
        if has_sp_dc {
          return Some(val);
        }
      }
    }
  }
  None
}

pub fn save_spotify_auth(val: &Value) {
  let has_sp_dc = val
    .get("sp_dc")
    .and_then(|c| c.as_str())
    .map(|c| !c.is_empty())
    .unwrap_or(false);
  if !has_sp_dc {
    println!("[BeatFlow Spotify Auth] ⚠️ Refusing to save spotify_auth without sp_dc cookie");
    return;
  }
  let path = get_spotify_auth_path();
  if let Ok(content) = serde_json::to_string_pretty(val) {
    let _ = fs::write(&path, content);
  }
}

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
    .and_then(|mut lock| lock.take())
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

pub fn get_config_dir() -> PathBuf {
  let dir = get_music_dir().join("config");
  let _ = fs::create_dir_all(&dir);
  dir
}

pub fn get_songs_dir() -> PathBuf {
  let dir = get_music_dir().join("songs");
  let _ = fs::create_dir_all(&dir);
  dir
}

pub fn get_lyrics_dir() -> PathBuf {
  let dir = get_music_dir().join("lyrics");
  let _ = fs::create_dir_all(&dir);
  dir
}

pub fn get_thumbnails_dir() -> PathBuf {
  let dir = get_music_dir().join("thumbnails");
  let _ = fs::create_dir_all(&dir);
  dir
}

pub fn get_cache_dir() -> PathBuf {
  let dir = get_music_dir().join("cache");
  let _ = fs::create_dir_all(&dir);
  dir
}

pub fn get_addons_config_path() -> PathBuf {
  let new_path = get_config_dir().join("addons.json");
  let old_path = get_music_dir().join("addons.json");
  if old_path.exists() && !new_path.exists() {
    let _ = fs::rename(&old_path, &new_path);
  }
  new_path
}

pub fn open_in_browser(url: &str) {
  #[cfg(target_os = "windows")]
  {
    let _ = std::process::Command::new("explorer").arg(url).spawn();
  }
  #[cfg(target_os = "macos")]
  {
    let _ = std::process::Command::new("open").arg(url).spawn();
  }
  #[cfg(target_os = "linux")]
  {
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
  }
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

#[allow(dead_code)]
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
    "mp3" | "m4a" | "mp4" | "flac" | "wav" | "ogg" | "opus" | "aac" | "webm" | "3gp" | "eac3" | "ec3" | "ac3" | "alac" | "aiff" | "aif"
  )
}

fn mime_for_ext(ext: &str) -> &'static str {
  match ext.to_lowercase().as_str() {
    "mp3" => "audio/mpeg",
    "m4a" | "mp4" | "aac" => "audio/mp4",
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

fn extract_account_from_menu_json(val: &Value) -> Option<(String, Option<String>, Option<String>)> {
  if let Some(actions) = val.get("actions").and_then(|v| v.as_array()) {
    for a in actions {
      if let Some(h) = a.pointer("/openPopupAction/popup/multiPageMenuRenderer/header/activeAccountHeaderRenderer") {
        let name = h.pointer("/accountName/runs/0/text")
          .or_else(|| h.pointer("/accountName/simpleText"))
          .and_then(|v| v.as_str())
          .filter(|n| !n.is_empty() && *n != "YouTube Account" && *n != "YouTube Music User")
          .map(|s| s.to_string());

        let handle = h.pointer("/channelHandle/runs/0/text")
          .or_else(|| h.pointer("/channelHandle/simpleText"))
          .and_then(|v| v.as_str())
          .map(|s| s.to_string());

        let avatar = h.pointer("/avatar/thumbnails")
          .and_then(|v| v.as_array())
          .and_then(|thumbs| thumbs.last())
          .and_then(|t| t.get("url"))
          .and_then(|u| u.as_str())
          .map(|s| s.to_string());

        if let Some(n) = name {
          return Some((n, handle, avatar));
        }
      }
    }
  }
  None
}

async fn query_youtube_account_menu(cookies: &str) -> Option<(String, Option<String>, Option<String>)> {
  // First attempt: YouTube Music endpoint (WEB_REMIX, client 67)
  if let Some(auth_hdr) = compute_youtube_authorization(cookies, "https://music.youtube.com") {
    let mut hm = HeaderMap::new();
    hm.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://music.youtube.com"));
    hm.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://music.youtube.com/"));
    hm.insert(HeaderName::from_static("x-origin"), HeaderValue::from_static("https://music.youtube.com"));
    hm.insert(HeaderName::from_static("x-youtube-client-name"), HeaderValue::from_static("67"));
    hm.insert(HeaderName::from_static("x-youtube-client-version"), HeaderValue::from_static("1.20250219.01.00"));
    hm.insert(
      reqwest::header::USER_AGENT,
      HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      ),
    );
    if let Ok(cval) = HeaderValue::from_str(cookies) {
      hm.insert(reqwest::header::COOKIE, cval);
    }
    if let Ok(aval) = HeaderValue::from_str(&auth_hdr) {
      hm.insert(reqwest::header::AUTHORIZATION, aval);
    }
    let body = json!({
      "context": {
        "client": {
          "clientName": "WEB_REMIX",
          "clientVersion": "1.20250219.01.00"
        }
      }
    });
    if let Ok(resp) = client()
      .post("https://music.youtube.com/youtubei/v1/account/account_menu?prettyPrint=false")
      .headers(hm)
      .json(&body)
      .send()
      .await
    {
      if resp.status().is_success() {
        if let Ok(val) = resp.json::<Value>().await {
          if let Some(res) = extract_account_from_menu_json(&val) {
            return Some(res);
          }
        }
      }
    }
  }

  // Second attempt: Main YouTube endpoint (WEB, client 1)
  if let Some(auth_hdr) = compute_youtube_authorization(cookies, "https://www.youtube.com") {
    let mut hm = HeaderMap::new();
    hm.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://www.youtube.com"));
    hm.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://www.youtube.com/"));
    hm.insert(HeaderName::from_static("x-origin"), HeaderValue::from_static("https://www.youtube.com"));
    hm.insert(HeaderName::from_static("x-youtube-client-name"), HeaderValue::from_static("1"));
    hm.insert(HeaderName::from_static("x-youtube-client-version"), HeaderValue::from_static("2.20250219.01.00"));
    hm.insert(
      reqwest::header::USER_AGENT,
      HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      ),
    );
    if let Ok(cval) = HeaderValue::from_str(cookies) {
      hm.insert(reqwest::header::COOKIE, cval);
    }
    if let Ok(aval) = HeaderValue::from_str(&auth_hdr) {
      hm.insert(reqwest::header::AUTHORIZATION, aval);
    }
    let body = json!({
      "context": {
        "client": {
          "clientName": "WEB",
          "clientVersion": "2.20250219.01.00"
        }
      }
    });
    if let Ok(resp) = client()
      .post("https://www.youtube.com/youtubei/v1/account/account_menu?prettyPrint=false")
      .headers(hm)
      .json(&body)
      .send()
      .await
    {
      if resp.status().is_success() {
        if let Ok(val) = resp.json::<Value>().await {
          if let Some(res) = extract_account_from_menu_json(&val) {
            return Some(res);
          }
        }
      }
    }
  }

  None
}

fn collect_account_items(val: &Value, out: &mut Vec<Value>) {
  match val {
    Value::Object(map) => {
      if let Some(item) = map.get("accountItem").and_then(|v| v.as_object()) {
        let name = item.get("accountName")
          .and_then(|n| n.pointer("/runs/0/text").or_else(|| n.get("simpleText")))
          .and_then(|s| s.as_str())
          .unwrap_or("");

        if !name.is_empty() {
          let handle = item.get("channelHandle")
            .or_else(|| item.get("accountByline"))
            .and_then(|h| h.pointer("/runs/0/text").or_else(|| h.get("simpleText")))
            .and_then(|s| s.as_str());

          let avatar = item.get("accountPhoto")
            .and_then(|p| p.get("thumbnails"))
            .and_then(|t| t.as_array())
            .and_then(|thumbs| thumbs.last())
            .and_then(|t| t.get("url"))
            .and_then(|u| u.as_str());

          let is_selected = item.get("isSelected").and_then(|v| v.as_bool()).unwrap_or(false);
          let page_id = item.get("pageId").and_then(|v| v.as_str());
          let auth_user = item.get("serviceEndpoint")
            .and_then(|s| s.pointer("/selectActiveIdentityEndpoint/supportedTokens/0/token"))
            .and_then(|t| t.as_str())
            .unwrap_or("0");

          let channel_id = if let Some(pid) = page_id {
            format!("{}:{}", auth_user, pid)
          } else {
            format!("{}:own", auth_user)
          };

          out.push(json!({
            "id": channel_id,
            "name": name,
            "handle": handle,
            "avatarUrl": avatar,
            "brand": page_id.is_some(),
            "pageId": page_id,
            "authUser": auth_user,
            "isSelected": is_selected
          }));
        }
      }
      for (_, v) in map {
        collect_account_items(v, out);
      }
    }
    Value::Array(arr) => {
      for v in arr {
        collect_account_items(v, out);
      }
    }
    _ => {}
  }
}

async fn query_youtube_accounts_list(cookies: &str) -> Vec<Value> {
  let yt_origin = "https://music.youtube.com";
  let mut channels = Vec::new();

  if let Some(auth_hdr) = compute_youtube_authorization(cookies, yt_origin) {
    let mut hm = HeaderMap::new();
    hm.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://music.youtube.com"));
    hm.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://music.youtube.com/"));
    hm.insert(HeaderName::from_static("x-origin"), HeaderValue::from_static("https://music.youtube.com"));
    hm.insert(HeaderName::from_static("x-youtube-client-name"), HeaderValue::from_static("67"));
    hm.insert(HeaderName::from_static("x-youtube-client-version"), HeaderValue::from_static("1.20250219.01.00"));
    hm.insert(
      reqwest::header::USER_AGENT,
      HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      ),
    );
    if let Ok(cval) = HeaderValue::from_str(cookies) {
      hm.insert(reqwest::header::COOKIE, cval);
    }
    if let Ok(aval) = HeaderValue::from_str(&auth_hdr) {
      hm.insert(reqwest::header::AUTHORIZATION, aval);
    }
    let body = json!({
      "context": {
        "client": {
          "clientName": "WEB_REMIX",
          "clientVersion": "1.20250219.01.00"
        }
      }
    });

    if let Ok(resp) = client()
      .post("https://music.youtube.com/youtubei/v1/account/accounts_list?prettyPrint=false")
      .headers(hm)
      .json(&body)
      .send()
      .await
    {
      if resp.status().is_success() {
        if let Ok(val) = resp.json::<Value>().await {
          collect_account_items(&val, &mut channels);
        }
      }
    }
  }

  channels
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
  #[serde(default)]
  auth: Option<bool>,
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

  let mut target_url = params.url.clone();
  let mut target_body = params.body;

  let is_like_endpoint = target_url.contains("/youtubei/v1/like/");
  let mut is_ytmusic = target_url.contains("music.youtube.com")
    || is_like_endpoint
    || target_url.contains("/playlist/create")
    || target_url.contains("/playlist/get_add_to_playlist")
    || target_url.contains("/browse/edit_playlist");

  if let Some(ref b) = target_body {
    if let Ok(mut val) = serde_json::from_str::<Value>(b) {
      if let Some(map) = val.as_object_mut() {
        if let Some(client_val) = map.get("client") {
          if client_val.as_str() == Some("YTMUSIC") || client_val.as_str() == Some("WEB_REMIX") {
            is_ytmusic = true;
          }
        }
        if let Some(context) = map.get("context").and_then(|c| c.as_object()) {
          if let Some(client) = context.get("client").and_then(|cl| cl.as_object()) {
            if let Some(name) = client.get("clientName").and_then(|n| n.as_str()) {
              if name == "WEB_REMIX" || name == "YTMUSIC" {
                is_ytmusic = true;
              }
            }
          }
        }

        map.remove("client");
        map.remove("isAudioOnly");

        if is_like_endpoint {
          if let Some(target_val) = map.get("target") {
            if let Some(id_str) = target_val.as_str() {
              let clean_id = id_str.trim_start_matches("VL");
              if clean_id.starts_with("PL") || clean_id.starts_with("RDCLAK") || clean_id.len() > 11 {
                map.insert("target".to_string(), json!({ "playlistId": clean_id }));
              } else {
                map.insert("target".to_string(), json!({ "videoId": clean_id }));
              }
            }
          }
        }

        if is_ytmusic {
          if let Some(context) = map.get_mut("context").and_then(|c| c.as_object_mut()) {
            if let Some(client) = context.get_mut("client").and_then(|cl| cl.as_object_mut()) {
              client.insert("clientName".to_string(), json!("WEB_REMIX"));
              if !client.contains_key("clientVersion") {
                client.insert("clientVersion".to_string(), json!("1.20250219.01.00"));
              }
            }
          }
        }
      }
      target_body = Some(val.to_string());
    }
  }

  if is_ytmusic && target_url.starts_with("https://www.youtube.com") {
    target_url = target_url.replacen("https://www.youtube.com", "https://music.youtube.com", 1);
  }

  let mut req = client().request(method, &target_url);
  let mut header_map = HeaderMap::new();

  let is_yt = is_youtube || target_url.contains("youtube.com") || target_url.contains("googlevideo.com");
  let is_apple = params.url.contains("amp-api.music.apple.com");
  let is_musixmatch = params.url.contains("musixmatch.com");
  let is_tidal = params.url.contains("tidal.com");
  let is_stats = params.url.contains("/api/stats/");

  let wants_auth = params.auth.unwrap_or(false)
    || (is_youtube
      && params.auth.is_none()
      && !params.url.contains("sw.js")
      && !params.url.contains("player")
      && !params.url.contains("iframe_api"));

  const IDENTITY_HEADERS: &[&str] = &[
    "authorization",
    "cookie",
    "x-goog-authuser",
    "x-goog-pageid",
    "x-origin",
    "origin",
    "referer",
  ];

  // 1. Pass through caller-provided headers, filtering out sensitive or duplicate headers
  if let Some(headers) = params.headers {
    for (k, v) in headers {
      let lower = k.to_lowercase();
      // Drop transport-level or conflict headers
      if lower == "host" || lower == "content-length" {
        continue;
      }
      // For YouTube requests, always drop origin/referer/x-origin and identity headers.
      // Origin/Referer/X-Origin will be set deterministically below without duplicates.
      // Identity headers will be injected from authenticated profile if wants_auth is true,
      // or omitted if wants_auth is false (preventing token leakage onto anonymous requests).
      if is_yt
        && (IDENTITY_HEADERS.contains(&lower.as_str())
          || lower == "origin"
          || lower == "referer"
          || lower == "x-origin")
      {
        continue;
      }
      if is_apple && (lower == "origin" || lower == "referer") {
        continue;
      }
      if is_tidal && (lower == "origin" || lower == "referer" || lower == "x-origin") {
        continue;
      }
      if (lower == "origin" || lower == "referer")
        && (v.contains("localhost") || v.contains("tauri:") || v.contains("127.0.0.1"))
      {
        continue;
      }
      if let (Ok(hname), Ok(hval)) = (HeaderName::try_from(k.as_str()), HeaderValue::try_from(v.as_str())) {
        header_map.insert(hname, hval);
      }
    }
  }

  // 2. Set default User-Agent if not explicitly specified
  if !header_map.contains_key(reqwest::header::USER_AGENT) {
    if is_tidal {
      header_map.insert(reqwest::header::USER_AGENT, HeaderValue::from_static(hires::USER_AGENT));
    } else {
      header_map.insert(
        reqwest::header::USER_AGENT,
        HeaderValue::from_static(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ),
      );
    }
  }

  // 3. Set Origin / Referer / X-Origin based on destination rules
  let is_no_origin_endpoint = target_url.contains("sw.js")
    || target_url.contains("/s/player/")
    || target_url.contains("iframe_api");

  let yt_origin = if is_stats || target_url.contains("music.youtube.com") || is_ytmusic {
    "https://music.youtube.com"
  } else {
    "https://www.youtube.com"
  };

  if is_yt && !is_no_origin_endpoint {
    if is_ytmusic || target_url.contains("music.youtube.com/youtubei/") {
      header_map.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://music.youtube.com"));
      header_map.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://music.youtube.com/"));
      header_map.insert(HeaderName::from_static("x-origin"), HeaderValue::from_static("https://music.youtube.com"));
      header_map.insert(HeaderName::from_static("x-youtube-client-name"), HeaderValue::from_static("67"));
      if !header_map.contains_key("x-youtube-client-version") {
        header_map.insert(HeaderName::from_static("x-youtube-client-version"), HeaderValue::from_static("1.20250219.01.00"));
      }
    } else if target_url.contains("youtube.com/youtubei/") {
      header_map.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://www.youtube.com"));
      header_map.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://www.youtube.com/"));
      header_map.insert(HeaderName::from_static("x-origin"), HeaderValue::from_static("https://www.youtube.com"));
    } else if target_url.contains("googlevideo.com") {
      if !target_url.contains("c=VISIONOS") {
        header_map.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://www.youtube.com"));
        header_map.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://www.youtube.com/"));
      }
    } else if is_stats {
      header_map.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://music.youtube.com"));
      header_map.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://music.youtube.com/"));
    }
  } else if is_apple {
    header_map.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://music.apple.com"));
    header_map.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://music.apple.com/"));
  } else if is_musixmatch {
    header_map.insert(reqwest::header::COOKIE, HeaderValue::from_static("mxm_bab=AB"));
  } else if is_tidal {
    header_map.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://listen.tidal.com"));
    header_map.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://listen.tidal.com/"));
  } else if target_url.contains("spotify.com") {
    if !header_map.contains_key("origin") {
      header_map.insert(HeaderName::from_static("origin"), HeaderValue::from_static("https://open.spotify.com"));
    }
    if !header_map.contains_key("referer") {
      header_map.insert(HeaderName::from_static("referer"), HeaderValue::from_static("https://open.spotify.com/"));
    }
    if !header_map.contains_key("app-platform") {
      header_map.insert(HeaderName::from_static("app-platform"), HeaderValue::from_static("WebPlayer"));
    }
  }

  // 4. Inject YouTube Auth when requested
  if is_yt && wants_auth {
    if let Some(auth) = load_yt_auth() {
      let connected = auth.get("connected").and_then(|v| v.as_bool()).unwrap_or(true);
      let signed_in = auth.get("signedIn").and_then(|v| v.as_bool()).unwrap_or(false);
      if connected && signed_in {
        if let Some(cookies) = auth.get("cookies").and_then(|v| v.as_str()) {
          if !cookies.is_empty() {
            if let Ok(val) = HeaderValue::from_str(cookies) {
              header_map.insert(reqwest::header::COOKIE, val);
            }
            if let Some(auth_header) = compute_youtube_authorization(cookies, yt_origin) {
              if let Ok(val) = HeaderValue::from_str(&auth_header) {
                header_map.insert(reqwest::header::AUTHORIZATION, val);
              }
            }
          }
        }
        if let Some(auth_user) = auth.get("active").and_then(|v| v.get("authUser")).and_then(|v| v.as_str()) {
          if let Ok(val) = HeaderValue::from_str(auth_user) {
            header_map.insert(HeaderName::from_static("x-goog-authuser"), val);
          }
        }
        if let Some(page_id) = auth.get("active").and_then(|v| v.get("pageId")).and_then(|v| v.as_str()) {
          if !page_id.is_empty() {
            if let Ok(val) = HeaderValue::from_str(page_id) {
              header_map.insert(HeaderName::from_static("x-goog-pageid"), val);
            }
          }
        }
      }
    }
  }

  // 5. Apply the HeaderMap onto the request builder
  req = req.headers(header_map);

  if let Some(body) = target_body {
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

  if status >= 400 {
    let preview_len = std::cmp::min(body_str.len(), 300);
    eprintln!(
      "[Rust Bridge] ⚠️ HTTP {} {} -> {} | Error snippet: {}",
      method_str,
      status,
      params.url,
      &body_str[..preview_len]
    );
  } else {
    println!("[Rust Bridge] HTTP {} {} -> {}", method_str, status, params.url);
  }

  Ok(FetchResult {
    status,
    headers: resp_headers,
    body: body_str,
    body_encoding,
    url: final_url,
  })
}

#[tauri::command]
async fn bridge_call(app: tauri::AppHandle, method: String, params: Value) -> Result<Value, String> {
  if method != "app.log" && method != "log" {
    println!("[Rust Bridge] IPC bridge_call: {}", method);
  }
  match method.as_str() {
    "app.log" | "log" => {
      let level = params.get("level").and_then(|v| v.as_str()).unwrap_or("INFO");
      let message = params.get("message").and_then(|v| v.as_str()).unwrap_or("");
      let about = params.get("about").and_then(|v| v.as_str());
      if let Some(ab) = about {
        println!("[Web Player {}][{}] {}", level.to_uppercase(), ab, message);
      } else {
        println!("[Web Player {}] {}", level.to_uppercase(), message);
      }
      Ok(json!({}))
    }
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
    "yt.authState" => {
      let mut auth = load_yt_auth().unwrap_or_else(|| json!({
        "browserSignedIn": false,
        "connected": false,
        "signedIn": false,
        "accounts": [],
        "active": null,
        "problem": null
      }));

      // Auto-heal: If session is valid but name was saved as generic, resolve it live from account_menu
      let active_name = auth.pointer("/active/name").and_then(|v| v.as_str()).unwrap_or("");
      if auth.get("browserSignedIn").and_then(|v| v.as_bool()).unwrap_or(false)
        && (active_name.is_empty() || active_name == "YouTube Account" || active_name == "YouTube Music User")
      {
        if let Some(cookies) = auth.get("cookies").and_then(|v| v.as_str()) {
          if let Some((real_name, real_handle, real_avatar)) = query_youtube_account_menu(cookies).await {
            println!("[BeatFlow Auth] ✨ Upgraded generic username to real name: \"{}\"", real_name);
            if let Some(map) = auth.as_object_mut() {
              if let Some(active) = map.get_mut("active").and_then(|v| v.as_object_mut()) {
                active.insert("name".to_string(), json!(real_name));
                if let Some(ref h) = real_handle {
                  active.insert("handle".to_string(), json!(h));
                }
                if let Some(ref a) = real_avatar {
                  active.insert("avatarUrl".to_string(), json!(a));
                }
              }
              if let Some(accounts) = map.get_mut("accounts").and_then(|v| v.as_array_mut()) {
                if let Some(acc) = accounts.first_mut().and_then(|v| v.as_object_mut()) {
                  acc.insert("name".to_string(), json!(real_name));
                  if let Some(ref a) = real_avatar {
                    acc.insert("avatarUrl".to_string(), json!(a));
                  }
                  if let Some(chans) = acc.get_mut("channels").and_then(|v| v.as_array_mut()) {
                    if let Some(chan) = chans.first_mut().and_then(|v| v.as_object_mut()) {
                      chan.insert("name".to_string(), json!(real_name));
                      if let Some(ref h) = real_handle {
                        chan.insert("handle".to_string(), json!(h));
                      }
                      if let Some(ref a) = real_avatar {
                        chan.insert("avatarUrl".to_string(), json!(a));
                      }
                    }
                  }
                }
              }
            }
            save_yt_auth(&auth);
          }
        }
      }

      // Also query channels list if accounts is empty or only has 1 channel
      let has_multiple = auth.pointer("/accounts/0/channels").and_then(|v| v.as_array()).map(|a| a.len() > 1).unwrap_or(false);
      if !has_multiple && auth.get("browserSignedIn").and_then(|v| v.as_bool()).unwrap_or(false) {
        if let Some(cookies) = auth.get("cookies").and_then(|v| v.as_str()) {
          let channels = query_youtube_accounts_list(cookies).await;
          if channels.len() > 1 {
            if let Some(map) = auth.as_object_mut() {
              if let Some(accounts) = map.get_mut("accounts").and_then(|v| v.as_array_mut()) {
                if let Some(acc) = accounts.first_mut().and_then(|v| v.as_object_mut()) {
                  acc.insert("channels".to_string(), json!(channels));
                }
              }
            }
            save_yt_auth(&auth);
          }
        }
      }

      Ok(auth)
    }
    "yt.setConnected" => {
      let connected = params.get("connected").and_then(|v| v.as_bool()).unwrap_or(true);
      if !connected {
        let path = get_yt_auth_path();
        if path.exists() {
          let _ = fs::remove_file(&path);
        }
        if let Some(main_win) = app.get_webview_window("main") {
          clear_webview2_cookies_by_filter(&main_win, &["youtube.com", "google.com"]);
        }
        if let Some(login_win) = app.get_webview_window("google-login") {
          clear_webview2_cookies_by_filter(&login_win, &["youtube.com", "google.com"]);
          let _ = login_win.close();
        }
        println!("[BeatFlow Auth] 🗑️ Disconnected and cleared Google/YouTube cookies from WebView2");
        return Ok(json!({
          "browserSignedIn": false,
          "connected": false,
          "signedIn": false,
          "accounts": [],
          "active": null,
          "problem": null
        }));
      }
      let mut auth = load_yt_auth().unwrap_or_else(|| json!({
        "browserSignedIn": false,
        "connected": false,
        "signedIn": false,
        "accounts": [],
        "active": null,
        "problem": null
      }));
      if let Some(map) = auth.as_object_mut() {
        map.insert("connected".to_string(), json!(connected));
        let signed_in = connected && map.get("active").map(|v| !v.is_null()).unwrap_or(false);
        map.insert("signedIn".to_string(), json!(signed_in));
      }
      save_yt_auth(&auth);
      Ok(auth)
    }
    "yt.signOut" | "yt.clearAuth" | "auth.clearAuth" => {
      let path = get_yt_auth_path();
      if path.exists() {
        let _ = fs::remove_file(&path);
      }
      if let Some(main_win) = app.get_webview_window("main") {
        clear_webview2_cookies_by_filter(&main_win, &["youtube.com", "google.com"]);
      }
      if let Some(login_win) = app.get_webview_window("google-login") {
        clear_webview2_cookies_by_filter(&login_win, &["youtube.com", "google.com"]);
        let _ = login_win.close();
      }
      println!("[BeatFlow Auth] 🗑️ User YouTube auth cleared");
      Ok(json!({
        "browserSignedIn": false,
        "connected": false,
        "signedIn": false,
        "accounts": [],
        "active": null,
        "problem": null
      }))
    }
    "yt.selectChannel" => {
      let channel_id = params.get("channelId").and_then(|v| v.as_str()).unwrap_or("");
      let mut auth = load_yt_auth().unwrap_or_else(|| json!({
        "browserSignedIn": true,
        "connected": true,
        "signedIn": true,
        "accounts": [],
        "active": null,
        "problem": null
      }));
      let mut found_channel: Option<Value> = None;
      if let Some(accounts) = auth.get("accounts").and_then(|v| v.as_array()) {
        for acc in accounts {
          if let Some(channels) = acc.get("channels").and_then(|v| v.as_array()) {
            for ch in channels {
              if ch.get("id").and_then(|v| v.as_str()) == Some(channel_id) {
                let mut active = ch.clone();
                if let Some(active_map) = active.as_object_mut() {
                  active_map.insert("authUser".to_string(), acc.get("authUser").cloned().unwrap_or(json!("0")));
                }
                found_channel = Some(active);
                break;
              }
            }
          }
          if found_channel.is_some() {
            break;
          }
        }
      }
      if let Some(active) = found_channel {
        if let Some(map) = auth.as_object_mut() {
          map.insert("active".to_string(), active);
          map.insert("signedIn".to_string(), json!(true));
          map.insert("connected".to_string(), json!(true));
          map.insert("browserSignedIn".to_string(), json!(true));
        }
      }
      save_yt_auth(&auth);
      Ok(auth)
    }
    "yt.saveProfile" | "yt.loginSuccess" => {
      let cookies = params.get("cookies").and_then(|v| v.as_str()).unwrap_or("");
      let email = params.get("email").and_then(|v| v.as_str());
      let name = params
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty() && *s != "YouTube Music User")
        .or_else(|| email.map(|e| e.split('@').next().unwrap_or(e)))
        .unwrap_or("YouTube Account");
      let avatar_url = params.get("avatarUrl").and_then(|v| v.as_str());
      let handle = params.get("handle").and_then(|v| v.as_str());
      let auth_user = params.get("authUser").and_then(|v| v.as_str()).unwrap_or("0");

      let channel_id = format!("{}:own", auth_user);
      let channel = json!({
        "id": channel_id,
        "name": name,
        "handle": handle,
        "avatarUrl": avatar_url,
        "brand": false,
        "authUser": auth_user
      });
      let account = json!({
        "authUser": auth_user,
        "name": name,
        "email": email,
        "avatarUrl": avatar_url,
        "channels": [channel.clone()]
      });

      let auth = json!({
        "browserSignedIn": true,
        "connected": true,
        "signedIn": true,
        "problem": null,
        "cookies": cookies,
        "accounts": [account],
        "active": channel
      });
      save_yt_auth(&auth);

      if let Some(login_win) = app.get_webview_window("google-login") {
        let _ = login_win.close();
      }

      Ok(auth)
    }
    "spotify.authState" => {
      let auth = load_spotify_auth().unwrap_or_else(|| json!({
        "browserSignedIn": false,
        "connected": false,
        "signedIn": false,
        "user": null,
        "problem": null
      }));
      Ok(auth)
    }
    "spotify.setConnected" => {
      let connected = params.get("connected").and_then(|v| v.as_bool()).unwrap_or(true);
      if !connected {
        let path = get_spotify_auth_path();
        if path.exists() {
          let _ = fs::remove_file(&path);
        }
        if let Some(main_win) = app.get_webview_window("main") {
          clear_webview2_cookies_by_filter(&main_win, &["spotify.com"]);
        }
        if let Some(login_win) = app.get_webview_window("spotify-login") {
          clear_webview2_cookies_by_filter(&login_win, &["spotify.com"]);
          let _ = login_win.close();
        }
        println!("[BeatFlow Spotify Auth] 🗑️ Disconnected and cleared Spotify cookies from WebView2");
        let auth = json!({
          "browserSignedIn": false,
          "connected": false,
          "signedIn": false,
          "user": null,
          "problem": null
        });
        if let Some(main_win) = app.get_webview_window("main") {
          let auth_str = serde_json::to_string(&auth).unwrap_or_default();
          let bridge_event = json!({
            "channel": "bitchord-bridge",
            "direction": "event",
            "payload": {
              "event": "spotify.authState",
              "data": auth
            }
          });
          let bridge_str = serde_json::to_string(&bridge_event).unwrap_or_default();
          let script = format!(
            "window.dispatchEvent(new CustomEvent('beatflow:spotify-auth-detected', {{ detail: {auth_str} }})); window.postMessage({bridge_str}, '*');"
          );
          let _ = main_win.eval(&script);
        }
        return Ok(auth);
      }
      let mut auth = load_spotify_auth().unwrap_or_else(|| json!({
        "browserSignedIn": false,
        "connected": false,
        "signedIn": false,
        "user": null,
        "problem": null
      }));
      if let Some(map) = auth.as_object_mut() {
        map.insert("connected".to_string(), json!(true));
        let signed_in = map.get("sp_dc").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
        map.insert("signedIn".to_string(), json!(signed_in));
      }
      save_spotify_auth(&auth);
      Ok(auth)
    }
    "spotify.signIn" | "auth.openSpotifyLoginWindow" => {
      let url_str = "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F&show_dialog=true";
      if let Ok(parsed_url) = url::Url::parse(url_str) {
        if let Some(existing) = app.get_webview_window("spotify-login") {
          let _ = existing.eval(&format!("window.location.href = '{}';", parsed_url));
          let _ = existing.show();
          let _ = existing.set_focus();
          let _ = existing.unminimize();
        } else {
          let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "spotify-login",
            tauri::WebviewUrl::External(parsed_url)
          )
          .title("Sign in to Spotify - BeatFlow")
          .inner_size(520.0, 720.0)
          .center()
          .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
          .build();
        }
      }
      Ok(json!({ "opened": true }))
    }
    "spotify.signOut" | "spotify.clearAuth" | "auth.clearSpotifyAuth" => {
      let path = get_spotify_auth_path();
      if path.exists() {
        let _ = fs::remove_file(&path);
      }
      if let Some(main_win) = app.get_webview_window("main") {
        clear_webview2_cookies_by_filter(&main_win, &["spotify.com"]);
      }
      if let Some(login_win) = app.get_webview_window("spotify-login") {
        clear_webview2_cookies_by_filter(&login_win, &["spotify.com"]);
        let _ = login_win.close();
      }
      println!("[BeatFlow Spotify Auth] 🗑️ Spotify auth cleared");
      let auth = json!({
        "browserSignedIn": false,
        "connected": false,
        "signedIn": false,
        "user": null,
        "problem": null
      });
      if let Some(main_win) = app.get_webview_window("main") {
        let auth_str = serde_json::to_string(&auth).unwrap_or_default();
        let bridge_event = json!({
          "channel": "bitchord-bridge",
          "direction": "event",
          "payload": {
            "event": "spotify.authState",
            "data": auth
          }
        });
        let bridge_str = serde_json::to_string(&bridge_event).unwrap_or_default();
        let script = format!(
          "window.dispatchEvent(new CustomEvent('beatflow:spotify-auth-detected', {{ detail: {auth_str} }})); window.postMessage({bridge_str}, '*');"
        );
        let _ = main_win.eval(&script);
      }
      Ok(auth)
    }
    "spotify.canvas" => Ok(json!({ "url": null })),
    "spotify.playlists" => Ok(json!({ "items": [], "total": 0, "offset": 0, "limit": 50, "raw": 0 })),
    "spotify.tracks" => Ok(json!({ "items": [], "total": 0, "offset": 0, "limit": 50, "raw": 0 })),
    "spotify.playlist" => Ok(json!({ "id": "", "name": "", "description": "", "images": [], "owner": { "name": "" }, "tracks": [], "total": 0 })),
    "spotify.searchTracks" => Ok(json!([])),
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
        "songsPath": get_songs_dir().to_string_lossy(),
        "lyricsPath": get_lyrics_dir().to_string_lossy(),
        "thumbnailsPath": get_thumbnails_dir().to_string_lossy(),
        "configPath": get_config_dir().to_string_lossy(),
        "cachePath": get_cache_dir().to_string_lossy(),
        "isDev": cfg!(debug_assertions),
        "folderName": if cfg!(debug_assertions) { "BeatFlow Dev" } else { "BeatFlow" }
      }))
    }
    "downloads.openFolder" => {
      let dir = get_music_dir();
      let target_folder = params.get("subfolder").and_then(|v| v.as_str()).unwrap_or("");
      let target_path = match target_folder {
        "songs" => get_songs_dir(),
        "lyrics" => get_lyrics_dir(),
        "thumbnails" => get_thumbnails_dir(),
        "config" => get_config_dir(),
        "cache" => get_cache_dir(),
        _ => dir,
      };
      open_in_file_manager(&target_path);
      Ok(json!({ "opened": true }))
    }
    "downloads.list" => {
      let songs_dir = get_songs_dir();
      let root_dir = get_music_dir();
      let thumbs_dir = get_thumbnails_dir();
      let lyrics_dir = get_lyrics_dir();

      // Auto-migrate any audio files from root_dir into songs_dir
      if let Ok(entries) = fs::read_dir(&root_dir) {
        for entry in entries.flatten() {
          let path = entry.path();
          if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext.eq_ignore_ascii_case("mpd") {
              let _ = fs::remove_file(&path);
              continue;
            }
            if is_audio_ext(ext) {
              if let Some(name) = path.file_name() {
                let dest = songs_dir.join(name);
                let _ = fs::rename(&path, &dest);
              }
            }
          }
        }
      }

      let mut items = Vec::new();
      if let Ok(entries) = fs::read_dir(&songs_dir) {
        for entry in entries.flatten() {
          let path = entry.path();
          if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext.eq_ignore_ascii_case("mpd") {
              let _ = fs::remove_file(&path);
              continue;
            }
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

              let thumb_file = format!("{}.jpg", stem);
              let thumbnail = if thumbs_dir.join(&thumb_file).exists() {
                Some(format!("beatflow://thumbnail/{}", thumb_file))
              } else {
                None
              };

              let has_lyrics = lyrics_dir.join(format!("{}.lrc", stem)).exists();

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
                "localUrl": local_url,
                "thumbnail": thumbnail,
                "hasLyrics": has_lyrics
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
      let thumbnail_url = params.get("thumbnailUrl").and_then(|v| v.as_str());
      let lyrics_text = params.get("lyrics").and_then(|v| v.as_str());

      let artist_clean = sanitize_stem(artist_raw);
      let title_clean = sanitize_stem(title_raw);
      let file_stem = if artist_clean.is_empty() || artist_clean == "Track" {
        title_clean
      } else {
        format!("{} - {}", artist_clean, title_clean)
      };

      let is_dash = audio_url.contains(".mpd") || ext_param.eq_ignore_ascii_case("mpd") || audio_url.contains("/manifest");
      let (bytes, effective_ext) = if is_dash {
        println!("[Rust Bridge] Detected DASH manifest stream for '{}' ({})", title_raw, audio_url);
        let xml_resp = client().get(audio_url).send().await.map_err(|e| format!("Failed to fetch DASH manifest: {e}"))?;
        let xml_text = xml_resp.text().await.map_err(|e| format!("Failed to read DASH manifest XML: {e}"))?;
        let plan = dash::DolbyPlan::parse(&xml_text, audio_url).map_err(|e| format!("Failed to parse DASH manifest: {e}"))?;

        let mut full_bytes = Vec::new();
        println!("[Rust Bridge] Downloading DASH init segment: {}", plan.init);
        let init_resp = client().get(&plan.init).send().await.map_err(|e| format!("Failed to fetch init segment: {e}"))?;
        let init_data = init_resp.bytes().await.map_err(|e| e.to_string())?;
        full_bytes.extend_from_slice(&init_data);

        println!("[Rust Bridge] Downloading {} DASH media segments...", plan.segments.len());
        for (i, seg) in plan.segments.iter().enumerate() {
          let seg_resp = client().get(seg).send().await.map_err(|e| format!("Failed to fetch segment #{}: {e}", i + 1))?;
          let seg_data = seg_resp.bytes().await.map_err(|e| e.to_string())?;
          full_bytes.extend_from_slice(&seg_data);
        }

        let dash_ext = if plan.codec.contains("flac") { "m4a" } else if plan.is_dolby_atmos { "m4a" } else { "m4a" };
        (full_bytes, dash_ext.to_string())
      } else {
        let resp = client().get(audio_url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
          return Err(format!("Download failed with HTTP {}", resp.status()));
        }
        let b = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
        let e = if ext_param.is_empty() || ext_param.eq_ignore_ascii_case("mpd") {
          "m4a".to_string()
        } else {
          ext_param.trim_start_matches('.').to_string()
        };
        (b, e)
      };

      let file_name = format!("{}.{}", file_stem, effective_ext);
      let songs_dir = get_songs_dir();
      let file_path = songs_dir.join(&file_name);

      println!("[Rust Bridge] Writing downloaded track '{}' ({} bytes) to {:?}", file_name, bytes.len(), file_path);
      fs::write(&file_path, &bytes).map_err(|e| e.to_string())?;

      // Download album art thumbnail if provided
      if let Some(t_url) = thumbnail_url && !t_url.is_empty() {
        let thumb_path = get_thumbnails_dir().join(format!("{}.jpg", file_stem));
        if let Ok(t_resp) = client().get(t_url).send().await
          && t_resp.status().is_success()
          && let Ok(t_bytes) = t_resp.bytes().await
        {
          let _ = fs::write(&thumb_path, &t_bytes);
        }
      }

      // Save lyrics (.lrc) if provided
      if let Some(l_text) = lyrics_text && !l_text.is_empty() {
        let lyrics_path = get_lyrics_dir().join(format!("{}.lrc", file_stem));
        let _ = fs::write(&lyrics_path, l_text);
      }

      // If an old .mpd file exists with the same stem, delete it
      let old_mpd = songs_dir.join(format!("{}.mpd", file_stem));
      if old_mpd.exists() {
        let _ = fs::remove_file(old_mpd);
      }
      let old_root_mpd = get_music_dir().join(format!("{}.mpd", file_stem));
      if old_root_mpd.exists() {
        let _ = fs::remove_file(old_root_mpd);
      }

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
      let file_path = get_songs_dir().join(file_name);
      let root_file_path = get_music_dir().join(file_name);
      let mut deleted = false;
      if file_path.exists() {
        let _ = fs::remove_file(&file_path);
        deleted = true;
      }
      if root_file_path.exists() {
        let _ = fs::remove_file(&root_file_path);
        deleted = true;
      }
      let stem = Path::new(file_name).file_stem().and_then(|s| s.to_str()).unwrap_or("");
      if !stem.is_empty() {
        let _ = fs::remove_file(get_thumbnails_dir().join(format!("{}.jpg", stem)));
        let _ = fs::remove_file(get_lyrics_dir().join(format!("{}.lrc", stem)));
      }
      Ok(json!({ "deleted": deleted, "fileName": file_name }))
    }
    "downloads.checkExists" => {
      let title_raw = params.get("title").and_then(|v| v.as_str()).unwrap_or("");
      let artist_raw = params.get("artist").and_then(|v| v.as_str()).unwrap_or("");
      let file_name_param = params.get("fileName").and_then(|v| v.as_str()).unwrap_or("");

      let songs_dir = get_songs_dir();
      let root_dir = get_music_dir();
      let mut found = false;
      let mut found_file = String::new();

      if !file_name_param.is_empty() && (songs_dir.join(file_name_param).exists() || root_dir.join(file_name_param).exists()) {
        found = true;
        found_file = file_name_param.to_string();
      } else {
        let artist_clean = sanitize_stem(artist_raw).to_lowercase();
        let title_clean = sanitize_stem(title_raw).to_lowercase();
        for dir in [&songs_dir, &root_dir] {
          if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
              let name = entry.file_name().to_string_lossy().to_lowercase();
              let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("").to_string();
              if is_audio_ext(&ext) {
                if !artist_clean.is_empty() && artist_clean != "track" {
                  if name.contains(&artist_clean) && name.contains(&title_clean) {
                    found = true;
                    found_file = entry.file_name().to_string_lossy().to_string();
                    break;
                  }
                } else if !title_clean.is_empty() && name.contains(&title_clean) {
                  found = true;
                  found_file = entry.file_name().to_string_lossy().to_string();
                  break;
                }
              }
            }
          }
          if found { break; }
        }
      }

      let local_url = if found {
        Some(format!("beatflow://local/{}", found_file))
      } else {
        None
      };

      Ok(json!({
        "exists": found,
        "fileName": if found { Some(found_file) } else { None },
        "localUrl": local_url
      }))
    }
    "shell.open" | "app.openUrl" => {
      let url = params.get("url").and_then(|v| v.as_str()).ok_or("Missing url")?;
      open_in_browser(url);
      Ok(json!({ "opened": true }))
    }
    "auth.openLoginWindow" => {
      let is_add = params.get("addAccount").and_then(|v| v.as_bool()).unwrap_or(false);
      let default_url = if is_add {
        "https://accounts.google.com/AddSession?service=youtube&prompt=select_account&continue=https%3A%2F%2Fmusic.youtube.com%2F"
      } else {
        "https://accounts.google.com/ServiceLogin?service=youtube&prompt=select_account&continue=https%3A%2F%2Fmusic.youtube.com%2F"
      };
      let url_str = params.get("url").and_then(|v| v.as_str()).unwrap_or(default_url);
      if let Ok(parsed_url) = url::Url::parse(url_str) {
        if let Some(existing) = app.get_webview_window("google-login") {
          let _ = existing.eval(&format!("window.location.href = '{}';", parsed_url));
          let _ = existing.show();
          let _ = existing.set_focus();
          let _ = existing.unminimize();
        } else {
          let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "google-login",
            tauri::WebviewUrl::External(parsed_url)
          )
          .title("Sign in with Google - BeatFlow")
          .inner_size(520.0, 720.0)
          .center()
          .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
          .build();
        }
      } else {
        open_in_browser(url_str);
      }
      Ok(json!({ "opened": true }))
    }
    "auth.startBrowserSignIn" => {
      let url_str = params.get("url").and_then(|v| v.as_str()).unwrap_or("https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F");
      let started = start_interactive_browser_sign_in(url_str);
      Ok(json!({ "started": started }))
    }
    "auth.saveSession" => {
      let raw_input = params.get("cookies")
        .or_else(|| params.get("session"))
        .or_else(|| params.get("data"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
      let outcome = handle_manual_session_import(raw_input).await?;
      Ok(outcome)
    }
    "addon.manifest" => {
      let base_url = params.get("baseUrl").and_then(|v| v.as_str()).ok_or("Missing baseUrl")?;
      let addon_client = hires::AddonClient::new(base_url).ok_or("Invalid addon baseUrl")?;
      let _manifest = addon_client.manifest(client()).await.map_err(|e| e.to_string())?;
      let manifest_url = format!("{}/manifest.json", addon_client.base);
      let json = hires::get_json(client(), &manifest_url).await.map_err(|e| e.to_string())?;
      Ok(json)
    }
    "addon.search" => {
      let base_url = params.get("baseUrl").and_then(|v| v.as_str()).ok_or("Missing baseUrl")?;
      let query = params.get("query").and_then(|v| v.as_str()).unwrap_or("");
      let atmos = params.get("atmos").and_then(|v| v.as_str()).map(|s| s != "off").unwrap_or(true);
      let addon_client = hires::AddonClient::new(base_url).ok_or("Invalid addon baseUrl")?;
      let manifest = addon_client.manifest(client()).await.map_err(|e| e.to_string())?;
      let candidates = addon_client.search(client(), &manifest, query, atmos).await.map_err(|e| e.to_string())?;
      Ok(json!(candidates))
    }
    "addon.stream" => {
      let base_url = params.get("baseUrl").and_then(|v| v.as_str()).ok_or("Missing baseUrl")?;
      let track_id = params.get("trackId").and_then(|v| v.as_str()).ok_or("Missing trackId")?;
      let atmos = params.get("atmos").and_then(|v| v.as_str()).map(|s| s != "off").unwrap_or(true);
      let addon_client = hires::AddonClient::new(base_url).ok_or("Invalid addon baseUrl")?;
      let manifest = addon_client.manifest(client()).await.map_err(|e| e.to_string())?;
      let candidate = hires::Candidate {
        id: track_id.to_string(),
        title: String::new(),
        artist: String::new(),
        duration: None,
        quality: manifest.quality.clone(),
        format: String::new(),
        atmos,
        stream_url: None,
      };
      let stream_info = addon_client.stream(client(), &manifest, &candidate, atmos).await.map_err(|e| e.to_string())?;
      let stream_info = stream_info.ok_or("Addon returned no playable stream")?;
      Ok(json!(stream_info))
    }
    "addons.loadConfig" => {
      let config_file = get_addons_config_path();
      if config_file.exists() {
        let content = fs::read_to_string(&config_file).map_err(|e| e.to_string())?;
        let parsed: Vec<InstalledAddon> = serde_json::from_str(&content).unwrap_or_default();
        engine().set_addons(parsed.clone()).await;
        Ok(json!(parsed))
      } else {
        Ok(json!([]))
      }
    }
    "addons.saveConfig" => {
      let config_file = get_addons_config_path();
      let addons_val = params.get("addons").cloned().unwrap_or(json!([]));
      let formatted = serde_json::to_string_pretty(&addons_val).map_err(|e| e.to_string())?;
      fs::write(&config_file, formatted).map_err(|e| e.to_string())?;
      if let Ok(addons) = serde_json::from_value::<Vec<InstalledAddon>>(addons_val) {
        engine().set_addons(addons).await;
      }
      Ok(json!({ "saved": true, "path": config_file.to_string_lossy() }))
    }
    "engine.setAddons" => {
      let addons_val = params.get("addons").cloned().unwrap_or(json!([]));
      let addons: Vec<InstalledAddon> = serde_json::from_value(addons_val).unwrap_or_default();
      engine().set_addons(addons.clone()).await;
      Ok(json!({ "count": addons.len() }))
    }
    "engine.getStreamInfo" => {
      let info = engine().get_stream_info().await;
      Ok(json!(info))
    }
    "engine.setPreferAtmos" => {
      let on = params.get("preferAtmos").and_then(|v| v.as_bool()).unwrap_or(true);
      engine().set_prefer_atmos(on).await;
      Ok(json!({ "preferAtmos": on }))
    }
    "engine.setAutoUpgrade" => {
      let on = params.get("autoUpgrade").and_then(|v| v.as_bool()).unwrap_or(true);
      engine().set_auto_upgrade(on).await;
      Ok(json!({ "autoUpgrade": on }))
    }
    "engine.loadTrack" => {
      let video_id = params.get("videoId").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let title = params.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let artist = params.get("artist").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let duration_sec = params.get("durationSec").and_then(|v| v.as_u64()).map(|d| d as u32);
      let thumbnail = params.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string());
      let album = params.get("album").and_then(|v| v.as_str()).map(|s| s.to_string());

      if let Some(on) = params.get("preferAtmos").and_then(|v| v.as_bool()) {
        engine().set_prefer_atmos(on).await;
      }
      if let Some(on) = params.get("autoUpgrade").and_then(|v| v.as_bool()) {
        engine().set_auto_upgrade(on).await;
      }

      println!("[BeatFlow Engine] >>> engine.loadTrack: videoId=\"{}\", title=\"{}\"", video_id, title);

      let track = TrackPayload {
        video_id: video_id.clone(),
        title,
        artist,
        duration_sec,
        thumbnail,
        album,
      };

      if video_id.starts_with("addon:") {
        println!("[BeatFlow Engine] 🔗 Resolving addon stream URI: {}", video_id);
        match engine().resolve_addon_stream(&video_id, None).await {
          Ok(stream) => {
            println!("[BeatFlow Engine] ✅ Addon Stream Loaded!");
            println!("[BeatFlow Engine]    Source: {}", stream.source);
            println!("[BeatFlow Engine]    Stream URL: {}", stream.url);
            println!("[BeatFlow Engine]    Codec: {} | Container: {:?}", stream.codec, stream.container);
            Ok(json!({
              "stream": stream,
              "isAddon": true
            }))
          }
          Err(e) => {
            println!("[BeatFlow Engine] ❌ resolve_addon_stream failed: {:#}", e);
            Err(e.to_string())
          }
        }
      } else {
        let upgrade = engine().check_auto_upgrade(track, None).await.unwrap_or(None);
        if let Some(ref u) = upgrade {
          println!("[BeatFlow Engine] 🚀 Auto-upgrade available: {} -> {}", u.source, u.url);
        }
        Ok(json!({
          "upgrade": upgrade,
          "isAddon": false
        }))
      }
    }
    "engine.upgradeQuality" => {
      let video_id = params.get("videoId").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let title = params.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let artist = params.get("artist").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let duration_sec = params.get("durationSec").and_then(|v| v.as_u64()).map(|d| d as u32);
      let thumbnail = params.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string());
      let album = params.get("album").and_then(|v| v.as_str()).map(|s| s.to_string());

      if let Some(on) = params.get("preferAtmos").and_then(|v| v.as_bool()) {
        engine().set_prefer_atmos(on).await;
      }
      if let Some(on) = params.get("autoUpgrade").and_then(|v| v.as_bool()) {
        engine().set_auto_upgrade(on).await;
      }

      println!("[BeatFlow Engine] >>> engine.upgradeQuality requested: \"{}\" - \"{}\" (videoId: {})", title, artist, video_id);

      let track = TrackPayload {
        video_id,
        title,
        artist,
        duration_sec,
        thumbnail,
        album,
      };

      let upgraded_stream = match engine().upgrade_quality(track, None).await {
        Ok(s) => s,
        Err(e) => {
          println!("[BeatFlow Engine] ❌ upgrade_quality error: {:#}", e);
          return Err(e.to_string());
        }
      };

      if let Some(ref s) = upgraded_stream {
        println!("[BeatFlow Engine] ✅ Stream upgrade successful!");
        println!("[BeatFlow Engine]    Source: {}", s.source);
        println!("[BeatFlow Engine]    Codec: {} ({:?})", s.codec, s.container);
        println!("[BeatFlow Engine]    Quality: {} (badge: {})", s.quality, s.badge);
        println!("[BeatFlow Engine]    Stream URL: {}", s.url);
      } else {
        println!("[BeatFlow Engine] ℹ️ No stream upgrade available for this track (keeping YouTube stream)");
      }

      Ok(json!({
        "upgraded": upgraded_stream.is_some(),
        "stream": upgraded_stream
      }))
    }
    "engine.revertToOriginal" => {
      let video_id = params.get("videoId").and_then(|v| v.as_str()).unwrap_or("");
      let original = engine().revert_to_original(video_id).await;
      Ok(json!({
        "reverted": original.is_some(),
        "original": original
      }))
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

static AUTH_SERVER_PORT: OnceLock<u16> = OnceLock::new();

async fn handle_auth_callback(payload_str: &str) -> Result<Value, String> {
  let data: Value = serde_json::from_str(payload_str).map_err(|e| e.to_string())?;

  // Attempt to extract full cookie jar from WebView2 on Windows to include HttpOnly session cookies
  let mut resolved_cookies = data.get("cookies").and_then(|v| v.as_str()).unwrap_or("").to_string();
  #[cfg(target_os = "windows")]
  {
    if let Some(app_handle) = APP_HANDLE.get() {
      if let Some(login_win) = app_handle.get_webview_window("google-login") {
        if let Some(c) = extract_webview2_cookies(&login_win) {
          if c.contains("SAPISID=") || c.contains("__Secure-3PAPISID=") || c.contains("__Secure-1PAPISID=") {
            resolved_cookies = c;
          }
        }
      }
      if !resolved_cookies.contains("SAPISID=") && !resolved_cookies.contains("__Secure-3PAPISID=") {
        if let Some(main_win) = app_handle.get_webview_window("main") {
          if let Some(c) = extract_webview2_cookies(&main_win) {
            if c.contains("SAPISID=") || c.contains("__Secure-3PAPISID=") {
              resolved_cookies = c;
            }
          }
        }
      }
    }
  }

  let has_sapisid = resolved_cookies.contains("SAPISID=")
    || resolved_cookies.contains("__Secure-3PAPISID=")
    || resolved_cookies.contains("__Secure-1PAPISID=");

  if !has_sapisid {
    println!("[BeatFlow Auth] ⚠️ Rejected auth payload: missing valid SAPISID cookie in resolved cookies");
    return Err("Missing SAPISID".into());
  }

  let mut resolved_name = data
    .get("name")
    .and_then(|v| v.as_str())
    .filter(|s| !s.is_empty() && *s != "YouTube Music User" && *s != "YouTube Account")
    .map(|s| s.to_string());
  let mut resolved_avatar = data.get("avatarUrl").and_then(|v| v.as_str()).map(|s| s.to_string());
  let mut resolved_handle = data.get("handle").and_then(|v| v.as_str()).map(|s| s.to_string());

  // If real name wasn't detected from the page DOM, query YouTube's account_menu directly using the authenticated session
  if resolved_name.is_none() {
    if let Some((n, hndl, av)) = query_youtube_account_menu(&resolved_cookies).await {
      resolved_name = Some(n);
      if resolved_handle.is_none() {
        resolved_handle = hndl;
      }
      if resolved_avatar.is_none() {
        resolved_avatar = av;
      }
    }
  }

  let email = data.get("email").and_then(|v| v.as_str());
  let name = resolved_name
    .or_else(|| email.map(|e| e.split('@').next().unwrap_or(e).to_string()))
    .or_else(|| resolved_handle.clone().map(|h| h.trim_start_matches('@').to_string()))
    .unwrap_or_else(|| "YouTube Account".to_string());
  let avatar_url = resolved_avatar.as_deref().or_else(|| data.get("avatarUrl").and_then(|v| v.as_str()));
  let handle = resolved_handle.as_deref().or_else(|| data.get("handle").and_then(|v| v.as_str()));
  let auth_user = data.get("authUser").and_then(|v| v.as_str()).unwrap_or("0");

  let channel_id = format!("{}:own", auth_user);
  let channel = json!({
    "id": channel_id,
    "name": name,
    "handle": handle,
    "avatarUrl": avatar_url,
    "brand": false,
    "authUser": auth_user
  });
  let mut all_channels = query_youtube_accounts_list(&resolved_cookies).await;
  let active_channel = if let Some(selected) = all_channels.iter().find(|c| c.get("isSelected") == Some(&json!(true))) {
    selected.clone()
  } else {
    channel.clone()
  };

  if all_channels.is_empty() {
    all_channels.push(channel.clone());
  }

  let account = json!({
    "authUser": auth_user,
    "name": name,
    "email": email,
    "avatarUrl": avatar_url,
    "channels": all_channels
  });

  let auth = json!({
    "browserSignedIn": true,
    "connected": true,
    "signedIn": true,
    "problem": null,
    "cookies": resolved_cookies,
    "accounts": [account],
    "active": active_channel
  });

  save_yt_auth(&auth);
  println!("[BeatFlow Auth] ✅ YouTube session saved for \"{}\" ({:?})", name, email);

  if let Some(app_handle) = APP_HANDLE.get() {
    if let Some(main_win) = app_handle.get_webview_window("main") {
      let auth_str = serde_json::to_string(&auth).unwrap_or_default();
      let bridge_event = json!({
        "channel": "bitchord-bridge",
        "direction": "event",
        "payload": {
          "event": "yt.authState",
          "data": auth
        }
      });
      let bridge_str = serde_json::to_string(&bridge_event).unwrap_or_default();
      let script = format!(
        "window.dispatchEvent(new CustomEvent('beatflow:yt-auth-detected', {{ detail: {auth_str} }})); window.postMessage({bridge_str}, '*');"
      );
      let _ = main_win.eval(&script);
    }
    if let Some(login_win) = app_handle.get_webview_window("google-login") {
      let _ = login_win.close();
    }
  }

  Ok(auth)
}

async fn fetch_spotify_profile(sp_dc: &str) -> Option<(String, Option<String>)> {
  let c = client();

  // 1. Get access token from open.spotify.com using sp_dc cookie
  let token_resp = c
    .get("https://open.spotify.com/get_access_token?reason=transport&productType=web_player")
    .header("Cookie", format!("sp_dc={}", sp_dc))
    .send()
    .await
    .ok()?;

  if !token_resp.status().is_success() {
    return None;
  }

  let token_json: Value = token_resp.json().await.ok()?;
  let access_token = token_json.get("accessToken").and_then(|v| v.as_str())?;
  let is_anon = token_json.get("isAnonymous").and_then(|v| v.as_bool()).unwrap_or(false);
  if is_anon {
    return None;
  }

  // 2. Fetch user profile from api.spotify.com/v1/me
  let me_resp = c
    .get("https://api.spotify.com/v1/me")
    .header("Authorization", format!("Bearer {}", access_token))
    .send()
    .await
    .ok()?;

  if !me_resp.status().is_success() {
    return None;
  }

  let me_json: Value = me_resp.json().await.ok()?;
  let name = me_json
    .get("display_name")
    .and_then(|v| v.as_str())
    .or_else(|| me_json.get("id").and_then(|v| v.as_str()))
    .map(|s| s.to_string())?;

  let avatar = me_json
    .get("images")
    .and_then(|v| v.as_array())
    .and_then(|arr| arr.first())
    .and_then(|img| img.get("url"))
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());

  Some((name, avatar))
}

async fn handle_spotify_auth_callback(payload_str: &str) -> Result<Value, String> {
  let data: Value = serde_json::from_str(payload_str).map_err(|e| e.to_string())?;
  let mut sp_dc = data.get("sp_dc").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let mut resolved_cookies = data.get("cookies").and_then(|v| v.as_str()).unwrap_or("").to_string();

  #[cfg(target_os = "windows")]
  {
    if let Some(app_handle) = APP_HANDLE.get() {
      if let Some(login_win) = app_handle.get_webview_window("spotify-login") {
        if let Some(c) = extract_webview2_cookies_for_url(&login_win, "https://open.spotify.com") {
          if let Some(pos) = c.find("sp_dc=") {
            let rest = &c[pos + 6..];
            let extracted = rest.split(';').next().unwrap_or("").trim().to_string();
            if !extracted.is_empty() {
              sp_dc = extracted;
            }
            resolved_cookies = c;
          }
        }
      }
    }
  }

  if sp_dc.is_empty() {
    println!("[BeatFlow Spotify Auth] ⚠️ Rejected: missing sp_dc cookie");
    return Err("Missing sp_dc".into());
  }

  let mut resolved_name = data
    .get("name")
    .and_then(|v| v.as_str())
    .filter(|s| !s.is_empty() && *s != "Spotify User" && *s != "Spotify Account")
    .map(|s| s.to_string());
  let mut resolved_avatar = data.get("avatarUrl").and_then(|v| v.as_str()).map(|s| s.to_string());

  if resolved_name.is_none() {
    if let Some((prof_name, prof_avatar)) = fetch_spotify_profile(&sp_dc).await {
      resolved_name = Some(prof_name);
      if resolved_avatar.is_none() {
        resolved_avatar = prof_avatar;
      }
    }
  }

  let name = resolved_name.unwrap_or_else(|| "Spotify User".to_string());
  let avatar_url = resolved_avatar.as_deref();

  let auth = json!({
    "browserSignedIn": true,
    "connected": true,
    "signedIn": true,
    "sp_dc": sp_dc,
    "cookies": resolved_cookies,
    "user": {
      "name": name,
      "avatarUrl": avatar_url
    },
    "problem": null
  });

  save_spotify_auth(&auth);
  println!("[BeatFlow Spotify Auth] ✅ Spotify session saved for \"{}\"", name);

  if let Some(app_handle) = APP_HANDLE.get() {
    if let Some(main_win) = app_handle.get_webview_window("main") {
      let auth_str = serde_json::to_string(&auth).unwrap_or_default();
      let bridge_event = json!({
        "channel": "bitchord-bridge",
        "direction": "event",
        "payload": {
          "event": "spotify.authState",
          "data": auth
        }
      });
      let bridge_str = serde_json::to_string(&bridge_event).unwrap_or_default();
      let script = format!(
        "window.dispatchEvent(new CustomEvent('beatflow:spotify-auth-detected', {{ detail: {auth_str} }})); window.postMessage({bridge_str}, '*');"
      );
      let _ = main_win.eval(&script);
    }
    if let Some(login_win) = app_handle.get_webview_window("spotify-login") {
      let _ = login_win.close();
    }
  }

  Ok(auth)
}

fn start_local_ipc_server(app_handle: tauri::AppHandle) {
  let std_listener = match std::net::TcpListener::bind("127.0.0.1:51189") {
    Ok(l) => l,
    Err(_) => match std::net::TcpListener::bind("127.0.0.1:0") {
      Ok(l) => l,
      Err(e) => {
        eprintln!("[BeatFlow IPC] Failed to bind local server: {}", e);
        return;
      }
    },
  };

  let local_addr = match std_listener.local_addr() {
    Ok(a) => a,
    Err(e) => {
      eprintln!("[BeatFlow IPC] Failed to get local_addr: {}", e);
      return;
    }
  };
  let port = local_addr.port();
  AUTH_SERVER_PORT.set(port).ok();
  println!("[BeatFlow IPC] Local loopback server listening on http://127.0.0.1:{}", port);

  let _ = std_listener.set_nonblocking(true);
  tauri::async_runtime::spawn(async move {
    let listener = match tokio::net::TcpListener::from_std(std_listener) {
      Ok(l) => l,
      Err(e) => {
        eprintln!("[BeatFlow IPC] tokio TcpListener error: {}", e);
        return;
      }
    };

    loop {
      if let Ok((mut socket, _)) = listener.accept().await {
        let app = app_handle.clone();
        tokio::spawn(async move {
          use tokio::io::{AsyncReadExt, AsyncWriteExt};
          let mut buf = vec![0u8; 65536];
          let n = match socket.read(&mut buf).await {
            Ok(n) if n > 0 => n,
            _ => return,
          };
          let req_text = String::from_utf8_lossy(&buf[..n]);

          // Handle CORS OPTIONS
          if req_text.starts_with("OPTIONS ") {
            let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\n\r\n";
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
          }

          // Handle POST /forward-arg (single instance forwarding)
          if req_text.contains("/forward-arg") {
            let body = if let Some(pos) = req_text.find("\r\n\r\n") {
              req_text[pos + 4..].trim().to_string()
            } else {
              String::new()
            };
            if let Some(main_win) = app.get_webview_window("main") {
              let _ = main_win.unminimize();
              let _ = main_win.show();
              let _ = main_win.set_focus();
              if !body.is_empty() && body.starts_with("beatflow://") {
                if let Ok(json) = serde_json::to_string(&body) {
                  let script = format!(
                    "window.__BEATFLOW_INITIAL_DEEPLINK__ = {json}; window.dispatchEvent(new CustomEvent('beatflow:deeplink', {{ detail: {json} }}));"
                  );
                  let _ = main_win.eval(&script);
                }
              }
            }
            let resp = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}";
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
          }

          // Handle POST /auth-callback-spotify or GET /auth-callback-spotify?data=...
          if req_text.contains("/auth-callback-spotify") {
            let mut payload = String::new();
            if req_text.starts_with("POST ") {
              if let Some(pos) = req_text.find("\r\n\r\n") {
                payload = req_text[pos + 4..].trim().to_string();
              }
            } else if req_text.starts_with("GET ") {
              if let Some(pos) = req_text.find("data=") {
                let rest = &req_text[pos + 5..];
                let enc = rest.split_whitespace().next().unwrap_or(rest);
                let clean = enc.split('&').next().unwrap_or(enc);
                payload = url_decode(clean);
              }
            }

            if !payload.is_empty() {
              let _ = handle_spotify_auth_callback(&payload).await;
            }

            let resp = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}";
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
          }

          // Handle POST /auth-callback or GET /auth-callback?data=...
          if req_text.contains("/auth-callback") {
            let mut payload = String::new();
            if req_text.starts_with("POST ") {
              if let Some(pos) = req_text.find("\r\n\r\n") {
                payload = req_text[pos + 4..].trim().to_string();
              }
            } else if req_text.starts_with("GET ") {
              if let Some(pos) = req_text.find("data=") {
                let rest = &req_text[pos + 5..];
                let enc = rest.split_whitespace().next().unwrap_or(rest);
                let clean = enc.split('&').next().unwrap_or(enc);
                payload = url_decode(clean);
              }
            }

            if !payload.is_empty() {
              let _ = handle_auth_callback(&payload).await;
            }

            let resp = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}";
            let _ = socket.write_all(resp.as_bytes()).await;
            return;
          }

          let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
          let _ = socket.write_all(resp.as_bytes()).await;
        });
      }
    }
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut initial_arg = String::new();
  for arg in std::env::args().skip(1) {
    if arg.starts_with("beatflow://") {
      initial_arg = arg;
      break;
    }
  }

  // Single-instance check: if primary instance is running on 51189, forward argument and exit immediately!
  if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:51189") {
    use std::io::Write;
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_millis(800)));
    let body = initial_arg.as_bytes();
    let req = format!(
      "POST /forward-arg HTTP/1.1\r\nHost: 127.0.0.1:51189\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      initial_arg
    );
    let _ = stream.write_all(req.as_bytes());
    println!("[BeatFlow IPC] Another instance is already running. Forwarded argument to main instance and exiting.");
    std::process::exit(0);
  }

  if !initial_arg.is_empty() && !initial_arg.contains("auth-callback") {
    set_deep_link(initial_arg);
  }

  tauri::Builder::default()
    .register_asynchronous_uri_scheme_protocol("beatflow", |_ctx, req, responder| {
      let uri = req.uri().to_string();
      let method = req.method().to_string();
      let range_header = req.headers().get("range").and_then(|v| v.to_str().ok()).map(|s| s.to_string());

      tauri::async_runtime::spawn(async move {
        if method == "OPTIONS" {
          let resp = tauri::http::Response::builder()
            .status(204)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "*")
            .body(Vec::new())
            .unwrap();
          responder.respond(resp);
          return;
        }

        // Handle beatflow://auth-callback?data=<encoded_json>
        if uri.contains("auth-callback") {
          println!("[Rust Bridge] Intercepted auth-callback URL: {}", uri);
          if let Some(q_idx) = uri.find("data=") {
            let encoded_data = &uri[q_idx + 5..];
            let clean_encoded = encoded_data.split('&').next().unwrap_or(encoded_data);
            let decoded_json = url_decode(clean_encoded);
            let _ = handle_auth_callback(&decoded_json).await;
          }
          let resp = tauri::http::Response::builder()
            .status(200)
            .header("Access-Control-Allow-Origin", "*")
            .header("Content-Type", "text/html")
            .body(b"<html><body><h1>Signed In!</h1><script>window.close();</script></body></html>".to_vec())
            .unwrap();
          responder.respond(resp);
          return;
        }

        // Handle beatflow://stream?url=<target> or beatflow://stream/?url=<target> or beatflow://localhost/stream?url=<target>
        let is_stream = uri.contains("stream") && uri.contains("url=");
        if is_stream {
          let mut target_url = String::new();
          if let Some(idx) = uri.find("url=") {
            let raw_val = &uri[idx + 4..];
            let val = if let Some(amp_idx) = raw_val.find('&') {
              &raw_val[..amp_idx]
            } else {
              raw_val
            };
            target_url = url_decode(val);
            if target_url.starts_with("http%3A") || target_url.starts_with("https%3A") {
              target_url = url_decode(&target_url);
            }
          }

          if !target_url.is_empty() {
            let is_head = method == "HEAD";
            let req_builder = if is_head {
              client().head(&target_url)
            } else {
              client().get(&target_url)
            };

            let mut request_builder = req_builder
              .header("User-Agent", hires::USER_AGENT)
              .header("Accept", "*/*")
              .header("Accept-Encoding", "identity");

            if target_url.contains("tidal.com") {
              request_builder = request_builder
                .header("Origin", "https://listen.tidal.com")
                .header("Referer", "https://listen.tidal.com/");
            }

            if let Some(ref range) = range_header {
              request_builder = request_builder.header("Range", range);
            }

            match request_builder.send().await {
              Ok(upstream_resp) => {
                let status = upstream_resp.status().as_u16();
                let ct = upstream_resp.headers().get("content-type").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
                let cr = upstream_resp.headers().get("content-range").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
                let cl = upstream_resp.headers().get("content-length").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
                let bytes = if is_head {
                  Vec::new()
                } else {
                  upstream_resp.bytes().await.unwrap_or_default().to_vec()
                };

                let effective_mime = if let Some(ref content_type) = ct {
                  if content_type.is_empty()
                    || content_type.contains("octet-stream")
                    || content_type.contains("text/plain")
                    || content_type.contains("text/html")
                  {
                    let clean_path = target_url.split('?').next().unwrap_or("").split('#').next().unwrap_or("");
                    let ext = clean_path.rsplit('.').next().unwrap_or("");
                    if is_audio_ext(ext) {
                      mime_for_ext(ext).to_string()
                    } else if target_url.contains(".mpd") {
                      "application/dash+xml".to_string()
                    } else if target_url.contains(".m3u8") {
                      "application/vnd.apple.mpegurl".to_string()
                    } else {
                      "audio/flac".to_string()
                    }
                  } else {
                    content_type.clone()
                  }
                } else {
                  let clean_path = target_url.split('?').next().unwrap_or("").split('#').next().unwrap_or("");
                  let ext = clean_path.rsplit('.').next().unwrap_or("");
                  if is_audio_ext(ext) {
                    mime_for_ext(ext).to_string()
                  } else if target_url.contains(".mpd") {
                    "application/dash+xml".to_string()
                  } else {
                    "audio/flac".to_string()
                  }
                };

                // If client requested a byte range but upstream returned 200 OK (did not slice), slice manually
                if !is_head {
                  if let Some(ref range) = range_header {
                    if status == 200 && range.starts_with("bytes=") {
                      let range_part = range.trim_start_matches("bytes=").trim();
                      let parts: Vec<&str> = range_part.split('-').collect();
                      let file_size = bytes.len() as u64;
                      let start: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                      let end: u64 = parts
                        .get(1)
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(file_size.saturating_sub(1));
                      let end = end.min(file_size.saturating_sub(1));

                      if start <= end && start < file_size {
                        let chunk_len = (end - start + 1) as usize;
                        let sliced = bytes[start as usize..start as usize + chunk_len].to_vec();
                        let resp = tauri::http::Response::builder()
                          .status(206)
                          .header("Access-Control-Allow-Origin", "*")
                          .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                          .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
                          .header("Accept-Ranges", "bytes")
                          .header("Content-Type", effective_mime)
                          .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size))
                          .header("Content-Length", chunk_len.to_string())
                          .body(sliced)
                          .unwrap();
                        responder.respond(resp);
                        return;
                      }
                    }
                  }
                }

                let content_len = if is_head {
                  cl.unwrap_or_else(|| bytes.len().to_string())
                } else {
                  bytes.len().to_string()
                };

                let mut resp_builder = tauri::http::Response::builder()
                  .status(status)
                  .header("Access-Control-Allow-Origin", "*")
                  .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                  .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
                  .header("Accept-Ranges", "bytes")
                  .header("Content-Type", effective_mime)
                  .header("Content-Length", content_len);

                if let Some(content_range) = cr {
                  resp_builder = resp_builder.header("Content-Range", content_range);
                }

                responder.respond(resp_builder.body(bytes).unwrap());
                return;
              }
              Err(err) => {
                log::warn!("Stream proxy request failed for {}: {}", target_url, err);
                let resp = tauri::http::Response::builder()
                  .status(502)
                  .header("Access-Control-Allow-Origin", "*")
                  .header("Content-Type", "text/plain")
                  .body(format!("Proxy error: {err}").into_bytes())
                  .unwrap();
                responder.respond(resp);
                return;
              }
            }
          }
        }

        // Handle beatflow://local/<filename> or beatflow://localhost/local/<filename>
        let is_local = uri.contains("local/") || uri.starts_with("beatflow://local");
        if is_local {
          let raw_file = if let Some(idx) = uri.find("local/") {
            &uri[idx + 6..]
          } else {
            uri.trim_start_matches("beatflow://local/")
          };
          let clean_file = raw_file.split(['?', '#']).next().unwrap_or(raw_file);
          let file_name = url_decode(clean_file);
          let songs_dir = get_songs_dir();
          let target_file = if songs_dir.join(&file_name).exists() {
            songs_dir.join(&file_name)
          } else {
            get_music_dir().join(&file_name)
          };

          if target_file.exists() && target_file.is_file() {
            if let Ok(mut f) = fs::File::open(&target_file) {
              let file_size = f.metadata().map(|m| m.len()).unwrap_or(0);
              let ext = target_file.extension().and_then(|e| e.to_str()).unwrap_or("");
              let mime = mime_for_ext(ext);

              if let Some(ref range_str) = range_header {
                if let Some(range_part) = range_str.strip_prefix("bytes=") {
                  let parts: Vec<&str> = range_part.split('-').collect();
                  let start: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
                  let requested_end: Option<u64> = parts.get(1).and_then(|s| s.parse().ok());
                  // 2MB chunking for fast audio start without buffer spikes
                  let max_chunk: u64 = 2 * 1024 * 1024;
                  let end = requested_end.unwrap_or(start + max_chunk - 1).min(file_size.saturating_sub(1));

                  if start <= end && start < file_size {
                    let chunk_len = end - start + 1;
                    let mut buffer = vec![0u8; chunk_len as usize];
                    if f.seek(SeekFrom::Start(start)).is_ok() && f.read_exact(&mut buffer).is_ok() {
                      let resp = tauri::http::Response::builder()
                        .status(206)
                        .header("Content-Type", mime)
                        .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size))
                        .header("Content-Length", chunk_len.to_string())
                        .header("Accept-Ranges", "bytes")
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                        .body(buffer)
                        .unwrap();
                      responder.respond(resp);
                      return;
                    }
                  }
                }
              }

              let mut buffer = Vec::new();
              if f.read_to_end(&mut buffer).is_ok() {
                let resp = tauri::http::Response::builder()
                  .status(200)
                  .header("Content-Type", mime)
                  .header("Content-Length", buffer.len().to_string())
                  .header("Accept-Ranges", "bytes")
                  .header("Access-Control-Allow-Origin", "*")
                  .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                  .body(buffer)
                  .unwrap();
                responder.respond(resp);
                return;
              }
            }
          }

          let resp = tauri::http::Response::builder()
            .status(404)
            .header("Access-Control-Allow-Origin", "*")
            .header("Content-Type", "text/plain")
            .body("File not found in BeatFlow music folder".as_bytes().to_vec())
            .unwrap();
          responder.respond(resp);
          return;
        }

        // Handle beatflow://thumbnail/<filename>
        let is_thumbnail = uri.contains("thumbnail/") || uri.starts_with("beatflow://thumbnail");
        if is_thumbnail {
          let raw_file = if let Some(idx) = uri.find("thumbnail/") {
            &uri[idx + 10..]
          } else {
            uri.trim_start_matches("beatflow://thumbnail/")
          };
          let clean_file = raw_file.split(['?', '#']).next().unwrap_or(raw_file);
          let file_name = url_decode(clean_file);
          let target_file = get_thumbnails_dir().join(&file_name);
          if target_file.exists() && target_file.is_file() {
            if let Ok(bytes) = fs::read(&target_file) {
              let resp = tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "image/jpeg")
                .header("Content-Length", bytes.len().to_string())
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
                .unwrap();
              responder.respond(resp);
              return;
            }
          }
        }

        // Handle beatflow://lyrics/<filename>
        let is_lyrics = uri.contains("lyrics/") || uri.starts_with("beatflow://lyrics");
        if is_lyrics {
          let raw_file = if let Some(idx) = uri.find("lyrics/") {
            &uri[idx + 7..]
          } else {
            uri.trim_start_matches("beatflow://lyrics/")
          };
          let clean_file = raw_file.split(['?', '#']).next().unwrap_or(raw_file);
          let file_name = url_decode(clean_file);
          let target_file = get_lyrics_dir().join(&file_name);
          if target_file.exists() && target_file.is_file() {
            if let Ok(bytes) = fs::read(&target_file) {
              let resp = tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "text/plain; charset=utf-8")
                .header("Content-Length", bytes.len().to_string())
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
                .unwrap();
              responder.respond(resp);
              return;
            }
          }
        }

        let json = json!({
          "status": "ok",
          "uri": uri,
          "scheme": "beatflow"
        });
        let body = serde_json::to_vec(&json).unwrap_or_default();
        let resp = tauri::http::Response::builder()
          .status(200)
          .header("Access-Control-Allow-Origin", "*")
          .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
          .header("Content-Type", "application/json")
          .body(body)
          .unwrap();
        responder.respond(resp);
      });
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
    .on_page_load(|window, payload| {
      let _ = window.eval(DESKTOP_BRIDGE_INIT);
      if window.label() == "google-login" {
        let url_obj = payload.url();
        let host = url_obj.host_str().unwrap_or("");
        let path = url_obj.path();
        // Do not capture or auto-close while on accounts.google.com or channel switcher
        if host == "music.youtube.com"
          && !path.contains("/channel_switcher")
          && !path.contains("/signin")
          && !path.contains("/select_account")
        {
          let app_handle = window.app_handle().clone();
          tauri::async_runtime::spawn(async move {
            for _ in 0..60 {
              tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
              #[cfg(target_os = "windows")]
              if let Some(login_win) = app_handle.get_webview_window("google-login") {
                if let Some(c) = extract_webview2_cookies(&login_win) {
                  if c.contains("SAPISID=") || c.contains("__Secure-3PAPISID=") || c.contains("__Secure-1PAPISID=") {
                    println!("[BeatFlow Google Auth] 🔑 Detected valid SAPISID in google-login WebView2!");
                    let payload = json!({
                      "cookies": c,
                      "authUser": "0"
                    });
                    let _ = handle_auth_callback(&payload.to_string()).await;
                    break;
                  }
                }
              } else {
                break;
              }
            }
          });
        }
      }
      if window.label() == "spotify-login" {
        let app_handle = window.app_handle().clone();
        tauri::async_runtime::spawn(async move {
          for _ in 0..120 {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            #[cfg(target_os = "windows")]
            if let Some(login_win) = app_handle.get_webview_window("spotify-login") {
              if let Some(c) = extract_webview2_cookies_for_url(&login_win, "https://open.spotify.com") {
                if let Some(pos) = c.find("sp_dc=") {
                  let rest = &c[pos + 6..];
                  let sp_dc_val = rest.split(';').next().unwrap_or("").trim().to_string();
                  if !sp_dc_val.is_empty() {
                    println!("[BeatFlow Spotify Auth] 🔑 Detected sp_dc cookie from WebView2!");
                    let payload = json!({
                      "sp_dc": sp_dc_val,
                      "name": "Spotify Account",
                      "avatarUrl": null,
                      "cookies": c
                    });
                    let _ = handle_spotify_auth_callback(&payload.to_string()).await;
                    break;
                  }
                }
              }
            } else {
              break;
            }
          }
        });
      }
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
      APP_HANDLE.set(app.handle().clone()).ok();
      start_local_ipc_server(app.handle().clone());
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

#[cfg(test)]
mod http_tests {
  use super::*;

  #[tokio::test]
  async fn test_youtubei_browse_does_not_return_400() {
    let mut headers = HashMap::new();
    headers.insert("Content-Type".to_string(), "application/json".to_string());
    headers.insert("x-youtube-client-name".to_string(), "67".to_string());
    headers.insert("x-youtube-client-version".to_string(), "1.20250219.01.00".to_string());

    let body = serde_json::to_string(&serde_json::json!({
      "browseId": "FEmusic_home",
      "context": {
        "client": {
          "clientName": "WEB_REMIX",
          "clientVersion": "1.20250219.01.00"
        }
      }
    }))
    .unwrap();

    let params = FetchParams {
      url: "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&alt=json".to_string(),
      method: Some("POST".to_string()),
      headers: Some(headers),
      body: Some(body),
      body_encoding: Some("text".to_string()),
      auth: Some(false),
    };

    let result = execute_http_request(params, true).await.expect("Request should succeed");
    assert_eq!(result.status, 200, "Browse endpoint returned status {}", result.status);
    assert!(result.body.contains("responseContext"), "Response body should contain responseContext");
  }

  #[tokio::test]
  async fn test_youtubei_browse_authenticated_if_auth_present() {
    if load_yt_auth().is_none() {
      return;
    }

    let mut headers = HashMap::new();
    headers.insert("Content-Type".to_string(), "application/json".to_string());
    headers.insert("x-youtube-client-name".to_string(), "67".to_string());
    headers.insert("x-youtube-client-version".to_string(), "1.20250219.01.00".to_string());

    let body = serde_json::to_string(&serde_json::json!({
      "browseId": "FEmusic_home",
      "context": {
        "client": {
          "clientName": "WEB_REMIX",
          "clientVersion": "1.20250219.01.00"
        }
      }
    }))
    .unwrap();

    let params = FetchParams {
      url: "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&alt=json".to_string(),
      method: Some("POST".to_string()),
      headers: Some(headers),
      body: Some(body),
      body_encoding: Some("text".to_string()),
      auth: Some(true),
    };

    let result = execute_http_request(params, true).await.expect("Request should succeed");
    assert_eq!(result.status, 200, "Authenticated browse endpoint returned status {}", result.status);
    assert!(result.body.contains("responseContext"), "Response body should contain responseContext");
  }
}
