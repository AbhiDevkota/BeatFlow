import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { LogoMark } from '@/components/icons/LogoMark';
import { PrefetchLink } from '@/components/PrefetchLink';
import { shelfHeader, shelfSection } from '@/components/shelf';
import { CORE_MOODS, type MoodDefinition } from '@/lib/homeLayout';
import { MoodEmblem } from './TopPickArtwork';

const arrow =
  'absolute top-1/2 z-3 hidden h-13 w-7 -translate-y-1/2 place-items-center rounded-pill bg-thin-material text-secondary opacity-0 transition-[opacity,background-color,color] duration-(--duration-arrow) ease-linear [backdrop-filter:saturate(180%)_blur(60px)] hover:text-primary disabled:pointer-events-none lg:grid lg:enabled:group-hover/shelf:opacity-100';

export function FindYourMoodShelf() {
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
    el.scrollBy({ left: direction * 400, behavior: 'smooth' });
  };

  const handleMoodClick = (mood: MoodDefinition) => {
    navigate(`/browse/FEmusic_moods_and_genres_category?params=${encodeURIComponent(mood.params)}`);
  };

  return (
    <section className={shelfSection} aria-label="Find Your Mood">
      <div className={`${shelfHeader} justify-between`}>
        <h2 className="type-title-2-emphasized">Find Your Mood</h2>
        <PrefetchLink
          to="/explore"
          className="group/all inline-flex items-center gap-0.5 text-sm font-medium text-key-accent hover:underline"
        >
          Show all
          <ChevronRight size={16} strokeWidth={2.4} />
        </PrefetchLink>
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
          className="flex gap-3.5 overflow-x-auto overflow-y-hidden px-(--body-gutter) py-2 -my-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={measure}
        >
          {CORE_MOODS.map((mood) => (
            <li key={mood.key} className="list-none shrink-0 snap-start">
              <div
                className="group/mood flex flex-col w-[150px] sm:w-[170px] cursor-pointer select-none"
                onClick={() => handleMoodClick(mood)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleMoodClick(mood);
                  }
                }}
              >
                {/* Square Tile */}
                <div
                  className="relative w-full aspect-square rounded-xl overflow-hidden shadow-sm transition-transform duration-200 group-hover/mood:scale-[1.02] flex items-center justify-center"
                  style={{ backgroundColor: mood.background }}
                >
                  {/* Mood SVG Emblem */}
                  <MoodEmblem
                    moodKey={mood.key}
                    strokeColor={mood.stroke}
                    className="w-20 h-20 opacity-95 transition-transform duration-300 group-hover/mood:scale-110"
                  />

                  {/* BeatFlow Logo Badge (Top-Right) */}
                  <div className="absolute top-2.5 right-2.5 size-5 grid place-items-center rounded-full bg-black/20 text-white/95">
                    <LogoMark size={12} />
                  </div>
                </div>

                {/* Title below tile */}
                <span className="mt-2 text-sm font-semibold text-primary truncate">
                  {mood.title}
                </span>
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
