import {
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  CircleCheckBig,
  Download,
  MicVocal,
  MonitorDown,
  Music2,
  Play,
  Search,
  SearchX,
  Shuffle,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { isDesktopApp } from '@bitchord/shared/bridge';
import { PageHeader } from '@/components/PageHeader';
import { Select, type SelectOption } from '@/components/Select';
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';
import { detailButton } from '@/components/music/DetailHeader';
import { stateStyles } from '@/components/music/States';
import { TrackList, type DownloadRowMeta } from '@/components/music/TrackList';
import { playList, shuffleList } from '@/components/music/play';
import { formatDuration } from '@/components/music/links';
import {
  toTrackFromDownloaded,
  useDownloadsStore,
  type ActiveDownload,
  type DownloadedItem,
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

const SORT_OPTIONS: readonly SelectOption<SortKey>[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'size', label: 'Largest first' },
];

function HeroMosaic({ covers }: { covers: string[] }) {
  const count = covers.length;
  const hasCovers = count > 0;

  return (
    <div className="relative w-[270px] self-start rounded-artwork-lg shadow-[0_10px_20px_0_var(--radiosityShadowColor)] [grid-area:artwork] max-lg:w-[220px] max-md:w-[min(270px,70vw)]">
      {hasCovers ? (
        <>
          {/* Apple-style radiosity ambient glow behind the artwork */}
          <div className="absolute inset-0 -z-1 scale-90 opacity-35 blur-[24px] saturate-200" aria-hidden="true">
            {count === 1 ? (
              <img src={covers[0]} alt="" className="size-full rounded-artwork-lg object-cover" draggable={false} />
            ) : count === 2 ? (
              <div className="grid aspect-square size-full grid-cols-2 gap-0.5 overflow-hidden rounded-artwork-lg">
                <img src={covers[0]} alt="" className="size-full object-cover" draggable={false} />
                <img src={covers[1]} alt="" className="size-full object-cover" draggable={false} />
              </div>
            ) : count === 3 ? (
              <div className="grid aspect-square size-full grid-cols-2 gap-0.5 overflow-hidden rounded-artwork-lg">
                <img src={covers[0]} alt="" className="size-full object-cover" draggable={false} />
                <div className="grid size-full grid-rows-2 gap-0.5">
                  <img src={covers[1]} alt="" className="size-full object-cover" draggable={false} />
                  <img src={covers[2]} alt="" className="size-full object-cover" draggable={false} />
                </div>
              </div>
            ) : (
              <div className="grid aspect-square size-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-artwork-lg">
                {covers.slice(0, 4).map((c, i) => (
                  <img key={i} src={c} alt="" className="size-full object-cover" draggable={false} />
                ))}
              </div>
            )}
          </div>

          {/* Front composite mosaic artwork */}
          <div className="artwork-stroke relative aspect-square size-full overflow-hidden rounded-artwork-lg shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
            {count === 1 ? (
              <img src={covers[0]} alt="" className="size-full object-cover" loading="eager" draggable={false} />
            ) : count === 2 ? (
              <div className="grid size-full grid-cols-2 gap-[1.5px] bg-black/40">
                <img src={covers[0]} alt="" className="size-full object-cover" loading="eager" draggable={false} />
                <img src={covers[1]} alt="" className="size-full object-cover" loading="eager" draggable={false} />
              </div>
            ) : count === 3 ? (
              <div className="grid size-full grid-cols-2 gap-[1.5px] bg-black/40">
                <img src={covers[0]} alt="" className="size-full object-cover" loading="eager" draggable={false} />
                <div className="grid size-full grid-rows-2 gap-[1.5px]">
                  <img src={covers[1]} alt="" className="size-full object-cover" loading="eager" draggable={false} />
                  <img src={covers[2]} alt="" className="size-full object-cover" loading="eager" draggable={false} />
                </div>
              </div>
            ) : (
              <div className="grid size-full grid-cols-2 grid-rows-2 gap-[1.5px] bg-black/40">
                {covers.slice(0, 4).map((c, i) => (
                  <img key={i} src={c} alt="" className="size-full object-cover" loading="eager" draggable={false} />
                ))}
              </div>
            )}

            {/* Subtle inner glass highlight */}
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),inset_0_-1px_0_0_rgba(0,0,0,0.3)]" />

            {/* Floating Apple-style download library badge */}
            <div
              className="absolute right-2.5 bottom-2.5 flex size-8 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] backdrop-blur-xl ring-1 ring-black/40"
              title="Downloaded Library"
              aria-hidden="true"
            >
              <ArrowDown size={16} strokeWidth={2.6} className="drop-shadow-xs" />
            </div>
          </div>
        </>
      ) : (
        /* Empty downloads state: bespoke Apple Music editorial sleeve */
        <div className="artwork-stroke relative grid aspect-square size-full place-items-center overflow-hidden rounded-artwork-lg bg-gradient-to-br from-[#1c1c1f] via-[#141416] to-[#0c0c0e] shadow-[0_16px_36px_-8px_rgba(0,0,0,0.6)] select-none">
          {/* Ambient radial accent glow */}
          <div className="pointer-events-none absolute -top-12 -right-12 size-48 rounded-full bg-key/25 blur-[40px]" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 size-40 rounded-full bg-key/15 blur-[35px]" />

          {/* Concentric disc grooves */}
          <div className="pointer-events-none absolute inset-6 rounded-full border border-white/[0.04]" />
          <div className="pointer-events-none absolute inset-12 rounded-full border border-white/[0.06]" />
          <div className="pointer-events-none absolute inset-20 rounded-full border border-white/[0.08]" />

          {/* Center frosted glass plate */}
          <div className="relative flex flex-col items-center gap-2.5">
            <div className="grid size-20 place-items-center rounded-2xl border border-white/15 bg-white/[0.08] text-white shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.25)] backdrop-blur-xl">
              <Download size={34} strokeWidth={2.2} className="text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]" />
            </div>
            <span className="type-[700_10px/12px] font-semibold uppercase tracking-[0.22em] text-white/50 drop-shadow-xs">
              Downloads
            </span>
          </div>

          {/* Inner specular glass rim */}
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),inset_0_-1px_0_0_rgba(0,0,0,0.4)]" />
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

function RefreshError({ message }: { message: string }) {
  return (
    <div className="mx-(--body-gutter) mt-6 flex items-center gap-3 rounded-[16px] border border-red/20 bg-red/5 p-4">
      <span className="grid size-10 flex-none place-items-center rounded-full bg-red/10 text-red">
        <CircleAlert size={20} />
      </span>
      <div className="min-w-0">
        <p className="type-body-emphasized">Couldn’t read your downloads</p>
        <p className="mt-0.5 truncate type-callout text-secondary" title={message}>
          {message}
        </p>
      </div>
    </div>
  );
}

function EmptyDownloads() {
  return (
    <div className="mx-(--body-gutter) mt-7 flex flex-col items-center py-14 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-key/10 text-key">
        <Download size={34} strokeWidth={1.9} />
      </span>
      <p className="mt-5 type-title-2-emphasized">No downloaded songs yet</p>
      <p className="mt-1 max-w-[390px] type-body-tall text-secondary">
        Download a song from its ⋯ menu and it will appear here, ready to play without a connection.
      </p>
    </div>
  );
}

function DownloadsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading downloads">
      <div className="mx-(--body-gutter) pt-6">
        <SkeletonBlock width={32} height={32} radius="50%" />
      </div>
      <div className="mx-(--body-gutter) mt-5 flex items-end gap-8 max-md:flex-col max-md:items-center">
        <SkeletonBlock width={270} aspectRatio="1" radius="var(--radius-artwork-large)" />
        <div className="min-w-0 flex-1 pb-2 max-md:w-full">
          <SkeletonLine lineHeight={44} fontSize={34} width={240} />
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
  const initialized = useDownloadsStore((s) => s.initialized);
  const error = useDownloadsStore((s) => s.error);
  const refresh = useDownloadsStore((s) => s.refresh);
  const [query, setQuery] = useState('');
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
  }, [downloaded, query, sort]);

  const filteredTracks = useMemo<Track[]>(() => filtered.map(toTrackFromDownloaded), [filtered]);
  const totalBytes = useMemo(() => downloaded.reduce((sum, item) => sum + item.size, 0), [downloaded]);
  const totalDurationSec = useMemo(() => downloaded.reduce((sum, item) => sum + (item.durationSec || 0), 0), [downloaded]);
  const filtersActive = query.trim().length > 0;
  const clearFilters = () => {
    setQuery('');
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

  const activeDownloads = useDownloadsStore((s) => s.activeDownloads);
  const activeList = useMemo(() => Object.values(activeDownloads), [activeDownloads]);

  const covers = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of downloaded) {
      const url = item.thumbnail;
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push(url);
      }
    }
    return list;
  }, [downloaded]);

  const metaLine =
    tracks.length > 0
      ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} · ${formatDuration(totalDurationSec)} · ${formatBytes(totalBytes)}`
      : 'Songs you save for offline listening will live here.';

  return (
    <div className="pb-12">
      <div className="mx-(--body-gutter) pt-6 -mb-5 flex items-center">
        <button
          type="button"
          onClick={goBack}
          className="grid size-8 place-items-center rounded-full bg-quaternary/60 text-secondary transition-all select-none hover:bg-quaternary hover:text-primary active:scale-95"
          aria-label="Back"
          title="Back"
        >
          <ChevronLeft size={19} strokeWidth={2.4} />
        </button>
      </div>

      <div className="mx-(--body-gutter) mb-8 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_1fr_auto] gap-x-[34px] pt-11 [grid-template-areas:'artwork_headings'_'artwork_description'_'artwork_actions'] max-md:grid-cols-[1fr] max-md:grid-rows-[auto] max-md:justify-items-center max-md:pt-4 max-md:text-center max-md:[grid-template-areas:'artwork'_'headings'_'actions'_'description']">
        <HeroMosaic covers={covers} />

        <div className="flex flex-col pt-[37px] [grid-area:headings] max-md:items-center max-md:pt-5">
          <h1 className="flex items-center type-large-title-emphasized leading-[30px] max-md:justify-center">
            Downloads
          </h1>
          <p className="mt-1 type-callout-emphasized text-secondary">{metaLine}</p>
        </div>

        {tracks.length > 0 && (
          <div className="mt-3.5 flex items-center gap-3.5 self-end [grid-area:actions]">
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

      {activeList.length > 0 && <ActiveDownloadsPanel downloads={activeList} />}

      {error && <RefreshError message={error} />}

      {tracks.length > 0 && (
        <div className="mx-(--body-gutter) mt-8 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 md:max-w-[360px]">
            <Search
              size={15}
              strokeWidth={2.4}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-secondary"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by song, artist, or file"
              aria-label="Search downloads"
              className="h-[38px] w-full rounded-pill border border-search-border bg-page pt-1.5 pr-[30px] pb-[5px] pl-7 type-body text-primary placeholder:text-tertiary transition-colors focus:border-key/60 [&::-webkit-search-cancel-button]:hidden"
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

          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={14} className="text-secondary" aria-hidden="true" />
            <Select<SortKey>
              value={sort}
              options={SORT_OPTIONS}
              onChange={setSort}
              label="Sort downloads"
            />
          </div>

          <span className="ms-auto type-callout text-secondary">
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
            {query.trim() ? 'Try a different title, artist, or file name.' : 'Try a different title, artist, or file name.'}
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
    </div>
  );
}
