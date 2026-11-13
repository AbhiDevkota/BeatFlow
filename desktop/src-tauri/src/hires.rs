//! High-resolution audio & addon engine ported from BitChord-PC (src/hires.rs).
//!
//! Provides title cleaning, candidate ranking, Dolby Atmos extraction, and parallel
//! addon stream resolution for BitFlow Desktop.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;

pub const USER_AGENT: &str = "BitChord/v1.9.2";
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
pub const SEARCH_LIMIT: usize = 25;
pub const STREAM_TRIES: usize = 3;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub source: String,
    pub host: String,
    pub codec: String,
    pub quality: String,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
    pub channels: Option<u8>,
    pub atmos: bool,
    pub lossless: bool,
    pub hires: bool,
    pub badge: String,
    pub url: String,
    pub container: Option<String>,
    pub duration_ms: u64,
}

impl StreamInfo {
    pub fn compute_badge(atmos: bool, hires: bool, lossless: bool, bitrate_kbps: Option<u32>) -> String {
        if atmos {
            "Dolby Atmos".to_string()
        } else if hires {
            "Hi-Res Lossless".to_string()
        } else if lossless {
            "Lossless".to_string()
        } else if bitrate_kbps.is_some_and(|k| k >= 320) {
            "320 kbps".to_string()
        } else {
            "High Quality".to_string()
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub duration: Option<u32>,
    pub quality: String,
    pub format: String,
    pub atmos: bool,
    pub stream_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAddon {
    pub id: String,
    pub name: String,
    pub version: String,
    pub base_url: String,
    pub enabled: bool,
    pub resources: Vec<String>,
    #[serde(default)]
    pub allow_downloads: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct Manifest {
    pub name: Option<String>,
    pub defaults: Vec<(String, String)>,
    pub quality: String,
}

pub struct AddonClient {
    pub base: String,
    pub manifest: Mutex<Option<Manifest>>,
    pub searches: Mutex<HashMap<String, Vec<Candidate>>>,
}

impl AddonClient {
    pub fn new(raw: &str) -> Option<Self> {
        let base = normalize_base(raw);
        let parsed = url::Url::parse(&base).ok()?;
        if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none_or(str::is_empty) {
            return None;
        }
        Some(Self {
            base,
            manifest: Mutex::new(None),
            searches: Mutex::new(HashMap::new()),
        })
    }

    pub fn host(&self) -> String {
        host_of(&self.base)
    }

    pub async fn manifest(&self, http: &reqwest::Client) -> anyhow::Result<Manifest> {
        let mut slot = self.manifest.lock().await;
        if let Some(m) = slot.as_ref() {
            return Ok(m.clone());
        }
        let url = format!("{}/manifest.json", self.base);
        let json = get_json(http, &url).await?;
        let id = json.get("id").and_then(Value::as_str).unwrap_or("").trim();
        anyhow::ensure!(!id.is_empty(), "URL answered, but not with an addon manifest");
        let name = json.get("name").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned);
        let (defaults, quality) = parse_settings(json.get("settings"));
        let manifest = Manifest { name, defaults, quality };
        *slot = Some(manifest.clone());
        Ok(manifest)
    }

    pub async fn search(&self, http: &reqwest::Client, manifest: &Manifest, query: &str, atmos: bool) -> anyhow::Result<Vec<Candidate>> {
        let key = format!("{}|{query}|{atmos}", manifest.quality);
        if let Some(hit) = self.searches.lock().await.get(&key) {
            return Ok(hit.clone());
        }
        let mut params = manifest.defaults.clone();
        params.push(("quality".to_owned(), manifest.quality.clone()));
        if atmos {
            params.push(("atmos".to_owned(), "auto".to_owned()));
        }
        params.push(("q".to_owned(), query.to_owned()));
        let url = endpoint(&self.base, &["search"], &params)?;
        let json = get_json(http, &url).await?;
        let tracks = if let Some(arr) = json.as_array() {
            arr.clone()
        } else if let Some(arr) = json.get("tracks").and_then(Value::as_array) {
            arr.clone()
        } else if let Some(arr) = json.get("results").and_then(Value::as_array) {
            arr.clone()
        } else {
            Vec::new()
        };

        let found: Vec<Candidate> = tracks.iter().filter_map(parse_candidate).take(400).collect();
        let mut cache = self.searches.lock().await;
        if cache.len() > 64 {
            cache.clear();
        }
        cache.insert(key, found.clone());
        Ok(found)
    }

    pub async fn stream(&self, http: &reqwest::Client, manifest: &Manifest, candidate: &Candidate, atmos: bool) -> anyhow::Result<Option<StreamInfo>> {
        let mut params = manifest.defaults.clone();
        params.push(("quality".to_owned(), manifest.quality.clone()));
        if atmos {
            params.push(("atmos".to_owned(), "auto".to_owned()));
        }
        let url = endpoint(&self.base, &["stream", &candidate.id], &params)?;
        let json = match get_json(http, &url).await {
            Ok(j) => j,
            Err(e) if e.to_string().contains("not found") => Value::Null,
            Err(e) => return Err(e),
        };
        let stated_url = json.get("url").and_then(Value::as_str).unwrap_or("").trim().to_owned();
        let stated_url = if stated_url.is_empty() {
            candidate.stream_url.clone().unwrap_or_default()
        } else {
            stated_url
        };
        anyhow::ensure!(!stated_url.is_empty(), "the addon returned no stream URL");
        anyhow::ensure!(playable_url(&stated_url), "the addon returned a non-http(s) URL");

        let quality = json.get("quality").and_then(Value::as_str)
            .or_else(|| json.get("streamQuality").and_then(Value::as_str))
            .or_else(|| json.get("audioQuality").and_then(Value::as_str))
            .unwrap_or("").trim().to_owned();
        let label = format!("{quality} {} {}", candidate.quality, candidate.format);
        let raw_codec = json.get("codec").and_then(Value::as_str)
            .or_else(|| json.get("fileCodec").and_then(Value::as_str))
            .unwrap_or("").trim().to_owned();
        let container = json.get("container").and_then(Value::as_str)
            .or_else(|| json.get("containerFormat").and_then(Value::as_str))
            .map(|s| s.trim().to_owned());

        let is_atmos = candidate.atmos || json_is_atmos(&json) || stated_url.contains("atmos") || stated_url.contains("eac3");
        let sample_rate = json.get("sampleRate").and_then(Value::as_f64).filter(|r| *r > 0.0)
            .map(|r| if r < 1000.0 { (r * 1000.0) as u32 } else { r as u32 })
            .or_else(|| number_before(&label, "khz").map(|r| (r * 1000.0) as u32));
        let bit_depth = json.get("bitDepth").and_then(Value::as_f64).filter(|b| *b > 0.0).map(|b| b as u32)
            .or_else(|| number_before(&label, "bit").filter(|b| (8.0..=32.0).contains(b)).map(|b| b as u32));
        let bitrate_kbps = json.get("bitrate").and_then(Value::as_f64).filter(|k| *k > 0.0)
            .map(|k| if k > 3000.0 { (k / 1000.0) as u32 } else { k as u32 })
            .or_else(|| number_before(&label, "kbps").map(|k| k as u32));

        let is_lossless = !is_atmos && (has_lossless_word(&label) || has_lossless_word(&raw_codec) || has_lossless_word(&stated_url));
        let is_hires = is_lossless && (bit_depth.is_some_and(|b| b > 16) || sample_rate.is_some_and(|r| r > 48000));
        let duration_ms = candidate.duration.map_or(0, |s| s as u64 * 1000);
        let channels = if is_atmos { Some(6) } else { json.get("channels").and_then(Value::as_u64).map(|c| c as u8).or(Some(2)) };

        let final_codec = if is_atmos {
            "Dolby Atmos (E-AC-3)".to_string()
        } else if is_lossless {
            if raw_codec.to_ascii_lowercase().contains("alac") {
                "ALAC".to_string()
            } else if raw_codec.to_ascii_lowercase().contains("wav") {
                "PCM".to_string()
            } else {
                "FLAC".to_string()
            }
        } else if !raw_codec.is_empty() {
            raw_codec.to_ascii_uppercase()
        } else {
            "Audio".to_string()
        };

        let badge = StreamInfo::compute_badge(is_atmos, is_hires, is_lossless, bitrate_kbps);

        Ok(Some(StreamInfo {
            source: manifest.name.clone().unwrap_or_else(|| host_of(&self.base)),
            host: host_of(&stated_url),
            codec: final_codec,
            quality: if quality.is_empty() { candidate.quality.clone() } else { quality },
            bitrate_kbps,
            sample_rate,
            bit_depth,
            channels,
            atmos: is_atmos,
            lossless: is_lossless,
            hires: is_hires,
            badge,
            url: stated_url,
            container,
            duration_ms,
        }))
    }
}

pub fn normalize_base(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    let last = trimmed.rsplit('/').next().unwrap_or("");
    if last.to_ascii_lowercase().ends_with(".json") && trimmed.contains("://") {
        trimmed[..trimmed.len() - last.len()].trim_end_matches('/').to_owned()
    } else {
        trimmed.to_owned()
    }
}

pub fn host_of(url: &str) -> String {
    url::Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_owned)).unwrap_or_default()
}

pub fn endpoint(base: &str, segments: &[&str], params: &[(String, String)]) -> anyhow::Result<String> {
    let mut url = url::Url::parse(base)?;
    {
        let mut path = url.path_segments_mut().map_err(|_| anyhow::anyhow!("address can't take paths"))?;
        path.pop_if_empty();
        for segment in segments {
            path.push(segment);
        }
    }
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in params {
            query.append_pair(key, value);
        }
    }
    Ok(url.into())
}

