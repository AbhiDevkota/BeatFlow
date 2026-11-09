import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from './types';
import { clearAudioVersionCache, isVideoTrack, resolveAudioTrack, resolveVideoTrack } from './resolveAudio';

vi.mock('@/data/music/api', () => ({
  fetchOfficialVersionPair: vi.fn(),
  searchSongs: vi.fn(),
}));

import { fetchOfficialVersionPair, searchSongs } from '@/data/music/api';

const mockFetchOfficial = vi.mocked(fetchOfficialVersionPair);
const mockSearchSongs = vi.mocked(searchSongs);

describe('resolveAudio', () => {
  beforeEach(() => {
    clearAudioVersionCache();
    vi.resetAllMocks();
  });

  const videoTrack: Track = {
    videoId: 'vid123',
    title: 'Kesariya (Official Music Video)',
    artists: [{ name: 'Arijit Singh', id: null }],
    album: null,
    durationSec: 292,
    explicit: false,
    thumbnail: 'https://example.com/video.jpg',
    index: null,
    plays: '10M plays',
    isVideo: true,
  };

  const audioTrack: Track = {
    videoId: 'audio456',
    title: 'Kesariya',
    artists: [{ name: 'Arijit Singh', id: null }],
    album: { name: 'Brahmāstra', id: 'alb789' },
    durationSec: 268,
    explicit: false,
    thumbnail: 'https://example.com/album.jpg',
    index: 1,
    plays: '50M plays',
    isVideo: false,
  };

  it('detects video tracks vs catalogue songs correctly', () => {
    expect(isVideoTrack(videoTrack)).toBe(true);
    expect(isVideoTrack(audioTrack)).toBe(false);
    expect(isVideoTrack({ ...audioTrack, isVideo: true })).toBe(true);
    expect(isVideoTrack({ ...videoTrack, album: { name: 'Single', id: null }, isVideo: false })).toBe(false);
  });

  it('leaves audio-only tracks untouched', async () => {
    const res = await resolveAudioTrack(audioTrack);
    expect(res).toBe(audioTrack);
    expect(mockFetchOfficial).not.toHaveBeenCalled();
    expect(mockSearchSongs).not.toHaveBeenCalled();
  });

  it('resolves official paired audio track from watch endpoint', async () => {
    mockFetchOfficial.mockResolvedValueOnce(audioTrack);

    const resolved = await resolveAudioTrack(videoTrack);
    expect(resolved.videoId).toBe('audio456');
    expect(resolved.album?.name).toBe('Brahmāstra');
    expect(resolved.isVideo).toBe(false);
    expect(mockFetchOfficial).toHaveBeenCalledWith('vid123', true);
    expect(mockSearchSongs).not.toHaveBeenCalled();

    // Subsequent call should hit cache without network requests
    const cached = await resolveAudioTrack(videoTrack);
    expect(cached.videoId).toBe('audio456');
    expect(mockFetchOfficial).toHaveBeenCalledTimes(1);
  });

  it('falls back to searchSongs and bestOfficialAudioForVideo when no official pair exists', async () => {
    mockFetchOfficial.mockResolvedValueOnce(null);
    mockSearchSongs.mockResolvedValueOnce([audioTrack]);

    const resolved = await resolveAudioTrack(videoTrack);
    expect(resolved.videoId).toBe('audio456');
    expect(resolved.title).toBe('Kesariya');
    expect(resolved.album?.name).toBe('Brahmāstra');
    expect(resolved.durationSec).toBe(268);
    expect(mockSearchSongs).toHaveBeenCalled();
  });

  it('settles on original video when no audio version can be found', async () => {
    mockFetchOfficial.mockResolvedValueOnce(null);
    mockSearchSongs.mockResolvedValue([]);

    const resolved = await resolveAudioTrack(videoTrack);
    expect(resolved.videoId).toBe('vid123');
    expect(resolved.isVideo).toBe(true);

    // Should be cached so it does not search again
    const cached = await resolveAudioTrack(videoTrack);
    expect(cached.videoId).toBe('vid123');
    expect(mockFetchOfficial).toHaveBeenCalledTimes(1);
  });

  it('resolves paired video for an audio track via resolveVideoTrack', async () => {
    mockFetchOfficial.mockResolvedValueOnce(videoTrack);

    const video = await resolveVideoTrack(audioTrack);
    expect(video?.videoId).toBe('vid123');
    expect(video?.isVideo).toBe(true);
  });
});
