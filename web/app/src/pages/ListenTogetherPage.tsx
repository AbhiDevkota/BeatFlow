import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Crown,
  Lock,
  LogOut,
  Music,
  Pause,
  Play,
  RefreshCw,
  Share2,
  SkipBack,
  SkipForward,
  UserMinus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { useSignedIn } from '@/data/music/queries';
import { useYtAuth } from '@/extension/useYtAuth';
import { cleanCode, CODE_LENGTH, inviteUrl } from '@/party/invite';
import {
  controlsLocked,
  createParty,
  DEFAULT_SERVER,
  joinParty,
  leaveParty,
  messageOf,
  party,
  partyPositionMs,
  partyServer,
  partySettings,
  previewParty,
  resolveServerHealth,
  savePartySettings,
  useParty,
  type PartyState,
  type ServerHealth,
} from '@/party/listenTogether';
import { usePlayer } from '@/state/player';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const lede = 'mx-4 mb-4 type-body-tall text-secondary text-center max-w-[520px] mx-auto';
const errorBanner = 'mx-4 mt-3 rounded-[10px] bg-red/10 border border-red/20 px-3.5 py-2.5 type-callout text-red';
const primaryBtn =
  'flex items-center justify-center gap-2 rounded-pill bg-key-bg px-5 py-2 type-body-emphasized text-white hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer';

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Listen Together (ListenTogetherScreen on mobile):
 * Play music together in real time. Provides code sharing, real-time playhead
 * sync, member presence, host controls, and server health checks.
 */
export default function ListenTogetherPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const inviteCode = params.code ? cleanCode(params.code) : null;
  const inviteServer = search.get('server');
  const state = useParty();
  const signedIn = useSignedIn();

  return (
    <div className={settingsUi.centered}>
      <PageHeader title="Listen Together" back={true} />
      <div className={settingsUi.body}>
        {state.code ? (
          <InParty />
        ) : inviteCode ? (
          <InviteCard code={inviteCode} server={inviteServer} signedIn={signedIn} />
        ) : (
          <StartOrJoin signedIn={signedIn} />
        )}
        {state.error && <p className={errorBanner}>{state.error}</p>}
      </div>
    </div>
  );
}

/**
 * Glowing breathing avatar matching mobile ListenTogetherScreen (GlowingAvatar).
 */
