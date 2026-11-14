//! BeatFlow Desktop Core Rust Playback & Stream Engine.
//!
//! Orchestrates playback streams, Hi-Res & Lossless upgrades, Dolby Atmos resolution,
//! local file stream probing, and addon management.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

use crate::hires::{self, AddonClient, InstalledAddon, StreamInfo};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackPayload {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub duration_sec: Option<u32>,
    pub thumbnail: Option<String>,
    pub album: Option<String>,
}

pub struct BeatflowEngine {
    pub http: reqwest::Client,
    pub addons: Arc<RwLock<Vec<InstalledAddon>>>,
    pub active_stream: Arc<RwLock<Option<StreamInfo>>>,
    pub original_tracks: Arc<RwLock<HashMap<String, TrackPayload>>>,
    pub upgraded_streams: Arc<RwLock<HashMap<String, StreamInfo>>>,
    pub reverted_tracks: Arc<RwLock<HashSet<String>>>,
    pub prefer_atmos: Arc<RwLock<bool>>,
    pub auto_upgrade: Arc<RwLock<bool>>,
}

impl BeatflowEngine {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .user_agent(hires::USER_AGENT)
            .build()
            .unwrap_or_default();

        let initial_addons = crate::load_addons_from_disk();

        Self {
            http,
            addons: Arc::new(RwLock::new(initial_addons)),
            active_stream: Arc::new(RwLock::new(None)),
            original_tracks: Arc::new(RwLock::new(HashMap::new())),
            upgraded_streams: Arc::new(RwLock::new(HashMap::new())),
            reverted_tracks: Arc::new(RwLock::new(HashSet::new())),
            prefer_atmos: Arc::new(RwLock::new(true)),
            auto_upgrade: Arc::new(RwLock::new(true)),
        }
    }

    pub async fn set_addons(&self, addons: Vec<InstalledAddon>) {
        let mut slot = self.addons.write().await;
        *slot = addons;
    }

    pub async fn get_addons(&self) -> Vec<InstalledAddon> {
        self.addons.read().await.clone()
    }

    pub async fn set_prefer_atmos(&self, on: bool) {
        let mut slot = self.prefer_atmos.write().await;
        *slot = on;
        if !on {
            let mut up = self.upgraded_streams.write().await;
            up.retain(|_, s| !s.atmos);
            let mut active = self.active_stream.write().await;
            if active.as_ref().is_some_and(|s| s.atmos) {
                *active = None;
            }
        }
    }

    pub async fn set_auto_upgrade(&self, on: bool) {
        let mut slot = self.auto_upgrade.write().await;
        *slot = on;
        if !on {
            let mut active = self.active_stream.write().await;
            *active = None;
        }
    }

    pub async fn get_stream_info(&self) -> Option<StreamInfo> {
        self.active_stream.read().await.clone()
    }

    /// Resolves stream specifications for an addon track URI (`addon:{addonId}:{trackId}`).
    pub async fn resolve_addon_stream(&self, addon_uri: &str, addons_override: Option<&[InstalledAddon]>) -> anyhow::Result<StreamInfo> {
        let parts: Vec<&str> = addon_uri.split(':').collect();
        anyhow::ensure!(parts.len() >= 3, "invalid addon track uri: {}", addon_uri);
        let addon_id = parts[1];
        let track_id = parts[2..].join(":");

        println!("[BeatFlow Engine] 🔗 Resolving addon stream for URI: {}", addon_uri);

        let prefer_atmos = *self.prefer_atmos.read().await;

        // If this track was already upgraded and cached, return it directly unless Atmos preference changed
        {
            let up = self.upgraded_streams.read().await;
            if let Some(cached) = up.get(&track_id).or_else(|| up.get(addon_uri)) {
                if !prefer_atmos && cached.atmos {
                    println!("[BeatFlow Engine] 🔄 Cached stream is Dolby Atmos but prefer_atmos is FALSE. Resolving stereo stream.");
                } else {
                    println!("[BeatFlow Engine] ⚡ Using cached stream for {}", addon_uri);
                    println!("[BeatFlow Engine]    Stream URL: {}", cached.url);
                    println!("[BeatFlow Engine]    Codec: {} | Container: {:?}", cached.codec, cached.container);
                    let mut active = self.active_stream.write().await;
                    *active = Some(cached.clone());
                    return Ok(cached.clone());
                }
            }
        }

        println!("[BeatFlow Engine] 🌐 Resolving fresh addon stream: addon_id=\"{}\", track_id=\"{}\"", addon_id, track_id);

        let owned_addons = if addons_override.is_none() {
            Some(self.addons.read().await.clone())
        } else {
            None
        };
        let addons: &[InstalledAddon] = addons_override.unwrap_or_else(|| owned_addons.as_deref().unwrap());

        let addon = addons.iter().find(|a| a.id == addon_id || a.name == addon_id || a.id.contains(addon_id) || addon_id.contains(&a.id))
            .ok_or_else(|| anyhow::anyhow!("addon '{}' not found", addon_id))?;

        println!("[BeatFlow Engine] Found matching addon: \"{}\" ({})", addon.name, addon.base_url);

        let client = AddonClient::new(&addon.base_url)
            .ok_or_else(|| anyhow::anyhow!("invalid addon base url: {}", addon.base_url))?;

        let prefer_atmos = *self.prefer_atmos.read().await;
        let manifest = client.manifest(&self.http).await?;

        let candidate = hires::Candidate {
            id: track_id.clone(),
            title: "".to_string(),
            artist: "".to_string(),
            duration: None,
            quality: manifest.quality.clone(),
            format: "FLAC".to_string(),
            atmos: prefer_atmos,
            stream_url: None,
        };

        let stream_info = client.stream(&self.http, &manifest, &candidate, prefer_atmos).await?
            .ok_or_else(|| anyhow::anyhow!("addon returned no playable stream"))?;

        println!("[BeatFlow Engine] ✅ Fresh stream resolved!");
        println!("[BeatFlow Engine]    Stream URL: {}", stream_info.url);
        println!("[BeatFlow Engine]    Codec: {} | Container: {:?}", stream_info.codec, stream_info.container);

        let mut active = self.active_stream.write().await;
        *active = Some(stream_info.clone());

        Ok(stream_info)
    }

    /// Finds and applies the best Dolby Atmos / Lossless / Hi-Res upgrade for a track.
    pub async fn upgrade_quality(
        &self,
        track: TrackPayload,
        addons_override: Option<&[InstalledAddon]>,
    ) -> anyhow::Result<Option<StreamInfo>> {
        {
            let mut reverted = self.reverted_tracks.write().await;
            reverted.remove(&track.video_id);
        }

        let owned_addons = if addons_override.is_none() {
            Some(self.addons.read().await.clone())
        } else {
            None
        };
        let addons: &[InstalledAddon] = addons_override.unwrap_or_else(|| owned_addons.as_deref().unwrap());

        let prefer_atmos = *self.prefer_atmos.read().await;
        let stream = hires::find_best_upgrade(
            &self.http,
            addons,
            &track.title,
            &track.artist,
            track.duration_sec,
            prefer_atmos,
        ).await?;

        if let Some(s) = stream.as_ref() {
            let mut orig = self.original_tracks.write().await;
            orig.insert(track.video_id.clone(), track.clone());

            let mut up = self.upgraded_streams.write().await;
            up.insert(track.video_id.clone(), s.clone());
            up.insert(format!("addon:{}:{}", s.source, track.video_id), s.clone());

            let mut active = self.active_stream.write().await;
            *active = Some(s.clone());
        }

        Ok(stream)
    }

    /// Reverts an upgraded track back to its original YouTube Music source.
    pub async fn revert_to_original(&self, video_id: &str) -> Option<TrackPayload> {
        {
            let mut reverted = self.reverted_tracks.write().await;
            reverted.insert(video_id.to_string());
        }
        {
            let mut up = self.upgraded_streams.write().await;
            up.remove(video_id);
        }

        let orig = self.original_tracks.read().await.get(video_id).cloned();
        let mut active = self.active_stream.write().await;
        *active = None;
        orig
    }

    /// Background check for auto-upgrade during playback.
    pub async fn check_auto_upgrade(
        &self,
        track: TrackPayload,
        addons_override: Option<&[InstalledAddon]>,
    ) -> anyhow::Result<Option<StreamInfo>> {
        if !*self.auto_upgrade.read().await {
            return Ok(None);
        }
        if self.reverted_tracks.read().await.contains(&track.video_id) {
            return Ok(None);
        }
        if track.video_id.starts_with("addon:") || track.video_id.starts_with("beatflow://") {
            return Ok(None);
        }

        self.upgrade_quality(track, addons_override).await
    }
}
