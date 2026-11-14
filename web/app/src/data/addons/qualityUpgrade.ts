import { desktopBridge, isDesktopApp } from '@bitchord/shared/bridge';
import type { Track } from '@/data/music/types';
import {
  getAutoUpgradeQuality,
  getInstalledAddons,
  getPreferDolbyAtmos,
  searchAddon,
  type InstalledAddon,
} from './addonStore';
import { parseSourceQuality, type SourceQuality } from './sourceQuality';

export interface QualityUpgradeResult {
  addon: InstalledAddon;
  track: Track;
  quality: SourceQuality;
}

export const QUALITY_RANKS: Record<SourceQuality, number> = {
  DOLBY_ATMOS: 4,
  HI_RES_LOSSLESS: 3,
  LOSSLESS: 2,
  HIGH_QUALITY: 1,
};

/**
 * Title cleaner ported from BitChord-PC (src/hires.rs: searchable_title).
 * Takes packaging off (Official Video, MV, Lyrics, feat., etc.), preserving core song title.
 */
export function cleanSearchableTitle(title: string): string {
  let text = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ');

  // Strip brackets containing packaging words
  text = text.replace(/\s*[\(\[][^\)\]]*(?:official|video|music|audio|lyrics|hd|4k|hq|soundtrack|ost|remaster|visualizer|album version|explicit)[^\)\]]*[\)\]]/gi, ' ');
  // Strip feat./ft./featuring
  text = text.replace(/\s*(?:feat\.|feat|ft\.|ft|featuring|with)\s+.*$/gi, ' ');
  // Strip " - Topic"
  text = text.replace(/\s*-\s*topic/gi, ' ');
  // Clean punctuation and double spaces
  text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return text || title.trim();
}

/**
 * Extracts primary artist name ported from BitChord-PC (src/hires.rs: primary_artist).
 */
export function getPrimaryArtist(artist: string): string {
  return artist
    .toLowerCase()
    .split(/[,&\/;·|]|(?:\s+(?:feat\.|feat|ft\.|ft|x|vs\.)\s+)/i)[0]
    ?.replace(/[^\p{L}\p{N}\s]/gu, '')
    ?.trim() ?? '';
}

function calculateSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const normB = b.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  const wordsA = new Set(normA.split(' '));
  const wordsB = new Set(normB.split(' '));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return (2 * intersection) / (wordsA.size + wordsB.size);
}

/**
 * Searches all enabled addons for a higher-quality copy of [track]
 * using BitChord-PC's ranking and query strategy (src/hires.rs).
 */
