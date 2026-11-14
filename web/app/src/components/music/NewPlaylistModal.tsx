import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { ListPlus, Loader2, X } from 'lucide-react';
import { useCreatePlaylist } from '@/data/music/queries';

export interface NewPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialVideoIds?: string[];
  onCreated?: (playlistId: string) => void;
}

/**
 * Theme-matching glass modal to create a new YouTube Music playlist.
 */
export function NewPlaylistModal({
  isOpen,
  onClose,
  initialVideoIds = [],
  onCreated,
}: NewPlaylistModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreatePlaylist();

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setError(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !createMutation.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, createMutation.isPending]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setError('Please enter a playlist title');
        return;
      }
      setError(null);

      try {
        const playlistId = await createMutation.mutateAsync({
          title: trimmedTitle,
          description: description.trim(),
          videoIds: initialVideoIds,
        });

        onClose();
        if (onCreated) {
          onCreated(playlistId);
        } else {
          navigate(`/playlist/${playlistId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create playlist');
      }
    },
    [title, description, initialVideoIds, createMutation, onClose, onCreated, navigate],
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/65 backdrop-blur-md p-4 animate-fade select-none"
      onClick={() => {
        if (!createMutation.isPending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="New Playlist"
    >
      <div
        className="w-[400px] max-w-[calc(100vw-32px)] rounded-[22px] bg-[#1c1c20]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-6 text-white animate-zoom relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={createMutation.isPending}
          className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all active:scale-95 cursor-pointer disabled:opacity-40"
          aria-label="Close"
        >
          <X size={15} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shadow-inner text-key">
            <ListPlus size={22} />
          </div>
          <div>
            <h3 className="text-[18px] font-semibold text-white tracking-tight">New Playlist</h3>
            <p className="text-[12.5px] text-white/60">Create a private YouTube Music playlist</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label htmlFor="playlist-title" className="block text-[12px] font-medium text-white/70 mb-1.5">
              Title <span className="text-key">*</span>
            </label>
            <input
              id="playlist-title"
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Playlist"
              disabled={createMutation.isPending}
              maxLength={150}
              className="w-full px-3.5 py-2.5 rounded-[12px] bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-[14px] focus:outline-none focus:border-key/60 focus:bg-white/10 transition-all"
            />
          </div>

          <div>
            <label htmlFor="playlist-description" className="block text-[12px] font-medium text-white/70 mb-1.5">
              Description <span className="text-white/40 text-[11px]">(optional)</span>
            </label>
            <textarea
              id="playlist-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Give your playlist a description"
              disabled={createMutation.isPending}
              maxLength={500}
              className="w-full px-3.5 py-2.5 rounded-[12px] bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-[13px] resize-none focus:outline-none focus:border-key/60 focus:bg-white/10 transition-all"
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-[8px]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 rounded-[12px] bg-white/5 hover:bg-white/10 text-[13px] font-medium text-white/70 hover:text-white transition-all cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-[12px] bg-key hover:bg-key/90 text-[13px] font-semibold text-white shadow-md shadow-key/20 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              <span>{createMutation.isPending ? 'Creating…' : 'Create'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
