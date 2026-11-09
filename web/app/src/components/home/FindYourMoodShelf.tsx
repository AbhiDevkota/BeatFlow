import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { LogoMark } from '@/components/icons/LogoMark';
import { PrefetchLink } from '@/components/PrefetchLink';
import { ShelfScroller } from '@/components/music/ShelfView';
import { shelfHeader, shelfSection } from '@/components/shelf';
import { CORE_MOODS, type MoodDefinition } from '@/lib/homeLayout';
import { MoodEmblem } from './TopPickArtwork';

export function FindYourMoodShelf() {
  const navigate = useNavigate();

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

      <ShelfScroller kind="square">
        {CORE_MOODS.map((mood) => (
          <li key={mood.key} className="list-none">
            <div
              className="group/mood flex flex-col w-[150px] sm:w-[170px] shrink-0 cursor-pointer select-none"
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
              <span className="mt-2 text-sm font-semibold text-primary truncate group-hover/mood:underline">
                {mood.title}
              </span>
            </div>
          </li>
        ))}
      </ShelfScroller>
    </section>
  );
}
