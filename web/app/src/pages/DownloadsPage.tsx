import {
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  CircleCheckBig,
  Download,
  FolderOpen,
  HardDrive,
  MicVocal,
  MonitorDown,
  Music2,
  Play,
  RefreshCw,
  Search,
  SearchX,
  Shuffle,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { isDesktopApp } from '@bitchord/shared/bridge';
import { PageHeader } from '@/components/PageHeader';
import { PrefetchLink } from '@/components/PrefetchLink';
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';
import { detailButton } from '@/components/music/DetailHeader';
import { stateStyles } from '@/components/music/States';
import { TrackList, type DownloadRowMeta } from '@/components/music/TrackList';
import { playList, shuffleList } from '@/components/music/play';
import {
  getDownloadsFolder,
  openDownloadsFolder,
  toTrackFromDownloaded,
  useDownloadsStore,
  type ActiveDownload,
  type DownloadedItem,
  type DownloadsFolderInfo,
} from '@/data/downloads/desktopDownloads';
import type { Track } from '@/data/music/types';

const SOURCE = { title: 'Downloads', type: 'playlist' as const, id: 'downloads' };
const CONTEXT = { source: SOURCE };
const DESKTOP_RELEASES = 'https://github.com/AbhiDevkota/BeatFlow/releases/latest';

type SortKey = 'recent' | 'title' | 'artist' | 'size';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recently added',
  title: 'Title',
  artist: 'Artist',
  size: 'Largest first',
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatElapsed(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}:${String(secs % 60).padStart(2, '0')}`;
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

function formatAdded(ms: number): { label: string; title: string } {
  if (!Number.isFinite(ms) || ms <= 0) return { label: '—', title: 'Date unavailable' };
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { label: '—', title: 'Date unavailable' };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const addedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const label =
    addedDay === today
      ? 'Today'
      : addedDay === yesterday
        ? 'Yesterday'
        : date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
          });
  return { label, title: date.toLocaleString() };
}

function formatCheckedAt(ts: number | null): string {
  if (!ts) return 'Not checked yet';
  return `Checked ${new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function extensionOf(item: DownloadedItem): string {
  const ext = item.fileName.split('.').pop()?.trim();
  return ext ? ext.toUpperCase() : 'Audio';
}

/** One clock for the whole queue, so the elapsed labels tick together. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function HeroMosaic({ covers }: { covers: string[] }) {
  return (
    <div className="relative w-[270px] flex-none max-lg:w-[220px] max-md:w-[min(240px,62vw)]">
      <div className="absolute inset-4 -z-1 rounded-full bg-key/25 blur-3xl" aria-hidden="true" />
      {covers[0] && (
        <div className="absolute inset-0 -z-1 scale-90 opacity-35 blur-[28px] saturate-200" aria-hidden="true">
          <img src={covers[0]} alt="" className="size-full rounded-artwork-lg object-cover" draggable={false} />
        </div>
      )}
      {covers.length === 0 ? (
        <div className="artwork-stroke relative grid aspect-square place-items-center overflow-hidden rounded-artwork-lg bg-gradient-to-br from-key via-key/75 to-key/35 shadow-[0_10px_20px_0_var(--radiosityShadowColor)]">
          <span className="grid size-20 place-items-center rounded-full bg-white/15 text-white shadow-lg backdrop-blur-md">
            <ArrowDown size={34} strokeWidth={2.2} />
          </span>
        </div>
      ) : (
        <div className="artwork-stroke relative grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden rounded-artwork-lg shadow-[0_10px_20px_0_var(--radiosityShadowColor)]">
          {Array.from({ length: 4 }, (_, i) => {
            const cover = covers[i];
            return cover ? (
              <img
                key={`${cover}-${i}`}
                src={cover}
                alt=""
                className="size-full object-cover"
                loading={i < 2 ? 'eager' : 'lazy'}
                draggable={false}
              />
            ) : (
              <div key={`empty-${i}`} className="grid size-full place-items-center bg-quaternary text-tertiary" aria-hidden="true">
                <Music2 size={26} strokeWidth={1.6} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActiveDownloadsPanel({ downloads }: { downloads: ActiveDownload[] }) {
  const now = useNow(downloads.length > 0);
  const downloading = downloads.filter((dl) => dl.status === 'downloading').length;

  return (
    <section
      className="mx-(--body-gutter) mt-7 overflow-hidden rounded-[16px] border border-key/20 bg-key/5 shadow-sm"
      aria-label="Active downloads"
    >
      <div className="h-0.5 bg-gradient-to-r from-key via-key/50 to-transparent" aria-hidden="true" />
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className={`absolute inline-flex size-full rounded-full opacity-70 ${downloading > 0 ? 'animate-ping bg-key' : 'bg-green'}`} />
              <span className={`relative inline-flex size-2 rounded-full ${downloading > 0 ? 'bg-key' : 'bg-green'}`} />
            </span>
            <span className="type-callout-emphasized uppercase tracking-[0.12em] text-secondary">
              {downloading > 0 ? 'Downloading' : 'Finishing up'}
            </span>
            <span className="rounded-full bg-key/10 px-1.5 py-0.5 type-caption-2 font-semibold tabular-nums text-key">
              {downloads.length}
            </span>
          </div>
          <span className="hidden type-caption-2 text-tertiary md:inline">You can keep browsing while these finish</span>
        </div>

        {downloads.map((dl) => (
          <div
            key={dl.videoId}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-page/55 p-2.5"
          >
            {dl.thumbnailUrl ? (
              <img
                src={dl.thumbnailUrl}
                alt=""
                className="size-11 flex-none rounded-lg bg-quaternary object-cover"
                draggable={false}
              />
            ) : (
              <div className="grid size-11 flex-none place-items-center rounded-lg bg-quaternary/80 text-secondary">
                <Music2 size={18} strokeWidth={1.8} />
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate type-body-emphasized">{dl.title}</p>
              <p className="truncate type-callout text-secondary">{dl.artist || 'Unknown Artist'}</p>
              {dl.status === 'downloading' && (
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-quaternary"
                    role="progressbar"
                    aria-label={`Downloading ${dl.title}`}
                  >
                    <span className="absolute inset-y-0 left-0 w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-key to-transparent" />
                  </div>
                  <span className="type-caption-2 tabular-nums text-secondary">{formatElapsed(now - dl.startedAt)}</span>
                </div>
              )}
              {dl.status === 'error' && dl.error && (
                <p className="mt-1 line-clamp-1 type-caption-2 text-red" title={dl.error}>
                  {dl.error}
                </p>
              )}
            </div>

            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 type-caption-2 font-semibold ${
                dl.status === 'downloading'
                  ? 'bg-key/10 text-key'
                  : dl.status === 'completed'
                    ? 'bg-green/10 text-green'
                    : 'bg-red/10 text-red'
              }`}
              aria-live="polite"
            >
              {dl.status === 'downloading' ? (
                <>
                  <ArrowDown size={12} className="animate-bounce" />
                  <span className="max-sm:hidden">Saving</span>
                </>
              ) : dl.status === 'completed' ? (
                <>
                  <CircleCheckBig size={12} strokeWidth={2.4} />
                  <span className="max-sm:hidden">Done</span>
                </>
              ) : (
                <>
                  <CircleAlert size={12} strokeWidth={2.4} />
                  <span className="max-sm:hidden">Failed</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FolderChip({
  label,
  count,
  subfolder,
  path,
}: {
  label: string;
  count: number;
  subfolder: string;
  path?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void openDownloadsFolder(subfolder)}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-divider/40 bg-page/60 px-3 type-caption-2 font-semibold text-secondary transition-colors hover:bg-quaternary/70 hover:text-primary"
      title={path ? `Open ${path}` : `Open ${label.toLowerCase()} folder`}
    >
      <FolderOpen size={13} />
      {label}
      <span className="tabular-nums text-tertiary">{count}</span>
    </button>
  );
}

function StorageFooter({
  folder,
  songs,
  lyrics,
  covers,
  checkedAt,
}: {
  folder: DownloadsFolderInfo | null;
  songs: number;
  lyrics: number;
  covers: number;
  checkedAt: string;
}) {
  return (
    <footer className="mx-(--body-gutter) mt-10 mb-12 rounded-[16px] border border-divider/40 bg-quaternary/20 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 flex-none place-items-center rounded-xl bg-quaternary/70 text-secondary">
            <HardDrive size={19} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="type-callout-emphasized">Stored on this device</p>
              <span className="type-caption-2 text-tertiary">{checkedAt}</span>
            </div>
            <p
              className="mt-0.5 truncate type-caption-2 text-secondary"
              title={folder?.path ?? undefined}
            >
              {folder?.path ?? 'Locating your music folder…'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FolderChip label="Songs" count={songs} subfolder="songs" path={folder?.songsPath} />
          <FolderChip label="Lyrics" count={lyrics} subfolder="lyrics" path={folder?.lyricsPath} />
          <FolderChip label="Artwork" count={covers} subfolder="thumbnails" path={folder?.thumbnailsPath} />
        </div>
      </div>
    </footer>
  );
}

function RefreshError({ message }: { message: string }) {
  const refresh = useDownloadsStore((s) => s.refresh);
  return (
    <div className="mx-(--body-gutter) mt-6 flex flex-col gap-3 rounded-[16px] border border-red/20 bg-red/5 p-4 sm:flex-row sm:items-center">
      <span className="grid size-10 flex-none place-items-center rounded-full bg-red/10 text-red">
        <CircleAlert size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-body-emphasized">Couldn’t read your downloads</p>
        <p className="mt-0.5 truncate type-callout text-secondary" title={message}>
          {message}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-key-bg px-3.5 type-callout-emphasized text-white transition-all hover:brightness-110 active:scale-95"
        >
          <RefreshCw size={13} />
          Try again
        </button>
        <button
          type="button"
          onClick={() => void openDownloadsFolder()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-quaternary/70 px-3.5 type-callout-emphasized text-secondary transition-colors hover:bg-quaternary hover:text-primary"
        >
          <FolderOpen size={13} />
          Open folder
        </button>
      </div>
    </div>
  );
}

function EmptyDownloads() {
  return (
    <div className="mx-(--body-gutter) mt-7">
      <div className="flex flex-col items-center rounded-[18px] border border-dashed border-divider/60 bg-quaternary/10 px-6 py-14 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-key/10 text-key">
          <Download size={27} strokeWidth={1.9} />
        </span>
        <p className="mt-4 type-title-2-emphasized">No downloaded songs yet</p>
        <p className="mt-1 max-w-[390px] type-body-tall text-secondary">
          Download a song from its ⋯ menu and it will appear here, ready to play without a connection.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <PrefetchLink
            to="/home"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-key-bg px-4 type-body-emphasized text-white transition-all hover:brightness-110 active:scale-95"
          >
            <Music2 size={15} />
            Browse music
          </PrefetchLink>
          <button
            type="button"
            onClick={() => void openDownloadsFolder()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-quaternary/70 px-4 type-body-emphasized text-secondary transition-colors hover:bg-quaternary hover:text-primary"
          >
            <FolderOpen size={15} />
            Open downloads folder
          </button>
        </div>
      </div>
    </div>
  );
}

function DownloadsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading downloads">
      <div className="mx-(--body-gutter) flex items-center justify-between pt-6">
        <SkeletonBlock width={32} height={32} radius="50%" />
        <div className="flex items-center gap-2">
          <SkeletonBlock width={36} height={36} radius="50%" />
          <SkeletonBlock width={36} height={36} radius="50%" />
        </div>
      </div>
      <div className="mx-(--body-gutter) mt-5 flex items-end gap-8 max-md:flex-col max-md:items-center">
        <SkeletonBlock width={270} aspectRatio="1" radius="var(--radius-artwork-large)" />
        <div className="min-w-0 flex-1 pb-2 max-md:w-full">
          <SkeletonLine lineHeight={20} fontSize={12} width={120} />
          <SkeletonLine lineHeight={44} fontSize={34} width={240} style={{ marginTop: 6 }} />
          <SkeletonLine lineHeight={18} fontSize={12} width={300} style={{ marginTop: 8 }} />
          <div className="mt-5 flex items-center gap-3">
            <SkeletonBlock width={36} height={36} radius="50%" />
            <SkeletonBlock width={150} height={36} radius="var(--radius-pill)" />
          </div>
        </div>
      </div>
      <div className="mx-(--body-gutter) mt-8">
        <SkeletonBlock height={56} radius={14} />
      </div>
      <div className="mx-(--body-gutter) mt-6 space-y-1">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <SkeletonBlock width={40} height={40} radius="var(--radius-artwork-small)" />
            <div className="min-w-0 flex-1">
              <SkeletonLine lineHeight={16} fontSize={13} width={`${38 + (i % 3) * 8}%`} />
              <SkeletonLine lineHeight={15} fontSize={11} width={`${22 + (i % 4) * 5}%`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DownloadsPage() {
  const isDesktop = isDesktopApp();
  const navigate = useNavigate();
  const downloaded = useDownloadsStore((s) => s.downloaded);
  const activeDownloads = useDownloadsStore((s) => s.activeDownloads);
  const initialized = useDownloadsStore((s) => s.initialized);
  const refreshing = useDownloadsStore((s) => s.refreshing);
  const error = useDownloadsStore((s) => s.error);
  const lastRefreshed = useDownloadsStore((s) => s.lastRefreshed);
  const refresh = useDownloadsStore((s) => s.refresh);
  const [folder, setFolder] = useState<DownloadsFolderInfo | null>(null);
  const [query, setQuery] = useState('');
  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('recent');

  // Every visit re-reads the folder; the shell's own call is deduplicated in the store.
  useEffect(() => {
    if (!isDesktop) return;
    void refresh();
  }, [isDesktop, refresh]);

  // Files can change while the app is open (another tool, a sync, the OS): re-read on return.
  useEffect(() => {
    if (!isDesktop) return;
    const reread = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', reread);
    return () => {
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', reread);
    };
  }, [isDesktop, refresh]);

  useEffect(() => {
    if (!isDesktop) return;
    let live = true;
    void getDownloadsFolder()
      .then((info) => {
        if (live) setFolder(info);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isDesktop]);

  const tracks = useMemo<Track[]>(() => downloaded.map(toTrackFromDownloaded), [downloaded]);
  const downloadMeta = useMemo(() => {
    const map: Record<string, DownloadRowMeta> = {};
    for (const item of downloaded) {
      const added = formatAdded(item.modified);
      map[item.localUrl] = {
        format: extensionOf(item),
        size: formatBytes(item.size),
        added: added.label,
        addedTitle: added.title,
        hasLyrics: Boolean(item.hasLyrics),
      };
    }
    return map;
  }, [downloaded]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = downloaded.filter((item) => {
      if (lyricsOnly && !item.hasLyrics) return false;
      if (!needle) return true;
      return `${item.title} ${item.artist} ${item.fileName}`.toLowerCase().includes(needle);
    });
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'title':
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.artist.localeCompare(b.artist);
        case 'artist':
          return a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title);
        case 'size':
          return b.size - a.size || a.title.localeCompare(b.title);
        default:
          return b.modified - a.modified || a.title.localeCompare(b.title);
      }
    });
  }, [downloaded, lyricsOnly, query, sort]);

  const filteredTracks = useMemo<Track[]>(() => filtered.map(toTrackFromDownloaded), [filtered]);
  const totalBytes = useMemo(() => downloaded.reduce((sum, item) => sum + item.size, 0), [downloaded]);
  const lyricsCount = useMemo(() => downloaded.filter((item) => item.hasLyrics).length, [downloaded]);
  const coverCount = useMemo(() => downloaded.filter((item) => item.thumbnail).length, [downloaded]);
  const covers = useMemo(
    () => downloaded.flatMap((item) => (item.thumbnail ? [item.thumbnail] : [])).slice(0, 4),
    [downloaded],
  );
  const activeList = Object.values(activeDownloads);
  const filtersActive = query.trim().length > 0 || lyricsOnly;
  const clearFilters = () => {
    setQuery('');
    setLyricsOnly(false);
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/home');
  };

  if (!isDesktop) {
    return (
      <>
        <PageHeader title="Downloads" back={true} />
        <div className={stateStyles.state}>
          <span className="grid size-16 place-items-center rounded-full bg-key/10 text-key">
            <MonitorDown size={28} strokeWidth={1.9} />
          </span>
          <p className={`${stateStyles.title} mt-2`}>Your offline library lives on the desktop</p>
          <p className={stateStyles.detail}>
            Download songs for offline playback in the BeatFlow desktop app. They stay with the rest of your library.
          </p>
          <a
            href={DESKTOP_RELEASES}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-pill bg-key-bg px-4 type-body-emphasized text-white transition-all hover:brightness-110 active:scale-95"
          >
            <Download size={15} />
            Get BeatFlow Desktop
          </a>
        </div>
      </>
    );
  }

  if (!initialized) return <DownloadsSkeleton />;

  const metaLine =
    tracks.length > 0
      ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} · ${formatBytes(totalBytes)}${
          lyricsCount > 0 ? ` · ${lyricsCount} with lyrics` : ''
        }`
      : 'Songs you save for offline listening will live here.';

  return (
    <div className="pb-12">
      <div className="mx-(--body-gutter) flex items-center justify-between gap-4 pt-6">
        <button
          type="button"
          onClick={goBack}
          className="grid size-8 place-items-center rounded-full bg-quaternary/60 text-secondary transition-all select-none hover:bg-quaternary hover:text-primary active:scale-95"
          aria-label="Back"
          title="Back"
        >
          <ChevronLeft size={19} strokeWidth={2.4} />
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden type-callout text-secondary sm:inline">
            {refreshing ? 'Refreshing…' : formatCheckedAt(lastRefreshed)}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className={`${detailButton.circle} transition-all active:scale-95`}
            aria-label="Refresh downloads"
            aria-busy={refreshing || undefined}
            title={refreshing ? 'Refreshing…' : 'Refresh downloads'}
            disabled={refreshing}
          >
            <RefreshCw size={16} strokeWidth={2.2} className={refreshing ? 'animate-spin' : undefined} />
          </button>
          <button
            type="button"
            onClick={() => void openDownloadsFolder()}
            className={`${detailButton.circle} transition-all active:scale-95`}
            aria-label="Open downloads folder"
            title="Open downloads folder"
          >
            <FolderOpen size={17} strokeWidth={2.1} />
          </button>
        </div>
      </div>

      <section className="mx-(--body-gutter) mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-8 gap-y-5 max-md:grid-cols-1 max-md:justify-items-center max-md:text-center">
        <HeroMosaic covers={covers} />
        <div className="flex min-w-0 flex-col pb-1 max-md:items-center">
          <span
            className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 type-caption-2 font-semibold uppercase tracking-[0.12em] max-md:self-center ${
              tracks.length > 0 ? 'bg-green/10 text-green' : 'bg-quaternary/60 text-secondary'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${tracks.length > 0 ? 'bg-green' : 'bg-tertiary'}`}
              aria-hidden="true"
            />
            {tracks.length > 0 ? 'Available offline' : 'Nothing saved yet'}
          </span>
          <h1 className="mt-3 type-header-emphasized">Downloads</h1>
          <p className="mt-1 type-callout-emphasized text-secondary">{metaLine}</p>
          {tracks.length > 0 && (
            <div className="mt-5 flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => shuffleList(tracks, CONTEXT)}
                className={`${detailButton.circle} transition-all active:scale-95`}
                aria-label="Shuffle all downloads"
                title="Shuffle all downloads"
              >
                <Shuffle size={18} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => playList(tracks, 0, CONTEXT)}
                className={detailButton.pill}
                title="Play all downloads"
              >
                <Play size={17} fill="currentColor" />
                <span>Play</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {activeList.length > 0 && <ActiveDownloadsPanel downloads={activeList} />}
      {error && <RefreshError message={error} />}

      {tracks.length > 0 && (
        <div className="mx-(--body-gutter) mt-8 flex flex-wrap items-center gap-2 rounded-[14px] border border-divider/40 bg-quaternary/20 p-2.5">
          <div className="relative min-w-[190px] flex-1 md:max-w-[330px]">
            <Search
              size={15}
              strokeWidth={2.4}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by song, artist, or file"
              aria-label="Search downloads"
              className="h-9 w-full rounded-full border border-search-border bg-page pr-8 pl-9 type-body text-primary transition-colors placeholder:text-tertiary focus:border-key/60 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-tertiary text-page"
                aria-label="Clear search"
              >
                <X size={12} strokeWidth={3} />
              </button>
            )}
          </div>

          <div className="relative inline-flex items-center">
            <ArrowUpDown
              size={13}
              className="pointer-events-none absolute left-2.5 text-secondary"
              aria-hidden="true"
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Sort downloads"
              className="h-9 cursor-pointer appearance-none rounded-full border border-divider/40 bg-page pr-8 pl-7 type-callout-emphasized text-primary transition-colors hover:bg-quaternary/50"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-secondary" aria-hidden="true" />
          </div>

          {lyricsCount > 0 && (
            <button
              type="button"
              aria-pressed={lyricsOnly}
              onClick={() => setLyricsOnly((value) => !value)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 type-callout-emphasized transition-colors ${
                lyricsOnly
                  ? 'border-key/40 bg-key/10 text-key'
                  : 'border-divider/40 bg-page text-secondary hover:bg-quaternary/50 hover:text-primary'
              }`}
            >
              <MicVocal size={14} strokeWidth={2.2} />
              With lyrics
              <span
                className={`rounded-full px-1.5 type-caption-2 font-semibold tabular-nums ${
                  lyricsOnly ? 'bg-key/15 text-key' : 'bg-quaternary/70 text-tertiary'
                }`}
              >
                {lyricsCount}
              </span>
            </button>
          )}

          <span className="ms-auto pe-1 type-callout text-secondary">
            {filtersActive ? `${filtered.length} of ${tracks.length} songs` : `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`}
          </span>
        </div>
      )}

      {tracks.length === 0 ? (
        !error && <EmptyDownloads />
      ) : filteredTracks.length === 0 ? (
        <div className="mx-(--body-gutter) mt-10 flex flex-col items-center gap-2 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-quaternary/60 text-secondary">
            <SearchX size={20} strokeWidth={1.9} />
          </span>
          <p className="mt-1 type-title-3-emphasized">
            No downloads match {query.trim() ? `“${query.trim()}”` : 'this filter'}
          </p>
          <p className="type-callout text-secondary">
            {lyricsOnly && !query.trim() ? 'Try turning off the lyrics filter.' : 'Try a different title, artist, or file name.'}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-1 rounded-full bg-quaternary/70 px-4 py-1.5 type-callout-emphasized text-primary transition-colors hover:bg-quaternary"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <TrackList
            tracks={filteredTracks}
            variant="downloads"
            source={SOURCE}
            downloadMeta={downloadMeta}
          />
        </div>
      )}

      <StorageFooter
        folder={folder}
        songs={tracks.length}
        lyrics={lyricsCount}
        covers={coverCount}
        checkedAt={refreshing ? 'Refreshing…' : formatCheckedAt(lastRefreshed)}
      />
    </div>
  );
}
