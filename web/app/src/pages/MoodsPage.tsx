import { useNavigate } from 'react-router';
import { LogoMark } from '@/components/icons/LogoMark';
import { PageHeader } from '@/components/PageHeader';
import { ALL_MOODS, type MoodDefinition } from '@/lib/homeLayout';
import { MoodEmblem } from '@/components/home/TopPickArtwork';

/**
 * 1:1 Find the Mood / MoodGridPage matching Android BeatFlow's MoodGridPage:
 * Displays all 28 mood and activity stations in a responsive grid with their
 * animated vector emblems, vivid Android colors, logo badges, and navigates
 * to their respective YouTube Music category browse stations.
 */
export default function MoodsPage() {
  const navigate = useNavigate();

  const handleMoodClick = (mood: MoodDefinition) => {
    navigate(`/browse/FEmusic_moods_and_genres_category?params=${encodeURIComponent(mood.params)}`);
  };

  return (
    <div className="pb-24">
      <PageHeader title="Find Your Mood" />

      <div className="mx-(--body-gutter) mt-6">
        <p className="text-sm sm:text-base text-secondary max-w-2xl mb-8">
          Pick a mood or activity to explore tailored stations and playlists designed for every moment of your day.
        </p>

        {/* 1:1 Grid of all 28 mood cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-7">
          {ALL_MOODS.map((mood) => (
            <div
              key={mood.key}
              className="group flex flex-col cursor-pointer select-none"
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
                className="relative w-full aspect-square rounded-xl overflow-hidden shadow-sm transition-all duration-200 group-hover:scale-[1.03] group-hover:shadow-md flex items-center justify-center"
                style={{ backgroundColor: mood.background }}
              >
                {/* Mood Animated Vector Emblem */}
                <div className="w-[70%] h-[70%] flex items-center justify-center pointer-events-none">
                  <MoodEmblem
                    moodKey={mood.key}
                    strokeColor={mood.stroke}
                    className="w-full h-full opacity-95 transition-transform duration-300 group-hover:scale-110"
                  />
                </div>

                {/* BeatFlow Logo Badge (Top-Right, matching Android) */}
                <div className="absolute top-2.5 right-2.5 size-5 sm:size-5.5 grid place-items-center rounded-full bg-black/25 text-white/95 backdrop-blur-xs">
                  <LogoMark size={12} />
                </div>
              </div>

              {/* Title and subtitle */}
              <span className="mt-2.5 text-sm sm:text-[15px] font-semibold text-primary truncate group-hover:text-key-accent transition-colors">
                {mood.title}
              </span>
              <span className="text-xs text-secondary truncate mt-0.5">
                {mood.subtitle}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
