import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { create } from 'zustand';
import type { Track } from '@/data/music/types';
import { resolveAudioUrl } from '@/playback/automix/fetchAudio';
import { getCanonicalVideoId } from '@/state/player';
import { useLyricsUi } from '@/lyrics/useLyrics';

export interface DownloadedItem {
  fileName: string;
  path: string;
  size: number;
  modified: number;
  title: string;
  artist: string;
  album?: string | null;
  durationSec: number;
  localUrl: string;
  thumbnail?: string | null;
  hasLyrics?: boolean;
  source?: string | null;
}

export interface DownloadsFolderInfo {
  path: string;
  songsPath?: string;
  lyricsPath?: string;
  thumbnailsPath?: string;
  configPath?: string;
  cachePath?: string;
  isDev: boolean;
  folderName: string;
}

export interface ActiveDownload {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string | null;
  status: 'downloading' | 'completed' | 'error';
  startedAt: number;
  error?: string;
}

export interface DownloadsStoreState {
  downloaded: DownloadedItem[];
  activeDownloads: Record<string, ActiveDownload>;
  initialized: boolean;
  /** Why the last refresh failed; cleared when another one starts. */
  error: string | null;
  refresh: () => Promise<void>;
  addActiveDownload: (download: ActiveDownload) => void;
  updateActiveDownload: (videoId: string, update: Partial<ActiveDownload>) => void;
  removeActiveDownload: (videoId: string) => void;
  isDownloading: (videoId: string) => boolean;
  isDownloaded: (titleOrId: string, artist?: string, videoId?: string) => boolean;
  getLocalTrack: (titleOrId: string, artist?: string, videoId?: string) => DownloadedItem | null;
}

/** One refresh at a time: the shell, the page and window focus all ask for it. */
let inFlightRefresh: Promise<void> | null = null;

