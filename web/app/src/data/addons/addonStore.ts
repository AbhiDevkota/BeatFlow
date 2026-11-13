import { desktopBridge, isDesktopApp } from '@bitchord/shared/bridge';
import type { Track } from '@/data/music/types';
import { parseSourceQuality } from './sourceQuality';

export interface InstalledAddon {
  id: string;
  name: string;
  version: string;
  baseUrl: string;
  enabled: boolean;
  resources: string[];
  allowDownloads?: boolean;
}

const STORAGE_KEY = 'beatflow_installed_addons';

export function getInstalledAddons(): InstalledAddon[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InstalledAddon[];
  } catch {
    return [];
  }
}

export function saveInstalledAddons(addons: InstalledAddon[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addons));

  // Also persist in the music folder config file (addons.json) on desktop
  if (isDesktopApp()) {
    try {
      void desktopBridge().call('addons.saveConfig', { addons }).catch((err) => {
        console.warn('[AddonStore] Failed to write addons.json in music folder:', err);
      });
    } catch {}
  }
}

/**
 * Loads addons from the music folder's `addons.json` on desktop
 * and syncs with localStorage so the user's config file remains the single source of truth.
 */
export async function syncAddonsWithFolderConfig(): Promise<InstalledAddon[]> {
  if (!isDesktopApp()) return getInstalledAddons();
  try {
    const bridge = desktopBridge();
    const folderConfig = await bridge.call('addons.loadConfig', {});
    if (Array.isArray(folderConfig) && folderConfig.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(folderConfig));
      return folderConfig as InstalledAddon[];
    } else {
      const current = getInstalledAddons();
      if (current.length > 0) {
        await bridge.call('addons.saveConfig', { addons: current });
      }
      return current;
    }
  } catch (err) {
    console.warn('[AddonStore] Failed to sync addons from music folder:', err);
    return getInstalledAddons();
  }
}

export async function fetchAddonManifest(baseUrl: string): Promise<Record<string, any>> {
  if (!isDesktopApp()) {
    throw new Error('Addons are only supported in the BeatFlow desktop application.');
  }
  const cleanBase = baseUrl.trim().replace(/\/manifest\.json$/, '');
  const bridge = desktopBridge();
  return bridge.call('addon.manifest', { baseUrl: cleanBase });
}

export async function addAddon(baseUrl: string): Promise<InstalledAddon> {
  const manifest = await fetchAddonManifest(baseUrl);
  const cleanBase = baseUrl.trim().replace(/\/manifest\.json$/, '');

  const id = String(manifest.id || `addon-${Date.now()}`);
  const name = String(manifest.name || manifest.id || 'Custom Addon');
  const version = String(manifest.version || '1.0.0');
  const resources = Array.isArray(manifest.resources) ? manifest.resources.map(String) : ['search', 'stream'];
  const allowDownloads = manifest.allowDownloads !== 0 && manifest.allowDownloads !== false;

  const newAddon: InstalledAddon = {
    id,
    name,
    version,
    baseUrl: cleanBase,
    enabled: true,
    resources,
    allowDownloads,
  };

  const current = getInstalledAddons();
  const filtered = current.filter((a) => a.id !== id && a.baseUrl !== cleanBase);
  const updated = [...filtered, newAddon];
  saveInstalledAddons(updated);
  return newAddon;
}

export function removeAddon(id: string): void {
  const current = getInstalledAddons();
  const updated = current.filter((a) => a.id !== id);
  saveInstalledAddons(updated);
}

export function toggleAddon(id: string, enabled: boolean): void {
  const current = getInstalledAddons();
  const updated = current.map((a) => (a.id === id ? { ...a, enabled } : a));
  saveInstalledAddons(updated);
}

export function getAddonById(id: string): InstalledAddon | null {
  const list = getInstalledAddons();
  return list.find((a) => a.id === id) ?? null;
}

