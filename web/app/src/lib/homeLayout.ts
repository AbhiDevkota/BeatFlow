import type { Shelf, Track } from '@/data/music/types';

/** How a shelf title is displayed, matching Android's localizeShelfTitle. */
export function localizeShelfTitle(title: string): string {
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'recents' || lower === 'recently played' || lower === 'gần đây' || lower === '最近') {
    return 'Recently Played';
  }
  if (lower === 'quick picks' || lower === 'lựa chọn nhanh' || lower === 'クイック ミックス') {
    return 'Quick picks';
  }
  if (lower === 'listen again' || lower === 'nghe lại' || lower === 'もう一度聴く') {
    return 'Listen again';
  }
  if (lower === 'mixed for you' || lower === 'dành riêng cho bạn' || lower === 'ミックス') {
    return 'Mixed for you';
  }
  if (
    lower === 'trending community playlists' ||
    lower === 'danh sách phát cộng đồng thịnh hành' ||
    lower === '急上昇のコミュニティ再生リスト'
  ) {
    return 'Trending community playlists';
  }
  if (
    lower === 'featured playlists for you' ||
    lower === 'danh sách phát đề xuất cho bạn' ||
    lower === 'おすすめの再生リスト'
  ) {
    return 'Featured playlists for you';
  }
  if (
    lower === 'forgotten favorites' ||
    lower === 'giai điệu quen thuộc' ||
    lower === 'よく聴いたお気に入りの曲'
  ) {
    return 'Forgotten favorites';
  }
  if (
    lower === 'recommended music videos' ||
    lower === 'video âm nhạc đề xuất' ||
    lower === 'おすすめのミュージック ビデオ'
  ) {
    return 'Recommended music videos';
  }
  if (lower === 'from your library' || lower === 'từ thư viện của bạn' || lower === 'ライブラリから') {
    return 'From your library';
  }
  if (lower === 'charts' || lower === 'bảng xếp hạng' || lower === 'チャート') {
    return 'Charts';
  }
  if (lower === 'new releases' || lower === 'bản phát hành mới' || lower === '最新リリース') {
    return 'New releases';
  }
  if (lower === 'top music videos' || lower === 'video âm nhạc hàng đầu' || lower === '人気のミュージック ビデオ') {
    return 'Top music videos';
  }
  if (lower === 'hits today' || lower === "today's hits" || lower === 'bản hit hôm nay') {
    return 'Hits today';
  }
  if (lower === 'trending' || lower === 'thịnh hành' || lower === '急上昇') {
    return 'Trending';
  }
  return trimmed;
}

/** How a shelf subtitle is displayed, matching Android's localizeShelfSubtitle. */
export function localizeShelfSubtitle(subtitle: string): string {
  const trimmed = subtitle.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'top tunes right now' || lower === 'giai điệu hàng đầu hiện nay' || lower === '注目の曲') {
    return 'Top tunes right now';
  }
  if (lower === 'from the community' || lower === 'từ cộng đồng' || lower === 'コミュニティより') {
    return 'From the community';
  }
  if (lower === 'youtube charts' || lower === 'bảng xếp hạng youtube' || lower === 'youtube チャート') {
    return 'YouTube Charts';
  }
  return trimmed;
}

export type TopPickMoodKey =
  | 'ENERGY'
  | 'RELAX'
  | 'FEELING_BLUE'
  | 'FEEL_GOOD'
  | 'FOCUS'
  | 'HEARTBREAK'
  | 'LOVE';

export interface MoodDefinition {
  key: TopPickMoodKey;
  title: string;
  subtitle: string;
  params: string;
  background: string;
  stroke: string;
  eyebrowColor: string;
}

/** Apple's seven Find Your Mood stations, with exact colors from Android BeatFlow. */
export const CORE_MOODS: readonly MoodDefinition[] = [
  {
    key: 'ENERGY',
    title: 'Energy',
    subtitle: 'High energy beats to keep you moving',
    params: 'ggMPOg1uX2lRZUZiMnNrQnJW',
    background: '#1EBD38',
    stroke: '#E2F6A2',
    eyebrowColor: '#E8FF9C',
  },
  {
    key: 'RELAX',
    title: 'Relax',
    subtitle: 'Calm sounds to unwind and decompress',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#31AFF3',
    stroke: '#B4E9FF',
    eyebrowColor: '#D6F3FF',
  },
  {
    key: 'FEELING_BLUE',
    title: 'Feeling Blue',
    subtitle: 'Comforting tracks for melancholic moments',
    params: 'ggMPOg1uX0JLQ0gySWZKZVY1',
    background: '#253AB2',
    stroke: '#6CC4FF',
    eyebrowColor: '#A9DBFF',
  },
  {
    key: 'FEEL_GOOD',
    title: 'Feel-Good',
    subtitle: 'Upbeat tracks to brighten your day',
    params: 'ggMPOg1uXzZQbDB5eThLRTQ3',
    background: '#F2A900',
    stroke: '#FFE8A0',
    eyebrowColor: '#FFF27A',
  },
  {
    key: 'FOCUS',
    title: 'Focus',
    subtitle: 'Concentration music without distraction',
    params: 'ggMPOg1uX0NvNGNhWThMYWRh',
    background: '#F28400',
    stroke: '#FFD6A4',
    eyebrowColor: '#FFE2B8',
  },
  {
    key: 'HEARTBREAK',
    title: 'Heartbreak',
    subtitle: 'Songs for emotional healing',
    params: 'ggMPOg1uX0JLQ0gySWZKZVY1',
    background: '#EA3520',
    stroke: '#FFA690',
    eyebrowColor: '#FFC9BC',
  },
  {
    key: 'LOVE',
    title: 'Love',
    subtitle: 'Romantic melodies and passionate rhythms',
    params: 'ggMPOg1uX0FzQ2FhZWtUY211',
    background: '#F34CA0',
    stroke: '#FFB8DC',
    eyebrowColor: '#FFD0EA',
  },
] as const;

