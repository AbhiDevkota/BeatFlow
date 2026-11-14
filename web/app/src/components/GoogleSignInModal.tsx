import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, ArrowLeft, CheckCircle2, Clipboard, ExternalLink, Loader2, X } from 'lucide-react';
import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { GoogleLogo } from '@/shell/AccountButton';

export const DEFAULT_GOOGLE_SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&prompt=select_account&continue=https%3A%2F%2Fmusic.youtube.com%2F';

export interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  url?: string;
}

type ModalMode = 'choose' | 'browser-waiting' | 'paste-cookies' | 'success';

/**
 * Theme-matching modal for Google Sign-In on BeatFlow.
 * Offers "Continue in BeatFlow" (in-app window with auto session detection)
 * vs "Open in Browser" (interactive browser launch with CDP session capture or cookie paste).
 */
export function GoogleSignInModal({
  isOpen,
  onClose,
  url = DEFAULT_GOOGLE_SIGN_IN_URL,
}: GoogleSignInModalProps) {
  const [mode, setMode] = useState<ModalMode>('choose');
  const [pastedCookies, setPastedCookies] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setMode('choose');
      setPastedCookies('');
      setIsSubmitting(false);
      setErrorMsg(null);
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

  // Listen for auth detection from background browser CDP or in-app login window
  useEffect(() => {
    if (!isOpen) return;
    const onAuthDetected = (e: Event) => {
      const customEvent = e as CustomEvent;
      const auth = customEvent.detail;
      const name = auth?.active?.name || auth?.accounts?.[0]?.name || 'Account';
      setAccountName(name);
      setMode('success');
      setTimeout(() => {
        onClose();
      }, 1300);
    };
    window.addEventListener('beatflow:yt-auth-detected', onAuthDetected);
    return () => window.removeEventListener('beatflow:yt-auth-detected', onAuthDetected);
  }, [isOpen, onClose]);

  const handleContinueHere = useCallback(() => {
    if (isDesktopApp()) {
      void desktopBridge()?.call('auth.openLoginWindow', { url });
    } else {
      window.open(url, 'google_login', 'width=520,height=720,menubar=no,toolbar=no');
    }
    onClose();
  }, [onClose, url]);

  const handleOpenInBrowser = useCallback(() => {
    if (isDesktopApp()) {
      void desktopBridge()?.call('auth.startBrowserSignIn', { url });
      setMode('browser-waiting');
    } else {
      window.open(url, '_blank', 'noreferrer');
      onClose();
    }
  }, [onClose, url]);

  const handleSavePastedCookies = useCallback(async () => {
    const raw = pastedCookies.trim();
    if (!raw) {
      setErrorMsg('Please paste cookies from YouTube Music.');
      return;
    }
    if (!raw.includes('SAPISID=') && !raw.includes('__Secure-3PAPISID=')) {
      setErrorMsg('Cookies must include SAPISID. Copy from music.youtube.com.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      if (isDesktopApp()) {
        await desktopBridge()?.call('auth.saveSession', { cookies: raw });
      } else {
        setErrorMsg('Manual cookie import is available in the desktop app.');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setIsSubmitting(false);
    }
  }, [pastedCookies]);

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
        className="w-[400px] max-w-[calc(100vw-32px)] rounded-[22px] bg-[#1c1c20]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-6 text-white animate-zoom relative flex flex-col items-center text-center"
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
        {mode === 'success' && (
          <div className="flex flex-col items-center py-4 animate-fade">
            <div className="size-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-3.5 text-emerald-400">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-[18px] font-semibold text-white tracking-tight">Connected!</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/70">
              Signed in as <span className="font-semibold text-white">{accountName}</span>. Syncing playlists and library...
            </p>
          </div>
        )}

        {/* Mode 1: Selection screen */}
        {mode === 'choose' && (
          <>
            <div className="size-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-3.5 shadow-inner">
              <GoogleLogo size={28} />
            </div>

            <h3 className="text-[18px] font-semibold text-white tracking-tight">Sign in with Google</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/70 max-w-[320px]">
              Connect your YouTube Music account to sync your playlists, liked songs, and library.
            </p>

            <div className="w-full mt-5 flex flex-col gap-2.5">
              {/* Option 1: Continue in BeatFlow */}
              <button
                type="button"
                onClick={handleContinueHere}
                className="group w-full flex items-center gap-3.5 p-3 rounded-[14px] bg-key/90 hover:bg-key active:scale-[0.98] text-white transition-all text-left shadow-md shadow-key/20 cursor-pointer"
              >
                <div className="size-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <AppWindow size={19} className="text-white" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[14px] font-semibold leading-tight text-white">Continue in BeatFlow</span>
                  <span className="text-[12px] text-white/80 leading-tight mt-0.5 truncate">
                    Sign in inside the app with automatic profile detection
                  </span>
                </div>
              </button>

              {/* Option 2: Open in default browser */}
              <button
                type="button"
                onClick={handleOpenInBrowser}
                className="group w-full flex items-center gap-3.5 p-3 rounded-[14px] bg-white/5 hover:bg-white/10 border border-white/10 active:scale-[0.98] text-white transition-all text-left cursor-pointer"
              >
                <div className="size-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white/80 group-hover:text-white">
                  <ExternalLink size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[14px] font-semibold leading-tight text-white">Open in Browser</span>
                  <span className="text-[12px] text-white/70 leading-tight mt-0.5 truncate">
                    Sign in with your browser and sync session
                  </span>
                </div>
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

        {/* Mode 2: Waiting for external browser sign-in */}
        {mode === 'browser-waiting' && (
          <div className="w-full flex flex-col items-center animate-fade">
            <div className="relative size-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-3.5">
              <ExternalLink size={24} className="text-white/80" />
              <div className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            </div>

            <h3 className="text-[17px] font-semibold text-white tracking-tight">Signing in via Browser...</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/70 max-w-[320px]">
              A browser window has opened for Google sign-in. Sign in to your account, and when YouTube Music loads, <strong>close that browser window</strong> to finish.
            </p>

            <div className="w-full mt-4 p-3 rounded-[12px] bg-white/5 border border-white/10 text-left text-[12px] text-white/80 flex flex-col gap-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin text-white/70" />
                Waiting for browser window to close...
              </span>
              <span className="text-white/60 leading-normal">
                BeatFlow will automatically capture the session once the sign-in window is closed.
              </span>
            </div>

            <div className="w-full mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setMode('paste-cookies')}
                className="flex items-center gap-1.5 text-[12.5px] text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <Clipboard size={14} />
                <span>Paste cookies instead</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-[12.5px] font-medium text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Mode 3: Manual Cookie Paste */}
        {mode === 'paste-cookies' && (
          <div className="w-full flex flex-col items-center animate-fade">
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="absolute left-4 top-4 grid size-7 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all active:scale-95 cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft size={15} />
            </button>

            <div className="size-12 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-3">
              <Clipboard size={22} className="text-white/80" />
            </div>

            <h3 className="text-[17px] font-semibold text-white tracking-tight">Paste Session Cookies</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/70 max-w-[320px]">
              Copy the cookies from <span className="text-white font-medium">music.youtube.com</span> (containing SAPISID) and paste them below:
            </p>

            <div className="w-full mt-3.5 flex flex-col gap-2">
              <textarea
                value={pastedCookies}
                onChange={(e) => {
                  setPastedCookies(e.target.value);
                  setErrorMsg(null);
                }}
                rows={4}
                placeholder="SAPISID=...; SID=...; HSID=..."
                className="w-full p-2.5 rounded-[12px] bg-black/40 border border-white/15 text-[12px] text-white font-mono placeholder:text-white/30 focus:outline-none focus:border-white/40 resize-none"
              />

              {errorMsg && (
                <span className="text-[12px] text-red-400 leading-tight text-left">
                  {errorMsg}
                </span>
              )}

              <button
                type="button"
                onClick={() => void handleSavePastedCookies()}
                disabled={isSubmitting || !pastedCookies.trim()}
                className="w-full mt-1 py-2.5 rounded-[12px] bg-key/90 hover:bg-key active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none text-[13.5px] font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-key/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Connect Account</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
