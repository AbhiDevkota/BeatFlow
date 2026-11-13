// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getCanonicalVideoId } from '@/state/player';
import { useLyricsUi } from './useLyrics';

describe('getCanonicalVideoId', () => {
  it('returns bare videoId for standard track', () => {
    expect(getCanonicalVideoId('qSay_8xzijg')).toBe('qSay_8xzijg');
    expect(getCanonicalVideoId({ videoId: 'qSay_8xzijg' } as any)).toBe('qSay_8xzijg');
  });

  it('strips addon:source prefix to extract original video ID', () => {
    expect(getCanonicalVideoId('addon:Unified (M sweet_deploy):qSay_8xzijg')).toBe('qSay_8xzijg');
    expect(getCanonicalVideoId({ videoId: 'addon:tidal:qSay_8xzijg' } as any)).toBe('qSay_8xzijg');
  });

  it('extracts originalTrack videoId when upgraded track metadata is provided', () => {
    const upgraded = {
      videoId: 'addon:Unified (M sweet_deploy):upgraded123',
      originalTrack: {
        videoId: 'original456',
        title: 'Original Song',
        artists: [],
      },
    };
    expect(getCanonicalVideoId(upgraded as any)).toBe('original456');
  });

  it('prioritizes canonicalVideoId when explicitly present on NowPlaying', () => {
    const nowPlaying = {
      videoId: 'addon:Unified (M sweet_deploy):randomId',
      canonicalVideoId: 'canonical789',
    };
    expect(getCanonicalVideoId(nowPlaying as any)).toBe('canonical789');
  });
});

describe('useLyricsUi canonicalization', () => {
  it('stores and retrieves picked providers under canonical video ID', () => {
    useLyricsUi.setState({ picked: {}, states: {} });
    useLyricsUi.getState().pick('addon:Unified (M sweet_deploy):trackABC', 'genius');

    const state = useLyricsUi.getState();
    expect(state.picked['trackABC']).toBe('genius');
  });
});
