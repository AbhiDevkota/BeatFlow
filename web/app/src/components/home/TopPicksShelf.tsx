import { useNavigate } from 'react-router';
import { LogoMark } from '@/components/icons/LogoMark';
import { PlayIcon } from '@/components/icons/Transport';
import { ShelfScroller } from '@/components/music/ShelfView';
import { shelfHeader, shelfSection } from '@/components/shelf';
import type { TopPickItem } from '@/lib/homeLayout';
import { playTrack } from '@/components/music/play';
import { DiscoveryStationArt, MoodEmblem, PersonalStationArt } from './TopPickArtwork';

interface TopPicksShelfProps {
  picks: TopPickItem[];
}

export function TopPicksShelf({ picks }: TopPicksShelfProps) {
  const navigate = useNavigate();

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

      <ShelfScroller kind="editorial">
        {picks.map((pick) => (
          <li key={pick.id} className="list-none">
            <div
              className="group/card relative w-[240px] sm:w-[260px] aspect-[3/4] shrink-0 rounded-xl overflow-hidden cursor-pointer select-none bg-surface-secondary shadow-sm transition-transform duration-200 hover:scale-[1.01]"
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
                      className="w-32 h-32 opacity-90 transition-transform duration-300 group-hover/card:scale-105"
                    />
                  </div>
                ) : (
                  <div className="relative w-full h-full bg-surface-secondary">
                    {pick.thumbnail && (
                      <>
                        {/* Blurred lower backdrop */}
                        <img
                          src={pick.thumbnail}
                          alt=""
                          className="absolute bottom-0 inset-x-0 w-full h-1/2 object-cover filter blur-xl opacity-70"
                        />
                        {/* Crisp upper image */}
                        <img
                          src={pick.thumbnail}
                          alt=""
                          className="w-full aspect-square object-cover"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Dark gradient for caption contrast */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

              {/* BeatFlow Logo Badge (Top-Right) */}
              <div className="absolute top-3 right-3 z-2 size-6 grid place-items-center rounded-full bg-black/30 backdrop-blur-md text-white/90">
                <LogoMark size={14} />
              </div>

              {/* Hover Play Platter (Center) */}
              <div className="pointer-events-none absolute inset-0 z-2 grid place-items-center opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
                <div className="grid size-12 place-items-center rounded-full bg-white/95 text-black shadow-lg backdrop-blur-md transition-transform group-hover/card:scale-105">
                  <PlayIcon size={22} />
                </div>
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
      </ShelfScroller>
    </section>
  );
}
