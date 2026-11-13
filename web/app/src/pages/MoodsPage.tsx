import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/icons/LogoMark';
import { PlayingBars } from '@/components/home/PlayingBars';
import { BeatLoader } from '@/components/music/BeatLoader';
import { PageHeader } from '@/components/PageHeader';
import { ALL_MOODS, type MoodDefinition } from '@/lib/homeLayout';
import { MoodCanvas } from '@/components/home/MoodCanvas';
import { playMoodStation, prewarmCoreMoods } from '@/lib/playMood';
import { usePlayer } from '@/state/player';

/**
 * 1:1 Find the Mood / MoodGridPage matching Android BeatFlow's MoodGridPage:
 * Displays all 28 mood and activity stations in a responsive grid with their
 * vector emblems at rest (still = true) and vivid Android colors, playing that mood's
 * station instantly on click.
 */
export default function MoodsPage() {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const activeSourceId = usePlayer((s) => s.queue[s.index]?.source?.id);
  const isPlaying = usePlayer((s) => s.status === 'playing');

  useEffect(() => {
    prewarmCoreMoods();
  }, []);

  const handleMoodClick = async (mood: MoodDefinition) => {
    setLoadingKey(mood.key);
    try {
      await playMoodStation(mood);
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="pb-24">
      <PageHeader title="Find Your Mood" />

      <div className="mx-(--body-gutter) mt-6">
        <p className="text-sm sm:text-base text-secondary max-w-2xl mb-8">
          Pick a mood or activity to play a personalized station with tracks tailored for every moment of your day.
        </p>

        {/* 1:1 Grid of all 28 mood cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-7">
          {ALL_MOODS.map((mood) => {
            const isLoading = loadingKey === mood.key;
            const isCurrentPlaying = isPlaying && activeSourceId === mood.key;

            return (
              <div
                key={mood.key}
                className="group flex flex-col cursor-pointer select-none"
                onClick={() => void handleMoodClick(mood)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleMoodClick(mood);
                  }
                }}
              >
                {/* Square Tile */}
                <div
                  className="relative w-full aspect-square rounded-xl overflow-hidden shadow-sm transition-transform duration-300 ease-out group-hover:scale-[1.03] group-hover:shadow-md"
                  style={{ backgroundColor: mood.background }}
                >
                  {/* 1:1 Android Skia Animated Canvas */}
                  <MoodCanvas
                    moodKey={mood.key}
                    strokeColor={mood.stroke}
                    backgroundColor={mood.background}
                    square={true}
                    className="pointer-events-none"
                  />

                  {/* BeatFlow Badge (Top-Right): Loader | Playing Bars | Logo */}
                  <div className="absolute top-2.5 right-2.5 size-5.5 grid place-items-center rounded-full bg-black/25 text-white/95 backdrop-blur-xs">
                    {isLoading ? (
                      <BeatLoader size={14} color="#ffffff" />
                    ) : isCurrentPlaying ? (
                      <PlayingBars size={18} className="bg-transparent" />
                    ) : (
                      <LogoMark size={12} />
                    )}
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