function GlowingAvatar({ url, name }: { url?: string | null; name?: string }) {
  return (
    <div className="relative flex items-center justify-center my-6 select-none">
      {/* Outer ambient breathing glow */}
      <div className="absolute size-36 rounded-full bg-key/35 blur-2xl animate-pulse pointer-events-none" />
      <div className="relative size-24 rounded-full border-2 border-white/20 bg-quaternary flex items-center justify-center overflow-hidden shadow-xl">
        {url ? (
          <img src={url} alt={name ?? ''} className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="type-title-1 font-bold text-primary">
            {name ? name.slice(0, 1).toUpperCase() : <Users size={34} className="text-secondary" />}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Live server health status pill with probe latency and fallback indicator.
 */
function ServerHealthBadge({ customServer }: { customServer?: string }) {
  const [health, setHealth] = useState<ServerHealth>({ state: 'checking', latencyMs: null, serverUrl: '' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const check = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const h = await resolveServerHealth(customServer);
      setHealth(h);
    } finally {
      setIsRefreshing(false);
    }
  }, [customServer]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <button
      onClick={() => void check()}
      type="button"
      className="inline-flex items-center gap-2 rounded-full bg-quaternary/60 border border-quaternary/40 px-3.5 py-1.5 text-xs text-secondary hover:text-primary transition-colors cursor-pointer"
      title="Click to re-check party server connection"
    >
      {health.state === 'checking' || isRefreshing ? (
        <RefreshCw size={12} className="animate-spin text-secondary" />
      ) : health.state === 'online' ? (
        <span className="size-2 rounded-full bg-green shadow-xs" />
      ) : health.state === 'fallback' ? (
        <span className="size-2 rounded-full bg-amber-400 shadow-xs" />
      ) : (
        <span className="size-2 rounded-full bg-red shadow-xs" />
      )}
      <span>
        {health.state === 'checking' || isRefreshing
          ? 'Checking server…'
          : health.state === 'online'
          ? `Server Online (${health.latencyMs ?? 0} ms)`
          : health.state === 'fallback'
          ? `Using default server (${health.latencyMs ?? 0} ms)`
          : 'Server Offline'}
      </span>
    </button>
  );
}

/**
 * Stepper control for party capacity.
 */
function Stepper({
  value,
  min = 2,
  max = 10,
  onChange,
  disabled = false,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-quaternary/70 rounded-full px-2 py-0.5 border border-quaternary/40">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="size-7 rounded-full flex items-center justify-center font-bold text-base text-primary hover:bg-quaternary disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center type-body-emphasized text-primary">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="size-7 rounded-full flex items-center justify-center font-bold text-base text-primary hover:bg-quaternary disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        +
      </button>
    </div>
  );
}

/**
 * 6-cell uppercase code input matching mobile PartyCodeField.
 */
function PartyCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
}) {
  const chars = value.padEnd(CODE_LENGTH, ' ').slice(0, CODE_LENGTH).split('');
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="relative w-full max-w-[340px] mx-auto select-none">
      <div className="grid grid-cols-6 gap-2">
        {chars.map((char, i) => {
          const isFilled = i < value.length;
          const isActive = i === activeIndex && !disabled && value.length < CODE_LENGTH;
          return (
            <div
              key={i}
              className={`h-13 rounded-xl flex items-center justify-center text-xl font-bold font-mono transition-all duration-150 ${
                isActive
                  ? 'border-2 border-key bg-quaternary/80 shadow-sm ring-2 ring-key/20 text-primary'
                  : isFilled
                  ? 'border border-quaternary bg-quaternary/60 text-primary'
                  : 'border border-quaternary/30 bg-quaternary/20 text-tertiary'
              }`}
            >
              {isFilled ? char : isActive ? <span className="w-0.5 h-5 bg-key animate-pulse rounded-full" /> : ''}
            </div>
          );
        })}
      </div>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={CODE_LENGTH}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck="false"
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-transparent"
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH);
          onChange(cleaned);
          if (cleaned.length === CODE_LENGTH) {
            onComplete?.(cleaned);
          }
        }}
      />
    </div>
  );
}

/**
 * Stack of overlapping member avatars (MemberAvatarStack).
 */
