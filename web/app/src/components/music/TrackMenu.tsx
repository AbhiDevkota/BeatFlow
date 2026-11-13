import { Check, ChevronLeft, ChevronRight, Download, ListEnd, ListPlus, ListStart, Loader2, MoreHorizontal, Music, RotateCcw, Sparkles, Star, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isDesktopApp } from '@bitchord/shared/bridge';
import { checkTrackDownloaded, deleteDownloadedTrack, downloadTrack } from '@/data/downloads/desktopDownloads';
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
import { usePlayer } from '@/state/player';

function PlaylistChoices({ videoId, onDone, onBack }: { videoId: string; onDone: () => void; onBack: () => void }) {
  const options = usePlaylistOptions(videoId, true);
  const add = useAddToPlaylist();
  return (
    <>
      <MenuItem icon={<ChevronLeft size={14} />} onSelect={onBack}>
        Back
      </MenuItem>
      <MenuSeparator />
      <MenuHeader>Add to Playlist</MenuHeader>
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
            add.mutate({ playlistId: option.playlistId, videoId });
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
  const status = useLikeStatus(track.videoId);
  const setLiked = useSetLiked();
  const liked = status.data === 'LIKE';
  return (
    <>
      <MenuSeparator />
      <MenuItem
        icon={<Star size={15} fill={liked ? 'currentColor' : 'none'} />}
        disabled={status.isPending}
        onSelect={() => {
          setLiked.mutate({ videoId: track.videoId, liked: !liked });
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
  const [status, setStatus] = useState<'checking' | 'not_downloaded' | 'downloading' | 'downloaded'>('checking');
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const artist = track.artists.map((a) => a.name).join(', ');
    checkTrackDownloaded(track.title, artist).then((res) => {
      if (active) {
        if (res.exists) {
          setStatus('downloaded');
          setDownloadedFile(res.fileName ?? null);
        } else {
          setStatus('not_downloaded');
        }
      }
    });
    return () => {
      active = false;
    };
  }, [track.title, track.artists]);

  if (!isDesktopApp() || status === 'checking') return null;

  if (status === 'downloading') {
    return (
      <MenuItem icon={<Loader2 size={15} className="animate-spin text-primary" />} disabled onSelect={() => {}}>
        Downloading…
      </MenuItem>
    );
  }

  if (status === 'downloaded') {
    return (
      <MenuItem
        icon={<Check size={15} className="text-primary" />}
        onSelect={async () => {
          if (downloadedFile) {
            await deleteDownloadedTrack(downloadedFile);
            setStatus('not_downloaded');
          }
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
        setStatus('downloading');
        try {
          await downloadTrack(track);
          setStatus('downloaded');
        } catch (e) {
          console.error('Download error:', e);
          setStatus('not_downloaded');
        }
        onClose();
      }}
    >
      Download
    </MenuItem>
  );
}

function TrackMenuItems({ track, onClose }: { track: Track; onClose: () => void }) {
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const signedIn = useSignedIn();
  if (view === 'playlists') {
    return <PlaylistChoices videoId={track.videoId} onDone={onClose} onBack={() => setView('main')} />;
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
          <TrackMenuItems track={track} onClose={close} />
        </Menu>
      )}
    </>
  );
}
