import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { GoogleSignInModal } from '@/components/GoogleSignInModal';
import { PageHeader } from '@/components/PageHeader';
import { CircleLockup, SquareLockup, VideoLockup } from '@/components/music/Lockups';
import { NewPlaylistModal } from '@/components/music/NewPlaylistModal';
import { EmptyState, LoadError, LoadMoreError, NeedsExtension } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { isLibrarySection, LIBRARY_SECTIONS, type LibrarySection } from '@/data/music/library';
import { useLibrary, useSignedIn, useYouTubeReady } from '@/data/music/queries';
import { useYtAuth } from '@/extension/useYtAuth';
import { PlainSkeleton } from '@/skeletons/PageSkeletons';
import { seeAllGrid, seeAllTracks } from './pageStyles';

/** Asks for the next page when [target] scrolls into view. */
function useLoadMore(onVisible: (() => void) | null) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = target.current;
    if (!node || !onVisible) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), {
      rootMargin: '600px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible]);
  return target;
}

/** A library section (prompt §5.3): Recently Played, Artists, Albums, Songs, Made for You, All Playlists, or Library overview. */
export default function LibraryPage() {
  const rawSection = useParams().section;
  const isGeneralLibrary = !rawSection;
  const section: LibrarySection = rawSection && isLibrarySection(rawSection) ? rawSection : 'playlists';
  const { missing } = useYouTubeReady();
  const auth = useYtAuth();
  const signedIn = useSignedIn();
  const library = useLibrary(section);
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const loadMore = useLoadMore(
    library.hasNextPage && !library.isFetchingNextPage && !library.isFetchNextPageError
      ? () => void library.fetchNextPage()
      : null,
  );

  if (rawSection && !isLibrarySection(rawSection)) return <Navigate to="/home" replace />;
  const title = isGeneralLibrary ? 'Library' : LIBRARY_SECTIONS[section].title;
  if (missing) return <NeedsExtension what="your library" />;
  if (auth.state === 'ready' && !signedIn) {
    return (
      <>
        <PageHeader title={title} back={!isGeneralLibrary} />
        <div className="flex flex-col items-center">
          <EmptyState
            title="Sign in to see your library"
            detail="BeatFlow syncs your library, liked songs, playlists, and history directly with your YouTube Music account."
          />
          <button
            type="button"
            onClick={() => {
              if (isDesktopApp()) {
                desktopBridge()?.call('auth.openLoginWindow', {
                  url: 'https://accounts.google.com/ServiceLogin?service=youtube&prompt=select_account&continue=https%3A%2F%2Fmusic.youtube.com%2F',
                });
              } else {
                setShowSignInModal(true);
              }
            }}
            className="mt-4 px-5 py-2.5 rounded-full bg-key text-sm font-semibold text-white hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
          >
            Sign In with Google
          </button>
          {showSignInModal && <GoogleSignInModal isOpen={showSignInModal} onClose={() => setShowSignInModal(false)} />}
        </div>
      </>
    );
  }
  if (library.isError && !library.data) return <LoadError error={library.error} onRetry={() => void library.refetch()} />;
  if (!library.data) return <PlainSkeleton />;

  const grid = library.data.pages.flatMap((page) => page.data.grid);
  const tracks = library.data.pages.flatMap((page) => page.data.tracks);
  const headerAction = (section === 'playlists' || isGeneralLibrary) && signedIn ? (
    <button
      type="button"
      onClick={() => setShowNewPlaylistModal(true)}
      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-quaternary/80 hover:bg-quaternary text-sm font-medium text-primary hover:text-white transition-all active:scale-95 cursor-pointer shadow-sm"
    >
      <Plus size={16} />
      <span>New Playlist</span>
    </button>
  ) : undefined;

  return (
    <>
      <PageHeader title={title} back={!isGeneralLibrary} action={headerAction} />
      {!grid.length && !tracks.length && (
        <div className="flex flex-col items-center">
          <EmptyState title="Nothing here yet" />
          {section === 'playlists' && signedIn && (
            <button
              type="button"
              onClick={() => setShowNewPlaylistModal(true)}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-full bg-key text-sm font-semibold text-white hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <Plus size={16} />
              <span>Create a playlist</span>
            </button>
          )}
        </div>
      )}
      {grid.length > 0 && (
        <ul className={seeAllGrid} data-wide={grid.every((i) => i.wide) || undefined}>
          {grid.map((item, i) => (
            <li key={`${item.id}-${i}`}>
              {item.kind === 'artist' ? (
                <CircleLockup item={item} />
              ) : item.wide ? (
                <VideoLockup item={item} />
              ) : (
                <SquareLockup item={item} />
              )}
            </li>
          ))}
        </ul>
      )}
      {tracks.length > 0 && (
        <div className={seeAllTracks}>
          <TrackList
            tracks={tracks}
            variant="playlist"
            source={{ title, type: 'library', id: section }}
            onNearEnd={
              library.hasNextPage && !library.isFetchingNextPage && !library.isFetchNextPageError
                ? () => void library.fetchNextPage()
                : undefined
            }
          />
        </div>
      )}
      {grid.length > 0 && <div ref={loadMore} aria-hidden="true" />}
      {library.isFetchNextPageError && <LoadMoreError onRetry={() => void library.fetchNextPage()} />}
      <NewPlaylistModal
        isOpen={showNewPlaylistModal}
        onClose={() => setShowNewPlaylistModal(false)}
      />
    </>
  );
}
