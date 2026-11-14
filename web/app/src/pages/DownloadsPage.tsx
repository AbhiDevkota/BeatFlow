import { FolderOpen, HardDrive, Play, RefreshCw, Shuffle, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isDesktopApp } from '@bitchord/shared/bridge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { playList, shuffleList } from '@/components/music/play';
import {
  deleteDownloadedTrack,
  getDownloadsFolder,
  listDownloadedTracks,
  openDownloadsFolder,
  toTrackFromDownloaded,
  type DownloadedItem,
  type DownloadsFolderInfo,
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
  const [folder, setFolder] = useState<DownloadsFolderInfo | null>(null);
  const [items, setItems] = useState<DownloadedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isDesktop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [f, list] = await Promise.all([getDownloadsFolder(), listDownloadedTracks()]);
      setFolder(f);
      setItems(list);
    } catch (e) {
      console.error('Failed to load downloads:', e);
    } finally {
      setLoading(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (fileName: string) => {
    await deleteDownloadedTrack(fileName);
    setItems((prev) => prev.filter((item) => item.fileName !== fileName));
  };

  const tracks: Track[] = items.map(toTrackFromDownloaded);
  const totalBytes = items.reduce((acc, it) => acc + it.size, 0);
  const context = { source: { title: 'Downloads', type: 'playlist' as const, id: 'downloads' } };

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <PageHeader title="Downloads" back={true} />
            {folder && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[5px] text-xs font-semibold tracking-wide ${
                  folder.isDev
                    ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                    : 'bg-primary/15 text-primary border border-primary/30'
                }`}
              >
                <HardDrive size={12} />
                {folder.folderName}
                {folder.isDev && <span className="text-[10px] uppercase font-bold opacity-80">(DEV)</span>}
              </span>
            )}
          </div>
          {folder?.path && (
            <p className="type-caption text-secondary/80 font-mono text-xs mt-1 truncate max-w-xl" title={folder.path}>
              {folder.path}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {tracks.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => playList(tracks, 0, context)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary text-white font-medium hover:brightness-110 active:scale-95 transition-all text-sm shadow-md"
              >
                <Play size={14} fill="currentColor" />
                Play All
              </button>
              <button
                type="button"
                onClick={() => shuffleList(tracks, context)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-secondary text-primary hover:bg-surface-tertiary transition-all text-sm"
                title="Shuffle"
              >
                <Shuffle size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void openDownloadsFolder()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-secondary hover:bg-surface-tertiary transition-all text-sm text-secondary hover:text-primary"
            title="Open folder in Explorer"
          >
            <FolderOpen size={14} />
            <span className="hidden sm:inline">Open Folder</span>
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1.5 rounded-full bg-surface-secondary hover:bg-surface-tertiary transition-all text-secondary hover:text-primary"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-secondary">Loading local downloads…</div>
      ) : tracks.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No downloaded tracks yet"
            detail={`Songs you download or place into your Music/${folder?.folderName ?? 'BeatFlow'} folder will appear here for offline playback.`}
          />
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={() => void openDownloadsFolder()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-secondary hover:bg-surface-tertiary text-sm font-medium transition-all"
            >
              <FolderOpen size={16} />
              Open {folder?.folderName ?? 'BeatFlow'} Folder
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TrackList tracks={tracks} variant="playlist" source={context.source} />

          <footer className="pt-4 border-t border-divider flex flex-col sm:flex-row justify-between text-xs text-secondary gap-2">
            <div>
              {items.length} {items.length === 1 ? 'song' : 'songs'} • {formatBytes(totalBytes)}
            </div>
            <div className="truncate max-w-md font-mono" title={folder?.path}>
              {folder?.path}
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