pub async fn get_json(http: &reqwest::Client, url: &str) -> anyhow::Result<Value> {
    let response = http.get(url)
        .timeout(REQUEST_TIMEOUT)
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .send()
        .await?;
    let status = response.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        anyhow::bail!("not found");
    }
    anyhow::ensure!(status.is_success(), "HTTP {}", status.as_u16());
    let bytes = response.bytes().await?;
    anyhow::ensure!(!bytes.is_empty(), "addon returned empty body");
    Ok(serde_json::from_slice(&bytes)?)
}

fn parse_settings(value: Option<&Value>) -> (Vec<(String, String)>, String) {
    let mut defaults = Vec::new();
    let mut quality = "LOSSLESS".to_owned();
    let Some(list) = value.and_then(Value::as_array) else { return (defaults, quality) };
    for entry in list {
        let Some(key) = entry.get("key").and_then(Value::as_str).map(str::trim).filter(|k| !k.is_empty()) else { continue };
        let Some(default) = entry.get("default").and_then(query_value) else { continue };
        if key.eq_ignore_ascii_case("quality") {
            let options: Vec<String> = entry.get("options").and_then(Value::as_array).map(|a| a.iter().filter_map(|o| o.get("value").and_then(query_value)).collect()).unwrap_or_default();
            quality = match_tier(&options);
        } else {
            defaults.push((key.to_owned(), default));
        }
    }
    (defaults, quality)
}

