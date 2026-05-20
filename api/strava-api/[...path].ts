/**
 * Edge proxy for Strava — production drop-in for the Vite dev
 * /strava-api proxy. Vercel rewrites /strava-api/* → /api/strava-api/*
 * so the existing client code keeps calling its dev paths unchanged.
 *
 * Server-side credential injection (opt-in):
 *   When the request is a POST to /oauth/token (refresh-token grant or
 *   authorization-code grant) and the env var STRAVA_CLIENT_SECRET is
 *   set, the proxy parses the form-urlencoded body and replaces the
 *   client_secret field server-side. This lets you delete
 *   VITE_STRAVA_CLIENT_SECRET from the client bundle once you're ready.
 *   STRAVA_CLIENT_ID is similarly injected if set (it isn't a secret,
 *   but injecting it keeps prod/dev configs in one place).
 *
 *   When neither env var is set, the proxy is a transparent forwarder
 *   and the client's bundled credentials work unchanged — so the dev →
 *   prod migration is non-breaking.
 *
 * All other endpoints (uploads, athlete, segments…) are forwarded as-is.
 */

export const config = { runtime: 'edge' };

const UPSTREAM_ORIGIN = 'https://www.strava.com';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // /api/strava-api/api/v3/uploads → /api/v3/uploads
  const tail = url.pathname.replace(/^\/api\/strava-api/, '');
  const upstream = `${UPSTREAM_ORIGIN}${tail}${url.search}`;

  const headers = new Headers(req.headers);
  for (const h of ['host', 'cookie', 'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'x-vercel-id', 'x-vercel-ip-country', 'x-vercel-deployment-url']) {
    headers.delete(h);
  }

  const serverSecret = process.env.STRAVA_CLIENT_SECRET;
  const serverClientId = process.env.STRAVA_CLIENT_ID;
  const isOauthToken = req.method === 'POST' && tail === '/oauth/token';

  let body: BodyInit | undefined;
  if (req.method === 'GET' || req.method === 'HEAD') {
    body = undefined;
  } else if (isOauthToken && (serverSecret || serverClientId)) {
    // Inject server-side credentials into the form body. Consuming the
    // stream forces us off duplex passthrough, but /oauth/token bodies
    // are tiny so this is fine.
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    if (serverClientId) params.set('client_id', serverClientId);
    if (serverSecret) params.set('client_secret', serverSecret);
    body = params.toString();
    headers.set('content-type', 'application/x-www-form-urlencoded');
    headers.delete('content-length');
  } else {
    body = req.body as BodyInit | undefined;
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  };
  // duplex: 'half' is required when forwarding a streaming request body
  // (everything except the injection branch above, which already read the
  // body to a string).
  if (body === req.body && body !== undefined) {
    // @ts-expect-error — types lag the runtime here.
    init.duplex = 'half';
  }

  return fetch(upstream, init);
}