export async function findBestQualityUpgrade(track: Track): Promise<QualityUpgradeResult | null> {
  const autoUpgrade = getAutoUpgradeQuality();
  if (!autoUpgrade) return null;

  const preferAtmos = getPreferDolbyAtmos();

  // On desktop, the Rust engine drives concurrent addon search, candidate scoring & Atmos resolution
  if (isDesktopApp()) {
    try {
      const bridge = desktopBridge();
      const res = (await bridge.call('engine.upgradeQuality', {
        videoId: track.videoId,
        title: track.title,
        artist: track.artists[0]?.name ?? '',
        durationSec: track.durationSec ?? null,
        thumbnail: track.thumbnail ?? null,
        album: track.album?.name ?? null,
        preferAtmos,
        autoUpgrade,
      })) as any;

      if (res && res.upgraded && res.stream) {
        const stream = res.stream;
        if (!preferAtmos && stream.atmos) {
          return null;
        }
        const isDolbyAtmos = Boolean(stream.atmos);
        const isLossless = Boolean(stream.lossless);
        const isHiRes = Boolean(stream.hires);
        const sourceQuality = isDolbyAtmos
          ? 'DOLBY_ATMOS'
          : isHiRes
            ? 'HI_RES_LOSSLESS'
            : isLossless
              ? 'LOSSLESS'
              : 'HIGH_QUALITY';

        const upgradedTrack: Track = {
          ...track,
          videoId: `addon:${stream.source}:${track.videoId}`,
          sourceQuality,
          sourceName: stream.source,
          sourceFormat: {
            codec: stream.codec,
            bitDepth: stream.bitDepth ?? null,
            sampleRateHz: stream.sampleRate ?? null,
            bitrateKbps: stream.bitrateKbps ?? (isDolbyAtmos ? 768 : 1411),
            isLossless,
            isDolbyAtmos,
          },
        };

        const addon: InstalledAddon = {
          id: stream.source,
          name: stream.source,
          version: '1.0.0',
          baseUrl: stream.host,
          enabled: true,
          resources: ['search', 'stream'],
        };

        return {
          addon,
          track: upgradedTrack,
          quality: sourceQuality,
        };
      }
    } catch (err) {
      console.warn('[QualityUpgrade] Rust engine.upgradeQuality failed, falling back to JS:', err);
    }
  }

  const enabledAddons = getInstalledAddons().filter((a) => a.enabled);
  if (!enabledAddons.length) return null;

  const artistName = track.artists[0]?.name ?? '';
  const cleanTitle = cleanSearchableTitle(track.title);
  const primaryArtist = getPrimaryArtist(artistName);

  const query1 = `${cleanTitle} ${primaryArtist}`.trim();
  const query2 = cleanTitle;

  const searchPromises = enabledAddons.map(async (addon) => {
    try {
      let results = await searchAddon(addon, query1, { atmos: preferAtmos });
      if (!results.length && query2 !== query1) {
        results = await searchAddon(addon, query2, { atmos: preferAtmos });
      }
      return { addon, results };
    } catch {
      return { addon, results: [] };
    }
  });

  const allResults = await Promise.all(searchPromises);
  const scoredCandidates: { candidate: QualityUpgradeResult; score: number }[] = [];

  for (const { addon, results } of allResults) {
    for (const candidate of results) {
      const candidateClean = cleanSearchableTitle(candidate.title);
      const titleSim = calculateSimilarity(cleanTitle, candidateClean);
      if (titleSim < 0.65) continue;

      // Check artist match
      const candArtist = getPrimaryArtist(candidate.artists[0]?.name ?? '');
      const artistMatches = !primaryArtist || !candArtist || candArtist.includes(primaryArtist) || primaryArtist.includes(candArtist);
      if (!artistMatches) continue;

      // Check duration tolerance (BitChord allows up to 30s diff)
      let durationScore = 20;
      if (track.durationSec && candidate.durationSec) {
        const diff = Math.abs(track.durationSec - candidate.durationSec);
        if (diff > 25) continue;
        durationScore = Math.max(0, 20 - diff);
      }

      // Determine quality tier
      const rawQuality = candidate.sourceQuality || candidate.sourceFormat?.codec || 'LOSSLESS';
      const parsedQuality = parseSourceQuality(rawQuality) ?? 'LOSSLESS';
      if (!preferAtmos && parsedQuality === 'DOLBY_ATMOS') {
        continue;
      }
      const qualityRank = parsedQuality === 'DOLBY_ATMOS' ? (preferAtmos ? 5 : 0) : (QUALITY_RANKS[parsedQuality] ?? 1);

      // Total score like BitChord: base title score + artist score + duration score + quality score
      const score = Math.round(titleSim * 100) + (artistMatches ? 30 : 0) + durationScore + (qualityRank * 15);

      scoredCandidates.push({
        candidate: {
          addon,
          track: {
            ...candidate,
            sourceQuality: parsedQuality,
            sourceName: addon.name,
          },
          quality: parsedQuality,
        },
        score,
      });
    }
  }

  if (!scoredCandidates.length) return null;

  scoredCandidates.sort((a, b) => b.score - a.score);
  return scoredCandidates[0]!.candidate;
}
