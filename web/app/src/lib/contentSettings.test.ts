// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { applyFont, useContentSettings } from './contentSettings';

describe('contentSettings', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-font');
    useContentSettings.setState({
      streamingQuality: 'high',
      directSource: true,
      loudnessNormalization: true,
      skipSilence: false,
      preferAudioCuts: true,
      fontFamily: 'dm-sans',
      dynamicTint: true,
      reduceAnimation: false,
    });
  });

  it('updates streaming quality', () => {
    expect(useContentSettings.getState().streamingQuality).toBe('high');
    useContentSettings.getState().setStreamingQuality('normal');
    expect(useContentSettings.getState().streamingQuality).toBe('normal');
  });

  it('updates direct source preference', () => {
    expect(useContentSettings.getState().directSource).toBe(true);
    useContentSettings.getState().setDirectSource(false);
    expect(useContentSettings.getState().directSource).toBe(false);
  });

  it('updates and applies font family', () => {
    useContentSettings.getState().setFontFamily('sf-pro');
    expect(useContentSettings.getState().fontFamily).toBe('sf-pro');
    expect(document.documentElement.getAttribute('data-font')).toBe('sf-pro');

    applyFont('system');
    expect(document.documentElement.getAttribute('data-font')).toBe('system');
  });

  it('toggles playback audio enhancements', () => {
    useContentSettings.getState().setLoudnessNormalization(false);
    expect(useContentSettings.getState().loudnessNormalization).toBe(false);

    useContentSettings.getState().setSkipSilence(true);
    expect(useContentSettings.getState().skipSilence).toBe(true);

    useContentSettings.getState().setPreferAudioCuts(false);
    expect(useContentSettings.getState().preferAudioCuts).toBe(false);
  });
});
