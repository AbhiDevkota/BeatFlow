import { ChevronLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { SiSpotify, SiYoutubemusic } from 'react-icons/si';
import { GoogleSignInModal } from '@/components/GoogleSignInModal';
import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';
import { useExtension } from '@/extension/useExtension';
import { useRefreshYtAuth, useSelectChannel, useSetConnected, useYtAuth } from '@/extension/useYtAuth';
import { SpotifyIntegration } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/';

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return src ? (
    <img
      className="inline-grid flex-none place-items-center rounded-full bg-quinary object-cover text-secondary"
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span
      className="inline-grid flex-none place-items-center rounded-full bg-quinary object-cover text-secondary text-[11px] font-semibold"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function AccountManagementPage() {
  const yt = useYtAuth();
  const select = useSelectChannel();
  const connect = useSetConnected();
  const refresh = useRefreshYtAuth();
  const desktop = isDesktopApp();
  const extension = useExtension();
  const present = extension.state === 'present';
  const [signInModalOpen, setSignInModalOpen] = useState(false);

  const ytReady = yt.state === 'ready';
  const ytAuth = ytReady ? yt.auth : null;
  const ytSignedIn = ytAuth?.browserSignedIn && ytAuth?.connected && ytAuth?.active;
  const activeChannel = ytAuth?.active;
  const accounts = ytAuth?.accounts ?? [];
  const allChannels = accounts.flatMap((a) =>
    a.channels.map((c) => ({ ...c, email: a.email, accountName: a.name })),
  );

  return (
    <div className={settingsUi.centered}>
      <div className={settingsUi.body}>
        {/* Navigation Header */}
        <div className="mb-6 flex items-center gap-3 pt-6">
          <Link
            to="/settings"
            className="grid size-8 place-items-center rounded-full bg-quaternary/60 text-secondary hover:text-primary transition-colors"
            aria-label="Back to Settings"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 className="type-title-2 font-bold tracking-tight">Account Management</h1>
        </div>

        {/* YouTube Music Account Section */}
        <h2 className={settingsUi.sectionHeader}>YouTube Music</h2>
        <section className={settingsUi.group}>
          <div className="relative flex items-center justify-between px-4 py-3.5 gap-3.5">
            <SiYoutubemusic size={24} className="text-white flex-shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="font-semibold text-[15px]">YouTube Music</span>
              <span className="type-callout text-secondary truncate">
                {yt.state === 'checking'
                  ? 'Checking account status…'
                  : !ytReady
                    ? `Requires ${desktop ? 'native engine' : 'extension'}`
                    : ytSignedIn
                      ? `Signed in as ${activeChannel?.name}`
                      : ytAuth?.browserSignedIn && !ytAuth?.connected
                        ? 'Account detected but disconnected'
                        : 'Not signed in'}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {ytReady && !ytAuth?.browserSignedIn && (
                <button
                  type="button"
                  onClick={() => {
                    if (desktop) {
                      desktopBridge()?.call('auth.openLoginWindow', {
                        url: 'https://accounts.google.com/ServiceLogin?service=youtube&prompt=select_account&continue=https%3A%2F%2Fmusic.youtube.com%2F',
                      });
                    } else {
                      setSignInModalOpen(true);
                    }
                  }}
                  className={settingsUi.inlineButton}
                >
                  Sign In
                </button>
              )}
              {ytReady && ytAuth?.browserSignedIn && !ytAuth?.connected && (
                <button
                  type="button"
                  className={settingsUi.inlineButton}
                  onClick={() => connect.mutate(true)}
                  disabled={connect.isPending}
                >
                  Connect
                </button>
              )}
              {ytSignedIn && (
                <>
                  {desktop && (
                    <button
                      type="button"
                      className="rounded-[12px] bg-quaternary/50 px-2.5 py-[3px] type-callout-emphasized text-secondary hover:text-primary hover:bg-quaternary transition-colors cursor-pointer"
                      onClick={() => {
                        desktopBridge()?.call('auth.openLoginWindow', {
                          addAccount: true,
                          url: 'https://accounts.google.com/AddSession?service=youtube&prompt=select_account&continue=https%3A%2F%2Fmusic.youtube.com%2F',
                        });
                      }}
                    >
                      Add Account
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-[12px] bg-quaternary/50 px-2.5 py-[3px] type-callout-emphasized text-secondary hover:text-primary hover:bg-quaternary transition-colors cursor-pointer"
                    onClick={() => connect.mutate(false)}
                    disabled={connect.isPending}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Multiple Profile / Channel Picker */}
          {ytSignedIn && allChannels.length > 1 && (
            <div className="border-t border-quaternary/20 px-4 py-3">
              <span className="type-callout-emphasized text-secondary block mb-2">Switch Channel</span>
              <div className="flex flex-col gap-1.5">
                {allChannels.map((channel) => {
                  const isCurrent = channel.id === activeChannel?.id;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrent) select.mutate(channel.id);
                      }}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] text-start transition-colors ${
                        isCurrent ? 'bg-quaternary/40 text-primary' : 'hover:bg-quaternary/20 text-secondary hover:text-primary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={channel.avatarUrl} name={channel.name} size={24} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-medium truncate">{channel.name}</span>
                          {channel.brand && <span className="text-[11px] text-secondary">Brand channel</span>}
                        </div>
                      </div>
                      {isCurrent && <Check size={16} className="text-key flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
        <p className={settingsUi.footer}>
          Sign in to your Google account to sync your liked songs, playlists, personal library, and YouTube Music playback history.
        </p>

        {/* Spotify Account Section */}
        <h2 className="mx-4 mt-8 mb-2 type-subhead-emphasized uppercase text-secondary font-semibold tracking-wider text-[11px]">
          Spotify
        </h2>
        <section className={settingsUi.group}>
          <div className="relative flex items-center justify-between px-4 py-3.5 gap-3.5">
            <SiSpotify size={24} className="text-[#1ed760] flex-shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="font-semibold text-[15px]">Spotify</span>
              <span className="type-callout text-secondary">Canvas video and playlist sync</span>
            </div>
            <div className="flex-shrink-0">
              {present || desktop ? (
                <SpotifyIntegration />
              ) : (
                <span className={settingsUi.value}>Needs {desktop ? 'engine' : 'extension'}</span>
              )}
            </div>
          </div>
        </section>
        <p className={settingsUi.footer}>
          Connecting your Spotify account enables Spotify Canvas background video playback on Now Playing and Spotify library import.
        </p>
      </div>
      <GoogleSignInModal
        isOpen={signInModalOpen}
        onClose={() => setSignInModalOpen(false)}
      />
    </div>
  );
}
