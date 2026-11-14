import { ArrowDown, CheckCircle2, FolderOpen, Play, Shuffle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isDesktopApp } from '@bitchord/shared/bridge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { playList, shuffleList } from '@/components/music/play';
import {
  openDownloadsFolder,
  toTrackFromDownloaded,
  useDownloadsStore,
} from '@/data/downloads/desktopDownloads';
import type { Track } from '@/data/music/types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DownloadsPage() {
  const isDesktop = isDesktopApp();
  const downloaded = useDownloadsStore((s) => s.downloaded);
  const activeDownloads = useDownloadsStore((s) => s.activeDownloads);
  const initialized = useDownloadsStore((s) => s.initialized);
  const refresh = useDownloadsStore((s) => s.refresh);
  const [loading, setLoading] = useState(!initialized);

  useEffect(() => {
    if (!isDesktop) return;
    if (!initialized) {
      setLoading(true);
      void refresh().finally(() => setLoading(false));
    }
  }, [isDesktop, initialized, refresh]);

  if (!isDesktop) {
    return (
      <>
        <PageHeader title="Downloads" back={true} />
        <EmptyState
          title="Desktop Offline Storage"
          detail="Downloads and offline playback are available in the BeatFlow Desktop application."
        />
      </>
    );
  }

  const tracks: Track[] = downloaded.map(toTrackFromDownloaded);
  const totalBytes = downloaded.reduce((acc, it) => acc + it.size, 0);
  const context = { source: { title: 'Downloads', type: 'playlist' as const, id: 'downloads' } };
  const activeList = Object.values(activeDownloads);

  const headerActions = (
    <div className="flex items-center gap-2">
      {tracks.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => playList(tracks, 0, context)}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-key text-white font-medium hover:brightness-110 active:scale-95 transition-all text-sm shadow-md cursor-pointer"
          >
            <Play size={14} fill="currentColor" />
            Play All
          </button>
          <button
            type="button"
            onClick={() => shuffleList(tracks, context)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-quaternary/60 text-secondary hover:text-primary hover:bg-quaternary transition-all text-sm cursor-pointer"
            title="Shuffle"
          >
            <Shuffle size={14} />
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => void openDownloadsFolder()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-quaternary/60 hover:bg-quaternary transition-all text-sm text-secondary hover:text-primary cursor-pointer"
        title="Open Downloads Folder"
      >
        <FolderOpen size={14} />
        <span className="hidden sm:inline">Open Folder</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title="Downloads"
          back={true}
          action={headerActions}
        />
        <p className="type-callout text-secondary mt-1">
          {tracks.length > 0
            ? `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} • ${formatBytes(totalBytes)}`
            : 'Offline music on this device'}
        </p>
      </div>

      {/* Real-time active downloading queue */}
      {activeList.length > 0 && (
        <div className="rounded-[14px] bg-quaternary/40 border border-quaternary/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-key opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-key" />
              </span>
              Downloading ({activeList.length})
            </span>
          </div>

          <div className="space-y-2">
            {activeList.map((dl) => (
              <div
                key={dl.videoId}
                className="flex items-center justify-between gap-3 p-2 rounded-xl bg-surface-secondary/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {dl.thumbnailUrl ? (
                    <img
                      src={dl.thumbnailUrl}
                      alt=""
                      className="size-9 rounded-lg object-cover flex-none bg-quaternary"
                    />
                  ) : (
                    <div className="size-9 rounded-lg bg-quaternary/80 flex items-center justify-center flex-none text-secondary">
                      <ArrowDown size={16} className="animate-bounce" />
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{dl.title}</span>
                    <span className="text-xs text-secondary truncate">{dl.artist}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-none">
                  {dl.status === 'downloading' && (
                    <span className="text-xs text-key font-medium flex items-center gap-1.5">
                      <ArrowDown size={12} className="animate-bounce" />
                      Downloading…
                    </span>
                  )}
                  {dl.status === 'completed' && (
                    <span className="text-xs text-green font-medium flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      Downloaded
                    </span>
                  )}
                  {dl.status === 'error' && (
                    <span className="text-xs text-red font-medium">Failed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-secondary">Loading local downloads…</div>
      ) : tracks.length === 0 && activeList.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No downloaded tracks yet"
            detail="Songs you download for offline playback will appear here automatically in real time."
          />
          <div className="flex justify-center mt-5">
            <button
              type="button"
              onClick={() => void openDownloadsFolder()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-quaternary/70 hover:bg-quaternary text-sm font-medium transition-all cursor-pointer"
            >
              <FolderOpen size={16} />
              Open Downloads Folder
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TrackList tracks={tracks} variant="playlist" source={context.source} />
        </div>
      )}
    </div>
  );
}
