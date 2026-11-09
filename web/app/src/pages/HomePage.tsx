import { useEffect, useMemo, useRef } from 'react';
import { FindYourMoodShelf } from '@/components/home/FindYourMoodShelf';
import { TopPicksShelf } from '@/components/home/TopPicksShelf';
import { PageHeader } from '@/components/PageHeader';
import { Shelves, TrackShelf } from '@/components/music/ShelfView';
import { LoadError, LoadMoreError, NeedsExtension } from '@/components/music/States';
import { useHome, useLibrary, useYouTubeReady } from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { ytAuthSnapshot } from '@/extension/useYtAuth';
import { useContentSettings } from '@/lib/contentSettings';
import { buildTopPicks } from '@/lib/homeLayout';
import { HomeSkeleton } from '@/skeletons/PageSkeletons';
import { ShelfSkeleton } from '@/skeletons/ShelfSkeleton';

const RECENT_TITLE = 'Recently Played';
const RECENT_LIMIT = 20;
const RECENT_SOURCE = { title: RECENT_TITLE, type: 'home' as const };

/**
 * The account's listening history, newest first, one row per song
 * (YtMusicRepository.recentlyPlayed): the first 20, signed in only. The same
 * query as Library's Recently Played, so either page warms the other.
 */
function useRecentlyPlayed(): Track[] {
  const history = useLibrary('recent');
  const first = history.data?.pages[0]?.data.tracks ?? [];
  const seen = new Set<string>();
  return first.filter((t) => !seen.has(t.videoId) && seen.add(t.videoId)).slice(0, RECENT_LIMIT);
}

/**
 * Recreated BeatFlow Home Page matching Android's HomeScreen:
 *  - Standard Home Header (PageHeader)
 *  - Top Picks for You (TopPicksShelf with 3:4 portrait cards)
 *  - Recently Played 4-row compact scroller (TrackShelf)
 *  - Find Your Mood (FindYourMoodShelf following lead shelf)
 *  - Dynamic Shelves with localized titles and subtitles
 *  - Infinite scroll continuation
 */
export default function HomePage() {
  const { missing } = useYouTubeReady();
  const home = useHome();
  const recent = useRecentlyPlayed();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hideRecents, hideHomeVideos, hideTopPicks, hideHomeMoods } = useContentSettings();

  // Synchronous non-triggering snapshot of auth to avoid query cancellation
  const auth = ytAuthSnapshot();
  const userName = auth.signedIn && auth.active?.name ? auth.active.name : null;

  // Loads the next shelves before the bottom comes into view; after a failed
  // page it waits for Try Again rather than retrying on every scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !home.hasNextPage || home.isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !home.isFetchingNextPage) void home.fetchNextPage();
      },
      { root: document.getElementById('scrollable-page'), rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [home.hasNextPage, home.isFetchingNextPage, home.isFetchNextPageError, home.fetchNextPage]);

  // Extract shelves safely with useMemo BEFORE any conditional early returns
  const shelves = useMemo(() => {
    if (!home.data?.pages) return [];
    let list = home.data.pages
      .flatMap((page) => page.data)
      .filter((shelf) => !(recent.length > 0 && shelf.title.trim().toLowerCase() === RECENT_TITLE.toLowerCase()));

    // Android-matched "Hide videos from Home" filter: remove video shelves & items
    if (hideHomeVideos) {
      list = list
        .map((shelf) => {
          if (shelf.layout === 'video') return null;
          const items = shelf.items.filter((item) => item.kind !== 'video');
          return items.length === 0 ? null : { ...shelf, items };
        })
        .filter((s): s is typeof s & object => s !== null);
    }

    return list;
  }, [home.data, recent, hideHomeVideos]);

  // Top Picks for You (Android lead row) - computed BEFORE any early returns
  const topPicks = useMemo(
    () => buildTopPicks({ shelves, recent, userName }),
    [shelves, recent, userName],
  );

  if (missing) {
    return (
      <>
        <PageHeader title="Home" />
        <NeedsExtension />
      </>
    );
  }

  // Only a failed first page replaces the feed; a later one is shown under it.
  if (home.isError && !home.data) {
    return (
      <>
        <PageHeader title="Home" />
        <LoadError error={home.error} onRetry={() => void home.refetch()} />
      </>
    );
  }

  if (!home.data) {
    return <HomeSkeleton />;
  }

  return (
    <>
      <PageHeader title="Home" />

      {/* 1. Top Picks for You (Android TopPicksShelf) */}
      {!hideTopPicks && topPicks.length > 0 && <TopPicksShelf picks={topPicks} />}

      {/* 2. Recently Played 4-row compact track scroller */}
      {!hideRecents && recent.length > 0 && (
        <TrackShelf
          title={RECENT_TITLE}
          to="/library/recent"
          tracks={recent}
          source={RECENT_SOURCE}
        />
      )}

      {/* 3. Shelves & Find Your Mood (at index 1 following lead shelf, as on Android) */}
      {shelves.length === 0 ? (
        !hideHomeMoods && <FindYourMoodShelf />
      ) : (
        <>
          {shelves.slice(0, 1).map((shelf, index) => (
            <Shelves key={`${shelf.title}-${index}`} shelves={[shelf]} />
          ))}
          {!hideHomeMoods && <FindYourMoodShelf />}
          {shelves.slice(1).map((shelf, index) => (
            <Shelves key={`${shelf.title}-${index + 1}`} shelves={[shelf]} />
          ))}
        </>
      )}

      {/* Pagination sentinel */}
      <div ref={sentinel} />
      {home.isFetchingNextPage && <ShelfSkeleton kind="square" />}
      {home.isFetchNextPageError && <LoadMoreError onRetry={() => void home.fetchNextPage()} />}
    </>
  );
}
