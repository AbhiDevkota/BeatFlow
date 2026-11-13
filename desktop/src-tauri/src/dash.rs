//! Dolby Atmos & DASH manifest engine ported from BitChord-PC (src/dash.rs).
//!
//! Parses DASH MPD manifests for Dolby (E-)AC-3 JOC renditions, resolves segment
//! templates, and provides stream metadata.

use std::time::Duration;
use roxmltree::Document;

pub const FETCH_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Debug)]
pub struct DolbyPlan {
    pub init: String,
    pub segments: Vec<String>,
    pub bandwidth: u32,
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub is_dolby_atmos: bool,
}

impl DolbyPlan {
    pub fn parse(xml: &str, mpd_url: &str) -> anyhow::Result<Self> {
        let doc = Document::parse(xml)?;
        let mpd = doc.root_element();
        anyhow::ensure!(mpd.tag_name().name() == "MPD", "not a DASH manifest");
        let base = url::Url::parse(mpd_url)?;
        let period = mpd.children().find(|n| n.has_tag_name("Period")).ok_or_else(|| anyhow::anyhow!("manifest has no Period"))?;
        let period_ms = duration_attr(mpd.attribute("mediaPresentationDuration"))
            .or_else(|| duration_attr(period.attribute("duration")))
            .unwrap_or(0);

        let mut reps: Vec<roxmltree::Node> = period.children()
            .filter(|n| n.has_tag_name("AdaptationSet"))
            .flat_map(|a| a.children().filter(|n| n.has_tag_name("Representation")).map(move |r| (a, r)))
            .filter(|(a, r)| {
                let mime = r.attribute("mimeType").or_else(|| a.attribute("mimeType")).unwrap_or("");
                mime.is_empty() || mime.starts_with("audio/")
            })
            .map(|(_, r)| r)
            .collect();

        reps.sort_by_key(|r| match r.attribute("codecs").unwrap_or("") {
            c if c.contains("ec-3") => 0,
            c if c.contains("ac-3") => 1,
            _ => 2,
        });

        let rep = reps.into_iter().find(|r| {
            r.attribute("codecs").is_some_and(|c| c.contains("ec-3") || c.contains("ac-3"))
        }).ok_or_else(|| anyhow::anyhow!("manifest has no Dolby rendition"))?;

        let bandwidth = rep.attribute("bandwidth").and_then(|v| v.parse().ok()).unwrap_or(0);

        fn up<'a, 'i>(n: roxmltree::Node<'a, 'i>, tag: &str) -> Option<roxmltree::Node<'a, 'i>> {
            let mut cur = Some(n);
            while let Some(c) = cur {
                if let Some(found) = c.children().find(|k| k.has_tag_name(tag)) {
                    return Some(found);
                }
                cur = c.parent();
            }
            None
        }

        let template = up(rep, "SegmentTemplate").ok_or_else(|| anyhow::anyhow!("rendition has no SegmentTemplate"))?;
        let base = {
            let mut cur = Some(rep);
            let mut found = None;
            while let Some(c) = cur {
                if let Some(b) = c.children().find(|k| k.has_tag_name("BaseURL")).and_then(|b| b.text()) {
                    found = Some(b.trim().to_owned());
                    break;
                }
                cur = c.parent();
            }
            match found {
                Some(b) => base.join(&b)?,
                None => base,
            }
        };

        let address = |pattern: &str, number: u64, time: u64| -> anyhow::Result<String> {
            let mut s = pattern.replace("$RepresentationID$", rep.attribute("id").unwrap_or(""));
            s = s.replace("$Bandwidth$", &bandwidth.to_string());
            s = s.replace("$Time$", &time.to_string());
            while let Some(start) = s.find("$Number") {
                let end = s[start + 1..].find('$').map(|i| start + i + 2).ok_or_else(|| anyhow::anyhow!("unclosed $Number$"))?;
                let token = &s[start + 1..end - 1];
                let width = token.split('%').nth(1).and_then(|w| w.trim_start_matches('0').trim_end_matches('d').parse::<usize>().ok());
                let text = match width {
                    Some(w) => format!("{number:0w$}"),
                    None => number.to_string(),
                };
                s.replace_range(start..end, &text);
            }
            Ok(if url::Url::parse(&s).is_ok() { s } else { base.join(&s)?.into() })
        };

        let timescale: u64 = template.attribute("timescale").and_then(|v| v.parse().ok()).unwrap_or(1);
        let start: u64 = template.attribute("startNumber").and_then(|v| v.parse().ok()).unwrap_or(1);
        let init = address(template.attribute("initialization").ok_or_else(|| anyhow::anyhow!("no initialization segment"))?, start, 0)?;
        let media = template.attribute("media").ok_or_else(|| anyhow::anyhow!("no media template"))?;
        let mut segments = Vec::new();

        if let Some(timeline) = template.children().find(|n| n.has_tag_name("SegmentTimeline")) {
            let (mut time, mut number) = (0u64, start);
            for s in timeline.children().filter(|n| n.has_tag_name("S")) {
                if let Some(t) = s.attribute("t").and_then(|v| v.parse::<u64>().ok()) {
                    time = t;
                }
                let d: u64 = s.attribute("d").and_then(|v| v.parse().ok()).ok_or_else(|| anyhow::anyhow!("segment has no duration"))?;
                let r: i64 = s.attribute("r").and_then(|v| v.parse().ok()).unwrap_or(0);
                let count = if r < 0 {
                    ((period_ms as u128 * timescale as u128 / 1000).saturating_sub(time as u128) / d as u128) as u64
                } else {
                    r as u64 + 1
                };
                for _ in 0..count {
                    segments.push(address(media, number, time)?);
                    time += d;
                    number += 1;
                }
            }
        }

        let sample_rate: u32 = rep.attribute("audioSamplingRate")
            .and_then(|v| v.parse().ok())
            .unwrap_or(48000);

        Ok(DolbyPlan {
            init,
            segments,
            bandwidth,
            duration_ms: period_ms,
            sample_rate,
            is_dolby_atmos: true,
        })
    }
}

fn duration_attr(v: Option<&str>) -> Option<u64> {
    let s = v?.strip_prefix("PT")?;
    let mut ms = 0u64;
    let mut num = String::new();
    for c in s.chars() {
        if c.is_ascii_digit() || c == '.' {
            num.push(c);
        } else {
            let val: f64 = num.parse().ok()?;
            num.clear();
            match c {
                'H' => ms += (val * 3_600_000.0) as u64,
                'M' => ms += (val * 60_000.0) as u64,
                'S' => ms += (val * 1_000.0) as u64,
                _ => {}
            }
        }
    }
    Some(ms)
}