fn query_value(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()).filter(|s| !s.is_empty()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn match_tier(options: &[String]) -> String {
    if options.is_empty() {
        return "LOSSLESS".to_owned();
    }
    if let Some(exact) = options.iter().find(|o| o.eq_ignore_ascii_case("LOSSLESS")) {
        return exact.clone();
    }
    const WORDS: [&str; 7] = ["lossless", "flac", "hifi", "hi-res", "hires", "max", "best"];
    options.iter().find(|o| WORDS.iter().any(|w| o.to_ascii_lowercase().contains(w))).cloned().unwrap_or_else(|| options[0].clone())
}

fn parse_candidate(v: &Value) -> Option<Candidate> {
    let id = v.get("id").and_then(Value::as_str).unwrap_or("").trim();
    let title = v.get("title").and_then(Value::as_str).unwrap_or("").trim();
    if id.is_empty() || title.is_empty() {
        return None;
    }
    Some(Candidate {
        id: id.to_owned(),
        title: title.to_owned(),
        artist: v.get("artist").and_then(Value::as_str).unwrap_or("").trim().to_owned(),
        duration: parse_seconds(v.get("duration").unwrap_or(&Value::Null)),
        quality: v.get("audioQuality").and_then(Value::as_str).unwrap_or("").trim().to_owned(),
        format: v.get("format").and_then(Value::as_str).unwrap_or("").trim().to_owned(),
        atmos: json_is_atmos(v),
        stream_url: v.get("streamURL").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned),
    })
}

