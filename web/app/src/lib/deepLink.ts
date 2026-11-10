/**
 * Resolves a `beatflow://` deep link URL into an internal web application route.
 *
 * Supported URI patterns:
 * - `beatflow://party/<CODE>?server=<SERVER>` -> `/invite/<CODE>?server=<SERVER>`
 * - `beatflow://party?code=<CODE>` -> `/invite/<CODE>`
 * - `beatflow://watch?v=<VIDEO_ID>` -> `/search?q=<VIDEO_ID>`
 * - `beatflow://album/<ID>` -> `/album/<ID>`
 * - `beatflow://artist/<ID>` -> `/artist/<ID>`
 * - `beatflow://playlist/<ID>` -> `/playlist/<ID>`
 * - `beatflow://search?q=<QUERY>` -> `/search?q=<QUERY>`
 * - `beatflow://settings` -> `/settings`
 * - `beatflow://settings/accounts` -> `/settings/accounts`
 * - `beatflow://settings/discord` -> `/settings/discord`
 * - `beatflow://settings/listen-together` -> `/settings/listen-together`
 * - `beatflow://library/<SECTION>` -> `/library/<SECTION>`
 * - `beatflow://spotify` -> `/spotify`
 */
export function resolveDeepLink(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('beatflow://')) return null;

  const withoutScheme = trimmed.slice('beatflow://'.length);
  const [pathPart = '', queryString] = withoutScheme.split('?');
  const path = pathPart.replace(/^\/+|\/+$/g, '');
  const search = queryString ? `?${queryString}` : '';

  // 1. Party / Listen Together: beatflow://party/<CODE> or beatflow://party?code=<CODE>
  if (path.startsWith('party/')) {
    const code = path.slice('party/'.length).replace(/\/.*$/, '');
    return `/invite/${code}${search}`;
  }
  if (path === 'party' && queryString) {
    const params = new URLSearchParams(queryString);
    const code = params.get('code');
    if (code) {
      const server = params.get('server');
      return server ? `/invite/${code}?server=${encodeURIComponent(server)}` : `/invite/${code}`;
    }
  }

  // 2. Watch / Track: beatflow://watch?v=<ID>
  if (path === 'watch' && queryString) {
    const params = new URLSearchParams(queryString);
    const v = params.get('v');
    if (v) return `/search?q=${encodeURIComponent(v)}`;
  }

  // 3. Album: beatflow://album/<ID>
  if (path.startsWith('album/')) {
    return `/${path}`;
  }

  // 4. Artist: beatflow://artist/<ID>
  if (path.startsWith('artist/')) {
    return `/${path}`;
  }

  // 5. Playlist: beatflow://playlist/<ID>
  if (path.startsWith('playlist/')) {
    return `/${path}`;
  }

  // 6. Search: beatflow://search?q=<QUERY>
  if (path === 'search' || path.startsWith('search/')) {
    return `/search${search}`;
  }

  // 7. Settings: beatflow://settings or sub-pages
  if (path === 'settings' || path.startsWith('settings/')) {
    return `/${path}${search}`;
  }

  // 8. Library: beatflow://library/<SECTION>
  if (path.startsWith('library/')) {
    return `/${path}`;
  }

  // 9. Spotify: beatflow://spotify
  if (path === 'spotify' || path.startsWith('spotify/')) {
    return `/${path}`;
  }

  // Generic fallback if path is provided
  if (path) {
    return `/${path}${search}`;
  }

  return null;
}
