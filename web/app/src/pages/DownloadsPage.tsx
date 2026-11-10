import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/music/States';

/** Downloads: lists songs and albums saved for offline playback. */
export default function DownloadsPage() {
  return (
    <>
      <PageHeader title="Downloads" />
      <EmptyState
        title="No downloaded tracks"
        detail="Music you download will appear here for offline listening."
      />
    </>
  );
}