fn parse_seconds(v: &Value) -> Option<u32> {
    if let Some(n) = v.as_f64() {
        return (n > 0.0).then_some(n as u32);
    }
    let text = v.as_str()?.trim();
    if let Some((m, s)) = text.split_once(':') {
        let m: u32 = m.parse().ok()?;
        let s: f64 = s.parse().ok()?;
        return Some(m * 60 + s as u32);
    }
    text.parse::<f64>().ok().filter(|n| *n > 0.0).map(|n| n as u32)
}

fn json_is_atmos(v: &Value) -> bool {
    const KEYS: [&str; 7] = ["audioMode", "audioModes", "quality", "streamQuality", "audioQuality", "format", "codec"];
    KEYS.iter().any(|key| v.get(*key).is_some_and(value_is_atmos))
}

fn value_is_atmos(v: &Value) -> bool {
    match v {
        Value::String(s) => {
            let s = s.to_ascii_lowercase();
            ["atmos", "dolby", "ac-3", "ac3", "eac3", "ec-3"].iter().any(|w| s.contains(w))
        }
        Value::Array(items) => items.iter().any(value_is_atmos),
        _ => false,
    }
}

fn playable_url(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some_and(|h| !h.is_empty()))
}

fn has_lossless_word(text: &str) -> bool {
    let text = text.to_ascii_lowercase();
    ["lossless", "flac", "hifi", "hi-res", "hires", "master", "24bit", "24-bit"].iter().any(|w| text.contains(w))
}

fn number_before(text: &str, unit: &str) -> Option<f64> {
    let lower = text.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find(unit) {
        let at = from + found;
        let mut end = at;
        while end > 0 && lower[..end].ends_with(' ') {
            end -= 1;
        }
        let mut start = end;
        while start > 0 {
            let ch = lower[..start].chars().last()?;
            if ch.is_ascii_digit() || ch == '.' || ch == ',' {
                start -= ch.len_utf8();
            } else {
                break;
            }
        }
        if start < end {
            let slice = &lower[start..end].replace(',', "");
            if let Ok(n) = slice.parse::<f64>() {
                return Some(n);
            }
        }
        from = at + unit.len();
    }
    None
}

// ── Searchable Title & Ranking ────────────────────────────────────────────────

pub fn searchable_title(title: &str, artist: &str) -> String {
    let (words, versions) = title_parts(title, artist);
    let mut out = words;
    for version in versions {
        out.push(' ');
        out.push_str(&version);
    }
    out.trim().to_owned()
}

pub fn primary_artist(artist: &str) -> String {
    artist.to_ascii_lowercase().split([',', '&', '/', ';', '·', '|']).next().unwrap_or("").trim().to_owned()
}

type TitleParts = (String, Vec<String>);

