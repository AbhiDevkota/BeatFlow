import {
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  ExternalLink,
  EyeOff,
  Film,
  HardDrive,
  History,
  Info,
  Layers,
  Monitor,
  Moon,
  Music,
  Palette,
  PlayCircle,
  Quote,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  SunMoon,
  Tag,
  Trash2,
  Type,
  Users,
  Volume2,
  VolumeX,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { MdOutlineExtension } from 'react-icons/md';
import { SiApplemusic, SiDiscord, SiGithub, SiSpotify, SiYoutubemusic } from 'react-icons/si';
import { PageHeader } from '@/components/PageHeader';
import { PrefetchLink } from '@/components/PrefetchLink';
import { Select } from '@/components/Select';
import { useAppleSettings } from '@/data/apple/motionArt';
import { useDiscord } from '@/extension/useDiscord';
import { useExtension } from '@/extension/useExtension';
import { useYtAuth } from '@/extension/useYtAuth';
import { useParty } from '@/party/useParty';
import { AUTOMIX_BARS } from '@/playback/automix/choices';
import { useHistorySettings } from '@/playback/historyReporting';
import { isDesktopApp } from '@/lib/platform';
import { queryClient } from '@/lib/queryClient';
import { useTheme } from '@/lib/theme';
import { useContentSettings, type AppFontFamily, type StreamingQuality } from '@/lib/contentSettings';
import { CROSSFADE_CHOICES, usePlayer } from '@/state/player';
import {
  AppleMusicIntegration,
  CanvasToggle,
  LyricSourcesAccess,
  SpotifyIntegration,
  Toggle,
} from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const LyricsSettings = lazy(() => import('@/shell/LyricsSettings').then((m) => ({ default: m.LyricsSettings })));

export type SettingsCategoryKey = 'playback' | 'appearance' | 'content' | 'lyrics' | 'storage' | 'about';

interface CategoryMeta {
  key: SettingsCategoryKey;
  title: string;
  subtitle: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  badge?: string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: 'playback',
    title: 'Playback',
    subtitle: 'AutoPlay, crossfade, automix, volume leveling, nerd stats',
    icon: PlayCircle,
  },
  {
    key: 'appearance',
    title: 'Appearance',
    subtitle: 'Theme mode, font selection, animated artwork, tinting',
    icon: SunMoon,
  },
  {
    key: 'content',
    title: 'Content & Audio',
    subtitle: 'Streaming quality, direct source, studio cuts, history',
    icon: SlidersHorizontal,
  },
  {
    key: 'lyrics',
    title: 'Lyrics',
    subtitle: 'Sources, syllable sync timing, Spotify canvas',
    icon: Quote,
  },
  {
    key: 'storage',
    title: 'Storage & Cache',
    subtitle: 'Cached media, offline assets, cache cleanup',
    icon: HardDrive,
  },
  {
    key: 'about',
    title: 'About',
    subtitle: 'Build version, architecture, open source repository',
    icon: Info,
  },
];

/** An integration row that opens a page of its own. */
function LinkRow({ to, icon, title, value }: { to: string; icon?: ReactNode; title: string; value?: string | null }) {
  return (
    <PrefetchLink to={to} className={`${icon ? settingsUi.integration : settingsUi.integrationPlain} ${settingsUi.linkRow}`}>
      {icon}
      <span className={settingsUi.integrationName}>{title}</span>
      <span className={settingsUi.value}>
        {value}
        <ChevronRight size={16} />
      </span>
    </PrefetchLink>
  );
}

function youtubeText(auth: ReturnType<typeof useYtAuth>): string {
  if (auth.state === 'checking') return 'Checking…';
  if (auth.state === 'unavailable') return 'Needs the extension';
  const { browserSignedIn, connected, active } = auth.auth;
  if (!browserSignedIn) return 'Not signed in';
  if (!connected) return 'Disconnected';
  return active ? active.name : 'Signed in';
}

/**
 * Settings Page: Reimagined after BeatFlow Android SettingsSheet.kt with:
 * - Minimal monochrome vector icons (no heavy colored squircle boxes)
 * - Real-time keyword search across all settings
 * - Drill-down category navigation with "← Settings" back button
 * - Extended settings: theme switcher, font selection, loudness normalization, skip silence, studio cuts, cache management
 */
