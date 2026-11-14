import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LogIn, UserCheck, X } from 'lucide-react';
import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { queryClient } from '@/lib/queryClient';
import { ytAuthQueryKey } from '@/extension/useYtAuth';

export interface ProfileData {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  handle?: string | null;
  authUser?: string;
  cookies?: string;
}

export interface UseProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: ProfileData | null;
  onSuccess?: () => void;
}

/**
 * Prompt modal: "Use this profile in YouTube Music?"
 * Appears when an account profile is detected from sign-in, allowing the user
 * to confirm and activate their YouTube Music profile in BeatFlow.
 */
export function UseProfileModal({
  isOpen,
  onClose,
  profile,
  onSuccess,
}: UseProfileModalProps) {
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState(profile?.name || 'YouTube Music User');
  const [email, setEmail] = useState(profile?.email || '');

  useEffect(() => {
    if (profile) {
      if (profile.name) setName(profile.name);
      if (profile.email) setEmail(profile.email);
    }
  }, [profile]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleUseProfile = useCallback(async () => {
    setConnecting(true);
    try {
      const bridge = desktopBridge();
      if (bridge) {
        const payload = {
          name: name.trim() || profile?.name || 'YouTube Music User',
          email: email.trim() || profile?.email || null,
          avatarUrl: profile?.avatarUrl || null,
          handle: profile?.handle || null,
          authUser: profile?.authUser || '0',
          cookies: profile?.cookies || '',
        };
        const newState = await bridge.call('yt.saveProfile', payload);
        queryClient.setQueryData(ytAuthQueryKey, newState);
        void queryClient.invalidateQueries({ queryKey: ytAuthQueryKey });
        void queryClient.invalidateQueries({ queryKey: ['music'] });
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('Failed to activate profile:', e);
    } finally {
      setConnecting(false);
    }
  }, [name, email, profile, onSuccess, onClose]);

  const handleSwitchAccount = useCallback(() => {
    onClose();
    if (isDesktopApp()) {
      void desktopBridge()?.call('auth.openLoginWindow', {
        url: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F',
      });
    } else {
      window.open('https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F', '_blank');
    }
  }, [onClose]);

  if (!isOpen) return null;

  const displayName = name || profile?.name || 'YouTube Music User';
  const displayEmail = email || profile?.email || profile?.handle || 'Google Account';
  const avatarUrl = profile?.avatarUrl;

  return createPortal(
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/65 backdrop-blur-md p-4 animate-fade select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Use this profile in YouTube Music"
    >
      <div
        className="w-[410px] max-w-[calc(100vw-32px)] rounded-[22px] bg-[#1c1c20]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-6 text-white animate-zoom relative flex flex-col items-center text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all active:scale-95"
          aria-label="Close"
        >
          <X size={15} />
        </button>

        {/* Profile Avatar Badge */}
        <div className="relative mb-3.5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="size-16 rounded-full object-cover border-2 border-key shadow-lg shadow-key/30"
            />
          ) : (
            <div className="size-16 rounded-full bg-key/20 border-2 border-key text-key flex items-center justify-center text-2xl font-bold shadow-lg shadow-key/20">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-key text-white flex items-center justify-center border-2 border-[#1c1c20] shadow-sm">
            <Check size={13} strokeWidth={3} />
          </div>
        </div>

        <h3 className="text-[19px] font-semibold text-white tracking-tight">
          Use this profile in YouTube Music?
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-white/70 max-w-[320px]">
          Connect this account to sync your liked songs, personal library, playlists, and history.
        </p>

        {/* Profile Card */}
        <div className="w-full mt-4 p-3.5 rounded-[14px] bg-white/5 border border-white/10 flex items-center gap-3 text-left">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-11 rounded-full object-cover shrink-0 border border-white/10"
            />
          ) : (
            <div className="size-11 rounded-full bg-quaternary flex items-center justify-center text-base font-semibold shrink-0">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[14.5px] font-semibold text-white truncate">{displayName}</span>
            <span className="text-[12px] text-white/60 truncate mt-0.5">{displayEmail}</span>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-key/20 text-key shrink-0">
            <UserCheck size={12} />
            Ready
          </span>
        </div>

        {/* Action Buttons */}
        <div className="w-full mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleUseProfile}
            disabled={connecting}
            className="w-full py-3 rounded-[12px] bg-key hover:brightness-110 active:scale-[0.98] text-white font-semibold text-[14px] transition-all shadow-md shadow-key/30 flex items-center justify-center gap-2"
          >
            <Check size={17} strokeWidth={2.5} />
            <span>{connecting ? 'Connecting…' : 'Use this Profile'}</span>
          </button>

          <button
            type="button"
            onClick={handleSwitchAccount}
            className="w-full py-2.5 rounded-[12px] bg-white/5 hover:bg-white/10 border border-white/10 active:scale-[0.98] text-white/80 hover:text-white font-medium text-[13px] transition-all flex items-center justify-center gap-2"
          >
            <LogIn size={15} />
            <span>Switch Account / Sign in with Another</span>
          </button>
        </div>

        {/* Cancel */}
        <button
          type="button"
          onClick={onClose}
          className="mt-3.5 text-[12.5px] font-medium text-white/50 hover:text-white transition-colors"
        >
          Not now
        </button>
      </div>
    </div>,
    document.body,
  );
}
