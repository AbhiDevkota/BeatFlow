import { fetchBrowse, fetchPlaylist, fetchSearch } from '@/data/music/api';
import type { Track } from '@/data/music/types';
import { playList, playTrack, toTrack } from '@/components/music/play';
import type { MoodDefinition } from '@/lib/homeLayout';

/** Cache of resolved mood tracks for instantaneous playback on repeat clicks */
const moodQueueCache = new Map<string, Track[]>();

/**
 * Plays songs matching a Find Your Mood station, implementing the exact logic
 * from Android BeatFlow (TopPicks.moodStation & TopPicks.queue):
 *
 * 1. Fetches the YouTube Music mood category playlists for `mood.params`.
 * 2. Scores the candidate shelves against `mood.shelfWords` (e.g. heartbreak, chill, workout).
 * 3. Draws candidate playlists at random and fetches their audio tracks.
 * 4. Deduplicates and shuffles them into a cohesive mood station queue.
 * 5. Starts playback with the queue labeled as "[Mood] Station".
 */
export async function playMoodStation(mood: MoodDefinition): Promise<void> {
  const cached = moodQueueCache.get(mood.key);
  if (cached && cached.length > 0) {
    const shuffled = [...cached].sort(() => Math.random() - 0.5);
    playList(shuffled, 0, {
      source: { title: `${mood.title} Station`, type: 'home', id: mood.key },
    });
    return;
  }

  try {
    // 1. Fetch category shelves using mood.params
    const browse = await fetchBrowse({
      browseId: 'FEmusic_moods_and_genres_category',
      params: mood.params,
    });

    // If the browse endpoint directly rendered tracks (some moods return a song list)
    if (browse.tracks && browse.tracks.length > 0) {
      moodQueueCache.set(mood.key, browse.tracks);
      playList(browse.tracks, 0, {
        source: { title: `${mood.title} Station`, type: 'home', id: mood.key },
      });
      return;
    }

    // 2. Identify shelves with playlists
    const shelvesWithPlaylists = browse.shelves.filter((shelf) =>
      shelf.items.some((item) => item.kind === 'playlist' || item.id.startsWith('VL') || item.id.startsWith('PL'))
    );

    let candidateItems: typeof browse.shelves[0]['items'] = [];

    if (shelvesWithPlaylists.length > 0) {
      // Score shelves based on mood.shelfWords matching Android's TopPicks score
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

    // 3. Take up to 3 playlists and fetch their tracks
    const playlistIds = candidateItems
      .map((item) => item.id.replace(/^VL/, ''))
      .filter(Boolean)
      .slice(0, 3);

    const tracksList: Track[] = [];

    if (playlistIds.length > 0) {
      const results = await Promise.allSettled(playlistIds.map((id) => fetchPlaylist(id)));
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value?.page?.tracks) {
          tracksList.push(...res.value.page.tracks);
        }
      }
    }

    // Deduplicate tracks by videoId
    const seen = new Set<string>();
    const uniqueTracks: Track[] = [];
    for (const t of tracksList) {
      if (t.videoId && !seen.has(t.videoId)) {
        seen.add(t.videoId);
        uniqueTracks.push(t);
      }
    }

    if (uniqueTracks.length > 0) {
      const shuffled = uniqueTracks.sort(() => Math.random() - 0.5).slice(0, 60);
      moodQueueCache.set(mood.key, shuffled);
      playList(shuffled, 0, {
        source: { title: `${mood.title} Station`, type: 'home', id: mood.key },
      });
      return;
    }

    // 4. Fallback: Search for mood tracks directly if category returned no playable playlists
    const searchRes = await fetchSearch(`${mood.title} mood`);
    const songItems =
      searchRes.songs.length > 0 ? searchRes.songs : searchRes.top.filter((i) => i.kind === 'song' || i.kind === 'video');

    if (songItems.length > 0) {
      const tracks = songItems.map((item) => toTrack(item));
      moodQueueCache.set(mood.key, tracks);
      playList(tracks, 0, {
        source: { title: `${mood.title} Station`, type: 'home', id: mood.key },
      });
      return;
    }
  } catch (err) {
    console.warn(`[playMood] Failed to load mood station for ${mood.title}:`, err);
    // Reliable fallback: search for mood songs and play
    try {
      const fallbackSearch = await fetchSearch(`${mood.title} music`);
      const first = fallbackSearch.songs[0] || fallbackSearch.top[0];
      if (first) {
        playTrack(toTrack(first), null, {
          title: `${mood.title} Station`,
          type: 'home',
          id: mood.key,
        });
      }
    } catch {
      // Ignored
    }
  }
}