export default function SettingsPage() {
  const extension = useExtension();
  const yt = useYtAuth();
  const discord = useDiscord();
  const party = useParty();
  const desktop = isDesktopApp();

  // Playback state
  const autoplay = usePlayer((s) => s.autoplay);
  const crossfadeSec = usePlayer((s) => s.crossfadeSec);
  const automix = usePlayer((s) => s.automix);
  const automixBars = usePlayer((s) => s.automixBars);
  const showNerdStats = usePlayer((s) => s.showNerdStats);
  const { setAutoplay, setCrossfade, setAutomix, setAutomixBars, setShowNerdStats } = usePlayer.getState();

  // History & Appearance
  const shareHistory = useHistorySettings((s) => s.share);
  const setShareHistory = useHistorySettings((s) => s.setShare);
  const { theme, setTheme } = useTheme();
  const { artistArt, motion, setArtistArt, setMotion } = useAppleSettings();

  // Content & Audio settings
  const {
    streamingQuality,
    directSource,
    loudnessNormalization,
    skipSilence,
    preferAudioCuts,
    fontFamily,
    dynamicTint,
    reduceAnimation,
    setStreamingQuality,
    setDirectSource,
    setLoudnessNormalization,
    setSkipSilence,
    setPreferAudioCuts,
    setFontFamily,
    setDynamicTint,
    setReduceAnimation,
  } = useContentSettings();

  // Dialogs & Navigation
  const [lyricsModal, setLyricsModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryKey | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Storage estimation
  const [storageEstimate, setStorageEstimate] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((est) => {
          if (est.usage != null) {
            const mb = (est.usage / (1024 * 1024)).toFixed(1);
            setStorageEstimate(`${mb} MB`);
          }
        })
        .catch(() => {});
    }
  }, [cleared]);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      queryClient.clear();
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } catch {
      // Ignore clear errors
    } finally {
      setClearing(false);
    }
  };

  const present = extension.state === 'present';
  const extensionVersion = extension.state === 'present' ? `v${extension.extension.info.version}` : null;
  const ytStatsCapable = extension.state === 'present' ? extension.extension.info.capabilities.includes('yt.stats') : true;
  const discordAvailable = discord.state === 'ready' && discord.discord.available;

  const discordText =
    discord.state === 'ready' && discord.discord.connected
      ? discord.discord.enabled
        ? 'On'
        : 'Off'
      : discord.state === 'ready' && discord.discord.available
        ? 'Not connected'
        : null;

  const currentCategoryMeta = useMemo(() => {
    return CATEGORIES.find((c) => c.key === activeCategory) ?? null;
  }, [activeCategory]);

  const searching = searchQuery.trim().length > 0;
  const q = searchQuery.toLowerCase().trim();

  // Render Account & Integrations card (minimal monochrome vectors)
  const renderAccountGroup = () => (
    <section className={settingsUi.group}>
      <div className={settingsUi.integration}>
        <SiYoutubemusic size={22} className="text-[#ff0033] flex-shrink-0" />
        <span className={settingsUi.integrationName}>YouTube Music</span>
        <span className={settingsUi.value}>{youtubeText(yt)}</span>
      </div>
      <div className={settingsUi.integration}>
        <SiSpotify size={22} className="text-[#1ed760] flex-shrink-0" />
        <span className={settingsUi.integrationName}>Spotify</span>
        {present ? <SpotifyIntegration /> : <span className={settingsUi.value}>Needs {desktop ? 'engine' : 'extension'}</span>}
      </div>
      {present && discordAvailable && (
        <LinkRow to="/settings/discord" icon={<SiDiscord size={22} className="text-[#5865f2] flex-shrink-0" />} title="Discord" value={discordText} />
      )}
      <LinkRow
        to="/extension"
        icon={<MdOutlineExtension size={22} className="text-secondary flex-shrink-0" />}
        title={desktop ? 'Desktop Native Engine' : 'BeatFlow Extension'}
        value={extensionVersion ? extensionVersion : (desktop ? 'Embedded Host' : 'Not installed')}
      />
      <LinkRow
        to="/settings/listen-together"
        icon={<Users size={22} className="text-[#fa2d48] flex-shrink-0" />}
        title="Listen Together"
        value={party.code ? `Party: ${party.code}` : 'Listen in sync'}
      />
    </section>
  );

  // Playback group
  const renderPlaybackGroup = () => (
    <>
      <section className={settingsUi.group}>
        <Toggle
          icon={<PlayCircle size={20} />}
          label="AutoPlay"
          detail="When the queue ends, continue playing similar songs automatically."
          checked={autoplay}
          onChange={setAutoplay}
        />
        <label className={settingsUi.controlRowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <Waves size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Crossfade</span>
            <span className={settingsUi.rowDetail}>Smoothly transition between consecutive tracks</span>
          </span>
          <Select<number | 'automix'>
            label="Crossfade"
            value={automix ? 'automix' : crossfadeSec}
            options={[
              ...CROSSFADE_CHOICES.map((seconds) => ({
                value: seconds,
                label: seconds === 0 ? 'Off' : `${seconds} seconds`,
              })),
              { value: 'automix', label: 'Automix' },
            ]}
            onChange={(value) => (value === 'automix' ? setAutomix(true) : setCrossfade(value))}
          />
        </label>
        {automix && (
          <label className={settingsUi.controlRowWithIcon}>
            <span className={settingsUi.rowIcon}>
              <Sparkles size={20} />
            </span>
            <span className={settingsUi.rowText}>
              <span>Blend Length</span>
              <span className={settingsUi.rowDetail}>Maximum number of bars blended over beat matching</span>
            </span>
            <Select
              label="Blend Length"
              value={automixBars}
              options={AUTOMIX_BARS.map((bars) => ({ value: bars, label: `Up to ${bars} bars` }))}
              onChange={setAutomixBars}
            />
          </label>
        )}
        <Toggle
          icon={<Volume2 size={20} />}
          label="Loudness Normalization"
          detail="Normalizes audio output volume across different tracks to -14 LUFS."
          checked={loudnessNormalization}
          onChange={setLoudnessNormalization}
        />
        <Toggle
          icon={<VolumeX size={20} />}
          label="Skip Silence"
          detail="Automatically skips silent intros, outros, and long pauses."
          checked={skipSilence}
          onChange={setSkipSilence}
        />
        <Toggle
          icon={<BarChart2 size={20} />}
          label="Show Stats for Nerds"
          detail="Codec, bitrate and sample rate under the artist in full-screen player, and Automix state."
          checked={showNerdStats}
          onChange={setShowNerdStats}
        />
      </section>
      {automix && (
        <p className={settingsUi.footer}>
          Automix finds each song’s tempo, key and phrases, then blends on the beat: the next song is time-stretched to match, and
          the bass swaps over halfway. Based on AutoMix by David Finnegan (AGPL-3.0).
        </p>
      )}
    </>
  );

  // Appearance group
  const renderAppearanceGroup = () => (
    <>
      <section className={settingsUi.group}>
        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <SunMoon size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Theme Mode</span>
            <span className={settingsUi.rowDetail}>Select application visual theme</span>
          </span>
          <div className={settingsUi.segmentedControl}>
            <button
              type="button"
              className={`${settingsUi.segmentedButton} ${theme === 'system' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
              onClick={() => setTheme('system')}
            >
              <Monitor size={14} />
              <span>System</span>
            </button>
            <button
              type="button"
              className={`${settingsUi.segmentedButton} ${theme === 'dark' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={14} />
              <span>Dark</span>
            </button>
            <button
              type="button"
              className={`${settingsUi.segmentedButton} ${theme === 'light' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={14} />
              <span>Light</span>
            </button>
          </div>
        </div>

        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <Type size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>App Typeface</span>
            <span className={settingsUi.rowDetail}>Font typography used across the interface</span>
          </span>
          <div className={settingsUi.segmentedControl}>
            <button
              type="button"
              className={`${settingsUi.segmentedButton} ${fontFamily === 'dm-sans' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
              onClick={() => setFontFamily('dm-sans')}
            >
              <span>DM Sans</span>
            </button>
            <button
              type="button"
              className={`${settingsUi.segmentedButton} ${fontFamily === 'sf-pro' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
              onClick={() => setFontFamily('sf-pro')}
            >
              <span>SF Pro</span>
            </button>
            <button
              type="button"
              className={`${settingsUi.segmentedButton} ${fontFamily === 'system' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
              onClick={() => setFontFamily('system')}
            >
              <span>System</span>
            </button>
          </div>
        </div>

        <Toggle
          icon={<Film size={20} />}
          label="Animated Artwork"
          detail="Apple Music’s moving video covers in the full-screen player, albums, and playlists."
          checked={motion}
          onChange={setMotion}
        />
        <Toggle
          icon={<Sparkles size={20} />}
          label="Artist Header Art"
          detail="Artist pages feature Apple Music’s high-resolution photography, logos, and ambient video banners."
          checked={artistArt}
          onChange={setArtistArt}
        />
        <Toggle
          icon={<Palette size={20} />}
          label="Dynamic Artwork Tint"
          detail="Adapts background and player labels to match dominant album artwork colors."
          checked={dynamicTint}
          onChange={setDynamicTint}
        />
        <Toggle
          icon={<EyeOff size={20} />}
          label="Reduce Motion"
          detail="Disables decorative animations and transitions for performance and power saving."
          checked={reduceAnimation}
          onChange={setReduceAnimation}
        />
      </section>
      <p className={settingsUi.footer}>
        Animated artwork is automatically paused when battery saver or reduced motion is active.
      </p>
    </>
  );

  // Content & Audio group
  const renderContentGroup = () => (
    <>
      <section className={settingsUi.group}>
        <label className={settingsUi.controlRowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <Radio size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Streaming Quality</span>
            <span className={settingsUi.rowDetail}>Preferred audio quality ceiling for playback</span>
          </span>
          <Select<StreamingQuality>
            label="Streaming Quality"
            value={streamingQuality}
            options={[
              { value: 'high', label: 'High (256 kbps AAC / Opus)' },
              { value: 'normal', label: 'Normal (128 kbps Standard)' },
              { value: 'saver', label: 'Data Saver (64 kbps Low Bandwidth)' },
            ]}
            onChange={setStreamingQuality}
          />
        </label>
        <Toggle
          icon={<Zap size={20} />}
          label="Direct Source Streaming"
          detail="Stream audio directly from verified edge CDN sources where available."
          checked={directSource}
          onChange={setDirectSource}
        />
        <Toggle
          icon={<Music size={20} />}
          label="Prefer Studio Audio Cuts"
          detail="Always prioritize studio album releases over music video uploads and live cuts."
          checked={preferAudioCuts}
          onChange={setPreferAudioCuts}
        />
        <Toggle
          icon={<History size={20} />}
          label="Share Listening Activity to YouTube"
          detail={
            !ytStatsCapable
              ? 'Update the BeatFlow extension to share: this version can’t send plays to YouTube.'
              : 'Songs you play here go to your YouTube Music history and shape its recommendations.'
          }
          checked={shareHistory}
          onChange={setShareHistory}
        />
        <div className={settingsUi.integration}>
          <SiApplemusic size={22} className="text-[#fa2d48] flex-shrink-0" />
          <span className={settingsUi.integrationName}>Apple Music Metadata Access</span>
          {present ? <AppleMusicIntegration /> : <span className={settingsUi.value}>Needs host access</span>}
        </div>
      </section>
      <p className={settingsUi.footer}>From Apple Music’s public catalog. No Apple Music account or sign-in needed.</p>
    </>
  );

  // Lyrics group
  const renderLyricsGroup = () => (
    <>
      <section className={settingsUi.group}>
        <button className={`${settingsUi.integration} ${settingsUi.linkRow}`} onClick={() => setLyricsModal(true)}>
          <Quote size={22} className="text-secondary flex-shrink-0" />
          <span className={settingsUi.integrationName}>Lyric Sources</span>
          <span className={settingsUi.value}>
            Order, sources, syllable timing
            <ChevronRight size={16} />
          </span>
        </button>
        <div className={settingsUi.integration}>
          <Sparkles size={22} className="text-green flex-shrink-0" />
          <span className={settingsUi.integrationName}>Syllable-by-Syllable Sync</span>
          <span className={settingsUi.value}>
            <span className="inline-flex items-center gap-1 text-green font-medium">
              Supported & Active
            </span>
          </span>
        </div>
        <CanvasToggle />
        <div className={settingsUi.integration}>
          <ShieldCheck size={22} className="text-secondary flex-shrink-0" />
          <span className={settingsUi.integrationName}>Lyric Sources Access</span>
          {present ? <LyricSourcesAccess /> : <span className={settingsUi.value}>Needs {desktop ? 'engine' : 'extension'}</span>}
        </div>
      </section>
      <p className={settingsUi.footer}>
        Lyrics support exact word and syllable animations provided by KuGou, Musixmatch, LRCLIB, Netease, and Apple Music.
      </p>
    </>
  );

  // Storage & Cache group
  const renderStorageGroup = () => (
    <>
      <section className={settingsUi.group}>
        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <HardDrive size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Local Cache Storage</span>
            <span className={settingsUi.rowDetail}>Estimated disk storage used by artwork, audio cuts, and queries</span>
          </span>
          <span className={settingsUi.value}>{storageEstimate ?? 'Calculating…'}</span>
        </div>
        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <Trash2 size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Clear Cache</span>
            <span className={settingsUi.rowDetail}>Free up temporary storage and refresh cached assets</span>
          </span>
          <button
            type="button"
            className={settingsUi.inlineButton}
            onClick={handleClearCache}
            disabled={clearing}
          >
            {clearing ? 'Clearing…' : cleared ? 'Cleared ✓' : 'Clear Now'}
          </button>
        </div>
      </section>
      <p className={settingsUi.footer}>
        Offline media, cached artist motion banners and lyric tokens are automatically evicted when space is low.
      </p>
    </>
  );

  // About group
  const renderAboutGroup = () => (
    <>
      <section className={settingsUi.group}>
        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <Layers size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Application</span>
            <span className={settingsUi.rowDetail}>BeatFlow modern Apple Music client</span>
          </span>
          <span className={settingsUi.value}>{desktop ? 'Desktop App' : 'Web App'}</span>
        </div>
        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <Tag size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Version</span>
            <span className={settingsUi.rowDetail}>Client build version</span>
          </span>
          <span className={settingsUi.value}>{desktop ? 'v0.1.0' : 'v1.0.0'}</span>
        </div>
        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <Cpu size={20} />
          </span>
          <span className={settingsUi.rowText}>
            <span>Engine</span>
            <span className={settingsUi.rowDetail}>Backend media & playback engine</span>
          </span>
          <span className={settingsUi.value}>
            {desktop ? 'Embedded Rust Tauri Host' : extensionVersion ? `Extension ${extensionVersion}` : 'Not connected'}
          </span>
        </div>
        <a
          href="https://github.com/Devk-Abhi/Musicooo"
          target="_blank"
          rel="noopener noreferrer"
          className={`${settingsUi.categoryRow} hover:bg-quaternary/40`}
        >
          <div className={settingsUi.categoryLeft}>
            <SiGithub size={22} className="text-secondary group-hover:text-primary transition-colors flex-shrink-0" />
            <div className="flex flex-col text-start">
              <span className={settingsUi.categoryTitle}>GitHub Repository</span>
              <span className={settingsUi.categorySubtitle}>Source code, issues and releases</span>
            </div>
          </div>
          <div className={settingsUi.categoryRight}>
            <ExternalLink size={16} />
          </div>
        </a>
      </section>
      <p className={settingsUi.footer}>
        Built with React 19, Tailwind CSS v4, Shaka Player, Essentia.js, and Rust Tauri v2.
      </p>
    </>
  );

  // Search indexing and filtering
  const searchResults = useMemo(() => {
    if (!searching) return [];

    const matches: { key: SettingsCategoryKey; title: string; element: ReactNode }[] = [];

    const check = (title: string, keywords: string[], element: ReactNode, key: SettingsCategoryKey) => {
      const match =
        title.toLowerCase().includes(q) ||
        keywords.some((kw) => kw.toLowerCase().includes(q));
      if (match) matches.push({ key, title, element });
    };

    // Account & Integrations
    check('YouTube Music', ['youtube', 'google', 'account', 'sign in', 'auth'], (
      <div key="yt" className={settingsUi.integration}>
        <SiYoutubemusic size={22} className="text-[#ff0033] flex-shrink-0" />
        <span className={settingsUi.integrationName}>YouTube Music</span>
        <span className={settingsUi.value}>{youtubeText(yt)}</span>
      </div>
    ), 'content');

    check('Spotify', ['spotify', 'canvas', 'sync', 'library'], (
      <div key="spot" className={settingsUi.integration}>
        <SiSpotify size={22} className="text-[#1ed760] flex-shrink-0" />
        <span className={settingsUi.integrationName}>Spotify</span>
        {present ? <SpotifyIntegration /> : <span className={settingsUi.value}>Needs {desktop ? 'engine' : 'extension'}</span>}
      </div>
    ), 'content');

    check('Discord Presence', ['discord', 'rich presence', 'activity', 'rpc'], (
      <LinkRow key="dc" to="/settings/discord" icon={<SiDiscord size={22} className="text-[#5865f2] flex-shrink-0" />} title="Discord" value={discordText} />
    ), 'content');

    check(desktop ? 'Desktop Engine' : 'BeatFlow Extension', ['extension', 'engine', 'host', 'native', 'desktop'], (
      <LinkRow
        key="ext"
        to="/extension"
        icon={<MdOutlineExtension size={22} className="text-secondary flex-shrink-0" />}
        title={desktop ? 'Desktop Native Engine' : 'BeatFlow Extension'}
        value={extensionVersion ? extensionVersion : (desktop ? 'Embedded Host' : 'Not installed')}
      />
    ), 'about');

    check('Listen Together', ['jam', 'party', 'listen together', 'friends', 'sync'], (
      <LinkRow
        key="party"
        to="/settings/listen-together"
        icon={<Users size={22} className="text-[#fa2d48] flex-shrink-0" />}
        title="Listen Together"
        value={party.code ? `Party: ${party.code}` : 'Listen in sync'}
      />
    ), 'content');

    // Playback
    check('AutoPlay', ['autoplay', 'queue', 'recommendations', 'similar'], (
      <Toggle
        key="autoplay"
        icon={<PlayCircle size={20} />}
        label="AutoPlay"
        detail="When the queue ends, continue playing similar songs automatically."
        checked={autoplay}
        onChange={setAutoplay}
      />
    ), 'playback');

    check('Crossfade', ['crossfade', 'gapless', 'fade', 'mix', 'transition', 'automix'], (
      <label key="crossfade" className={settingsUi.controlRowWithIcon}>
        <span className={settingsUi.rowIcon}>
          <Waves size={20} />
        </span>
        <span className={settingsUi.rowText}>
          <span>Crossfade</span>
          <span className={settingsUi.rowDetail}>Smoothly transition between consecutive tracks</span>
        </span>
        <Select<number | 'automix'>
          label="Crossfade"
          value={automix ? 'automix' : crossfadeSec}
          options={[
            ...CROSSFADE_CHOICES.map((seconds) => ({
              value: seconds,
              label: seconds === 0 ? 'Off' : `${seconds} seconds`,
            })),
            { value: 'automix', label: 'Automix' },
          ]}
          onChange={(value) => (value === 'automix' ? setAutomix(true) : setCrossfade(value))}
        />
      </label>
    ), 'playback');

    check('Loudness Normalization', ['volume', 'loudness', 'normalize', 'replaygain', 'lufs', 'leveling'], (
      <Toggle
        key="loudness"
        icon={<Volume2 size={20} />}
        label="Loudness Normalization"
        detail="Normalizes audio output volume across different tracks to -14 LUFS standard."
        checked={loudnessNormalization}
        onChange={setLoudnessNormalization}
      />
    ), 'playback');

    check('Skip Silence', ['silence', 'skip silence', 'gapless', 'quiet', 'pause'], (
      <Toggle
        key="silence"
        icon={<VolumeX size={20} />}
        label="Skip Silence"
        detail="Automatically skips silent intros, outros, and long pauses."
        checked={skipSilence}
        onChange={setSkipSilence}
      />
    ), 'playback');

    check('Stats for Nerds', ['nerd', 'stats', 'bitrate', 'codec', 'sample rate', 'info'], (
      <Toggle
        key="nerd"
        icon={<BarChart2 size={20} />}
        label="Show Stats for Nerds"
        detail="Codec, bitrate and sample rate under the artist in full-screen player, and Automix state."
        checked={showNerdStats}
        onChange={setShowNerdStats}
      />
    ), 'playback');

    // Appearance
    check('Theme Mode', ['theme', 'dark', 'light', 'system', 'mode', 'color', 'appearance'], (
      <div key="theme" className={settingsUi.rowWithIcon}>
        <span className={settingsUi.rowIcon}>
          <SunMoon size={20} />
        </span>
        <span className={settingsUi.rowText}>
          <span>Theme Mode</span>
          <span className={settingsUi.rowDetail}>Select application visual theme</span>
        </span>
        <div className={settingsUi.segmentedControl}>
          <button
            type="button"
            className={`${settingsUi.segmentedButton} ${theme === 'system' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
            onClick={() => setTheme('system')}
          >
            <Monitor size={14} />
            <span>System</span>
          </button>
          <button
            type="button"
            className={`${settingsUi.segmentedButton} ${theme === 'dark' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
            onClick={() => setTheme('dark')}
          >
            <Moon size={14} />
            <span>Dark</span>
          </button>
          <button
            type="button"
            className={`${settingsUi.segmentedButton} ${theme === 'light' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
            onClick={() => setTheme('light')}
          >
            <Sun size={14} />
            <span>Light</span>
          </button>
        </div>
      </div>
    ), 'appearance');

    check('App Typeface', ['font', 'typeface', 'typography', 'sf pro', 'dm sans', 'system'], (
      <div key="font" className={settingsUi.rowWithIcon}>
        <span className={settingsUi.rowIcon}>
          <Type size={20} />
        </span>
        <span className={settingsUi.rowText}>
          <span>App Typeface</span>
          <span className={settingsUi.rowDetail}>Font typography used across the interface</span>
        </span>
        <div className={settingsUi.segmentedControl}>
          <button
            type="button"
            className={`${settingsUi.segmentedButton} ${fontFamily === 'dm-sans' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
            onClick={() => setFontFamily('dm-sans')}
          >
            <span>DM Sans</span>
          </button>
          <button
            type="button"
            className={`${settingsUi.segmentedButton} ${fontFamily === 'sf-pro' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
            onClick={() => setFontFamily('sf-pro')}
          >
            <span>SF Pro</span>
          </button>
          <button
            type="button"
            className={`${settingsUi.segmentedButton} ${fontFamily === 'system' ? settingsUi.segmentedActive : settingsUi.segmentedInactive}`}
            onClick={() => setFontFamily('system')}
          >
            <span>System</span>
          </button>
        </div>
      </div>
    ), 'appearance');

    check('Animated Artwork', ['animated artwork', 'motion', 'video cover', 'moving artwork'], (
      <Toggle
        key="motion"
        icon={<Film size={20} />}
        label="Animated Artwork"
        detail="Apple Music’s moving video covers in the full-screen player, albums, and playlists."
        checked={motion}
        onChange={setMotion}
      />
    ), 'appearance');

    check('Artist Header Art', ['artist art', 'header', 'banner', 'apple music photo'], (
      <Toggle
        key="artistArt"
        icon={<Sparkles size={20} />}
        label="Artist Header Art"
        detail="Artist pages feature Apple Music’s high-resolution photography, logos, and ambient video banners."
        checked={artistArt}
        onChange={setArtistArt}
      />
    ), 'appearance');

    check('Dynamic Artwork Tint', ['tint', 'color', 'background', 'accent', 'palette'], (
      <Toggle
        key="tint"
        icon={<Palette size={20} />}
        label="Dynamic Artwork Tint"
        detail="Adapts background and player labels to match dominant album artwork colors."
        checked={dynamicTint}
        onChange={setDynamicTint}
      />
    ), 'appearance');

    check('Reduce Motion', ['reduce motion', 'animation', 'performance', 'battery'], (
      <Toggle
        key="reduceMotion"
        icon={<EyeOff size={20} />}
        label="Reduce Motion"
        detail="Disables decorative animations and transitions for performance and power saving."
        checked={reduceAnimation}
        onChange={setReduceAnimation}
      />
    ), 'appearance');

    // Content
    check('Streaming Quality', ['quality', 'bitrate', 'audio quality', 'high', 'audio format'], (
      <label key="quality" className={settingsUi.controlRowWithIcon}>
        <span className={settingsUi.rowIcon}>
          <Radio size={20} />
        </span>
        <span className={settingsUi.rowText}>
          <span>Streaming Quality</span>
          <span className={settingsUi.rowDetail}>Preferred audio quality ceiling for playback</span>
        </span>
        <Select<StreamingQuality>
          label="Streaming Quality"
          value={streamingQuality}
          options={[
            { value: 'high', label: 'High (256 kbps AAC / Opus)' },
            { value: 'normal', label: 'Normal (128 kbps Standard)' },
            { value: 'saver', label: 'Data Saver (64 kbps Low Bandwidth)' },
          ]}
          onChange={setStreamingQuality}
        />
      </label>
    ), 'content');

    check('Direct Source Streaming', ['direct source', 'cdn', 'lossless', 'stream'], (
      <Toggle
        key="direct"
        icon={<Zap size={20} />}
        label="Direct Source Streaming"
        detail="Stream audio directly from verified edge CDN sources where available."
        checked={directSource}
        onChange={setDirectSource}
      />
    ), 'content');

    check('Prefer Studio Audio Cuts', ['studio', 'cuts', 'audio only', 'music only', 'video'], (
      <Toggle
        key="preferAudio"
        icon={<Music size={20} />}
        label="Prefer Studio Audio Cuts"
        detail="Always prioritize studio album releases over music video uploads and live cuts."
        checked={preferAudioCuts}
        onChange={setPreferAudioCuts}
      />
    ), 'content');

    check('Share Listening Activity', ['share history', 'scrobble', 'recommendations', 'history'], (
      <Toggle
        key="history"
        icon={<History size={20} />}
        label="Share Listening Activity to YouTube"
        detail="Songs you play here go to your YouTube Music history and shape its recommendations."
        checked={shareHistory}
        onChange={setShareHistory}
      />
    ), 'content');

    // Lyrics
    check('Lyric Sources', ['lyrics', 'words', 'subtitles', 'sources', 'kugou', 'musixmatch', 'lrclib'], (
      <button key="lyr-src" className={`${settingsUi.integration} ${settingsUi.linkRow}`} onClick={() => setLyricsModal(true)}>
        <Quote size={22} className="text-secondary flex-shrink-0" />
        <span className={settingsUi.integrationName}>Lyric Sources</span>
        <span className={settingsUi.value}>
          Order, sources, syllable timing
          <ChevronRight size={16} />
        </span>
      </button>
    ), 'lyrics');

    check('Spotify Canvas', ['canvas', 'spotify canvas', 'looping video', 'background'], (
      <CanvasToggle key="canvas" />
    ), 'lyrics');

    // Storage
    check('Storage & Cache', ['cache', 'storage', 'clear cache', 'temp', 'offline'], (
      <div key="storage-clear" className={settingsUi.rowWithIcon}>
        <span className={settingsUi.rowIcon}>
          <HardDrive size={20} />
        </span>
        <span className={settingsUi.rowText}>
          <span>Clear Cache ({storageEstimate ?? 'Estimating…'})</span>
          <span className={settingsUi.rowDetail}>Free up temporary storage and refresh cached assets</span>
        </span>
        <button
          type="button"
          className={settingsUi.inlineButton}
          onClick={handleClearCache}
          disabled={clearing}
        >
          {clearing ? 'Clearing…' : cleared ? 'Cleared ✓' : 'Clear Now'}
        </button>
      </div>
    ), 'storage');

    // About
    check('About & Version', ['about', 'version', 'github', 'architecture', 'credits'], (
      <div key="about-ver" className={settingsUi.rowWithIcon}>
        <span className={settingsUi.rowIcon}>
          <Layers size={20} />
        </span>
        <span className={settingsUi.rowText}>
          <span>BeatFlow {desktop ? 'Desktop' : 'Web'}</span>
          <span className={settingsUi.rowDetail}>Client build version</span>
        </span>
        <span className={settingsUi.value}>{desktop ? 'v0.1.0' : 'v1.0.0'}</span>
      </div>
    ), 'about');

    return matches;
  }, [
    searching,
    q,
    yt,
    present,
    desktop,
    discord,
    discordText,
    extension,
    extensionVersion,
    ytStatsCapable,
    party.code,
    autoplay,
    setAutoplay,
    automix,
    crossfadeSec,
    setAutomix,
    setCrossfade,
    loudnessNormalization,
    setLoudnessNormalization,
    skipSilence,
    setSkipSilence,
    showNerdStats,
    setShowNerdStats,
    theme,
    setTheme,
    fontFamily,
    setFontFamily,
    motion,
    setMotion,
    artistArt,
    setArtistArt,
    dynamicTint,
    setDynamicTint,
    reduceAnimation,
    setReduceAnimation,
    streamingQuality,
    setStreamingQuality,
    directSource,
    setDirectSource,
    preferAudioCuts,
    setPreferAudioCuts,
    shareHistory,
    setShareHistory,
    storageEstimate,
    clearing,
    cleared,
  ]);

  return (
    <div className={settingsUi.centered}>
      <PageHeader title={activeCategory && currentCategoryMeta ? currentCategoryMeta.title : 'Settings'} />
      <div className={settingsUi.body}>
        {/* Drill-down Back Navigation */}
        {activeCategory && !searching && (
          <button
            type="button"
            className={settingsUi.backButton}
            onClick={() => setActiveCategory(null)}
          >
            <ChevronLeft size={18} />
            <span>Settings</span>
          </button>
        )}

        {/* Search Bar matching Android SettingsSheet */}
        <div className={settingsUi.searchContainer}>
          <Search size={16} className="text-secondary flex-shrink-0" />
          <input
            type="text"
            className={settingsUi.searchInput}
            placeholder="Search settings…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className={settingsUi.searchClear}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Searching View */}
        {searching && (
          <div>
            {searchResults.length > 0 ? (
              <section className={settingsUi.group}>
                {searchResults.map((item) => item.element)}
              </section>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search size={36} className="text-secondary/60 mb-3 stroke-[1.5]" />
                <p className="type-title-3 font-semibold text-primary">No settings found</p>
                <p className="type-callout text-secondary mt-1">No settings match &ldquo;{searchQuery}&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {/* Drill-down View: One specific category */}
        {!searching && activeCategory && (
          <div>
            {activeCategory === 'playback' && renderPlaybackGroup()}
            {activeCategory === 'appearance' && renderAppearanceGroup()}
            {activeCategory === 'content' && renderContentGroup()}
            {activeCategory === 'lyrics' && renderLyricsGroup()}
            {activeCategory === 'storage' && renderStorageGroup()}
            {activeCategory === 'about' && renderAboutGroup()}
          </div>
        )}

        {/* Main View: Account & Integrations + Minimal Category Cards */}
        {!searching && !activeCategory && (
          <div>
            <h2 className={settingsUi.sectionHeader}>Account & Integrations</h2>
            {renderAccountGroup()}

            <h2 className={settingsUi.sectionHeader}>Categories</h2>
            <section className={settingsUi.group}>
              {CATEGORIES.map((cat) => {
                const IconComponent = cat.icon;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    className={settingsUi.categoryRow}
                    onClick={() => setActiveCategory(cat.key)}
                  >
                    <div className={settingsUi.categoryLeft}>
                      <IconComponent size={22} className={settingsUi.minimalIcon} />
                      <div className="flex flex-col text-start min-w-0">
                        <span className={settingsUi.categoryTitle}>{cat.title}</span>
                        <span className={settingsUi.categorySubtitle}>
                          {cat.subtitle}
                        </span>
                      </div>
                    </div>
                    <div className={settingsUi.categoryRight}>
                      {cat.badge && <span className={settingsUi.categoryBadge}>{cat.badge}</span>}
                      <ChevronRight size={18} />
                    </div>
                  </button>
                );
              })}
            </section>
          </div>
        )}
      </div>

      {/* Lyrics Settings Modal Dialog */}
      {lyricsModal && (
        <Suspense fallback={null}>
          <LyricsSettings onClose={() => setLyricsModal(false)} />
        </Suspense>
      )}
    </div>
  );
}
