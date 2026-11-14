import { Check, ChevronLeft, ChevronRight, Download, ListEnd, ListPlus, ListStart, Loader2, MoreHorizontal, Music, Plus, RotateCcw, Sparkles, Star, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isDesktopApp } from '@bitchord/shared/bridge';
import { deleteDownloadedTrack, downloadTrack, useDownloadsStore } from '@/data/downloads/desktopDownloads';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement } from '@/components/Menu';
import { isVideoTrack } from '@/data/music/resolveAudio';
import {
  useAddToPlaylist,
  useLikeStatus,
  usePlaylistOptions,
  useSetLiked,
  useSignedIn,
} from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { getCanonicalVideoId, usePlayer } from '@/state/player';
import { NewPlaylistModal } from './NewPlaylistModal';

function PlaylistChoices({
  videoId,
  onDone,
  onBack,
  onNewPlaylist,
}: {
  videoId: string;
  onDone: () => void;
  onBack: () => void;
  onNewPlaylist: () => void;
}) {
  const canonicalId = getCanonicalVideoId(videoId) ?? videoId;
  const options = usePlaylistOptions(canonicalId, true);
  const add = useAddToPlaylist();
  return (
    <>
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-secondary">
        <button
          type="button"
          onClick={onBack}
          className="grid size-6 place-items-center rounded-full hover:bg-quaternary text-secondary hover:text-primary transition-colors cursor-pointer"
          aria-label="Back"
          title="Back"
        >
          <ChevronLeft size={15} />
        </button>
        <span>Add to Playlist</span>
      </div>
      <MenuSeparator />
      <MenuItem icon={<Plus size={15} />} onSelect={onNewPlaylist}>
        New Playlist
      </MenuItem>
      <MenuSeparator />
      {options.isPending && (
        <MenuItem disabled onSelect={() => {}}>
          Loading…
        </MenuItem>
      )}
      {options.isError && (
        <MenuItem disabled onSelect={() => {}}>
          Couldn’t load your playlists
        </MenuItem>
      )}
      {options.data?.length === 0 && (
        <MenuItem disabled onSelect={() => {}}>
          No playlists yet
        </MenuItem>
      )}
      {options.data?.map((option) => (
        <MenuItem
          key={option.playlistId}
          onSelect={() => {
            add.mutate({ playlistId: option.playlistId, videoId: canonicalId });
            onDone();
          }}
        >
          {option.title}
        </MenuItem>
      ))}
    </>
  );
}

/** Favorite and Add to Playlist: the account's actions, signed in only. */
function AccountItems({ track, onClose, onPlaylists }: { track: Track; onClose: () => void; onPlaylists: () => void }) {
  const canonicalId = getCanonicalVideoId(track) ?? track.videoId;
  const status = useLikeStatus(canonicalId);
  const setLiked = useSetLiked();
  const liked = status.data === 'LIKE';
  return (
    <>
      <MenuSeparator />
      <MenuItem
        icon={<Star size={15} fill={liked ? 'currentColor' : 'none'} />}
        disabled={status.isPending}
        onSelect={() => {
          setLiked.mutate({ videoId: canonicalId, liked: !liked });
          onClose();
        }}
      >
        {liked ? 'Unfavorite' : 'Favorite'}
      </MenuItem>
      <MenuItem icon={<ListPlus size={15} />} trailing={<ChevronRight size={14} />} onSelect={onPlaylists}>
        Add to Playlist
      </MenuItem>
    </>
  );
}

