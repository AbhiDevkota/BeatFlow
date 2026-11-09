import { describe, expect, it } from 'vitest';
import type { Shelf, Track } from '@/data/music/types';
import {
  buildTopPicks,
  CORE_MOODS,
  localizeShelfSubtitle,
  localizeShelfTitle,
  pickMoodForNow,
} from './homeLayout';

describe('localizeShelfTitle', () => {
  it('localizes Recents / Recently Played in multiple languages', () => {
    expect(localizeShelfTitle('Recents')).toBe('Recently Played');
    expect(localizeShelfTitle('recently played')).toBe('Recently Played');
    expect(localizeShelfTitle('Gần đây')).toBe('Recently Played');
    expect(localizeShelfTitle('最近')).toBe('Recently Played');
  });

  it('normalizes common shelf titles', () => {
    expect(localizeShelfTitle('quick picks')).toBe('Quick picks');
    expect(localizeShelfTitle('listen again')).toBe('Listen again');
    expect(localizeShelfTitle('mixed for you')).toBe('Mixed for you');
    expect(localizeShelfTitle('new releases')).toBe('New releases');
  });

  it('preserves custom shelf titles', () => {
    expect(localizeShelfTitle('Chill Instrumental')).toBe('Chill Instrumental');
  });
});

describe('localizeShelfSubtitle', () => {
  it('normalizes subtitles', () => {
    expect(localizeShelfSubtitle('TOP TUNES RIGHT NOW')).toBe('Top tunes right now');
    expect(localizeShelfSubtitle('From the community')).toBe('From the community');
    expect(localizeShelfSubtitle('YouTube Charts')).toBe('YouTube Charts');
  });
});

describe('pickMoodForNow', () => {
  it('picks Feel-Good in morning (8am)', () => {
    const morning = new Date(2026, 10, 9, 8, 0, 0);
    expect(pickMoodForNow(morning).key).toBe('FEEL_GOOD');
  });

  it('picks Energy in afternoon (14pm)', () => {
    const afternoon = new Date(2026, 10, 9, 14, 0, 0);
    expect(pickMoodForNow(afternoon).key).toBe('ENERGY');
  });

  it('picks Relax in evening (19pm)', () => {
    const evening = new Date(2026, 10, 9, 19, 0, 0);
    expect(pickMoodForNow(evening).key).toBe('RELAX');
  });

  it('picks Feeling Blue at night (23pm)', () => {
    const night = new Date(2026, 10, 9, 23, 0, 0);
    expect(pickMoodForNow(night).key).toBe('FEELING_BLUE');
  });
});

describe('buildTopPicks', () => {
  const sampleTracks: Track[] = [
    {
      videoId: 'v1',
      title: 'Starboy',
      artists: [{ name: 'The Weeknd', id: 'UC1' }],
      album: { name: 'Starboy', id: 'a1' },
      durationSec: 230,
      explicit: false,
      thumbnail: 'https://example.com/art1.jpg',
      index: 1,
      plays: '1B',
    },
    {
      videoId: 'v2',
      title: 'Blinding Lights',
      artists: [{ name: 'The Weeknd', id: 'UC1' }],
      album: { name: 'After Hours', id: 'a2' },
      durationSec: 200,
      explicit: false,
      thumbnail: 'https://example.com/art2.jpg',
      index: 2,
      plays: '2B',
    },
  ];

  it('builds Personal Station, Discovery Station, Mood, and Featured Artist', () => {
    const picks = buildTopPicks({
      recent: sampleTracks,
      userName: 'Abhi Devkota',
    });

    expect(picks.length).toBe(4);
    const [p0, p1, p2, p3] = picks;

    // Personal Station
    expect(p0?.kind).toBe('PERSONAL_STATION');
    expect(p0?.title).toBe("Abhi's Station");
    expect(p0?.eyebrow).toBe('MADE FOR YOU');

    // Discovery Station
    expect(p1?.kind).toBe('DISCOVERY_STATION');
    expect(p1?.title).toBe('Discovery Station');

    // Mood
    expect(p2?.kind).toBe('MOOD');
    expect(CORE_MOODS.some((m) => m.key === p2?.mood?.key)).toBe(true);

    // Featured Artist
    expect(p3?.kind).toBe('FEATURED_ARTIST');
    expect(p3?.title).toContain('The Weeknd');
  });

  it('falls back to "Your Station" when username is absent', () => {
    const picks = buildTopPicks({});
    expect(picks[0]?.title).toBe('Your Station');
  });
});
