import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { LogoMark } from '@/components/icons/LogoMark';
import { shelfHeader, shelfSection } from '@/components/shelf';
import type { TopPickItem } from '@/lib/homeLayout';
import { playTrack } from '@/components/music/play';
import { CardPhotoArt, DiscoveryStationArt, MoodEmblem, PersonalStationArt } from './TopPickArtwork';

interface TopPicksShelfProps {
  picks: TopPickItem[];
}

const arrow =
  'absolute top-1/2 z-3 hidden h-13 w-7 -translate-y-1/2 place-items-center rounded-pill bg-thin-material text-secondary opacity-0 transition-[opacity,background-color,color] duration-(--duration-arrow) ease-linear [backdrop-filter:saturate(180%)_blur(60px)] hover:text-primary disabled:pointer-events-none lg:grid lg:enabled:group-hover/shelf:opacity-100';

export function TopPicksShelf({ picks }: TopPicksShelfProps) {
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 560, behavior: 'smooth' });
  };

  if (!picks.length) return null;

  const handlePickClick = (pick: TopPickItem) => {
    if (pick.browseId) {
      if (pick.browseId.startsWith('MPREb_')) {
        navigate(`/album/${encodeURIComponent(pick.browseId)}`);
        return;
      }
      if (pick.browseId.startsWith('UC')) {
        navigate(`/artist/${encodeURIComponent(pick.browseId)}`);
        return;
      }
      if (pick.browseId.startsWith('VL')) {
        navigate(`/playlist/${encodeURIComponent(pick.browseId)}`);
        return;
      }
    }

    if (pick.kind === 'MOOD' && pick.mood) {
      navigate(`/browse/FEmusic_moods_and_genres_category?params=${encodeURIComponent(pick.mood.params)}`);
      return;
    }

    if (pick.target?.videoId) {
      playTrack(
        {
          id: pick.target.videoId,
          title: pick.title,
          subtitle: pick.subtitle,
          artists: [],
          album: null,
          thumbnail: pick.thumbnail ?? null,
          wide: false,
          kind: 'song',
          durationSec: null,
          explicit: false,
        },
        pick.thumbnail,
        { title: pick.title, type: 'home' },
      );
    }
  };

  return (
    <section className={shelfSection} aria-label="Top Picks for You">
      <div className={shelfHeader}>
        <h2 className="type-title-2-emphasized">Top Picks for You</h2>
      </div>

      <div className="group/shelf relative">
        <button
          className={`${arrow} left-1.5`}
          aria-label="Previous Page"
          disabled={edges.start}
          onClick={() => page(-1)}
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>

        <ul
          ref={listRef}
          className="flex gap-4 overflow-x-auto overflow-y-hidden px-(--body-gutter) py-2 -my-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={measure}
        >
          {picks.map((pick) => (
            <li key={pick.id} className="list-none shrink-0 snap-start">
              <div
                className="group/card relative w-[240px] sm:w-[260px] aspect-[3/4] rounded-xl overflow-hidden cursor-pointer select-none bg-surface-secondary shadow-sm transition-transform duration-200 hover:scale-[1.01]"
                onClick={() => handlePickClick(pick)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePickClick(pick);
                  }
                }}
              >
                {/* Background Art */}
                <div className="absolute inset-0">
                  {pick.kind === 'PERSONAL_STATION' ? (
                    <PersonalStationArt />
                  ) : pick.kind === 'DISCOVERY_STATION' ? (
                    <DiscoveryStationArt />
                  ) : pick.kind === 'MOOD' && pick.mood ? (
                    <div
                      className="relative w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: pick.mood.background }}
                    >
                      <MoodEmblem
                        moodKey={pick.mood.key}
                        strokeColor={pick.mood.stroke}
                        className="w-32 h-32 opacity-90"
                      />
                    </div>
                  ) : (
                    <CardPhotoArt pick={pick} />
                  )}
                </div>

                {/* Dark gradient for caption contrast */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

                {/* BeatFlow Logo Badge (Top-Right) */}
                <div className="absolute top-3 right-3 z-2 size-6 grid place-items-center rounded-full bg-black/30 backdrop-blur-md text-white/90">
                  <LogoMark size={14} />
                </div>

                {/* Caption (Bottom) */}
                <div className="absolute bottom-0 inset-x-0 z-2 p-4 flex flex-col min-w-0">
                  <span
                    className="text-[11px] font-bold tracking-wider uppercase truncate"
                    style={{ color: pick.eyebrowColor || 'rgba(255, 255, 255, 0.75)' }}
                  >
                    {pick.eyebrow}
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white line-clamp-2 leading-tight mt-0.5">
                    {pick.title}
                  </h3>
                  {pick.subtitle && (
                    <p className="text-xs text-white/80 truncate mt-0.5">{pick.subtitle}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <button
          className={`${arrow} right-1.5`}
          aria-label="Next Page"
          disabled={edges.end}
          onClick={() => page(1)}
        >
          <ChevronRight size={20} strokeWidth={2.4} />
        </button>
      </div>
    </section>
  );
}
