import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import type { Track } from '@/data/music/types';
import { resolveAudioUrl } from '@/playback/automix/fetchAudio';

export interface DownloadedItem {
  fileName: string;
  path: string;
  size: number;
  modified: number;
  title: string;
  artist: string;
  durationSec: number;
  localUrl: string;
}

export interface DownloadsFolderInfo {
  path: string;
  isDev: boolean;
  folderName: string;
}

export async function getDownloadsFolder(): Promise<DownloadsFolderInfo | null> {
  if (!isDesktopApp()) return null;
  const bridge = desktopBridge();
  return bridge.call('downloads.getFolder', {});
}

export async function openDownloadsFolder(): Promise<boolean> {
  if (!isDesktopApp()) return false;
  const bridge = desktopBridge();
  const res = await bridge.call('downloads.openFolder', {});
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
    durationSec: 0,
    localUrl: it.localUrl,
  }));
}

export async function checkTrackDownloaded(
  title: string,
  artist: string,
  fileName?: string,
): Promise<{ exists: boolean; fileName?: string | null }> {
  if (!isDesktopApp()) return { exists: false };
  const bridge = desktopBridge();
  return bridge.call('downloads.checkExists', { title, artist, fileName });
}

export async function deleteDownloadedTrack(fileName: string): Promise<boolean> {
  if (!isDesktopApp()) return false;
  const bridge = desktopBridge();
  const res = await bridge.call('downloads.deleteTrack', { fileName });
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

  let audioUrl = customAudioUrl;
  let extension = 'm4a';

  if (!audioUrl) {
    if (track.videoId.startsWith('addon:')) {
      const { resolveAddonStream } = await import('@/data/addons/addonStore');
      audioUrl = await resolveAddonStream(track.videoId);
      const cleanUrl = audioUrl.split('?')[0] ?? '';
      const extMatch = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
      if (extMatch && extMatch[1]) {
        extension = extMatch[1].toLowerCase();
      }
    } else if (track.videoId.startsWith('http://') || track.videoId.startsWith('https://')) {
      audioUrl = track.videoId;
      const cleanUrl = audioUrl.split('?')[0] ?? '';
      const extMatch = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
      if (extMatch && extMatch[1]) {
        extension = extMatch[1].toLowerCase();
      }
    } else {
      const resolved = await resolveAudioUrl(track.videoId);
      audioUrl = resolved.url.toString();
      extension = resolved.itag === 251 ? 'webm' : 'm4a';
    }
  }

  const bridge = desktopBridge();
  const res = await bridge.call('downloads.downloadTrack', {
    audioUrl,
    title,
    artist,
    videoId: track.videoId,
    extension,
  });

  return {
    success: res.success,
    fileName: res.fileName,
    localUrl: res.localUrl,
  };
}

export function toTrackFromDownloaded(item: DownloadedItem): Track {
  return {
    videoId: item.localUrl,
    title: item.title,
    artists: [{ name: item.artist, id: null }],
    album: null,
    durationSec: item.durationSec > 0 ? item.durationSec : null,
    explicit: false,
    thumbnail: null,
    index: null,
    plays: null,
  };
}
