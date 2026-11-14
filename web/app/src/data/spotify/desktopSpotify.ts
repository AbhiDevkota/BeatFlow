import type { SpotifyAuthState, SpotifyPage, SpotifyPlaylist, SpotifyTrack } from '@bitchord/shared/bridge';
import { desktopBridge } from '@bitchord/shared/bridge';

const WEB_PLAYER = 'https://open.spotify.com';
const CDN = 'https://open.spotifycdn.com/cdn/build/web-player/';
const PATHFINDER = 'https://api-partner.spotify.com/pathfinder/v2/query';
const CLIENT_TOKEN = 'https://clienttoken.spotify.com/v1/clienttoken';

type Operation = 'libraryV3' | 'fetchPlaylist' | 'fetchLibraryTracks' | 'canvas' | 'searchTracks' | 'profileAttributes';

const KNOWN_HASHES: Record<Operation, string> = {
  libraryV3: '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
  fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  canvas: '575138ab27cd5c1b3e54da54d0a7cc8d85485402de26340c2145f0f6bb5e7a9f',
  searchTracks: 'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751',
  profileAttributes: '08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0',
};
const OPERATIONS = Object.keys(KNOWN_HASHES) as Operation[];

const KNOWN_SECRET = {
  version: 12,
  codes: [107, 81, 49, 57, 67, 93, 87, 81, 69, 67, 40, 93, 48, 50, 46, 91, 94, 113, 41, 47],
};

export const LIKED_ID = 'liked';
const LIKED_COVER = 'https://misc.scdn.co/liked-songs/liked-songs-640.png';

const FOUND_TTL_MS = 12 * 60 * 60_000;
const MISSED_TTL_MS = 30 * 60_000;

export class SpotifyAuthError extends Error {
  readonly code = 'unauthenticated';
}

interface WebPlayer {
  clientVersion: string;
  secret: { version: number; codes: number[] };
  hashes: Record<Operation, string>;
  complete: boolean;
  at: number;
}

const WEB_PLAYER_KEY = 'beatflow:spotify:webPlayer';
let webPlayerCache: WebPlayer | null = null;

export function unescapeJs(body: string): string {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc: string) => {
    if (esc[0] === 'u') return String.fromCodePoint(parseInt(esc.replace(/[u{}]/g, ''), 16));
    if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' } as Record<string, string>)[esc] ?? esc;
  });
}