export const useDownloadsStore = create<DownloadsStoreState>((set, get) => ({
  downloaded: [],
  activeDownloads: {},
  initialized: false,
  error: null,
  refresh: async () => {
    if (!isDesktopApp()) return;
    if (inFlightRefresh) return inFlightRefresh;
    set({ error: null });
    const run = (async () => {
      try {
        const items = await listDownloadedTracks();
        set({ downloaded: items, initialized: true });
      } catch (err) {
        // Keep what's already on screen; the page shows the error.
        set({
          initialized: true,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        inFlightRefresh = null;
      }
    })();
    inFlightRefresh = run;
    return run;
  },
  addActiveDownload: (download) =>
    set((s) => ({
      activeDownloads: { ...s.activeDownloads, [download.videoId]: download },
    })),
  updateActiveDownload: (videoId, update) =>
    set((s) => {
      const existing = s.activeDownloads[videoId];
      if (!existing) return s;
      return {
        activeDownloads: {
          ...s.activeDownloads,
          [videoId]: { ...existing, ...update },
        },
      };
    }),
  removeActiveDownload: (videoId) =>
    set((s) => {
      const copy = { ...s.activeDownloads };
      delete copy[videoId];
      return { activeDownloads: copy };
    }),
  isDownloading: (videoId) => {
    return !!get().activeDownloads[videoId];
  },
  isDownloaded: (titleOrId, artist, videoId) => {
    const list = get().downloaded;
    const tClean = titleOrId.toLowerCase().trim();
    const aClean = (artist ?? '').toLowerCase().trim();
    const vClean = (videoId ?? '').toLowerCase().trim();
    return list.some((item) => {
      if (vClean && item.fileName.toLowerCase().includes(vClean)) return true;
      if (item.localUrl.toLowerCase().includes(tClean)) return true;
      const itTitle = item.title.toLowerCase().trim();
      const itArtist = item.artist.toLowerCase().trim();
      return (
        itTitle === tClean &&
        (!aClean || !itArtist || itArtist.includes(aClean) || aClean.includes(itArtist))
      );
    });
  },
  getLocalTrack: (titleOrId, artist, videoId) => {
    const list = get().downloaded;
    const tClean = titleOrId.toLowerCase().trim();
    const aClean = (artist ?? '').toLowerCase().trim();
    const vClean = (videoId ?? '').toLowerCase().trim();
    return (
      list.find((item) => {
        if (vClean && item.fileName.toLowerCase().includes(vClean)) return true;
        if (item.localUrl.toLowerCase().includes(tClean)) return true;
        const itTitle = item.title.toLowerCase().trim();
        const itArtist = item.artist.toLowerCase().trim();
        return (
          itTitle === tClean &&
          (!aClean || !itArtist || itArtist.includes(aClean) || aClean.includes(itArtist))
        );
      }) ?? null
    );
  },
}));

export async function getDownloadsFolder(): Promise<DownloadsFolderInfo | null> {
  if (!isDesktopApp()) return null;
  const bridge = desktopBridge();
  return bridge.call('downloads.getFolder', {});
}

export async function openDownloadsFolder(subfolder?: string): Promise<boolean> {
  if (!isDesktopApp()) return false;
  const bridge = desktopBridge();
  const res = await bridge.call('downloads.openFolder', { subfolder } as any);
  return res.opened;
}

export async function listDownloadedTracks(): Promise<DownloadedItem[]> {
  if (!isDesktopApp()) return [];
  const bridge = desktopBridge();
  const res = await bridge.call('downloads.list', {});
  return (res ?? []).map((it) => ({
    fileName: it.fileName,
    path: it.filePath,
    size: it.sizeBytes,
    modified: it.modifiedMs,
    title: it.title,
    artist: it.artist,
    album: it.album ?? null,
    durationSec: it.durationSec ?? 0,
    localUrl: it.localUrl,
    thumbnail: it.thumbnail ?? null,
    hasLyrics: it.hasLyrics ?? false,
    source: it.source ?? null,
  }));
}

export async function checkTrackDownloaded(
  title: string,
  artist: string,
  fileName?: string,
): Promise<{ exists: boolean; fileName?: string | null; localUrl?: string | null }> {
  if (!isDesktopApp()) return { exists: false };
  const bridge = desktopBridge();
  return bridge.call('downloads.checkExists', { title, artist, fileName });
}

export async function deleteDownloadedTrack(fileName: string): Promise<boolean> {
  if (!isDesktopApp()) return false;
  // Optimistically remove from state so the page and menus update in real time
  useDownloadsStore.setState((s) => ({
    downloaded: s.downloaded.filter((it) => it.fileName !== fileName),
  }));
  const bridge = desktopBridge();
  const res = await bridge.call('downloads.deleteTrack', { fileName });
  void useDownloadsStore.getState().refresh();
  return res.deleted;
}

export async function downloadTrack(
  track: Track,
  customAudioUrl?: string,
): Promise<{ success: boolean; fileName: string; localUrl: string }> {
  if (!isDesktopApp()) {
    throw new Error('Downloads are only supported in the BeatFlow desktop application.');
  }

  const artist = track.artists.map((a) => a.name).join(', ') || 'Unknown Artist';
  const title = track.title || 'Untitled Track';

  useDownloadsStore.getState().addActiveDownload({
    videoId: track.videoId,
    title,
    artist,
    thumbnailUrl: track.thumbnail ?? null,
    status: 'downloading',
    startedAt: Date.now(),
  });

  try {
    let audioUrl = customAudioUrl;
    let extension = 'm4a';
    let resolvedThumbnailUrl: string | null | undefined = track.thumbnail ?? null;
    let resolvedAlbum: string | null = track.album?.name ?? null;
    let resolvedDurationSec: number | undefined = track.durationSec ?? undefined;
    let resolvedSource: string | undefined;

    const deriveExt = (url: string) => {
      const cleanUrl = url.split('?')[0] ?? '';
      const extMatch = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
      if (extMatch && extMatch[1] && extMatch[1].toLowerCase() !== 'mpd') {
        return extMatch[1].toLowerCase();
      }
      return null;
    };

    if (!audioUrl) {
      try {
        const source = await desktopBridge().call('downloads.resolveSource', {
          videoId: track.videoId,
          title,
          artist,
          durationSec: track.durationSec ?? null,
        });
        if (source?.stream?.url) {
          audioUrl = source.stream.url;
          resolvedThumbnailUrl = source.artwork ?? resolvedThumbnailUrl;
          resolvedSource = source.stream.source ?? 'Addon';
          const ext = deriveExt(audioUrl!);
          if (ext) extension = ext;
          else if (track.sourceFormat?.codec) {
            const c = track.sourceFormat.codec.toLowerCase();
            if (c.includes('flac')) extension = 'm4a';
            else if (c.includes('mp3')) extension = 'mp3';
            else if (c.includes('opus')) extension = 'opus';
            else extension = 'm4a';
          }
        }
      } catch {
        // Fall through to the per-track resolution below.
      }
    }

    if (!audioUrl) {
      if (track.videoId.startsWith('addon:')) {
        const { resolveAddonStream, getAddonById } = await import('@/data/addons/addonStore');
        const addonId = track.videoId.split(':')[1];
        if (addonId) {
          const addon = getAddonById(addonId);
          if (addon && addon.allowDownloads === false) {
            throw new Error(`Downloads are not permitted by "${addon.name}".`);
          }
        }
        audioUrl = await resolveAddonStream(track.videoId);
        const ext = deriveExt(audioUrl ?? '');
        if (ext) extension = ext;
        else if (track.sourceFormat?.codec) {
          const c = track.sourceFormat.codec.toLowerCase();
          if (c.includes('flac')) extension = 'm4a';
          else if (c.includes('mp3')) extension = 'mp3';
          else if (c.includes('opus')) extension = 'opus';
          else extension = 'm4a';
        } else {
          extension = 'm4a';
        }
      } else if (track.videoId.startsWith('http://') || track.videoId.startsWith('https://')) {
        audioUrl = track.videoId;
        const ext = deriveExt(audioUrl!);
        if (ext) extension = ext;
      } else {
        const resolved = await resolveAudioUrl(track.videoId);
        audioUrl = resolved.url.toString();
        extension = resolved.itag === 251 ? 'webm' : 'm4a';
      }
    }

    // Attempt to fetch lyrics to save along with the song. Prefer the source
    // the user picked for this track (useLyricsUi.picked, keyed by canonical
    // video id); otherwise run the normal provider chain. Bounded so a slow
    // lyric server can't hold a finished download up.
    let lyricsText: string | undefined;
    try {
      const { lookupLyrics } = await import('@/lyrics/repository');
      const canonicalId = getCanonicalVideoId(track.videoId) ?? track.videoId;
      const picked = useLyricsUi.getState().picked[canonicalId];
      const lookup = lookupLyrics(
        {
          videoId: track.videoId,
          title: track.title,
          artist: artist,
          durationMs: (track.durationSec ?? 0) * 1000,
          album: track.album?.name ?? null,
        },
        picked ? { only: picked } : {},
      );
      const lyrics = (await Promise.race([
        lookup,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
      ])) as Awaited<ReturnType<typeof lookupLyrics>> | null;
      if (lyrics && lyrics.lines && lyrics.lines.length > 0) {
        lyricsText = lyrics.lines
          .map((line) => {
            const min = Math.floor(line.timeMs / 60000);
            const sec = Math.floor((line.timeMs % 60000) / 1000);
            const ms = Math.floor((line.timeMs % 1000) / 10);
            const time = `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;
            return `${time}${line.text}`;
          })
          .join('\n');
      }
    } catch {}

    const bridge = desktopBridge();
    const res = await bridge.call('downloads.downloadTrack', {
      audioUrl: audioUrl!,
      title,
      artist,
      videoId: track.videoId,
      extension,
      thumbnailUrl: resolvedThumbnailUrl ?? undefined,
      lyrics: lyricsText,
      album: resolvedAlbum ?? undefined,
      durationSec: resolvedDurationSec,
      source: resolvedSource,
    });

    useDownloadsStore.getState().updateActiveDownload(track.videoId, { status: 'completed' });
    setTimeout(() => {
      useDownloadsStore.getState().removeActiveDownload(track.videoId);
    }, 1500);

    await useDownloadsStore.getState().refresh();

    return {
      success: res.success,
      fileName: res.fileName,
      localUrl: res.localUrl,
    };
  } catch (err) {
    useDownloadsStore.getState().updateActiveDownload(track.videoId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    setTimeout(() => {
      useDownloadsStore.getState().removeActiveDownload(track.videoId);
    }, 3500);
    throw err;
  }
}

export function toTrackFromDownloaded(item: DownloadedItem): Track {
  const ext = item.fileName.split('.').pop()?.toLowerCase() ?? '';
  const isDolby = ext === 'eac3' || ext === 'ec3' || ext === 'ac3';
  const isLossless = ['flac', 'wav', 'alac', 'aiff'].includes(ext);
  const sourceQuality = isDolby
    ? 'DOLBY_ATMOS'
    : isLossless
      ? 'LOSSLESS'
      : ['mp3', 'm4a', 'aac', 'opus', 'ogg'].includes(ext)
        ? 'HIGH_QUALITY'
        : null;

  return {
    videoId: item.localUrl,
    title: item.title,
    artists: [{ name: item.artist, id: null }],
    album: item.album ? { name: item.album, id: null } : null,
    durationSec: item.durationSec > 0 ? item.durationSec : null,
    explicit: false,
    thumbnail: item.thumbnail ?? null,
    index: null,
    plays: null,
    sourceQuality,
    sourceName: 'On Device',
    sourceFormat: {
      codec: isDolby ? 'Dolby Atmos' : isLossless ? ext.toUpperCase() : ext.toUpperCase(),
      isLossless,
      isDolbyAtmos: isDolby,
    },
  };
}
