import type { MusicItem, Track } from '@/data/music/types';
import { best, bestOfficialAudioForVideo, queries, type MatchTarget } from '@/data/match/trackMatcher';
import { fetchOfficialVersionPair, searchSongs } from '@/data/music/api';
import { trackLog } from '@/playback/trackLog';

/**
 * Caches mapping music video videoId -> resolved catalogue audio Track.
 * Prevents re-querying the network repeatedly for the same video.
 */
const audioVersionCache = new Map<string, Track>();

/**
 * Caches mapping audio videoId -> original music video Track (inverse).
 * Allows switching back to the music video if requested.
 */
const videoVersionCache = new Map<string, Track>();

/** Ongoing in-flight lookups so multiple callers await the same promise. */
const activeLookups = new Map<string, Promise<Track>>();

/**
 * Whether [item] is a music video rather than a catalogue audio track.
 * Catalogue audio releases on YouTube Music always have an album reference;
 * videos generally do not, or are explicitly marked with item_type/kind 'video' or 16:9 aspect.
 */
export function isVideoTrack(item: Track | MusicItem): boolean {
  if ('kind' in item) {
    return item.kind === 'video' || item.wide || !item.album;
  }
  if (item.isVideo !== undefined) {
    return item.isVideo;
  }
  return !item.album && !item.index;
}

export function cachedAudioVersion(videoId: string): Track | null {
  return audioVersionCache.get(videoId) ?? null;
}

export function cachedVideoVersion(videoId: string): Track | null {
  return videoVersionCache.get(videoId) ?? null;
}

export function rememberAudioVersion(videoId: string, audio: Track): void {
  audioVersionCache.set(videoId, audio);
}

export function rememberVideoVersion(videoId: string, video: Track): void {
  videoVersionCache.set(videoId, video);
}

export function clearAudioVersionCache(): void {
  audioVersionCache.clear();
  videoVersionCache.clear();
  activeLookups.clear();
}

/**
 * Resolves a music video to its pure official catalogue audio track (YtMusicRepository.resolveAudio).
 *
 * Music videos on YouTube often contain visual preludes, intro dialogues, or credit sequences
 * that disrupt lyrics timing and automix beatgrids. Resolving to the official studio track ensures:
 * 1. Exact syllable-by-syllable lyrics synchronization from LRCLIB / Musixmatch / Apple Music.
 * 2. High fidelity studio audio master and album artwork.
 * 3. Seamless phrase-aligned AutoMix blending.
 */
export async function resolveAudioTrack(song: Track): Promise<Track> {
  if (!isVideoTrack(song)) return song;

  const cached = audioVersionCache.get(song.videoId);
  if (cached) return cached;

  const existing = activeLookups.get(song.videoId);
  if (existing) return existing;

  const lookup = (async () => {
    // 1. YouTube Music official paired version (next endpoint wrapper counterpart)
    try {
      const official = await fetchOfficialVersionPair(song.videoId, true);
      if (official && official.videoId !== song.videoId) {
        const audio: Track = { ...official, isVideo: false };
        audioVersionCache.set(song.videoId, audio);
        videoVersionCache.set(audio.videoId, song);
        trackLog.i(`audio switch: paired '${song.title}' -> '${audio.title}' (${audio.videoId})`, song.videoId);
        return audio;
      }
    } catch (err) {
      trackLog.d(`audio switch: official pair lookup failed: ${String(err)}`, song.videoId);
    }

    // 2. TrackMatcher search fallback across YouTube Music catalogue
    const target: MatchTarget = {
      title: song.title,
      artist: song.artists.map((a) => a.name).join(', '),
      durationSec: song.durationSec,
      album: song.album?.name ?? null,
      isExplicit: song.explicit,
      isVideo: true,
    };

    const searchQueries = queries(target);
    for (const query of searchQueries) {
      try {
        const candidates = await searchSongs(query);
        if (!candidates.length) continue;

        const candidatesWithMeta = candidates.map((c) => ({
          track: c,
          title: c.title,
          artist: c.artists.map((a) => a.name).join(', '),
          album: c.album?.name ?? null,
          durationSec: c.durationSec,
          explicit: c.explicit,
        }));

        // A: Strictest match (runtime close to target)
        const match = best(candidatesWithMeta, target);
        if (match) {
          const audio: Track = { ...match.track, isVideo: false };
          audioVersionCache.set(song.videoId, audio);
          videoVersionCache.set(audio.videoId, song);
          trackLog.i(`audio switch: matched '${song.title}' -> '${audio.title}' (${query})`, song.videoId);
          return audio;
        }

        // B: Official catalogue audio match accepting music video intro/outro runtime drift
        const driftMatch = bestOfficialAudioForVideo(candidatesWithMeta, target);
        if (driftMatch) {
          const audio: Track = { ...driftMatch.track, isVideo: false };
          audioVersionCache.set(song.videoId, audio);
          videoVersionCache.set(audio.videoId, song);
          trackLog.i(`audio switch: accepted video runtime drift '${song.title}' -> '${audio.title}' (${query})`, song.videoId);
          return audio;
        }
      } catch (err) {
        trackLog.w(`audio switch: search failed for '${query}': ${String(err)}`, song.videoId);
      }
    }

    trackLog.d(`audio switch: no official song match for '${song.title}', keeping video`, song.videoId);
    // Settle on original video so we don't repeat searches in this session
    audioVersionCache.set(song.videoId, song);
    return song;
  })();

  activeLookups.set(song.videoId, lookup);
  try {
    return await lookup;
  } finally {
    activeLookups.delete(song.videoId);
  }
}

/**
 * Resolves an audio track to its paired music video, if any (YtMusicRepository.resolveVideo).
 */
export async function resolveVideoTrack(song: Track): Promise<Track | null> {
  if (isVideoTrack(song)) return null;

  const cached = videoVersionCache.get(song.videoId);
  if (cached) return cached;

  try {
    const official = await fetchOfficialVersionPair(song.videoId, false);
    if (official && official.videoId !== song.videoId) {
      const video: Track = { ...official, isVideo: true };
      videoVersionCache.set(song.videoId, video);
      audioVersionCache.set(video.videoId, song);
      return video;
    }
  } catch {
    // ignore
  }

  return null;
}
