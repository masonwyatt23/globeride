/**
 * Edge proxy for Strava — production drop-in for the Vite dev
 * /strava-api proxy. vercel.json rewrites /strava-api/* to this
 * function with the upstream sub-path in the `__tail` query parameter
 * (see api/xai.ts for why a query param rather than a path catch-all).
 *
 * Server-side credential injection (opt-in): on a POST to /oauth/token
 * the proxy parses the form body and overrides client_secret (and
 * client_id) from server-only env vars when set, so the real Strava
 * secret never ships in the client bundle. All other endpoints are
 * forwarded transparently. When the env vars are unset the proxy is a
 * pure forwarder, so the dev → prod migration is non-breaking.
 */

export const config = { runtime: 'edge' };

const UPSTREAM_ORIGIN = 'https://www.strava.com';
const STRIP_HEADERS = ['host', 'cookie', 'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'x-vercel-id', 'x-vercel-ip-country', 'x-vercel-deployment-url'];

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const tail = url.searchParams.get('__tail') ?? '';
  url.searchParams.delete('__tail');
  const qs = url.searchParams.toString();
  const upstream = `${UPSTREAM_ORIGIN}/${tail}${qs ? `?${qs}` : ''}`;

  const headers = new Headers(req.headers);
  for (const h of STRIP_HEADERS) headers.delete(h);

  const serverSecret = process.env.STRAVA_CLIENT_SECRET;
  const serverClientId = process.env.STRAVA_CLIENT_ID;
  const isOauthToken = req.method === 'POST' && tail === 'oauth/token';

  const init: RequestInit = { method: req.method, headers, redirect: 'manual' };

  if (req.method === 'GET' || req.method === 'HEAD') {
    // no body
  } else if (isOauthToken && (serverSecret || serverClientId)) {
    // Inject server-side credentials into the form body. Reading the
    // stream means we can't passthrough as duplex, but /oauth/token
    // bodies are tiny so this is fine.
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    if (serverClientId) params.set('client_id', serverClientId);
    if (serverSecret) params.set('client_secret', serverSecret);
    init.body = params.toString();
    headers.set('content-type', 'application/x-www-form-urlencoded');
    headers.delete('content-length');
  } else if (req.body) {
    init.body = req.body;
    // duplex: 'half' is required when forwarding a streaming request body.
    // @ts-expect-error — types lag the runtime here.
    init.duplex = 'half';
  }

  return fetch(upstream, init);
}
