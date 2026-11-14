import { ArrowUpRight, ChevronsUpDown } from 'lucide-react';
import { useCallback, useState } from 'react';
import { GoogleSignInModal } from '@/components/GoogleSignInModal';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '@/components/Menu';
import { useRefreshYtAuth, useSelectChannel, useSetConnected, useYtAuth } from '@/extension/useYtAuth';

const SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/';

/** Official Google multi-color G icon matching the mobile / Android implementation. */
export function GoogleLogo({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={`flex-none ${className}`}>
      <path
        fill="#EA4335"
        d="M24,9.5c3.54,0 6.71,1.22 9.21,3.6l6.85,-6.85C35.9,2.38 30.47,0 24,0 14.62,0 6.51,5.38 2.56,13.22l7.98,6.19C12.43,13.72 17.74,9.5 24,9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98,24.55c0,-1.57 -0.15,-3.09 -0.38,-4.55H24v9.02h12.94c-0.58,2.96 -2.26,5.48 -4.78,7.18l7.73,6c4.51,-4.18 7.09,-10.36 7.09,-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53,28.59c-0.48,-1.45 -0.76,-2.99 -0.76,-4.59s0.27,-3.14 0.76,-4.59l-7.98,-6.19C0.92,16.46 0,20.12 0,24c0,3.88 0.92,7.54 2.56,10.78l7.97,-6.19z"
      />
      <path
        fill="#34A853"
        d="M24,48c6.48,0 11.93,-2.13 15.89,-5.81l-7.73,-6c-2.15,1.45 -4.92,2.3 -8.16,2.3 -6.26,0 -11.57,-4.22 -13.47,-9.91l-7.98,6.19C6.51,42.62 14.62,48 24,48z"
      />
    </svg>
  );
}

// Miniplayer-style glass pill matching BeatFlow's player pill and mobile theme
const googlePill =
  'glass-pill relative inline-flex min-w-0 flex-1 items-center justify-center gap-2 h-8 rounded-pill px-3.5 text-primary hover:text-white hover:bg-white/10 active:scale-[0.98] transition-all select-none';
const connectPill =
  'glass-pill relative inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 h-8 rounded-pill bg-key/80 px-3 text-white hover:brightness-110 active:scale-[0.98] transition-all text-[12px] font-semibold leading-none truncate disabled:opacity-60';
const retryPill =
  'glass-pill relative inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 h-8 rounded-pill px-3 text-primary hover:bg-white/10 active:scale-[0.98] transition-all text-[12px] font-semibold leading-none truncate disabled:opacity-60';
const avatar = 'inline-grid flex-none place-items-center rounded-full bg-quinary object-cover type-[600_11px/1] text-secondary';

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return src ? (
    <img className={avatar} src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className={avatar} style={{ width: size, height: size }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * The sidebar's account control (avatar and name opening the account menu;
 * Android-style "Continue With Google" pill when signed out).
 */
export function AccountButton({ onNavigate }: { onNavigate?: () => void } = {}) {
  const status = useYtAuth();
  const select = useSelectChannel();
  const connect = useSetConnected();
  const refresh = useRefreshYtAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleModalUrl, setGoogleModalUrl] = useState<string | undefined>(undefined);
  const close = useCallback(() => setAnchor(null), []);

  if (status.state === 'checking') {
    return <div className="min-w-0 flex-1 h-8" />;
  }

  const auth = status.state === 'ready' ? status.auth : null;

  if (!auth || !auth.browserSignedIn) {
    return (
      <>
        <button
          type="button"
          className={googlePill}
          title="Continue With Google"
          onClick={() => {
            onNavigate?.();
            setGoogleModalUrl(undefined);
            setGoogleModalOpen(true);
          }}
        >
          <GoogleLogo size={18} />
          <span className="truncate text-[12.5px] font-semibold leading-none tracking-tight">
            Continue With Google
          </span>
        </button>
        <GoogleSignInModal
          isOpen={googleModalOpen}
          onClose={() => setGoogleModalOpen(false)}
          url={googleModalUrl}
        />
      </>
    );
  }

  if (!auth.connected) {
    return (
      <button className={connectPill} onClick={() => connect.mutate(true)} disabled={connect.isPending}>
        Connect YouTube Music
      </button>
    );
  }

  if (!auth.active) {
    // Signed in to the browser, but the account couldn't be read (the reason is on the Extension page).
    return (
      <button
        className={retryPill}
        title={auth.problem ?? undefined}
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
      >
        {refresh.isPending ? 'Reading account…' : 'Retry YouTube Sign-In'}
      </button>
    );
  }

  const active = auth.active;
  const multiple = auth.accounts.flatMap((a) => a.channels).length > 1;

  return (
    <>
      <button
        // Signed in: a 24px avatar and the name, opening the account menu.
        className="glass-pill relative flex min-w-0 flex-1 items-center gap-2 h-8 rounded-pill px-2.5 text-start type-body-reduced text-primary hover:bg-white/10 aria-expanded:bg-white/10 transition-all select-none"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <Avatar src={active.avatarUrl} name={active.name} size={22} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{active.name}</span>
        {multiple && <ChevronsUpDown size={14} strokeWidth={2} className="flex-none text-secondary" />}
      </button>
      {anchor && (
        <Menu anchor={anchor} placement="above-start" onClose={close} label="Account">
          {auth.accounts.map((account) => (
            <div key={account.authUser} role="group" aria-label={account.email ?? account.name}>
              <MenuHeader>{account.email ?? account.name}</MenuHeader>
              {account.channels.map((channel) => (
                <MenuItem
                  key={channel.id}
                  checked={channel.id === active.id}
                  icon={<Avatar src={channel.avatarUrl} name={channel.name} size={20} />}
                  trailing={channel.brand ? 'Brand' : undefined}
                  onSelect={() => {
                    close();
                    if (channel.id !== active.id) select.mutate(channel.id);
                  }}
                >
                  {channel.name}
                </MenuItem>
              ))}
            </div>
          ))}
          <MenuSeparator />
          <MenuItem
            onSelect={() => {
              close();
              setGoogleModalUrl(SIGN_IN_URL.replace('ServiceLogin', 'AddSession'));
              setGoogleModalOpen(true);
            }}
            trailing={<ArrowUpRight size={13} />}
          >
            Add Account
          </MenuItem>
          <MenuItem
            destructive
            onSelect={() => {
              close();
              connect.mutate(false);
            }}
          >
            Disconnect from BeatFlow
          </MenuItem>
        </Menu>
      )}
      <GoogleSignInModal
        isOpen={googleModalOpen}
        onClose={() => setGoogleModalOpen(false)}
        url={googleModalUrl}
      />
    </>
  );
}
