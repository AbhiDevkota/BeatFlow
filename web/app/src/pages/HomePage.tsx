import { useEffect, useMemo, useRef } from 'react';
import { FindYourMoodShelf } from '@/components/home/FindYourMoodShelf';
import { HomeHeader } from '@/components/home/HomeHeader';
import { RecentShelf } from '@/components/home/RecentShelf';
import { TopPicksShelf } from '@/components/home/TopPicksShelf';
import { ShelfView } from '@/components/music/ShelfView';
import { LoadError, LoadMoreError, NeedsExtension } from '@/components/music/States';
import { useHome, useLibrary, useYouTubeReady } from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { useYtAuth } from '@/extension/useYtAuth';
import { buildTopPicks } from '@/lib/homeLayout';
import { HomeSkeleton } from '@/skeletons/PageSkeletons';
import { ShelfSkeleton } from '@/skeletons/ShelfSkeleton';

const RECENT_TITLE = 'Recently Played';
const RECENT_LIMIT = 20;

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
 *  - Top Header with BeatFlow mark & Listen Now heading (HomeTitle)
 *  - Top Picks for You (TopPicksShelf with 3:4 portrait cards)
 *  - Recently Played (RecentShelf with 4-rows-per-column horizontal scroller)
 *  - Find Your Mood (FindYourMoodShelf following lead shelf)
 *  - Dynamic Shelves with localized titles and subtitles
 *  - Infinite scroll continuation
 */
export default function HomePage() {
  const { missing } = useYouTubeReady();
  const authStatus = useYtAuth();
  const userName = authStatus.state === 'ready' ? authStatus.auth.active?.name : null;

  const home = useHome();
  const recent = useRecentlyPlayed();
  const sentinel = useRef<HTMLDivElement>(null);

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

  if (missing) {
    return (
      <>
        <HomeHeader />
        <NeedsExtension />
      </>
    );
  }

  // Only a failed first page replaces the feed; a later one is shown under it.
  if (home.isError && !home.data) {
    return (
      <>
        <HomeHeader />
        <LoadError error={home.error} onRetry={() => void home.refetch()} />
      </>
    );
  }

  if (!home.data) {
    return (
      <>
        <HomeHeader />
        <HomeSkeleton />
      </>
    );
  }

  // YouTube's feed can carry its own, older Recently Played; the history wins, as on the phone.
  const shelves = home.data.pages
    .flatMap((page) => page.data)
    .filter((shelf) => !(recent.length > 0 && shelf.title.trim().toLowerCase() === RECENT_TITLE.toLowerCase()));

  // Top Picks for You (Apple Music / Android lead row)
  const topPicks = useMemo(
    () => buildTopPicks({ shelves, recent, userName }),
    [shelves, recent, userName],
  );

  return (
    <>
      <HomeHeader />

      {/* 1. Top Picks for You (Android TopPicksShelf) */}
      <TopPicksShelf picks={topPicks} />

      {/* 2. Recently Played 4-row compact scroller (Android RecentShelf) */}
      {recent.length > 0 && <RecentShelf tracks={recent} />}

      {/* 3. Shelves & Find Your Mood (at index 1 following lead shelf, as on Android) */}
      {shelves.length === 0 ? (
        <FindYourMoodShelf />
      ) : (
        shelves.map((shelf, index) => (
          <div key={`${shelf.title}-${index}`}>
            {index === 1 && <FindYourMoodShelf />}
            <ShelfView shelf={shelf} />
          </div>
        ))
      )}
      {shelves.length === 1 && <FindYourMoodShelf />}

      {/* Pagination sentinel */}
      <div ref={sentinel} />
      {home.isFetchingNextPage && <ShelfSkeleton kind="square" />}
      {home.isFetchNextPageError && <LoadMoreError onRetry={() => void home.fetchNextPage()} />}
    </>
  );
}
