import { isDesktopApp, desktopBridge } from '@bitchord/shared/bridge';

export function fastBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.length;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function shouldRouteViaDesktopBridge(url: URL): boolean {
  const host = url.hostname;
  if (host === 'googlevideo.com' || host.endsWith('.googlevideo.com')) return true;
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'music.youtube.com') {
    // /api/jnn/ is BotGuard challenge which manages its own CORS in-browser
    if (url.pathname.startsWith('/api/jnn/')) return false;
    return true;
  }
  return false;
}

let installed = false;

export function installDesktopFetch(): void {
  if (installed || typeof window === 'undefined' || !isDesktopApp()) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : input.toString(), window.location.href);

    if (!shouldRouteViaDesktopBridge(url)) {
      return originalFetch(input, init);
    }

    const bridge = desktopBridge();
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? request?.headers).forEach((value, key) => {
      headers[key] = value;
    });

    let body: string | undefined;
    let bodyEncoding: 'text' | 'base64' | undefined;
    let rawBody: BodyInit | null | undefined = init?.body;
    if (rawBody === undefined && request && method !== 'GET' && method !== 'HEAD') {
      try {
        rawBody = await request.arrayBuffer();
      } catch {
        // Ignored
      }
    }

    if (rawBody != null) {
      if (typeof rawBody === 'string') {
        body = rawBody;
        bodyEncoding = 'text';
      } else if (rawBody instanceof ArrayBuffer) {
        body = toBase64(new Uint8Array(rawBody));
        bodyEncoding = 'base64';
      } else if (ArrayBuffer.isView(rawBody)) {
        body = toBase64(new Uint8Array(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength));
        bodyEncoding = 'base64';
      } else if (rawBody instanceof Blob) {
        const buf = await rawBody.arrayBuffer();
        body = toBase64(new Uint8Array(buf));
        bodyEncoding = 'base64';
      } else if (typeof (rawBody as any).text === 'function') {
        body = await (rawBody as any).text();
        bodyEncoding = 'text';
      }
    }

    try {
      const response = await bridge.call(
        'yt.fetch',
        {
          url: url.toString(),
          method: method as 'GET' | 'HEAD' | 'POST',
          headers,
          ...(body !== undefined && { body, bodyEncoding }),
          auth: false,
        },
        { ...(init?.signal && { signal: init.signal }) },
      );

      const payload = response.bodyEncoding === 'base64' ? fastBase64ToUint8Array(response.body) : response.body;
      return new Response(response.status === 204 || response.status === 304 ? null : (payload as unknown as BodyInit), {
        status: response.status,
        headers: response.headers,
      });
    } catch (err) {
      console.warn('[Desktop Fetch] Bridge call failed, trying fallback:', err);
      return originalFetch(input, init);
    }
  };
}
