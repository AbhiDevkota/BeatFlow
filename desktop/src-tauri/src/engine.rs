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
    pub active_stream: Arc<RwLock<Option<StreamInfo>>>,
    pub original_tracks: Arc<RwLock<HashMap<String, TrackPayload>>>,
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

        Self {
            http,
            active_stream: Arc::new(RwLock::new(None)),
            original_tracks: Arc::new(RwLock::new(HashMap::new())),
            reverted_tracks: Arc::new(RwLock::new(HashSet::new())),
            prefer_atmos: Arc::new(RwLock::new(true)),
            auto_upgrade: Arc::new(RwLock::new(true)),
        }
    }

    pub async fn set_prefer_atmos(&self, on: bool) {
        let mut slot = self.prefer_atmos.write().await;
        *slot = on;
    }

    pub async fn set_auto_upgrade(&self, on: bool) {
        let mut slot = self.auto_upgrade.write().await;
        *slot = on;
    }

    pub async fn get_stream_info(&self) -> Option<StreamInfo> {
        self.active_stream.read().await.clone()
    }

    /// Resolves stream specifications for an addon track URI (`addon:{addonId}:{trackId}`).
    pub async fn resolve_addon_stream(&self, addon_uri: &str, addons: &[InstalledAddon]) -> anyhow::Result<StreamInfo> {
        let parts: Vec<&str> = addon_uri.split(':').collect();
        anyhow::ensure!(parts.len() >= 3, "invalid addon track uri: {}", addon_uri);
        let addon_id = parts[1];
        let track_id = parts[2..].join(":");

        let addon = addons.iter().find(|a| a.id == addon_id)
            .ok_or_else(|| anyhow::anyhow!("addon '{}' not found", addon_id))?;

        let client = AddonClient::new(&addon.base_url)
            .ok_or_else(|| anyhow::anyhow!("invalid addon base url: {}", addon.base_url))?;

        let prefer_atmos = *self.prefer_atmos.read().await;
        let manifest = client.manifest(&self.http).await?;

        let candidate = hires::Candidate {
            id: track_id,
            title: "".to_string(),
            artist: "".to_string(),
            duration: None,
            quality: "LOSSLESS".to_string(),
            format: "FLAC".to_string(),
            atmos: prefer_atmos,
            stream_url: None,
        };

        let stream_info = client.stream(&self.http, &manifest, &candidate, prefer_atmos).await?
            .ok_or_else(|| anyhow::anyhow!("addon returned no playable stream"))?;

        let mut active = self.active_stream.write().await;
        *active = Some(stream_info.clone());

        Ok(stream_info)
    }

    /// Finds and applies the best Dolby Atmos / Lossless / Hi-Res upgrade for a track.
    pub async fn upgrade_quality(
        &self,
        track: TrackPayload,
        addons: &[InstalledAddon],
    ) -> anyhow::Result<Option<StreamInfo>> {
        {
            let mut reverted = self.reverted_tracks.write().await;
            reverted.remove(&track.video_id);
        }

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

        let orig = self.original_tracks.read().await.get(video_id).cloned();
        let mut active = self.active_stream.write().await;
        *active = None;
        orig
    }

    /// Background check for auto-upgrade during playback.
    pub async fn check_auto_upgrade(
        &self,
        track: TrackPayload,
        addons: &[InstalledAddon],
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

        self.upgrade_quality(track, addons).await
    }
}