/** Chooses a mood station based on the current hour of the day. */
export function pickMoodForNow(date = new Date()): MoodDefinition {
  const h = date.getHours();
  const fallback = CORE_MOODS[0]!;
  if (h >= 5 && h < 11) return CORE_MOODS[3] ?? fallback;
  if (h >= 11 && h < 17) return CORE_MOODS[0] ?? fallback;
  if (h >= 17 && h < 21) return CORE_MOODS[1] ?? fallback;
  return CORE_MOODS[2] ?? fallback;
}

export type TopPickKind =
  | 'PERSONAL_STATION'
  | 'DISCOVERY_STATION'
  | 'MOOD'
  | 'LATEST_RELEASE'
  | 'FEATURED_ARTIST';

export interface TopPickItem {
  id: string;
  kind: TopPickKind;
  title: string;
  subtitle: string;
  eyebrow: string;
  eyebrowColor?: string;
  thumbnail?: string | null;
  browseId?: string | null;
  mood?: MoodDefinition;
  target?: {
    videoId?: string;
    playlistId?: string;
  };
}

export interface BuildTopPicksOptions {
  shelves?: Shelf[];
  recent?: Track[];
  userName?: string | null;
  now?: Date;
}

/**
 * Builds the lead "Top Picks for You" row for Home:
 *  - Personal Station ("Your Station" / "[Name]'s Station")
 *  - Discovery Station
 *  - Mood for You (dynamic for current time)
 *  - Latest Release / Featured Artist (from top recent history or home shelves)
 */
export function buildTopPicks({
  shelves = [],
  recent = [],
  userName,
  now = new Date(),
}: BuildTopPicksOptions): TopPickItem[] {
  const picks: TopPickItem[] = [];

  // 1. Personal Station
  const firstName = userName?.trim().split(/\s+/)[0];
  const stationTitle = firstName ? `${firstName}'s Station` : 'Your Station';

  // Look for My Supermix in shelves if present
  let supermixPlaylistId: string | undefined;
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      if (item.title.toLowerCase().includes('supermix') || item.title.toLowerCase().includes('your mix')) {
        supermixPlaylistId = item.id;
        break;
      }
    }
    if (supermixPlaylistId) break;
  }

  const seedTrack = recent[0];
  picks.push({
    id: 'top-pick-personal-station',
    kind: 'PERSONAL_STATION',
    title: stationTitle,
    subtitle: 'All your favorites and new discoveries',
    eyebrow: 'MADE FOR YOU',
    eyebrowColor: '#FFD2DA',
    target: {
      playlistId: supermixPlaylistId,
      videoId: seedTrack?.videoId,
    },
  });

  // 2. Discovery Station
  let discoverPlaylistId: string | undefined;
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      if (item.title.toLowerCase().includes('discover')) {
        discoverPlaylistId = item.id;
        break;
      }
    }
    if (discoverPlaylistId) break;
  }

  picks.push({
    id: 'top-pick-discovery-station',
    kind: 'DISCOVERY_STATION',
    title: 'Discovery Station',
    subtitle: 'Fresh music you haven’t heard yet',
    eyebrow: 'MADE FOR YOU',
    eyebrowColor: '#CDBDFF',
    target: {
      playlistId: discoverPlaylistId,
      videoId: recent[1]?.videoId ?? seedTrack?.videoId,
    },
  });

  // 3. Mood for You
  const mood = pickMoodForNow(now);
  picks.push({
    id: `top-pick-mood-${mood.key.toLowerCase()}`,
    kind: 'MOOD',
    title: mood.title,
    subtitle: mood.subtitle,
    eyebrow: 'MOOD FOR YOU',
    eyebrowColor: mood.eyebrowColor,
    mood,
  });

  // 4. Latest Release / Featured Artist
  // Find top artist from recent tracks
  const artistCounts = new Map<string, { name: string; id: string | null; track: Track }>();
  for (const track of recent) {
    const artist = track.artists[0];
    if (artist?.name) {
      const existing = artistCounts.get(artist.name);
      if (!existing) {
        artistCounts.set(artist.name, { name: artist.name, id: artist.id, track });
      }
    }
  }

  const topArtistEntry = Array.from(artistCounts.values())[0];
  if (topArtistEntry) {
    picks.push({
      id: `top-pick-artist-${topArtistEntry.name}`,
      kind: 'FEATURED_ARTIST',
      title: `${topArtistEntry.name} & Similar`,
      subtitle: topArtistEntry.track.title,
      eyebrow: `FEATURING ${topArtistEntry.name.toUpperCase()}`,
      eyebrowColor: 'rgba(255, 255, 255, 0.72)',
      thumbnail: topArtistEntry.track.thumbnail,
      browseId: topArtistEntry.id,
      target: {
        videoId: topArtistEntry.track.videoId,
      },
    });
  } else if (shelves[0]?.items[0]) {
    const firstItem = shelves[0].items[0];
    picks.push({
      id: `top-pick-item-${firstItem.id}`,
      kind: 'LATEST_RELEASE',
      title: firstItem.title,
      subtitle: firstItem.subtitle || 'Recommended for you',
      eyebrow: 'NEW RELEASE',
      eyebrowColor: 'rgba(255, 255, 255, 0.72)',
      thumbnail: firstItem.thumbnail,
      browseId: firstItem.id,
      target: {
        videoId: firstItem.kind === 'song' || firstItem.kind === 'video' ? firstItem.id : undefined,
      },
    });
  }

  return picks;
}
