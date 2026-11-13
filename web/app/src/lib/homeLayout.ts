import type { Shelf, Track } from '@/data/music/types';

/** How a shelf title is displayed, matching Android's localizeShelfTitle. */
export function localizeShelfTitle(title: string): string {
  const trimmed = title?.trim() ?? '';
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
  const trimmed = subtitle?.trim() ?? '';
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
  | 'LOVE'
  | 'AFTER_HOURS'
  | 'ALONE_TIME'
  | 'CHILL'
  | 'COMMUTING'
  | 'EATING_COOKING'
  | 'EVENING'
  | 'FITNESS'
  | 'GAMING'
  | 'HOME'
  | 'MORNING'
  | 'MOTIVATION'
  | 'OUTDOORS'
  | 'PARTY'
  | 'SLEEP'
  | 'SOCIAL'
  | 'SPORTS'
  | 'SUMMERTIME'
  | 'HOLIDAY'
  | 'WEEKEND'
  | 'WELLBEING'
  | 'WORK';

export interface MoodDefinition {
  key: TopPickMoodKey;
  title: string;
  subtitle: string;
  params: string;
  background: string;
  stroke: string;
  eyebrowColor: string;
  isCoreMood?: boolean;
}

/** All 28 Find Your Mood stations and activities matching Android BeatFlow TopPickMood.entries. */
export const ALL_MOODS: readonly MoodDefinition[] = [
  // Core Find Your Mood stations (7)
  {
    key: 'ENERGY',
    title: 'Energy',
    subtitle: 'High-voltage tracks to keep you moving.',
    params: 'ggMPOg1uX2lRZUZiMnNrQnJW',
    background: '#1EBD38',
    stroke: '#E2F6A2',
    eyebrowColor: '#E8FF9C',
    isCoreMood: true,
  },
  {
    key: 'RELAX',
    title: 'Relax',
    subtitle: 'Easy, soothing sounds to slow things down.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#31AFF3',
    stroke: '#B4E9FF',
    eyebrowColor: '#D6F3FF',
    isCoreMood: true,
  },
  {
    key: 'FEELING_BLUE',
    title: 'Feeling Blue',
    subtitle: 'Sad songs for when you need them.',
    params: 'ggMPOg1uX0JLQ0gySWZKZVY1',
    background: '#253AB2',
    stroke: '#6CC4FF',
    eyebrowColor: '#A9DBFF',
    isCoreMood: true,
  },
  {
    key: 'FEEL_GOOD',
    title: 'Feel Good',
    subtitle: 'Bright, upbeat songs to lift the day.',
    params: 'ggMPOg1uXzZQbDB5eThLRTQ3',
    background: '#F2A900',
    stroke: '#FFE8A0',
    eyebrowColor: '#FFF27A',
    isCoreMood: true,
  },
  {
    key: 'FOCUS',
    title: 'Focus',
    subtitle: 'Steady music to keep you in the zone.',
    params: 'ggMPOg1uX0NvNGNhWThMYWRh',
    background: '#F28400',
    stroke: '#FFD6A4',
    eyebrowColor: '#FFE2B8',
    isCoreMood: true,
  },
  {
    key: 'HEARTBREAK',
    title: 'Heartbreak',
    subtitle: 'Breakup anthems, one tear at a time.',
    params: 'ggMPOg1uX0JLQ0gySWZKZVY1',
    background: '#EA3520',
    stroke: '#FFA690',
    eyebrowColor: '#FFC9BC',
    isCoreMood: true,
  },
  {
    key: 'LOVE',
    title: 'Love',
    subtitle: 'Romantic songs for the moment.',
    params: 'ggMPOg1uX0FzQ2FhZWtUY211',
    background: '#F34CA0',
    stroke: '#FFB8DC',
    eyebrowColor: '#FFD0EA',
    isCoreMood: true,
  },

  // Moods and Activities (21)
  {
    key: 'AFTER_HOURS',
    title: 'After Hours',
    subtitle: 'Late-night grooves for when the city goes quiet.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#3A1F78',
    stroke: '#C9B6FF',
    eyebrowColor: '#DCC8FF',
    isCoreMood: false,
  },
  {
    key: 'ALONE_TIME',
    title: 'Alone Time',
    subtitle: 'Mellow songs for time to yourself.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#2C6E8C',
    stroke: '#A9E2F5',
    eyebrowColor: '#C5EFFB',
    isCoreMood: false,
  },
  {
    key: 'CHILL',
    title: 'Chill',
    subtitle: 'Laid-back sounds to take it easy.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#138A86',
    stroke: '#A6F0E6',
    eyebrowColor: '#C6F7F0',
    isCoreMood: false,
  },
  {
    key: 'COMMUTING',
    title: 'Commuting',
    subtitle: 'The right soundtrack for the road.',
    params: 'ggMPOg1uX044Z2o5WERLckpU',
    background: '#17855F',
    stroke: '#A8EFD0',
    eyebrowColor: '#C8F7E0',
    isCoreMood: false,
  },
  {
    key: 'EATING_COOKING',
    title: 'Eating & Cooking',
    subtitle: 'Warm, easy music for the kitchen and the table.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#D9621A',
    stroke: '#FFD3A8',
    eyebrowColor: '#FFE4C8',
    isCoreMood: false,
  },
  {
    key: 'EVENING',
    title: 'Evening',
    subtitle: 'Gentle songs to wind the day down.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#2A3A8C',
    stroke: '#B8C6FF',
    eyebrowColor: '#D4DEFF',
    isCoreMood: false,
  },
  {
    key: 'FITNESS',
    title: 'Fitness',
    subtitle: 'Hard-hitting tracks to push you further.',
    params: 'ggMPOg1uX09LWkhnTjRGRUJh',
    background: '#8DB014',
    stroke: '#EFFFA8',
    eyebrowColor: '#F5FFC4',
    isCoreMood: false,
  },
  {
    key: 'GAMING',
    title: 'Gaming',
    subtitle: 'Soundtracks to level up to.',
    params: 'ggMPOg1uX3NmUVV4Vzl3WGQ0',
    background: '#239A2A',
    stroke: '#B8FFB0',
    eyebrowColor: '#D4FFCE',
    isCoreMood: false,
  },
  {
    key: 'HOME',
    title: 'Home',
    subtitle: 'Easy listening for a slow day in.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#0E8A6C',
    stroke: '#A8F2DB',
    eyebrowColor: '#C8F9E8',
    isCoreMood: false,
  },
  {
    key: 'MORNING',
    title: 'Morning',
    subtitle: 'Bright songs to start the day right.',
    params: 'ggMPOg1uXzZQbDB5eThLRTQ3',
    background: '#F08C1A',
    stroke: '#FFE2A6',
    eyebrowColor: '#FFEDC4',
    isCoreMood: false,
  },
  {
    key: 'MOTIVATION',
    title: 'Motivation',
    subtitle: 'Anthems to get you up and going.',
    params: 'ggMPOg1uX2lRZUZiMnNrQnJW',
    background: '#C01E4A',
    stroke: '#FFB3C6',
    eyebrowColor: '#FFD0DE',
    isCoreMood: false,
  },
  {
    key: 'OUTDOORS',
    title: 'Outdoors',
    subtitle: 'Music for fresh air and open roads.',
    params: 'ggMPOg1uX09LWkhnTjRGRUJh',
    background: '#4C8A1E',
    stroke: '#D4F5A8',
    eyebrowColor: '#E4F9C4',
    isCoreMood: false,
  },
  {
    key: 'PARTY',
    title: 'Party',
    subtitle: 'Crowd-pleasers to keep the night going.',
    params: 'ggMPOg1uX0pmQ0s2V0JRclZs',
    background: '#C2287A',
    stroke: '#FFFFE0',
    eyebrowColor: '#FFF5E8',
    isCoreMood: false,
  },
  {
    key: 'SLEEP',
    title: 'Sleep',
    subtitle: 'Soft, calming sounds to drift off to.',
    params: 'ggMPOg1uX1MxaFQ3Z0JMZkN4',
    background: '#26266E',
    stroke: '#C2C6FF',
    eyebrowColor: '#D8DCFF',
    isCoreMood: false,
  },
  {
    key: 'SOCIAL',
    title: 'Social',
    subtitle: 'Songs everyone in the room will know.',
    params: 'ggMPOg1uX0pmQ0s2V0JRclZs',
    background: '#E0507A',
    stroke: '#FFD0DE',
    eyebrowColor: '#FFE2EB',
    isCoreMood: false,
  },
  {
    key: 'SPORTS',
    title: 'Sports',
    subtitle: 'Game-day energy, start to finish.',
    params: 'ggMPOg1uX2lRZUZiMnNrQnJW',
    background: '#1C6CD0',
    stroke: '#B8D8FF',
    eyebrowColor: '#D0E4FF',
    isCoreMood: false,
  },
  {
    key: 'SUMMERTIME',
    title: 'Summertime Sounds',
    subtitle: 'Sunny songs for long, warm days.',
    params: 'ggMPOg1uXzZQbDB5eThLRTQ3',
    background: '#FF8C00',
    stroke: '#FFE6A8',
    eyebrowColor: '#FFF0C4',
    isCoreMood: false,
  },
  {
    key: 'HOLIDAY',
    title: 'Holiday',
    subtitle: 'Festive favourites for the season.',
    params: 'ggMPOg1uXzZQbDB5eThLRTQ3',
    background: '#C62828',
    stroke: '#FFC8C8',
    eyebrowColor: '#FFDEDE',
    isCoreMood: false,
  },
  {
    key: 'WEEKEND',
    title: 'Weekend',
    subtitle: 'Feel-good music for your days off.',
    params: 'ggMPOg1uX0pmQ0s2V0JRclZs',
    background: '#7A3CC2',
    stroke: '#E2CCFF',
    eyebrowColor: '#EEDEFF',
    isCoreMood: false,
  },
  {
    key: 'WELLBEING',
    title: 'Wellbeing',
    subtitle: 'Calm music for mindfulness and yoga.',
    params: 'ggMPOg1uX1JOQWZFeDByc2Jm',
    background: '#36A98A',
    stroke: '#C6F7E6',
    eyebrowColor: '#DEFBF0',
    isCoreMood: false,
  },
  {
    key: 'WORK',
    title: 'Work',
    subtitle: 'Steady instrumentals to get things done.',
    params: 'ggMPOg1uX0NvNGNhWThMYWRh',
    background: '#3E63C9',
    stroke: '#C4D2FF',
    eyebrowColor: '#DCE4FF',
    isCoreMood: false,
  },
] as const;

/** Apple's seven Find Your Mood stations, with exact colors from Android BeatFlow. */
export const CORE_MOODS: readonly MoodDefinition[] = ALL_MOODS.slice(0, 7);

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
  | 'FEATURED_ARTIST'
  | 'ARTIST_AND_SIMILAR';

export interface CollagePalette {
  top: string;
  bottom: string;
  eyebrow: string;
}

/** Vivid backdrops matching Android BeatFlow, one per artist. */
export const COLLAGE_PALETTES: readonly CollagePalette[] = [
  { top: '#8F3F00', bottom: '#FF6A0F', eyebrow: '#FFC48A' },
  { top: '#2D8A20', bottom: '#4FD22C', eyebrow: '#CBFFA3' },
  { top: '#173E9E', bottom: '#2F7BFF', eyebrow: '#C0D8FF' },
  { top: '#4A1E99', bottom: '#8A4BFF', eyebrow: '#DCC8FF' },
  { top: '#0B6E6E', bottom: '#14B8A6', eyebrow: '#B5FFF3' },
  { top: '#8E1426', bottom: '#F0364F', eyebrow: '#FFC4CC' },
];

export function getCollagePalette(name: string): CollagePalette {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLAGE_PALETTES.length;
  return COLLAGE_PALETTES[index]!;
}

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

  try {
    // 1. Personal Station
    const firstName = userName?.trim()?.split(/\s+/)?.[0];
    const stationTitle = firstName ? `${firstName}'s Station` : 'Your Station';

    // Look for My Supermix in shelves if present
    let supermixPlaylistId: string | undefined;
    if (Array.isArray(shelves)) {
      for (const shelf of shelves) {
        if (!shelf?.items) continue;
        for (const item of shelf.items) {
          const titleLower = item?.title?.toLowerCase() ?? '';
          if (titleLower.includes('supermix') || titleLower.includes('your mix')) {
            supermixPlaylistId = item.id;
            break;
          }
        }
        if (supermixPlaylistId) break;
      }
    }

    const seedTrack = recent?.[0];
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
    if (Array.isArray(shelves)) {
      for (const shelf of shelves) {
        if (!shelf?.items) continue;
        for (const item of shelf.items) {
          const titleLower = item?.title?.toLowerCase() ?? '';
          if (titleLower.includes('discover')) {
            discoverPlaylistId = item.id;
            break;
          }
        }
        if (discoverPlaylistId) break;
      }
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
        videoId: recent?.[1]?.videoId ?? seedTrack?.videoId,
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
    const artistCounts = new Map<string, { name: string; id: string | null; track: Track }>();
    if (Array.isArray(recent)) {
      for (const track of recent) {
        const artist = track?.artists?.[0];
        if (artist?.name) {
          const existing = artistCounts.get(artist.name);
          if (!existing) {
            artistCounts.set(artist.name, { name: artist.name, id: artist.id ?? null, track });
          }
        }
      }
    }

    const topArtistEntry = Array.from(artistCounts.values())[0];
    const firstShelfItem = shelves?.[0]?.items?.[0];

    if (topArtistEntry) {
      const palette = getCollagePalette(topArtistEntry.name);
      picks.push({
        id: `top-pick-artist-${topArtistEntry.name}`,
        kind: 'FEATURED_ARTIST',
        title: `${topArtistEntry.name} & Similar`,
        subtitle: topArtistEntry.track.title,
        eyebrow: `FEATURING ${topArtistEntry.name.toUpperCase()}`,
        eyebrowColor: palette.eyebrow,
        thumbnail: topArtistEntry.track.thumbnail,
        browseId: topArtistEntry.id,
        target: {
          videoId: topArtistEntry.track.videoId,
        },
      });
    } else if (firstShelfItem) {
      picks.push({
        id: `top-pick-item-${firstShelfItem.id}`,
        kind: 'LATEST_RELEASE',
        title: firstShelfItem.title,
        subtitle: firstShelfItem.subtitle || 'Recommended for you',
        eyebrow: 'NEW RELEASE',
        eyebrowColor: 'rgba(255, 255, 255, 0.72)',
        thumbnail: firstShelfItem.thumbnail,
        browseId: firstShelfItem.id,
        target: {
          videoId: firstShelfItem.kind === 'song' || firstShelfItem.kind === 'video' ? firstShelfItem.id : undefined,
        },
      });
    }
  } catch (err) {
    console.error('Failed to build top picks:', err);
  }

  return picks;
}
