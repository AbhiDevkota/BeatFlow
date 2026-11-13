import type { Track } from '@/data/music/types';
import { getInstalledAddons, searchAddon, type InstalledAddon } from './addonStore';
import { parseSourceQuality, type SourceQuality } from './sourceQuality';

export interface QualityUpgradeResult {
  addon: InstalledAddon;
  track: Track;
  quality: SourceQuality;
}

const QUALITY_RANKS: Record<SourceQuality, number> = {
  DOLBY_ATMOS: 4,
  HI_RES_LOSSLESS: 3,
  LOSSLESS: 2,
  HIGH_QUALITY: 1,
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);
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
 * matching BeatFlow Android's QualityUpgrade.
 */
export async function findBestQualityUpgrade(track: Track): Promise<QualityUpgradeResult | null> {
  const enabledAddons = getInstalledAddons().filter((a) => a.enabled);
  if (!enabledAddons.length) return null;

  const artistName = track.artists[0]?.name ?? '';
  const query = `${track.title} ${artistName}`.trim();

  const searchPromises = enabledAddons.map(async (addon) => {
    try {
      const results = await searchAddon(addon, query);
      return { addon, results };
    } catch {
      return { addon, results: [] };
    }
  });

  const allResults = await Promise.all(searchPromises);
  const candidates: QualityUpgradeResult[] = [];

  for (const { addon, results } of allResults) {
    for (const candidate of results) {
      // 1. Check title similarity
      const titleSim = calculateSimilarity(track.title, candidate.title);
      if (titleSim < 0.6) continue;

      // 2. Check duration if both exist (allow +/- 12 sec leeway)
      if (track.durationSec && candidate.durationSec) {
        const diff = Math.abs(track.durationSec - candidate.durationSec);
        if (diff > 12) continue;
      }

      // 3. Determine quality
      const rawQuality = candidate.sourceQuality || candidate.sourceFormat?.codec || 'LOSSLESS';
      const parsedQuality = parseSourceQuality(rawQuality) ?? 'LOSSLESS';

      candidates.push({
        addon,
        track: {
          ...candidate,
          sourceQuality: parsedQuality,
          sourceName: addon.name,
        },
        quality: parsedQuality,
      });
    }
  }

  if (!candidates.length) return null;

  // Sort best rank first
  candidates.sort((a, b) => {
    const rankA = QUALITY_RANKS[a.quality] ?? 0;
    const rankB = QUALITY_RANKS[b.quality] ?? 0;
    return rankB - rankA;
  });

  return candidates[0] ?? null;
}