fn title_parts(raw: &str, artist: &str) -> TitleParts {
    let mut versions = BTreeSet::new();
    let mut text = raw.to_ascii_lowercase().replace('&', " and ");
    for _ in 0..3 {
        let Some((start, end)) = bracket_span(&text) else { break };
        classify(&text[start + 1..end], &mut versions);
        text.replace_range(start..=end, " ");
    }
    if let Some(at) = text.find(['(', '[']) {
        classify(&text[at..], &mut versions);
        text.truncate(at);
    }
    for _ in 0..3 {
        let Some(at) = text.find(" - ") else { break };
        let (head, tail) = (text[..at].to_owned(), text[at + 3..].to_owned());
        if is_artist_name(&head, artist) {
            classify(&head, &mut versions);
            text = tail;
        } else if is_artist_name(&tail, artist) {
            classify(&tail, &mut versions);
            text = head;
        } else {
            classify(&tail, &mut versions);
            text = head;
        }
    }
    for marker in [" feat.", " feat ", " ft.", " ft ", " featuring ", " with "] {
        if let Some(at) = text.find(marker) {
            text.truncate(at);
        }
    }
    let mut words: Vec<String> = text.split([' ', '.', '·']).map(clean).filter(|w| !w.is_empty() && w != "and").collect();
    while words.len() > 1 && matches!(words.last().map(String::as_str), Some("song" | "songs" | "video" | "audio" | "lyrics" | "official" | "full" | "hd" | "hq" | "4k" | "mp3" | "ost" | "soundtrack")) {
        words.pop();
    }
    (words.join(" "), versions.into_iter().collect())
}

fn bracket_span(text: &str) -> Option<(usize, usize)> {
    let open = text.find(['(', '['])?;
    let close = text[open..].find([')', ']'])? + open;
    Some((open, close))
}

fn classify(segment: &str, versions: &mut BTreeSet<String>) {
    let words: Vec<String> = segment.split([' ', '.', '·']).map(clean).filter(|w| !w.is_empty()).collect();
    if words.is_empty() {
        return;
    }
    let joined = words.join("");
    if matches!(joined.as_str(), "albumversion" | "originalversion" | "originalmix" | "singleversion" | "radioversion" | "radioedit" | "stereoversion" | "monoversion" | "studioversion" | "fullversion" | "standardversion" | "explicitversion" | "deluxeversion" | "originaltrack") {
        return;
    }
    for word in words {
        if VERSION_WORDS.contains(&word.as_str()) {
            versions.insert(word);
        }
    }
}

fn is_artist_name(text: &str, artist: &str) -> bool {
    if artist.is_empty() {
        return false;
    }
    let words: Vec<String> = text.split([' ', '.', '·']).map(clean).filter(|w| !w.is_empty()).collect();
    if words.is_empty() {
        return false;
    }
    let credited: Vec<String> = artist.to_ascii_lowercase().split([' ', '.', '·']).map(clean).filter(|w| !w.is_empty()).collect();
    words.iter().all(|w| credited.contains(w))
}

fn clean(word: &str) -> String {
    word.chars().filter(|c| c.is_ascii_alphanumeric()).collect()
}

const VERSION_WORDS: &[&str] = &[
    "remix", "remixes", "rmx", "refix", "flip", "bootleg", "mashup", "medley", "live", "concert", "unplugged", "acoustic", "instrumental", "karaoke", "vocals", "vocal",
    "acapella", "acappella", "backing", "stems", "stem", "cover", "demo", "reprise", "remake", "rework", "extended", "edit", "version", "mix", "dub", "vip", "session",
    "sessions", "sped", "slowed", "reverb", "nightcore", "lofi", "orchestral", "symphonic", "part", "pt", "chapter",
];

