import { describe, expect, it } from 'vitest';
import { resolveDeepLink } from './deepLink';

describe('resolveDeepLink', () => {
  it('ignores non-beatflow URLs', () => {
    expect(resolveDeepLink('https://example.com')).toBeNull();
    expect(resolveDeepLink('spotify://track/123')).toBeNull();
    expect(resolveDeepLink('')).toBeNull();
  });

  it('resolves party / listen-together deep links', () => {
    expect(resolveDeepLink('beatflow://party/ABC123')).toBe('/invite/ABC123');
    expect(resolveDeepLink('beatflow://party/ABC123?server=https%3A%2F%2Fjam.test')).toBe('/invite/ABC123?server=https%3A%2F%2Fjam.test');
    expect(resolveDeepLink('beatflow://party?code=XYZ789')).toBe('/invite/XYZ789');
  });

  it('resolves media and browse deep links', () => {
    expect(resolveDeepLink('beatflow://album/MPREb_12345')).toBe('/album/MPREb_12345');
    expect(resolveDeepLink('beatflow://artist/UC12345')).toBe('/artist/UC12345');
    expect(resolveDeepLink('beatflow://playlist/VLPL12345')).toBe('/playlist/VLPL12345');
    expect(resolveDeepLink('beatflow://search?q=kesariya')).toBe('/search?q=kesariya');
    expect(resolveDeepLink('beatflow://watch?v=abcd1234efg')).toBe('/search?q=abcd1234efg');
  });

  it('resolves settings and account deep links', () => {
    expect(resolveDeepLink('beatflow://settings')).toBe('/settings');
    expect(resolveDeepLink('beatflow://settings/accounts')).toBe('/settings/accounts');
    expect(resolveDeepLink('beatflow://settings/discord')).toBe('/settings/discord');
    expect(resolveDeepLink('beatflow://settings/listen-together')).toBe('/settings/listen-together');
    expect(resolveDeepLink('beatflow://library/songs')).toBe('/library/songs');
    expect(resolveDeepLink('beatflow://spotify')).toBe('/spotify');
  });
});
