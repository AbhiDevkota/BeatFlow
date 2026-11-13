import { fetchBrowse, fetchPlaylist, searchSongs } from '@/data/music/api';
import type { Track } from '@/data/music/types';
import { playList } from '@/components/music/play';
import { CORE_MOODS, type MoodDefinition } from '@/lib/homeLayout';

/** In-memory cache of resolved mood tracks for instantaneous playback */
const moodQueueCache = new Map<string, Track[]>();
const STORAGE_PREFIX = 'beatflow_mood_station_';

/** Retrieve cached tracks from memory or sessionStorage */
function getCachedMoodTracks(key: string): Track[] | null {
  const inMem = moodQueueCache.get(key);
  if (inMem && inMem.length > 0) return inMem;
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        moodQueueCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignore storage issues
  }
  return null;
}

/** Store resolved tracks in memory and sessionStorage */
function setCachedMoodTracks(key: string, tracks: Track[]) {
  if (!tracks || tracks.length === 0) return;
  moodQueueCache.set(key, tracks);
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(tracks.slice(0, 50)));
  } catch {
    // Ignore quota issues
  }
}

/**
 * Fast resolution of playable tracks for a mood.
 * Calls searchSongs which returns ~20 tracks directly in a single fast round-trip (~250ms).
 */
async function fastFetchMoodSongs(mood: MoodDefinition): Promise<Track[]> {
  try {
    const query = `${mood.title} mood songs`;
    const tracks = await searchSongs(query);
    if (tracks && tracks.length > 0) {
      return tracks;
    }
  } catch (err) {
    console.warn(`[playMood] fastFetch failed for ${mood.title}:`, err);
  }
  return [];
}

/**
 * Full category browse resolution matching Android BeatFlow's TopPicks.moodQueue:
 * Fetches FEmusic_moods_and_genres_category, scores shelves, and pulls tracks from candidate playlists.
 */
async function fullBrowseMoodTracks(mood: MoodDefinition): Promise<Track[]> {
  try {
    const browse = await fetchBrowse({
      browseId: 'FEmusic_moods_and_genres_category',
      params: mood.params,
    });

    if (browse.tracks && browse.tracks.length > 0) {
      return browse.tracks;
    }

    const shelvesWithPlaylists = browse.shelves.filter((shelf) =>
      shelf.items.some((item) => item.kind === 'playlist' || item.id.startsWith('VL') || item.id.startsWith('PL'))
    );

    let candidateItems: typeof browse.shelves[0]['items'] = [];

    if (shelvesWithPlaylists.length > 0) {
      const words = mood.shelfWords ?? [];
      let bestShelf = shelvesWithPlaylists[0]!;
      let bestScore = -1;

      for (const shelf of shelvesWithPlaylists) {
        const titleLower = shelf.title.toLowerCase();
        let score = 0;
        for (const w of words) {
          if (titleLower.includes(w.toLowerCase())) score += 2;
        }
        if (score > bestScore) {
          bestScore = score;
          bestShelf = shelf;
        }
      }

      candidateItems = bestShelf.items.filter(
        (item) => item.kind === 'playlist' || item.id.startsWith('VL') || item.id.startsWith('PL')
      );
    } else if (browse.shelves.length > 0) {
      candidateItems = browse.shelves[0]?.items ?? [];
    } else if (browse.grid.length > 0) {
      candidateItems = browse.grid;
    }

    const playlistIds = candidateItems
      .map((item) => item.id.replace(/^VL/, ''))
      .filter(Boolean)
      .slice(0, 2);

    if (playlistIds.length === 0) return [];

    const tracksList: Track[] = [];
    const results = await Promise.allSettled(playlistIds.map((id) => fetchPlaylist(id)));
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value?.page?.tracks) {
        tracksList.push(...res.value.page.tracks);
      }
    }

    const seen = new Set<string>();
    const unique: Track[] = [];
    for (const t of tracksList) {
      if (t.videoId && !seen.has(t.videoId)) {
        seen.add(t.videoId);
        unique.push(t);
      }
    }
    return unique;
  } catch (err) {
    console.warn(`[playMood] fullBrowse failed for ${mood.title}:`, err);
    return [];
  }
}

/**
 * Plays a Find Your Mood station.
 * Instant start:
 * - If cached: starts in 0ms.
 * - If uncached: races fast-fetch so music starts playing within ~250ms,
 *   while background resolution enriches the queue without blocking audio.
 */
export async function playMoodStation(mood: MoodDefinition): Promise<void> {
  // 1. Instant Cache Hit (0ms)
  const cached = getCachedMoodTracks(mood.key);
  if (cached && cached.length > 0) {
    const shuffled = [...cached].sort(() => Math.random() - 0.5);
    playList(shuffled, 0, {
      source: { title: `${mood.title} Station`, type: 'home', id: mood.key },
    });
    return;
  }

  // 2. Fast-path: Start playback as soon as the first track list resolves (~250-350ms)
  let playbackStarted = false;

  const startPlayback = (tracks: Track[]) => {
    if (playbackStarted || !tracks.length) return;
    playbackStarted = true;
    setCachedMoodTracks(mood.key, tracks);
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playList(shuffled, 0, {
      source: { title: `${mood.title} Station`, type: 'home', id: mood.key },
    });
  };

  // Run fast song search and full category browse concurrently
  const fastPromise = fastFetchMoodSongs(mood).then((songs) => {
    if (songs.length > 0 && !playbackStarted) {
      startPlayback(songs);
    }
    return songs;
  });

  const fullPromise = fullBrowseMoodTracks(mood).then((browseTracks) => {
    if (browseTracks.length > 0) {
      if (!playbackStarted) {
        startPlayback(browseTracks);
      } else {
        // Enrich the cache with the full playlist tracks for next time
        setCachedMoodTracks(mood.key, browseTracks);
      }
    }
    return browseTracks;
  });

  // Await whichever finishes first to ensure playback starts
  await Promise.race([fastPromise, fullPromise]);

  // If neither has started playback yet, await both
  if (!playbackStarted) {
    const [fast, full] = await Promise.all([fastPromise, fullPromise]);
    const fallback = fast.length > 0 ? fast : full;
    if (fallback.length > 0) {
      startPlayback(fallback);
    }
  }
}

let prewarmDone = false;

/**
 * Pre-warms the core moods in the background during idle time so clicking
 * them plays instantly with 0ms delay.
 */
export function prewarmCoreMoods(): void {
  if (prewarmDone || typeof window === 'undefined') return;
  prewarmDone = true;

  const schedule =
    'requestIdleCallback' in window
      ? (window as unknown as { requestIdleCallback: (fn: () => void) => void }).requestIdleCallback
      : (fn: () => void) => setTimeout(fn, 1200);

  schedule(() => {
    void (async () => {
      for (const mood of CORE_MOODS) {
        if (!getCachedMoodTracks(mood.key)) {
          try {
            const songs = await fastFetchMoodSongs(mood);
            if (songs.length > 0) {
              setCachedMoodTracks(mood.key, songs);
            }
          } catch {
            // Silently ignore background prewarm errors
          }
        }
      }
    })();
  });
}
