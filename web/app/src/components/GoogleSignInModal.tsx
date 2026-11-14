import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, CheckCircle2, X } from 'lucide-react';
import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { GoogleLogo } from '@/shell/AccountButton';

export const DEFAULT_GOOGLE_SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&prompt=select_account&continue=https%3A%2F%2Fmusic.youtube.com%2F';

export interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  url?: string;
}

/**
 * Theme-matching modal for Google Sign-In on BeatFlow.
 * Clean in-app sign-in with automatic profile detection and session sync.
 */
export function GoogleSignInModal({
  isOpen,
  onClose,
  url = DEFAULT_GOOGLE_SIGN_IN_URL,
}: GoogleSignInModalProps) {
  const [success, setSuccess] = useState(false);
  const [accountName, setAccountName] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSuccess(false);
      setAccountName(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Listen for auth detection from in-app login window
  useEffect(() => {
    if (!isOpen) return;
    const onAuthDetected = (e: Event) => {
      const customEvent = e as CustomEvent;
      const auth = customEvent.detail;
      const name = auth?.active?.name || auth?.accounts?.[0]?.name || 'Account';
      setAccountName(name);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    };
    window.addEventListener('beatflow:yt-auth-detected', onAuthDetected);
    return () => window.removeEventListener('beatflow:yt-auth-detected', onAuthDetected);
  }, [isOpen, onClose]);

  const handleSignIn = useCallback(() => {
    if (isDesktopApp()) {
      void desktopBridge()?.call('auth.openLoginWindow', { url });
    } else {
      window.open(url, 'google_login', 'width=520,height=720,menubar=no,toolbar=no');
    }
    onClose();
  }, [onClose, url]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/65 backdrop-blur-md p-4 animate-fade select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in with Google"
    >
      <div
        className="w-[380px] max-w-[calc(100vw-32px)] rounded-[22px] bg-[#1c1c20]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-6 text-white animate-zoom relative flex flex-col items-center text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all active:scale-95 cursor-pointer"
          aria-label="Close"
        >
          <X size={15} />
        </button>

        {/* Success screen */}
        {success ? (
          <div className="flex flex-col items-center py-4 animate-fade">
            <div className="size-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-3.5 text-emerald-400">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-[18px] font-semibold text-white tracking-tight">Connected!</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/70">
              Signed in as <span className="font-semibold text-white">{accountName}</span>. Syncing playlists and library...
            </p>
          </div>
        ) : (
          <>
            <div className="size-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-3.5 shadow-inner">
              <GoogleLogo size={28} />
            </div>

            <h3 className="text-[18px] font-semibold text-white tracking-tight">Sign in with Google</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/70 max-w-[300px]">
              Sign in to YouTube Music to sync your playlists, liked songs, and music library.
            </p>

            <div className="w-full mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleSignIn}
                className="group w-full flex items-center justify-center gap-3 p-3 rounded-[14px] bg-key/90 hover:bg-key active:scale-[0.98] text-white transition-all text-center shadow-md shadow-key/20 cursor-pointer"
              >
                <AppWindow size={18} className="text-white" />
                <span className="text-[14px] font-semibold text-white">Sign in within BeatFlow</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-4 text-[12.5px] font-medium text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
