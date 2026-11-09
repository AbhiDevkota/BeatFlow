import { useMemo, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router';
import { PrefetchLink } from '@/components/PrefetchLink';
import { PlayIcon } from '@/components/icons/Transport';
import { Artwork } from '@/components/music/Artwork';
import { browseHref, hrefFor } from '@/components/music/links';
import { playList } from '@/components/music/play';
import { Shelves, TrackShelf } from '@/components/music/ShelfView';
import { LoadError, NeedsExtension } from '@/components/music/States';
import { MotionArtwork } from '@/components/music/MotionArtwork';
import { requestAppleAccess, useAppleArtistArt, useUngrantedAppleOrigins, type AppleArtistArt } from '@/data/apple/artistArt';
import { useMotionAllowed } from '@/data/apple/motionArt';
import { useArtist, useYouTubeReady } from '@/data/music/queries';
import type { MusicItem } from '@/data/music/types';
import { findTopRelease, organizeArtistShelves, recentLabel } from '@/lib/artistLayout';
import { computeAndroidPalette, useArtworkColor, type ArtworkColor } from '@/lib/artworkColor';
import { useIsDark } from '@/lib/theme';
import { usePageTint } from '@/lib/usePageTint';
import { ArtistSkeleton } from '@/skeletons/PageSkeletons';

/**
 * The name, or Apple's title logo in its place (AppleArtistArt.kt). Until the
 * logo has drawn, the name stands in, so the header is never left empty; a
 * logo that fails to load leaves the name.
 */
function ArtistName({
  name,
  apple,
  color,
}: {
  name: string;
  apple: AppleArtistArt | null;
  color?: string;
}) {
  const logo = apple?.logoUrl ?? null;
  const [shown, setShown] = useState<string | null>(null);
  const logoShown = !!logo && shown === logo;
  return (
    <h1
      className="type-header-emphasized text-[clamp(34px,5vw,64px)] leading-[1.05] [text-shadow:0_2px_20px_#00000059] data-logo:w-full data-logo:[text-shadow:none]"
      style={!logoShown ? { color: color ?? '#ffffff' } : undefined}
      data-logo={logoShown || undefined}
    >
      {!logoShown && name}
      {logo && (
        <img
          key={logo}
          // Apple's title logo in place of the name: at most 82% of the page's width and 30% of the
          // photo's height (the photo is the column's width over 1.93, and never taller than 70vh).
          className="mx-auto mt-0 mb-1.5 block h-auto max-h-[min(calc((100vw-var(--web-navigation-width))/1.93*0.3),21vh)] w-auto max-w-[min(82%,640px)] [filter:drop-shadow(0_2px_16px_#00000040)]"
          src={logo}
          alt={logoShown ? name : ''}
          hidden={!logoShown}
          // Its proportions are known before it decodes; the CSS caps its size.
          style={{ aspectRatio: String(apple!.logoAspect) }}
          decoding="async"
          onLoad={() => setShown(logo)}
        />
      )}
    </h1>
  );
}

/**
 * Top Release / Latest Release card (port of Android DetailScreen.kt TopReleaseCard):
 * Proportioned off Apple Music's card: 96px sleeve, title, type/year subtitle, and overline.
 */
function TopReleaseCard({ item }: { item: MusicItem }) {
  const label = recentLabel(item.subtitle);
  const href = hrefFor(item) ?? `/album/${encodeURIComponent(item.id)}`;

  return (
    <section className="mx-(--body-gutter) mt-6 mb-3" aria-label={label}>
      <h2 className="mb-2.5 type-title-2-emphasized">{label}</h2>
      <PrefetchLink
        to={href}
        className="group relative flex max-w-[560px] items-center gap-4 rounded-[20px] border border-divider bg-opaque-shelf p-3.5 shadow-sm transition-all duration-200 hover:border-vibrant-divider hover:brightness-[1.04] hover:shadow-md"
      >
        <div className="relative size-[96px] flex-none overflow-hidden rounded-[14px] bg-generic shadow-inner">
          <Artwork src={item.thumbnail} displayWidth={200} aspect={1} radius="14px" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="grid size-11 place-items-center rounded-full bg-white text-black shadow-lg transition-transform duration-150 group-hover:scale-105">
              <PlayIcon size={22} className="translate-x-0.5" />
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 pr-3">
          <p className="type-callout-emphasized text-secondary tracking-wide uppercase text-[11px]">
            {item.subtitle || label}
          </p>
          <p className="mt-0.5 type-title-2-emphasized truncate text-primary group-hover:underline">
            {item.title}
          </p>
          <p className="mt-0.5 type-callout text-secondary">
            {label}
          </p>
        </div>
      </PrefetchLink>
    </section>
  );
}

/**
 * An artist: full-bleed hero with the name and Play, Top Songs, then shelves.
 * 1-to-1 port of BeatFlow Android's artist page (ArtworkPalette.kt & DetailScreen.kt):
 * Apple's photograph, title logo over it, the exact palette.wash behind the page and
 * vertical gradient, onBackgroundVariant secondary text, and PlayCircle styling.
 */
export default function ArtistPage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const { missing } = useYouTubeReady();
  const artist = useArtist(id);
  const apple = useAppleArtistArt(artist.data?.name);
  const appleUngranted = useUngrantedAppleOrigins();
  const motionAllowed = useMotionAllowed();
  const isDark = useIsDark();

  const fallbackTint = useArtworkColor(artist.data?.heroImage);

  // Exact Android ArtworkPalette.kt engine calculation
  const palette = useMemo(
    () =>
      apple
        ? computeAndroidPalette(apple.background, apple.accent, isDark)
        : fallbackTint
          ? computeAndroidPalette(fallbackTint.background, fallbackTint.accent, isDark)
          : null,
    [apple, fallbackTint, isDark],
  );

  const tint = useMemo<ArtworkColor | null>(() => {
    if (!palette) return null;
    return {
      background: palette.wash,
      accent: palette.onBackground,
      keyColor: apple?.keyColor ?? palette.accent,
      secondary: palette.onBackgroundVariant,
      elevated: palette.elevated,
      divider: palette.divider,
      dark: isDark,
    };
  }, [palette, apple?.keyColor, isDark]);

  usePageTint(tint);

  const topRelease = useMemo(
    () => (artist.data?.shelves ? findTopRelease(artist.data.shelves) : null),
    [artist.data?.shelves],
  );

  const shelves = useMemo(
    () => (artist.data?.shelves ? organizeArtistShelves(artist.data.shelves) : []),
    [artist.data?.shelves],
  );

  if (missing) return <NeedsExtension />;
  if (artist.isError) return <LoadError error={artist.error} onRetry={() => void artist.refetch()} />;
  if (!artist.data) return <ArtistSkeleton />;

  const data = artist.data;
  const topSongs = { title: `${data.name}: Top Songs`, type: 'artist' as const, id: data.id };
  return (
    <>
      {/* The hero: full-bleed, ~1.93:1 of the content column, the name and actions centred near the bottom. */}
      <header className="relative max-h-[70vh] overflow-hidden">
        <div className="relative w-full">
          <Artwork src={data.heroImage} displayWidth={2880} aspect={1165 / 604} eager />
          {/* Apple's photograph fades in over YouTube's once it arrives. */}
          {apple && (
            <img
              key={apple.heroUrl}
              className="absolute inset-0 size-full object-cover object-top opacity-0 transition-opacity duration-400 ease-in data-loaded:opacity-100"
              src={apple.heroUrl}
              alt=""
              decoding="async"
              onLoad={(e) => e.currentTarget.setAttribute('data-loaded', '')}
            />
          )}
          {/* Apple's looping motion artwork video, replacing the photo when present. */}
          {motionAllowed && apple?.videoUrl && (
            <MotionArtwork
              key={apple.videoUrl}
              motion={{ url: apple.videoUrl, fallbackUrl: null }}
              className="absolute inset-0 size-full object-cover object-top opacity-0 transition-opacity duration-600 ease-in data-ready:opacity-100"
              highQuality
            />
          )}
        </div>
        {/* Android DetailScreen.kt exact vertical wash gradient: 0.45 transparent -> 0.65 wash 30% -> 0.82 wash 72% -> 0.94 wash 95% -> 1.00 wash 100% */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_45%,color-mix(in_srgb,var(--page-tint,var(--pageBG))_30%,transparent)_65%,color-mix(in_srgb,var(--page-tint,var(--pageBG))_72%,transparent)_82%,color-mix(in_srgb,var(--page-tint,var(--pageBG))_95%,transparent)_94%,var(--page-tint,var(--pageBG))_100%)]"
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-1.5 px-(--body-gutter) text-center">
          <ArtistName name={data.name} apple={apple} color={palette?.onBackground} />
          {data.audience && <p className="type-callout-emphasized text-secondary">{data.audience}</p>}
          <button
            // Android DetailScreen.kt PlayCircle: white filled circle with cutout showing background wash (or keyColor)
            className="mt-2.5 grid size-14 place-items-center rounded-full bg-(--play-fill) text-(--play-glyph) shadow-[0_4px_16px_#0000004d,inset_0_0_2px_#ffffff1a] transition-transform disabled:opacity-40 enabled:hover:scale-[1.04]"
            style={
              {
                '--play-fill': apple?.keyColor ? apple.keyColor : '#ffffff',
                '--play-glyph': apple?.keyColor ? '#ffffff' : (tint?.background ?? '#000000'),
              } as CSSProperties
            }
            aria-label={`Play ${data.name}`}
            disabled={!data.topSongs.length}
            onClick={() => playList(data.topSongs, 0, { source: topSongs })}
          >
            <PlayIcon size={26} />
          </button>
          {!apple && appleUngranted.length > 0 && (
            // The lyrics panel's permission notice, as a pill over the photograph.
            <div className="mt-3 flex items-center gap-2.5 rounded-[999px] bg-[#0000004d] py-1.5 pr-2 pl-3.5 type-callout text-[#ffffffcc] [backdrop-filter:blur(20px)_saturate(1.6)]">
              <span>Apple Music artist art needs the extension’s permission.</span>
              <button
                className="flex-none rounded-[999px] bg-[#ffffff26] px-2.5 py-1 type-callout-emphasized text-white hover:bg-[#ffffff40]"
                // Stays until the extension confirms the grant (checked when this tab comes back).
                onClick={requestAppleAccess}
              >
                Allow
              </button>
            </div>
          )}
        </div>
      </header>

      {topRelease && <TopReleaseCard item={topRelease} />}

      {data.topSongs.length > 0 && (
        <TrackShelf
          title="Top Songs"
          to={data.topSongsSeeAll ? browseHref(data.topSongsSeeAll) : null}
          tracks={data.topSongs}
          source={topSongs}
        />
      )}

      <Shelves shelves={shelves} />

      {data.description && (
        <section className="mx-(--body-gutter) mt-3 mb-10" aria-label={`About ${data.name}`}>
          <h2 className="type-title-2-emphasized">About {data.name}</h2>
          <p className="mt-2 max-w-[720px] type-body-tall whitespace-pre-line text-secondary">{data.description}</p>
        </section>
      )}
    </>
  );
}

