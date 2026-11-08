use base64::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

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
  for (k, v) in resp.headers().iter() {
    if let Ok(val) = v.to_str() {
      resp_headers.insert(k.as_str().to_string(), val.to_string());
    }
  }

  let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
  let (body_str, body_encoding) = match String::from_utf8(bytes.to_vec()) {
    Ok(s) => (s, "text".to_string()),
    Err(_) => (BASE64_STANDARD.encode(&bytes), "base64".to_string()),
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
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![bridge_call])
    .on_page_load(|window, _payload| {
      let _ = window.eval(DESKTOP_BRIDGE_INIT);
    })
    .setup(|app| {
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
