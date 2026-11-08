const DESKTOP_BRIDGE_INIT: &str = r#"
(function() {
  if (window.__BEATFLOW_DESKTOP__) return;
  window.__BEATFLOW_DESKTOP__ = true;

  window.addEventListener('message', function(event) {
    if (!event.data || event.data.channel !== 'bitchord-bridge' || event.data.direction !== 'to-extension') return;
    var req = event.data;
    var reply = function(ok, result, error) {
      window.postMessage({
        channel: 'bitchord-bridge',
        protocol: 1,
        direction: 'from-extension',
        id: req.id,
        ok: ok,
        result: result,
        error: error
      }, '*');
    };

    if (req.method === 'ping') {
      reply(true, {
        version: '1.9.2',
        protocol: 1,
        browser: 'chromium',
        capabilities: ['yt', 'addon', 'lyrics']
      });
    } else if (req.method === 'yt.authState') {
      reply(true, {
        browserSignedIn: false,
        connected: false,
        signedIn: false,
        accounts: [],
        active: null,
        problem: null
      });
    } else if (req.method === 'lyrics.permissions') {
      reply(true, {
        allowed: (req.params && req.params.origins) || [],
        denied: []
      });
    } else if (req.method === 'lyrics.requestPermissions') {
      reply(true, { granted: true });
    } else if (req.method === 'spotify.authState') {
      reply(true, {
        browserSignedIn: false,
        connected: false,
        signedIn: false,
        user: null,
        problem: null
      });
    } else if (req.method === 'spotify.canvas') {
      reply(true, { url: null });
    } else if (req.method === 'discord.state') {
      reply(true, {
        available: false,
        connected: false,
        enabled: false,
        user: null,
        gateway: 'off',
        problem: null
      });
    } else if (req.method === 'discord.presence') {
      reply(true, {});
    }
  });
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