pub fn rank(candidates: Vec<Candidate>, title: &str, artist: &str, duration: Option<u32>, prefer_atmos: bool) -> Vec<Candidate> {
    let (wanted_title, wanted_versions) = title_parts(title, artist);
    let mut scored: Vec<(i32, Candidate)> = candidates
        .into_iter()
        .filter_map(|c| {
            let score = score_candidate(&c, &wanted_title, &wanted_versions, artist, duration, prefer_atmos)?;
            Some((score, c))
        })
        .collect();
    scored.sort_by(|(sa, _), (sb, _)| sb.cmp(sa));
    scored.into_iter().map(|(_, c)| c).collect()
}

fn score_candidate(candidate: &Candidate, wanted_title: &str, wanted_versions: &[String], artist: &str, duration: Option<u32>, prefer_atmos: bool) -> Option<i32> {
    let (cand_title, cand_versions) = title_parts(&candidate.title, &candidate.artist);
    if wanted_title.is_empty() || cand_title.is_empty() {
        return None;
    }
    if wanted_title != cand_title && !cand_title.contains(wanted_title) && !wanted_title.contains(&cand_title) {
        return None;
    }
    if wanted_versions != cand_versions {
        return None;
    }
    let cand_primary = primary_artist(&candidate.artist);
    let wanted_primary = primary_artist(artist);
    let artist_match = wanted_primary.is_empty() || cand_primary.is_empty() || cand_primary.contains(&wanted_primary) || wanted_primary.contains(&cand_primary);
    if !artist_match {
        return None;
    }

    let duration_score = match (duration, candidate.duration) {
        (Some(w), Some(g)) => {
            let diff = w.abs_diff(g);
            if diff > 30 {
                return None;
            }
            (20 - diff as i32).max(0)
        }
        _ => 10,
    };

    let quality_score = if candidate.atmos {
        if prefer_atmos { 50 } else { 20 }
    } else if has_lossless_word(&candidate.quality) || has_lossless_word(&candidate.format) {
        30
    } else {
        10
    };

    Some(100 + duration_score + quality_score)
}

// ── Multi-Addon Orchestrator ───────────────────────────────────────────────────

pub async fn find_best_upgrade(
    http: &reqwest::Client,
    addons: &[InstalledAddon],
    title: &str,
    artist: &str,
    duration_sec: Option<u32>,
    prefer_atmos: bool,
) -> anyhow::Result<Option<StreamInfo>> {
    let enabled_addons: Vec<&InstalledAddon> = addons.iter().filter(|a| a.enabled).collect();
    if enabled_addons.is_empty() {
        return Ok(None);
    }

    let searchable = searchable_title(title, artist);
    let primary = primary_artist(artist);
    let mut queries = Vec::new();
    if !searchable.is_empty() {
        if !primary.is_empty() {
            queries.push(format!("{searchable} {primary}"));
        }
        queries.push(searchable.clone());
    }
    if queries.is_empty() {
        queries.push(title.to_string());
    }

    let passes = if prefer_atmos {
        vec![(true, true), (false, false)]
    } else {
        vec![(false, false)]
    };

    let mut tried = HashSet::new();

    for (search_atmos, stream_atmos) in passes {
        for query in &queries {
            let mut tasks = tokio::task::JoinSet::new();
            for addon in &enabled_addons {
                let client = match AddonClient::new(&addon.base_url) {
                    Some(c) => Arc::new(c),
                    None => continue,
                };
                let http = http.clone();
                let q = query.clone();
                tasks.spawn(async move {
                    let manifest = client.manifest(&http).await.ok()?;
                    let candidates = client.search(&http, &manifest, &q, search_atmos).await.ok()?;
                    Some((client, manifest, candidates))
                });
            }

            while let Some(res) = tasks.join_next().await {
                if let Ok(Some((client, manifest, candidates))) = res {
                    let ranked = rank(candidates, title, artist, duration_sec, stream_atmos);
                    for candidate in ranked.into_iter().take(STREAM_TRIES) {
                        if !tried.insert(candidate.id.clone()) {
                            continue;
                        }
                        if let Ok(Some(stream)) = client.stream(http, &manifest, &candidate, stream_atmos).await {
                            return Ok(Some(stream));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}