export async function searchAddon(addon: InstalledAddon, query: string): Promise<Track[]> {
  if (!addon.enabled || !isDesktopApp()) return [];
  const bridge = desktopBridge();
  try {
    const raw = await bridge.call('addon.search', {
      baseUrl: addon.baseUrl,
      query,
      quality: 'high',
    });

    const rawData = raw as any;
    const list = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData.results)
        ? rawData.results
        : Array.isArray(rawData.tracks)
          ? rawData.tracks
          : [];

    return list.map((item: any) => {
      const trackId = String(item.id || item.videoId || item.trackId || '');
      const title = String(item.title || item.name || 'Untitled');
      const artistName = String(item.artist || item.author || addon.name);
      const albumName = item.album ? String(item.album) : null;
      const thumbnail = item.artwork || item.thumbnail || item.cover || null;
      const durationSec =
        typeof item.duration === 'number'
          ? item.duration
          : typeof item.durationSec === 'number'
            ? item.durationSec
            : null;

      const rawQualityStr = String(item.quality || item.sourceQuality || item.format || '');
      const detectedQuality = parseSourceQuality(rawQualityStr);
      const isDolby =
        detectedQuality === 'DOLBY_ATMOS' ||
        Boolean(item.isDolby || item.atmos || rawQualityStr.toUpperCase().includes('DOLBY'));
      const isLossless =
        detectedQuality === 'LOSSLESS' ||
        detectedQuality === 'HI_RES_LOSSLESS' ||
        Boolean(item.isLossless || ['flac', 'alac', 'wav'].includes(String(item.codec || '').toLowerCase()));

      const finalQuality = isDolby
        ? 'DOLBY_ATMOS'
        : detectedQuality === 'HI_RES_LOSSLESS' || item.bitDepth > 16 || item.sampleRate > 48000
          ? 'HI_RES_LOSSLESS'
          : isLossless
            ? 'LOSSLESS'
            : detectedQuality === 'HIGH_QUALITY' || item.bitrate >= 320
              ? 'HIGH_QUALITY'
              : null;

      return {
        videoId: `addon:${addon.id}:${trackId}`,
        title,
        artists: [{ name: artistName, id: null }],
        album: albumName ? { name: albumName, id: null } : null,
        durationSec,
        explicit: Boolean(item.explicit),
        thumbnail,
        index: null,
        plays: null,
        sourceQuality: finalQuality,
        sourceName: addon.name,
        sourceFormat: {
          codec: item.codec || (isDolby ? 'Dolby Atmos' : isLossless ? 'FLAC' : 'Audio'),
          bitDepth: typeof item.bitDepth === 'number' ? item.bitDepth : null,
          sampleRateHz: typeof item.sampleRate === 'number' ? item.sampleRate : null,
          bitrateKbps: typeof item.bitrate === 'number' ? item.bitrate : null,
          isLossless,
          isDolbyAtmos: isDolby,
        },
      } as Track;
    });
  } catch (err) {
    console.warn(`[Addon] Search failed for ${addon.name}:`, err);
    return [];
  }
}

export async function searchAllEnabledAddons(query: string): Promise<{ addon: InstalledAddon; tracks: Track[] }[]> {
  const addons = getInstalledAddons().filter((a) => a.enabled);
  if (!addons.length || !isDesktopApp()) return [];

  const promises = addons.map(async (addon) => {
    const tracks = await searchAddon(addon, query);
    return { addon, tracks };
  });

  const results = await Promise.all(promises);
  return results.filter((r) => r.tracks.length > 0);
}

export async function resolveAddonStream(addonUri: string): Promise<string> {
  // Format: addon:{addonId}:{trackId}
  const parts = addonUri.split(':');
  if (parts.length < 3) {
    throw new Error(`Invalid addon track URI: ${addonUri}`);
  }
  const addonId = parts[1]!;
  const trackId = parts.slice(2).join(':');

  const addons = getInstalledAddons();
  const addon = addons.find((a) => a.id === addonId);
  if (!addon) {
    throw new Error(`Addon with id '${addonId}' not found.`);
  }

  const bridge = desktopBridge();
  const res = await bridge.call('addon.stream', {
    baseUrl: addon.baseUrl,
    trackId,
  });

  const streamUrl = typeof res === 'string' ? res : res.url || res.streamUrl || res.stream || '';
  if (!streamUrl) {
    throw new Error(`Addon ${addon.name} returned empty stream URL`);
  }
  return streamUrl;
}