function DesktopDownloadItem({ track, onClose }: { track: Track; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const artist = track.artists.map((a) => a.name).join(', ');
  const localItem = useDownloadsStore((s) => s.getLocalTrack(track.title, artist, track.videoId));
  const isDownloaded = Boolean(localItem);

  if (!isDesktopApp()) return null;

  if (downloading) {
    return (
      <MenuItem icon={<Loader2 size={15} className="animate-spin text-primary" />} disabled onSelect={() => {}}>
        Downloading…
      </MenuItem>
    );
  }

  if (isDownloaded && localItem) {
    return (
      <MenuItem
        icon={<Check size={15} className="text-key" />}
        onSelect={async () => {
          await deleteDownloadedTrack(localItem.fileName);
          onClose();
        }}
      >
        Downloaded (Remove)
      </MenuItem>
    );
  }

  return (
    <MenuItem
      icon={<Download size={15} />}
      onSelect={async () => {
        setDownloading(true);
        try {
          await downloadTrack(track);
        } catch (e) {
          console.error('Download error:', e);
        } finally {
          setDownloading(false);
        }
        onClose();
      }}
    >
      Download
    </MenuItem>
  );
}

function TrackMenuItems({
  track,
  onClose,
  onOpenNewPlaylist,
}: {
  track: Track;
  onClose: () => void;
  onOpenNewPlaylist: () => void;
}) {
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const signedIn = useSignedIn();
  if (view === 'playlists') {
    return (
      <PlaylistChoices
        videoId={track.videoId}
        onDone={onClose}
        onBack={() => setView('main')}
        onNewPlaylist={() => {
          onClose();
          onOpenNewPlaylist();
        }}
      />
    );
  }
  const { playNext, addToQueue, swapVersion, upgradeQuality, revertToOriginal, isUpgraded } = usePlayer.getState();
  const isCurrentPlaying = usePlayer((s) => s.nowPlaying?.videoId === track.videoId);
  const upgradingQuality = usePlayer((s) => s.upgradingQuality);
  const trackUpgraded = isUpgraded(track.videoId);
  return (
    <>
      <MenuItem icon={<ListStart size={15} />} onSelect={() => (onClose(), playNext([track]))}>
        Play Next
      </MenuItem>
      <MenuItem icon={<ListEnd size={15} />} onSelect={() => (onClose(), addToQueue([track]))}>
        Add to Queue
      </MenuItem>
      {isDesktopApp() && <DesktopDownloadItem track={track} onClose={onClose} />}
      {isCurrentPlaying && (
        <>
          {trackUpgraded ? (
            <MenuItem
              icon={<RotateCcw size={15} />}
              onSelect={async () => {
                onClose();
                await revertToOriginal();
              }}
            >
              Revert to Original Version
            </MenuItem>
          ) : (
            <MenuItem
              icon={
                upgradingQuality ? (
                  <Loader2 size={15} className="animate-spin text-primary" />
                ) : (
                  <Sparkles size={15} className="text-amber-400" />
                )
              }
              disabled={upgradingQuality}
              onSelect={async () => {
                onClose();
                await upgradeQuality();
              }}
            >
              {upgradingQuality ? 'Searching Higher Quality…' : 'Upgrade Quality'}
            </MenuItem>
          )}
          <MenuItem
            icon={isVideoTrack(track) ? <Music size={15} /> : <Video size={15} />}
            onSelect={async () => {
              onClose();
              await swapVersion();
            }}
          >
            {isVideoTrack(track) ? 'Switch to Audio Version' : 'Switch to Music Video'}
          </MenuItem>
        </>
      )}
      {signedIn && <AccountItems track={track} onClose={onClose} onPlaylists={() => setView('playlists')} />}
    </>
  );
}

/**
 * The ⋯ button at the end of a track row (report §14): Play Next and Add to
 * Queue for everyone; Favorite and Add to Playlist signed in.
 */
export function TrackMenu({
  track,
  className,
  placement,
  onOpenChange,
}: {
  track: Track;
  className?: string;
  /** Where the menu opens from the button; the player's sit at the bottom of the window. */
  placement?: MenuPlacement;
  /** Told when the menu opens and closes; most mounts don't need to know. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const canonicalId = getCanonicalVideoId(track) ?? track.videoId;
  const close = useCallback(() => setAnchor(null), []);
  useEffect(() => {
    onOpenChange?.(anchor !== null);
  }, [anchor, onOpenChange]);
  return (
    <>
      <button
        className={className}
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-open={anchor !== null || undefined}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={18} strokeWidth={2} />
      </button>
      {anchor && (
        <Menu anchor={anchor} placement={placement} onClose={close} label={track.title}>
          <TrackMenuItems
            track={track}
            onClose={close}
            onOpenNewPlaylist={() => setShowNewPlaylistModal(true)}
          />
        </Menu>
      )}
      <NewPlaylistModal
        isOpen={showNewPlaylistModal}
        onClose={() => setShowNewPlaylistModal(false)}
        initialVideoIds={[canonicalId]}
      />
    </>
  );
}
