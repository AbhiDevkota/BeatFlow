import { ChevronRight } from 'lucide-react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { ShelfScroller } from '@/components/music/ShelfView';
import { shelfHeader, shelfSection } from '@/components/shelf';
import type { Track } from '@/data/music/types';
import { playList } from '@/components/music/play';
import { CompactTrackRow } from './CompactTrackRow';

interface RecentShelfProps {
  tracks: Track[];
}

const RECENT_SOURCE = { title: 'Recently Played', type: 'home' as const };

/**
 * 4-rows-per-column horizontal scroller for Recently Played,
 * exactly matching Android's RecentShelf and CompactTrackRow.
 */
export function RecentShelf({ tracks }: RecentShelfProps) {
  if (!tracks.length) return null;

  // Chunk tracks into columns of 4
  const columns: Track[][] = [];
  for (let i = 0; i < tracks.length; i += 4) {
    columns.push(tracks.slice(i, i + 4));
  }

  return (
    <section className={shelfSection} aria-label="Recently Played">
      <div className={`${shelfHeader} justify-between`}>
        <h2 className="type-title-2-emphasized">
          <PrefetchLink to="/library/recent" className="group/title inline-flex items-center gap-0.5">
            Recently Played
            <ChevronRight size={18} strokeWidth={2.6} className="text-secondary group-hover/title:text-primary" />
          </PrefetchLink>
        </h2>
        <PrefetchLink
          to="/library/recent"
          className="group/all inline-flex items-center gap-0.5 text-sm font-medium text-key-accent hover:underline"
        >
          Show all
          <ChevronRight size={16} strokeWidth={2.4} />
        </PrefetchLink>
      </div>

      <ShelfScroller kind="tracks">
        {columns.map((column, colIdx) => (
          <li key={`recent-col-${colIdx}`} className="list-none w-[280px] sm:w-[320px] shrink-0">
            <div className="flex flex-col gap-1">
              {column.map((track, rowIdx) => {
                const globalIndex = colIdx * 4 + rowIdx;
                return (
                  <CompactTrackRow
                    key={track.videoId}
                    track={track}
                    onPlay={() => playList(tracks, globalIndex, { source: RECENT_SOURCE })}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ShelfScroller>
    </section>
  );
}