function MemberAvatarStack({
  members,
  total,
}: {
  members: Array<{ displayName: string; avatarUrl: string | null }>;
  total: number;
}) {
  const faces = members.slice(0, 4);
  const extra = Math.max(0, total - faces.length);
  return (
    <div className="flex items-center -space-x-2.5">
      {faces.map((m, i) => (
        <div
          key={i}
          className="relative size-10 rounded-full border-2 border-quinary bg-quaternary overflow-hidden flex items-center justify-center shadow-xs"
        >
          {m.avatarUrl ? (
            <img src={m.avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="type-caption-1 font-bold text-secondary">{m.displayName.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className="relative size-10 rounded-full border-2 border-quinary bg-key-bg text-white flex items-center justify-center type-caption-1 font-bold shadow-xs">
          +{extra}
        </div>
      )}
    </div>
  );
}

function StartOrJoin({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const auth = useYtAuth();
  const activeAccount = auth.state === 'ready' && auth.auth.signedIn ? auth.auth.active : null;
  const [code, setCode] = useState('');
  const [settings, setSettings] = useState(partySettings);
  const [maxMembers, setMaxMembers] = useState(5);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);

  const create = useMutation({
    mutationFn: () => createParty({ maxMembers, autoplayEnabled }),
  });

  const preview = useQuery({
    queryKey: ['party', 'preview', code],
    queryFn: () => previewParty(code, settings.customServer || null),
    enabled: code.length === CODE_LENGTH,
    retry: false,
  });

  const join = useMutation({
    mutationFn: () => joinParty(code, settings.customServer || null),
    onSuccess: () => navigate('/settings/listen-together'),
  });

  const update = (change: Partial<typeof settings>) => {
    savePartySettings(change);
    setSettings(partySettings());
  };

  const displayName = activeAccount?.name || settings.nickname.trim() || 'BeatFlow Listener';
  const displayAvatar = activeAccount?.avatarUrl || null;

  return (
    <div className="flex flex-col gap-6">
      {/* Landing Hero */}
      <div className="flex flex-col items-center text-center">
        <GlowingAvatar url={displayAvatar} name={displayName} />
        <h1 className="type-title-1 font-bold text-primary mb-1.5">Listen Together</h1>
        <p className={lede}>
          Listen to the same music at the same moment with friends. Anyone in the party can control the queue.
        </p>
        <div className="mt-1">
          <ServerHealthBadge customServer={settings.customServer} />
        </div>
        {!signedIn && (
          <p className="mt-4 type-callout text-secondary max-w-[480px]">
            Jamming as <strong className="text-primary">{displayName}</strong>. Sign in to YouTube Music anytime to sync
            your account profile and avatar.
          </p>
        )}
      </div>

      {/* Start a Party Card */}
      <div className="flex flex-col gap-2">
        <h2 className={settingsUi.sectionHeader}>Start a Party</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.controlRow}>
            <span className={settingsUi.rowText}>
              <span>Party size</span>
              <span className={settingsUi.rowDetail}>Up to 10 devices can listen together.</span>
            </span>
            <Stepper value={maxMembers} min={2} max={10} onChange={setMaxMembers} disabled={create.isPending} />
          </div>
          <Toggle
            label="AutoPlay"
            detail="Keep the party going with similar music when the queue runs out."
            checked={autoplayEnabled}
            onChange={setAutoplayEnabled}
          />
          <div className={settingsUi.row}>
            <span className={settingsUi.rowText}>
              <span className={settingsUi.rowDetail}>Whatever you’re playing comes with you.</span>
            </span>
            <button className={primaryBtn} disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Starting…' : 'Start Party'}
            </button>
          </div>
        </section>
      </div>

      {/* Join with a Code Card */}
      <div className="flex flex-col gap-2">
        <h2 className={settingsUi.sectionHeader}>Join with a Code</h2>
        <section className={`${settingsUi.group} p-6 flex flex-col items-center gap-4`}>
          <p className="type-body text-secondary text-center">Enter the 6-character party code:</p>
          <PartyCodeInput
            value={code}
            onChange={setCode}
            disabled={join.isPending}
            onComplete={(c) => {
              // Automatically triggers preview via React Query
            }}
          />

          {code.length === CODE_LENGTH && preview.isPending && (
            <p className="type-callout text-secondary animate-pulse">Looking up the party…</p>
          )}

          {code.length === CODE_LENGTH && preview.isError && (
            <p className="type-callout text-red">{messageOf(preview.error)}</p>
          )}

          {code.length === CODE_LENGTH && preview.data && (
            <div className="w-full rounded-[12px] bg-quaternary/40 border border-quaternary/40 p-4 flex flex-col items-center gap-3">
              <MemberAvatarStack members={preview.data.members} total={preview.data.memberCount} />
              <div className="text-center">
                <p className="type-title-3 font-semibold text-primary">
                  {preview.data.hostName ? `${preview.data.hostName}’s party` : 'Listen Together Party'}
                </p>
                <p className="type-callout text-secondary">
                  {preview.data.memberCount} of {preview.data.maxMembers} listening
                </p>
              </div>
              <button
                className={primaryBtn}
                disabled={join.isPending || preview.data.isFull}
                onClick={() => join.mutate()}
              >
                {preview.data.isFull ? 'Party is full' : join.isPending ? 'Joining…' : 'Tap to Join'}
              </button>
            </div>
          )}

          {code.length < CODE_LENGTH && (
            <button
              className={primaryBtn}
              disabled={code.length !== CODE_LENGTH}
              onClick={() => {
                const cleaned = cleanCode(code);
                if (cleaned) navigate(`/invite/${cleaned}`);
              }}
            >
              Join Party
            </button>
          )}
        </section>
      </div>

      {/* You & Server Settings */}
      <div className="flex flex-col gap-2">
        <h2 className={settingsUi.sectionHeader}>You & Settings</h2>
        <section className={settingsUi.group}>
          <label className={settingsUi.controlRow}>
            <span>Name in parties</span>
            <input
              className={settingsUi.input}
              placeholder="Your nickname"
              value={settings.nickname}
              maxLength={80}
              onChange={(e) => update({ nickname: e.currentTarget.value })}
            />
          </label>
          <label className={settingsUi.controlRow}>
            <span>Party server</span>
            <input
              className={settingsUi.input}
              placeholder={DEFAULT_SERVER ? new URL(DEFAULT_SERVER).host : 'party.example.com'}
              value={settings.customServer}
              onChange={(e) => update({ customServer: e.currentTarget.value })}
            />
          </label>
        </section>
        <p className={settingsUi.footer}>
          Leave the server empty to use BeatFlow’s default server. Anyone joining your party connects to the server it’s on.
        </p>
      </div>
    </div>
  );
}

/**
 * An invite: who's in it, then a tap to join.
 */
function InviteCard({ code, server, signedIn }: { code: string; server: string | null; signedIn: boolean }) {
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ['party', 'preview', code, server],
    queryFn: () => previewParty(code, server),
    retry: false,
  });
  const join = useMutation({
    mutationFn: () => joinParty(code, server),
    onSuccess: () => navigate('/settings/listen-together'),
  });
  const data = preview.data;

  return (
    <div className="flex flex-col items-center gap-5 rounded-[16px] bg-quinary border border-quaternary/30 px-6 py-8 text-center max-w-[480px] mx-auto">
      <div className="flex flex-col items-center gap-1">
        <span className="type-caption-1 font-semibold uppercase tracking-wider text-secondary">Party Code</span>
        <p className="font-mono type-[700_40px/48px] tracking-[0.18em] text-primary">{code}</p>
      </div>

      {preview.isPending && <p className="type-callout text-secondary animate-pulse">Looking up the party…</p>}
      {preview.isError && <p className="type-callout text-red">{messageOf(preview.error)}</p>}

      {data && (
        <div className="flex flex-col items-center gap-3">
          <MemberAvatarStack members={data.members} total={data.memberCount} />
          <div>
            <p className="type-title-2 font-bold text-primary">
              {data.hostName ? `${data.hostName}’s party` : 'Listen Together Party'}
            </p>
            <p className="type-callout text-secondary">
              {data.memberCount} of {data.maxMembers} listening
            </p>
          </div>
        </div>
      )}

      <button
        className="mt-2 w-full max-w-[260px] rounded-pill bg-key-bg px-7 py-3 type-title-3-emphasized text-white hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-45 disabled:pointer-events-none cursor-pointer"
        disabled={join.isPending || data?.isFull || preview.isError}
        onClick={() => join.mutate()}
      >
        {data?.isFull ? 'This party is full' : join.isPending ? 'Joining…' : 'Tap to Join'}
      </button>

      <button
        type="button"
        className="type-callout text-secondary hover:text-primary transition-colors cursor-pointer"
        onClick={() => navigate('/settings/listen-together')}
      >
        Cancel
      </button>
    </div>
  );
}

function Avatar({ name, url, large = false }: { name: string; url: string | null; large?: boolean }) {
  const className = `grid place-items-center rounded-full bg-quaternary object-cover type-callout-emphasized flex-shrink-0 ${
    large ? 'size-10' : 'size-7'
  }`;
  return url ? (
    <img className={className} src={url} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className={className}>{name.slice(0, 1).toUpperCase()}</span>
  );
}

/**
 * Now Playing card inside a live party with playhead position ticker and transport controls.
 */
function NowPlayingInTheParty({ state }: { state: PartyState }) {
  const track = state.playback.track;
  const [positionMs, setPositionMs] = useState(0);
  const locked = controlsLocked(state);

  useEffect(() => {
    const update = () => {
      setPositionMs(partyPositionMs() ?? 0);
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [state.playback.seq, state.playback.isPlaying]);

  const durationMs = track?.durationMs ?? 0;
  const progressPercent = durationMs > 0 ? Math.min(100, Math.max(0, (positionMs / durationMs) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <h2 className={settingsUi.sectionHeader}>Now Playing in the Party</h2>
      <section className={`${settingsUi.group} p-4 flex flex-col gap-3.5`}>
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="size-16 rounded-[10px] bg-quaternary flex items-center justify-center overflow-hidden flex-shrink-0 border border-quaternary/30">
            {track?.thumbnailUrl ? (
              <img src={track.thumbnailUrl} alt="" className="size-full object-cover" />
            ) : (
              <Music size={26} className="text-secondary" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="type-title-3 font-semibold text-primary truncate">
              {track?.title || 'Nothing playing'}
            </span>
            <span className="type-callout text-secondary truncate">{track?.artist || 'Idle party queue'}</span>
            <span className="type-caption-1 text-tertiary mt-0.5">
              {formatMs(positionMs)} {durationMs > 0 && ` / ${formatMs(durationMs)}`}
            </span>
          </div>
          {locked && (
            <div
              className="flex items-center gap-1 rounded-[6px] bg-quaternary/80 px-2 py-1 text-xs text-secondary flex-shrink-0"
              title="Host only controls music"
            >
              <Lock size={12} />
              <span>Host only</span>
            </div>
          )}
        </div>

        {/* Live Progress Bar */}
        {durationMs > 0 && (
          <div className="h-1.5 w-full rounded-full bg-quaternary overflow-hidden">
            <div
              className="h-full bg-key transition-all duration-200 ease-linear rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-4 pt-1">
          <button
            type="button"
            className="p-2 rounded-full text-secondary hover:text-primary hover:bg-quaternary transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            disabled={locked}
            onClick={() => party.previous()}
            title="Previous"
          >
            <SkipBack size={18} />
          </button>
          <button
            type="button"
            className="size-10 rounded-full bg-key-bg text-white flex items-center justify-center hover:opacity-95 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-sm"
            disabled={locked}
            onClick={() => (state.playback.isPlaying ? party.pause() : party.play())}
            title={state.playback.isPlaying ? 'Pause' : 'Play'}
          >
            {state.playback.isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
          <button
            type="button"
            className="p-2 rounded-full text-secondary hover:text-primary hover:bg-quaternary transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            disabled={locked}
            onClick={() => party.next()}
            title="Next"
          >
            <SkipForward size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}

function InParty() {
  const state = useParty();
  const navigate = useNavigate();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const isHost = state.you?.isHost === true;
  const locked = controlsLocked(state);
  const custom = partyServer() && partyServer() !== DEFAULT_SERVER ? partyServer() : null;
  const link = inviteUrl(state.code!, custom);

  useEffect(() => {
    if (!copiedCode) return;
    const t = setTimeout(() => setCopiedCode(false), 1500);
    return () => clearTimeout(t);
  }, [copiedCode]);

  useEffect(() => {
    if (!copiedLink) return;
    const t = setTimeout(() => setCopiedLink(false), 1500);
    return () => clearTimeout(t);
  }, [copiedLink]);

  const status =
    state.connection === 'live'
      ? state.clockSynced
        ? `In sync · ${state.roundTripMs} ms round trip`
        : 'Measuring the clock…'
      : state.connection === 'connecting'
      ? 'Reconnecting…'
      : 'Offline';

  return (
    <div className="flex flex-col gap-6">
      {/* Party Code & Share Card */}
      <div className="flex flex-col items-center gap-3 rounded-[16px] bg-quinary border border-quaternary/30 px-6 py-7 text-center">
        <span className="type-caption-1 font-semibold uppercase tracking-wider text-secondary">Party Code</span>
        <p className="font-mono type-[700_40px/48px] tracking-[0.2em] text-primary">{state.code}</p>
        <p className="type-caption-1 text-secondary">{status}</p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-pill bg-quaternary/80 border border-quaternary px-3.5 py-1.5 type-callout-emphasized text-primary hover:bg-quaternary transition-colors cursor-pointer"
            onClick={() => {
              void navigator.clipboard.writeText(state.code!).then(() => setCopiedCode(true));
            }}
          >
            {copiedCode ? <Check size={14} className="text-green" /> : <Copy size={14} />}
            {copiedCode ? 'Code Copied' : 'Copy Code'}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-pill bg-quaternary/80 border border-quaternary px-3.5 py-1.5 type-callout-emphasized text-primary hover:bg-quaternary transition-colors cursor-pointer"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => setCopiedLink(true));
            }}
            title={link}
          >
            {copiedLink ? <Check size={14} className="text-green" /> : <Share2 size={14} />}
            {copiedLink ? 'Link Copied' : 'Copy Invite Link'}
          </button>
        </div>
      </div>

      {/* Now Playing In Party */}
      <NowPlayingInTheParty state={state} />

      {/* Listening Members & Host Controls */}
      <div className="flex flex-col gap-2">
        <h2 className={settingsUi.sectionHeader}>
          Listening · {state.members.length} of {state.maxMembers}
        </h2>
        <section className={settingsUi.group}>
          {isHost && (
            <>
              <div className={settingsUi.controlRow}>
                <span className={settingsUi.rowText}>
                  <span>Party size</span>
                  <span className={settingsUi.rowDetail}>Max listener capacity for this party.</span>
                </span>
                <Stepper
                  value={state.maxMembers}
                  min={Math.max(2, state.members.length)}
                  max={10}
                  onChange={party.setMaxMembers}
                />
              </div>
              <Toggle
                label="Only I control the music"
                detail="Others can listen but not play, pause, skip, or change the queue."
                checked={state.hostOnlyControl}
                onChange={party.setHostOnlyControl}
              />
            </>
          )}

          <Toggle
            label="AutoPlay"
            detail="Keep the party going with similar music when the queue runs out."
            checked={state.playback.autoplayEnabled}
            onChange={(on) => !locked && party.setAutoplay(on)}
          />

          {state.members.map((m) => (
            <div key={m.memberId} className={settingsUi.integrationPlain}>
              <Avatar name={m.displayName} url={m.avatarUrl} />
              <span className={settingsUi.integrationName}>
                {m.displayName}
                {m.memberId === state.you?.memberId && <span className="text-secondary font-normal"> (you)</span>}
              </span>
              <span className={settingsUi.value}>
                {m.isHost && <Crown size={14} className="text-amber-400" aria-label="Host" />}
                <span
                  className="size-2 rounded-full bg-quaternary data-on:bg-green"
                  data-on={m.connected || undefined}
                  title={m.connected ? 'Connected' : 'Reconnecting / Away'}
                />
                {isHost && m.memberId !== state.you?.memberId && (
                  <button
                    className={settingsUi.inlineButton}
                    onClick={() => party.kick(m.memberId)}
                    title="Remove from party"
                  >
                    <UserMinus size={13} />
                  </button>
                )}
              </span>
            </div>
          ))}
        </section>
        {locked && (
          <p className={settingsUi.footer}>
            The host controls the music in this party. You can still pause your own device.
          </p>
        )}
      </div>

      {/* Activity Log */}
      {state.activity.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className={settingsUi.sectionHeader}>Activity</h2>
          <section className={`${settingsUi.group} max-h-48 overflow-y-auto divide-y divide-quaternary/30`}>
            {state.activity.slice(0, 15).map((a, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 type-callout">
                <span className="text-primary truncate min-w-0 flex-1">
                  <strong className="font-semibold">{a.by}</strong> · {a.action}
                  {a.detail && <span className="text-secondary font-normal"> ({a.detail})</span>}
                </span>
                <span className="text-tertiary text-xs flex-shrink-0 ml-3">
                  {new Date(a.atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* Leave Party */}
      <div className="pt-2">
        <button
          className="inline-flex items-center gap-2 type-body-emphasized text-red hover:opacity-80 transition-opacity cursor-pointer px-4 py-2"
          onClick={() => void leaveParty().then(() => navigate('/settings/listen-together'))}
        >
          <LogOut size={16} />
          Leave Party
        </button>
      </div>
    </div>
  );
}
