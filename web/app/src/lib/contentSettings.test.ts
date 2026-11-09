// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { useContentSettings } from './contentSettings';

describe('contentSettings', () => {
  beforeEach(() => {
    useContentSettings.setState({
      streamingQuality: 'high',
      directSource: true,
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
});
