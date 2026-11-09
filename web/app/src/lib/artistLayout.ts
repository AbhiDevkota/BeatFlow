import type { MusicItem, Shelf } from '@/data/music/types';

/**
 * Extracts the release year from an item's subtitle (e.g. "Album • 2024", "Single • 2023").
 */
export function extractReleaseYear(subtitle: string): number {
  const match = /\b(19|20)\d{2}\b/.exec(subtitle);
  return match ? parseInt(match[0]!, 10) : 0;
}

/**
 * The newest release on an artist's shelves (Android DetailScreen.kt topRelease()).
 * Searches for releases (MPRE… browse id or kind === 'album').
 * Prioritizes the latest year in subtitle; ties keep the artist's shelf ordering.
 */
export function findTopRelease(shelves: Shelf[]): MusicItem | null {
  const releases: { item: MusicItem; year: number; index: number }[] = [];
  let globalIndex = 0;

  for (const shelf of shelves) {
    for (const item of shelf.items) {
      globalIndex++;
      if (item.kind === 'album' || item.id.startsWith('MPRE')) {
        const year = extractReleaseYear(item.subtitle);
        releases.push({ item, year, index: globalIndex });
      }
    }
  }

  if (releases.length === 0) return null;

  releases.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return a.index - b.index;
  });

  return releases[0]?.item ?? null;
}

/**
 * "Latest Single" / "Latest EP" where the subtitle indicates, otherwise "Latest Release".
 */
export function recentLabel(subtitle: string): string {
  const kind = subtitle.toLowerCase();
  if (kind.includes('single')) return 'Latest Single';
  if (/\bep\b/.test(kind)) return 'Latest EP';
  return 'Latest Release';
}

/**
 * Apple Music hierarchy for artist shelves:
 * 1. Albums
 * 2. Singles & EPs
 * 3. Featured Playlists / Artist Playlists
 * 4. Music Videos
 * 5. Appears On / Compilations
 * 6. Similar Artists / Fans Also Like
 * 7. Everything else
 */
export function shelfRank(title: string): number {
  const t = title.toLowerCase();
  if (t === 'albums' || t.includes('album')) return 1;
  if (t.includes('single') || /\bep\b/.test(t) || t.includes('eps')) return 2;
  if (t.includes('playlist') || t.includes('essential')) return 3;
  if (t.includes('video')) return 4;
  if (t.includes('appear') || t.includes('featured on') || t.includes('compilation')) return 5;
  if (t.includes('fans') || t.includes('similar') || t.includes('artist')) return 6;
  return 7;
}

export function organizeArtistShelves(shelves: Shelf[]): Shelf[] {
  return [...shelves].sort((a, b) => shelfRank(a.title) - shelfRank(b.title));
}