export function secretsIn(script: string): { version: number; codes: number[] }[] {
  return [...script.matchAll(/\{secret:(['"])((?:\\.|(?!\1).)*)\1,version:(\d+)\}/g)]
    .map((m) => ({ version: Number(m[3]), codes: [...unescapeJs(m[2]!)].map((c) => c.charCodeAt(0)) }))
    .sort((a, b) => b.version - a.version);
}

export function queryHashIn(script: string, operation: string): string | null {
  return script.match(new RegExp(`["']${operation}["']\\s*,\\s*["']query["']\\s*,\\s*["']([0-9a-f]{64})["']`))?.[1] ?? null;
}

async function httpFetchText(url: string, headers?: Record<string, string>): Promise<string | null> {
  const bridge = desktopBridge();
  if (bridge) {
    try {
      const res = await bridge.call(
        'lyrics.fetch',
        {
          url,
          method: 'GET',
          headers: headers ?? {},
        },
        { timeoutMs: 30_000 }
      );
      return res.status >= 200 && res.status < 300 ? res.body : null;
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch(url, { headers, credentials: 'omit' });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function httpFetchJson(
  url: string,
  init?: { method?: 'GET' | 'HEAD' | 'POST'; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: any }> {
  const bridge = desktopBridge();
  if (bridge) {
    try {
      const res = await bridge.call(
        'lyrics.fetch',
        {
          url,
          method: init?.method ?? 'GET',
          headers: init?.headers ?? {},
          body: init?.body,
        },
        { timeoutMs: 30_000 }
      );
      let parsed: any = {};
      try {
        parsed = JSON.parse(res.body);
      } catch {}
      return { status: res.status, body: parsed };
    } catch {
      return { status: 500, body: {} };
    }
  }
  try {
    const res = await fetch(url, {
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
      credentials: 'omit',
    });
    const parsed = await res.json().catch(() => ({}));
    return { status: res.status, body: parsed };
  } catch {
    return { status: 500, body: {} };
  }
}

async function readWebPlayer(): Promise<WebPlayer> {
  const html = (await httpFetchText(`${WEB_PLAYER}/`)) ?? '';
  let clientVersion = '';
  const config = html.match(/<script id="appServerConfig" type="text\/plain">([^<]+)<\/script>/)?.[1];
  if (config) {
    try {
      clientVersion = (JSON.parse(atob(config)) as { clientVersion?: string }).clientVersion ?? '';
    } catch {}
  }
  const bundleUrl = html.match(/https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[0-9a-f]+\.js/)?.[0];
  const bundle = bundleUrl ? ((await httpFetchText(bundleUrl)) ?? '') : '';
  let searchChunk = '';
  const searchId = bundle.match(/(\d+):"xpui-routes-search"/)?.[1];
  if (searchId) {
    for (const [, part] of bundle.matchAll(new RegExp(`\\b${searchId}:"([0-9a-f]{8})"`, 'g'))) {
      searchChunk = (await httpFetchText(`${CDN}xpui-routes-search.${part}.js`)) ?? '';
      if (searchChunk) break;
    }
  }
  const secret = secretsIn(bundle)[0];
  const found = Object.fromEntries(OPERATIONS.map((op) => [op, queryHashIn(bundle, op) ?? queryHashIn(searchChunk, op)]));
  const complete = !!secret && !!clientVersion && OPERATIONS.every((op) => found[op]);
  return {
    clientVersion: clientVersion || '1.2.77.0',
    secret: secret ?? KNOWN_SECRET,
    hashes: Object.fromEntries(OPERATIONS.map((op) => [op, found[op] ?? KNOWN_HASHES[op]])) as Record<Operation, string>,
    complete,
    at: Date.now(),
  };
}

async function webPlayer(force = false): Promise<WebPlayer> {
  if (!force) {
    if (!webPlayerCache) {
      try {
        const stored = localStorage.getItem(WEB_PLAYER_KEY);
        if (stored) webPlayerCache = JSON.parse(stored);
      } catch {}
    }
    const cached = webPlayerCache;
    if (cached && Date.now() - cached.at < (cached.complete ? FOUND_TTL_MS : MISSED_TTL_MS)) return cached;
  }
  webPlayerCache = await readWebPlayer();
  try {
    localStorage.setItem(WEB_PLAYER_KEY, JSON.stringify(webPlayerCache));
  } catch {}
  return webPlayerCache;
}

export async function totp(codes: number[], epochMs: number): Promise<string> {
  const key = new TextEncoder().encode(codes.map((code, i) => code ^ ((i % 33) + 9)).join(''));
  const counter = new ArrayBuffer(8);
  new DataView(counter).setBigUint64(0, BigInt(Math.floor(epochMs / 1000 / 30)));
  const hmac = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, counter));
  const offset = hash[hash.length - 1]! & 0x0f;
  const binary =
    ((hash[offset]! & 0x7f) << 24) | (hash[offset + 1]! << 16) | (hash[offset + 2]! << 8) | hash[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, '0');
}

interface AccessToken {
  token: string;
  expiresAt: number;
  clientId: string | null;
  cookie: string;
}

let access: AccessToken | null = null;
let client: { token: string; expiresAt: number } | null = null;
let retryAfter = 0;
const RETRY_MS = 60_000;

export function invalidateSession(): void {
  access = null;
  client = null;
  profileCache = null;
  retryAfter = 0;
}

let minting: Promise<AccessToken> | null = null;
async function accessToken(): Promise<AccessToken> {
  const bridge = desktopBridge();
  if (!bridge) throw new SpotifyAuthError('No desktop bridge');
  const rawAuth = (await bridge.call('spotify.authState', {}).catch(() => null)) as any;
  const cookie = rawAuth?.sp_dc;
  if (access && access.cookie !== cookie) invalidateSession();
  if (access && Date.now() < access.expiresAt - 30_000) return access;
  minting ??= mint(cookie).finally(() => (minting = null));
  return minting;
}

async function mint(cookie?: string): Promise<AccessToken> {
  if (!cookie) {
    const bridge = desktopBridge();
    const rawAuth = (await bridge?.call('spotify.authState', {}).catch(() => null)) as any;
    cookie = rawAuth?.sp_dc;
  }
  if (!cookie) throw new SpotifyAuthError('Not signed in to Spotify');
  if (Date.now() < retryAfter) throw new SpotifyAuthError('Spotify would not mint a token; trying again shortly');

  for (const force of [false, true]) {
    const player = await webPlayer(force);
    const code = await totp(player.secret.codes, Date.now());
    const query = new URLSearchParams({
      reason: 'init',
      productType: 'web-player',
      totp: code,
      totpServer: code,
      totpVer: String(player.secret.version),
    });
    const { status, body } = await httpFetchJson(`${WEB_PLAYER}/api/token?${query}`, {
      headers: {
        Cookie: `sp_dc=${cookie}`,
      },
    });
    if (body.totpVerExpired && !force) continue;
    if (status === 401) throw new SpotifyAuthError('Your Spotify session has expired. Sign in again at open.spotify.com.');
    if (body.isAnonymous) throw new SpotifyAuthError('Not signed in to Spotify');
    if (body.accessToken) {
      access = {
        token: body.accessToken,
        expiresAt: body.accessTokenExpirationTimestampMs ?? Date.now() + 3_600_000,
        clientId: body.clientId ?? null,
        cookie,
      };
      return access;
    }
    if (force) break;
  }
  retryAfter = Date.now() + RETRY_MS;
  throw new SpotifyAuthError('Spotify would not mint a token');
}

let deviceId: string | null = null;
function getDeviceId(): string {
  if (deviceId) return deviceId;
  deviceId = localStorage.getItem('beatflow:spotify:deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID().replaceAll('-', '');
    localStorage.setItem('beatflow:spotify:deviceId', deviceId);
  }
  return deviceId;
}

async function clientToken(): Promise<string | null> {
  if (client && Date.now() < client.expiresAt - 30_000) return client.token;
  const bearer = await accessToken();
  if (!bearer.clientId) return null;
  const player = await webPlayer();
  try {
    const { body } = await httpFetchJson(CLIENT_TOKEN, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_data: {
          client_version: player.clientVersion,
          client_id: bearer.clientId,
          js_sdk_data: {
            device_brand: 'unknown',
            device_model: 'unknown',
            os: 'windows',
            os_version: 'unknown',
            device_id: getDeviceId(),
            device_type: 'computer',
          },
        },
      }),
    });
    if (body.response_type !== 'RESPONSE_GRANTED_TOKEN_RESPONSE' || !body.granted_token?.token) return null;
    client = { token: body.granted_token.token, expiresAt: Date.now() + (body.granted_token.expires_after_seconds ?? 3600) * 1000 };
    return client.token;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

async function gql(operation: Operation, variables: Json, retried = false): Promise<Json> {
  const bearer = await accessToken();
  const player = await webPlayer();
  const clientTok = await clientToken();
  const { status, body } = await httpFetchJson(PATHFINDER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'App-Platform': 'WebPlayer',
      ...(clientTok && { 'Client-Token': clientTok }),
    },
    body: JSON.stringify({
      variables,
      operationName: operation,
      extensions: { persistedQuery: { version: 1, sha256Hash: player.hashes[operation] } },
    }),
  });
  if (status === 401 && !retried) {
    invalidateSession();
    return gql(operation, variables, true);
  }
  const errors = (body?.errors as { message?: string }[] | undefined)?.map((e) => e.message ?? '') ?? [];
  if (errors.some((m) => /PersistedQueryNotFound/i.test(m)) && !retried) {
    await webPlayer(true);
    return gql(operation, variables, true);
  }
  if (status < 200 || status >= 300) throw new Error(`Spotify ${operation} failed (${status})`);
  if (!body) throw new Error(`Spotify ${operation} answered with something other than JSON`);
  if (errors.length && !body.data) throw new Error(errors.join('; '));
  return body;
}

const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const path = (v: unknown, ...keys: string[]): unknown => keys.reduce<unknown>((at, key) => obj(at)?.[key], v);

function largest(sources: unknown): string | null {
  let best: { url: string; width: number } | null = null;
  for (const source of arr(sources)) {
    const url = str(path(source, 'url'));
    const width = num(path(source, 'width')) ?? 0;
    if (url && (!best || width > best.width)) best = { url, width };
  }
  return best?.url ?? null;
}

function sized(sources: unknown, min = 300): string | null {
  const list = arr(sources)
    .map((s) => ({ url: str(path(s, 'url')), width: num(path(s, 'width')) ?? 0 }))
    .filter((s): s is { url: string; width: number } => !!s.url)
    .sort((a, b) => a.width - b.width);
  return (list.find((s) => s.width >= min) ?? list.at(-1))?.url ?? null;
}

function artistsOf(data: unknown): string {
  return arr(path(data, 'artists', 'items'))
    .map((a) => str(path(a, 'profile', 'name')))
    .filter((n): n is string => !!n?.trim())
    .join(', ');
}

function trackOf(data: unknown, uri: string | null): SpotifyTrack | null {
  const title = str(path(data, 'name'))?.trim();
  if (!title || !uri) return null;
  const album = obj(path(data, 'albumOfTrack'));
  return {
    id: uri.split(':').pop()!,
    title,
    artist: artistsOf(data),
    album: str(album?.name) ?? null,
    durationMs: num(path(data, 'trackDuration', 'totalMilliseconds')) ?? num(path(data, 'duration', 'totalMilliseconds')) ?? 0,
    imageUrl: sized(path(album, 'coverArt', 'sources')),
  };
}

export function parsePlaylistPage(root: Json): SpotifyPage<SpotifyPlaylist> {
  const library = obj(path(root, 'data', 'me', 'libraryV3'));
  if (!library) throw new Error('Spotify library response was empty');
  const raw = arr(library.items);
  const items = raw.flatMap((entry): SpotifyPlaylist[] => {
    const wrapper = obj(path(entry, 'item'));
    if (!wrapper || !str(wrapper.__typename)?.toLowerCase().includes('playlist')) return [];
    const data = obj(wrapper.data);
    if (str(data?.__typename) !== 'Playlist') return [];
    const uri = str(wrapper._uri);
    const name = str(data?.name);
    if (!uri || !name?.trim()) return [];
    return [
      {
        id: uri.split(':').pop()!,
        name,
        owner: str(path(data, 'ownerV2', 'data', 'name')),
        imageUrl: largest(path(arr(path(data, 'images', 'items'))[0], 'sources')),
      },
    ];
  });
  return { items, total: num(library.totalCount) ?? raw.length, raw: raw.length };
}

export function parseTrackPage(root: Json): SpotifyPage<SpotifyTrack> {
  const content = obj(path(root, 'data', 'playlistV2', 'content'));
  if (!content) throw new Error('Spotify playlist response was empty');
  const raw = arr(content.items);
  const items = raw.flatMap((entry) => {
    const data = path(entry, 'itemV2', 'data');
    const track = trackOf(data, str(path(data, 'uri')) ?? str(path(data, '_uri')));
    return track ? [track] : [];
  });
  return { items, total: num(content.totalCount) ?? raw.length, raw: raw.length };
}

export function parseLikedPage(root: Json): SpotifyPage<SpotifyTrack> {
  const tracks = obj(path(root, 'data', 'me', 'library', 'tracks'));
  if (!tracks) throw new Error('Spotify liked songs response was empty');
  const raw = arr(tracks.items);
  const items = raw.flatMap((entry) => {
    const wrapper = path(entry, 'track');
    const data = path(wrapper, 'data');
    const track = trackOf(data, str(path(wrapper, '_uri')) ?? str(path(data, 'uri')));
    return track ? [track] : [];
  });
  return { items, total: num(tracks.totalCount) ?? raw.length, raw: raw.length };
}

export function parseSearchTracks(root: Json): SpotifyTrack[] {
  return arr(path(root, 'data', 'searchV2', 'tracksV2', 'items')).flatMap((entry) => {
    const data = path(entry, 'item', 'data');
    const track = trackOf(data, str(path(data, 'uri')));
    return track ? [track] : [];
  });
}

export function parseCanvas(root: Json): string | null {
  const url = str(path(root, 'data', 'trackUnion', 'canvas', 'url'));
  return url?.startsWith('https://') && /\.mp4(?:[?#]|$)/i.test(url) ? url : null;
}

export async function playlists(offset: number): Promise<SpotifyPage<SpotifyPlaylist>> {
  const page = parsePlaylistPage(
    await gql('libraryV3', {
      filters: ['Playlists'],
      order: null,
      textFilter: '',
      features: ['LIKED_SONGS', 'YOUR_EPISODES_V2', 'PRERELEASES', 'EVENTS'],
      limit: 50,
      offset,
      flatten: true,
      expandedFolders: [],
      folderUri: null,
      includeFoldersWhenFlattening: false,
    }),
  );
  if (offset === 0) page.items.unshift({ id: LIKED_ID, name: 'Liked Songs', owner: null, imageUrl: LIKED_COVER });
  return page;
}

export async function tracks(playlistId: string, offset: number): Promise<SpotifyPage<SpotifyTrack>> {
  if (playlistId === LIKED_ID) return parseLikedPage(await gql('fetchLibraryTracks', { offset, limit: 100 }));
  return parseTrackPage(
    await gql('fetchPlaylist', { uri: `spotify:playlist:${playlistId}`, offset, limit: 100, enableWatchFeedEntrypoint: false }),
  );
}

export async function playlistInfo(playlistId: string): Promise<{ name: string; owner: string | null; imageUrl: string | null; total: number }> {
  if (playlistId === LIKED_ID) {
    const page = parseLikedPage(await gql('fetchLibraryTracks', { offset: 0, limit: 1 }));
    return { name: 'Liked Songs', owner: null, imageUrl: LIKED_COVER, total: page.total };
  }
  const root = await gql('fetchPlaylist', { uri: `spotify:playlist:${playlistId}`, offset: 0, limit: 1, enableWatchFeedEntrypoint: false });
  const playlist = obj(path(root, 'data', 'playlistV2'));
  return {
    name: str(playlist?.name) ?? 'Playlist',
    owner: str(path(playlist, 'ownerV2', 'data', 'name')),
    imageUrl: largest(path(arr(path(playlist, 'images', 'items'))[0], 'sources')),
    total: num(path(playlist, 'content', 'totalCount')) ?? 0,
  };
}

export async function searchTracks(query: string): Promise<SpotifyTrack[]> {
  return parseSearchTracks(
    await gql('searchTracks', {
      searchTerm: query,
      offset: 0,
      limit: 10,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includePreReleases: false,
      includeAuthors: false,
    }),
  );
}

export async function canvas(trackId: string): Promise<string | null> {
  return parseCanvas(await gql('canvas', { trackUri: `spotify:track:${trackId}` }));
}

let profileCache: { name: string; avatarUrl: string | null } | null = null;

export async function authState(): Promise<SpotifyAuthState> {
  const bridge = desktopBridge();
  const rawAuth = (await bridge?.call('spotify.authState', {}).catch(() => null)) as any;
  const cookie = rawAuth?.sp_dc;
  const browserSignedIn = !!cookie;
  const connected = rawAuth?.connected !== false;
  const base: SpotifyAuthState = { browserSignedIn, connected, signedIn: false, user: null, problem: null };
  if (!browserSignedIn || !connected) return base;

  try {
    if (!profileCache) {
      const profile = obj(path(await gql('profileAttributes', {}), 'data', 'me', 'profile'));
      profileCache = {
        name: str(profile?.name) ?? str(profile?.username) ?? 'Spotify',
        avatarUrl: sized(path(profile, 'avatar', 'sources'), 64),
      };
    }
    return { ...base, signedIn: true, user: profileCache };
  } catch (error) {
    const existingName = rawAuth?.user?.name && rawAuth.user.name !== 'Spotify User' ? rawAuth.user.name : null;
    return {
      ...base,
      signedIn: !!existingName || !!profileCache,
      user: profileCache ?? (existingName ? { name: existingName, avatarUrl: rawAuth?.user?.avatarUrl ?? null } : null),
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}
