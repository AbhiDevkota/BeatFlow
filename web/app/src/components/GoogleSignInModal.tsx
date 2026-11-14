import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, ExternalLink, UserCheck, X } from 'lucide-react';
import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { GoogleLogo } from '@/shell/AccountButton';
import { UseProfileModal } from './UseProfileModal';

export const DEFAULT_GOOGLE_SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/';

export interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  url?: string;
}

/**
 * Theme-matching modal for Google Sign-In on BeatFlow.
 * Offers "Continue in BeatFlow" (in-app desktop window) vs "Use Profile in YT Music" vs "Open in Browser" (default browser).
 */
export function GoogleSignInModal({
  isOpen,
  onClose,
  url = DEFAULT_GOOGLE_SIGN_IN_URL,
}: GoogleSignInModalProps) {
  const [showUseProfile, setShowUseProfile] = useState(false);
  const [activeProfile, setActiveProfile] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Load existing profile from yt.authState if available
  useEffect(() => {
    if (isOpen && isDesktopApp()) {
      void desktopBridge()
        ?.call('yt.authState', {})
        .then((res: any) => {
          if (res?.active) {
            setActiveProfile(res.active);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleContinueHere = useCallback(() => {
    onClose();
    if (isDesktopApp()) {
      void desktopBridge()?.call('auth.openLoginWindow', { url });
    } else {
      window.open(url, 'google_login', 'width=520,height=720,menubar=no,toolbar=no');
    }
  }, [onClose, url]);

  const handleOpenInBrowser = useCallback(() => {
    onClose();
    if (isDesktopApp()) {
      void desktopBridge()?.call('shell.open', { url });
    } else {
      window.open(url, '_blank', 'noreferrer');
    }
  }, [onClose, url]);

  const handleUseProfileClick = useCallback(() => {
    onClose();
    setShowUseProfile(true);
  }, [onClose]);

  if (!isOpen && !showUseProfile) return null;

  return (
    <>
      {isOpen &&
        createPortal(
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
                className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all active:scale-95"
                aria-label="Close"
              >
                <X size={15} />
              </button>

              {/* Google brand emblem */}
              <div className="size-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-3.5 shadow-inner">
                <GoogleLogo size={28} />
              </div>

              <h3 className="text-[18px] font-semibold text-white tracking-tight">Sign in with Google</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-white/70 max-w-[310px]">
                Connect your YouTube Music account to sync your playlists, liked songs, and library.
              </p>

              {/* Action Options */}
              <div className="w-full mt-5 flex flex-col gap-2.5">
                {/* Option 1: Continue here */}
                <button
                  type="button"
                  onClick={handleContinueHere}
                  className="group w-full flex items-center gap-3.5 p-3 rounded-[14px] bg-key/90 hover:bg-key active:scale-[0.98] text-white transition-all text-left shadow-md shadow-key/20"
                >
                  <div className="size-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <AppWindow size={19} className="text-white" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] font-semibold leading-tight text-white">Continue in BeatFlow</span>
                    <span className="text-[12px] text-white/80 leading-tight mt-0.5 truncate">
                      Sign in inside an app window with profile auto-detection
                    </span>
                  </div>
                </button>

                {/* Option 2: Use Profile in YT Music */}
                <button
                  type="button"
                  onClick={handleUseProfileClick}
                  className="group w-full flex items-center gap-3.5 p-3 rounded-[14px] bg-white/5 hover:bg-white/10 border border-white/10 active:scale-[0.98] text-white transition-all text-left"
                >
                  <div className="size-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white/80 group-hover:text-white">
                    <UserCheck size={18} />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] font-semibold leading-tight text-white">
                      Use Profile in YT Music
                    </span>
                    <span className="text-[12px] text-white/70 leading-tight mt-0.5 truncate">
                      {activeProfile?.name ? `Active: ${activeProfile.name}` : 'Review and activate your profile'}
                    </span>
                  </div>
                </button>

                {/* Option 3: Open in default browser */}
                <button
                  type="button"
                  onClick={handleOpenInBrowser}
                  className="group w-full flex items-center gap-3.5 p-3 rounded-[14px] bg-white/5 hover:bg-white/10 border border-white/10 active:scale-[0.98] text-white transition-all text-left"
                >
                  <div className="size-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white/80 group-hover:text-white">
                    <ExternalLink size={18} />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[14px] font-semibold leading-tight text-white">Open in Browser</span>
                    <span className="text-[12px] text-white/70 leading-tight mt-0.5 truncate">
                      Open in your system’s default browser
                    </span>
                  </div>
                </button>
              </div>

              {/* Cancel */}
              <button
                type="button"
                onClick={onClose}
                className="mt-4 text-[12.5px] font-medium text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Use Profile Modal */}
      <UseProfileModal
        isOpen={showUseProfile}
        onClose={() => setShowUseProfile(false)}
        profile={activeProfile}
      />
    </>
  );
}
