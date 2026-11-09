import { describe, expect, it } from 'vitest';
import type { MusicItem, Shelf } from '@/data/music/types';
import {
  extractReleaseYear,
  findTopRelease,
  organizeArtistShelves,
  recentLabel,
  shelfRank,
} from './artistLayout';

const mockItem = (id: string, title: string, subtitle: string, kind: MusicItem['kind'] = 'album'): MusicItem => ({
  id,
  title,
  subtitle,
  kind,
  artists: [{ name: 'Test Artist', id: 'UC123' }],
  album: null,
  thumbnail: 'https://example.com/art.jpg',
  wide: false,
  durationSec: null,
  explicit: false,
});

describe('artistLayout', () => {
  it('extracts release years correctly', () => {
    expect(extractReleaseYear('Album • 2024')).toBe(2024);
    expect(extractReleaseYear('Single • 2021')).toBe(2021);
    expect(extractReleaseYear('1999 • Compilation')).toBe(1999);
    expect(extractReleaseYear('No Year')).toBe(0);
  });

  it('determines the recent label based on subtitle', () => {
    expect(recentLabel('Single • 2024')).toBe('Latest Single');
    expect(recentLabel('2023 • EP')).toBe('Latest EP');
    expect(recentLabel('Album • 2024')).toBe('Latest Release');
    expect(recentLabel('')).toBe('Latest Release');
  });

  it('finds the newest top release across shelves', () => {
    const shelves: Shelf[] = [
      {
        title: 'Albums',
        strapline: null,
        layout: 'square',
        seeAll: null,
        items: [
          mockItem('MPREb_album1', 'Older Album', 'Album • 2020'),
          mockItem('MPREb_album2', 'Mid Album', 'Album • 2023'),
        ],
      },
      {
        title: 'Singles & EPs',
        strapline: null,
        layout: 'square',
        seeAll: null,
        items: [
          mockItem('MPREb_single1', 'Newest Single', 'Single • 2024'),
          mockItem('MPREb_single2', 'Past Single', 'Single • 2022'),
        ],
      },
      {
        title: 'Featured Playlists',
        strapline: null,
        layout: 'square',
        seeAll: null,
        items: [
          mockItem('VL_playlist1', 'Best Of', 'Playlist • 2025', 'playlist'),
        ],
      },
    ];

    const top = findTopRelease(shelves);
    expect(top).not.toBeNull();
    expect(top?.id).toBe('MPREb_single1');
    expect(top?.title).toBe('Newest Single');
  });

  it('ranks shelves into Apple Music hierarchy', () => {
    const shelves: Shelf[] = [
      { title: 'Fans might also like', strapline: null, layout: 'circle', seeAll: null, items: [] },
      { title: 'Featured Playlists', strapline: null, layout: 'square', seeAll: null, items: [] },
      { title: 'Singles & EPs', strapline: null, layout: 'square', seeAll: null, items: [] },
      { title: 'Albums', strapline: null, layout: 'square', seeAll: null, items: [] },
      { title: 'Music Videos', strapline: null, layout: 'video', seeAll: null, items: [] },
      { title: 'Appears On', strapline: null, layout: 'square', seeAll: null, items: [] },
    ];

    const sorted = organizeArtistShelves(shelves);
    expect(sorted.map((s) => s.title)).toEqual([
      'Albums',
      'Singles & EPs',
      'Featured Playlists',
      'Music Videos',
      'Appears On',
      'Fans might also like',
    ]);
  });
});
