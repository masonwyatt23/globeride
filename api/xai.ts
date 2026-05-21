/**
 * Edge proxy for xAI Grok — production drop-in for the Vite dev /xai
 * proxy. vercel.json rewrites /xai/* to this function with the upstream
 * sub-path passed as the `__tail` query parameter.
 *
 * Why a query param and not a path catch-all: Vercel's zero-config
 * `api/` directory does not reliably route multi-segment `[...path]`
 * catch-alls (it compiles them to a single-segment matcher), so the
 * rewrite hands the full sub-path to this static-route function
 * explicitly instead.
 *
 * If XAI_API_KEY is set in the Vercel environment the proxy injects it
 * as the Authorization header, so the key never ships in the client
 * bundle. When absent, the client's own Authorization header is
 * forwarded unchanged — dev/prod parity even before you migrate to
 * server-only secrets.
 */

export const config = { runtime: 'edge' };

const UPSTREAM_ORIGIN = 'https://api.x.ai';
const STRIP_HEADERS = ['host', 'cookie', 'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'x-vercel-id', 'x-vercel-ip-country', 'x-vercel-deployment-url'];

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // The rewrite passes the real upstream path in __tail; anything else
  // in the query string is a genuine caller param and gets forwarded.
  const tail = url.searchParams.get('__tail') ?? '';
  url.searchParams.delete('__tail');
  const qs = url.searchParams.toString();
  const upstream = `${UPSTREAM_ORIGIN}/${tail}${qs ? `?${qs}` : ''}`;

  const headers = new Headers(req.headers);
  for (const h of STRIP_HEADERS) headers.delete(h);

  const serverKey = process.env.XAI_API_KEY;
  if (serverKey && serverKey.length > 0) {
    headers.set('Authorization', `Bearer ${serverKey}`);
  }

  const init: RequestInit = { method: req.method, headers, redirect: 'manual' };
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    init.body = req.body;
    // duplex: 'half' is required when forwarding a streaming request body.
    // @ts-expect-error — types lag the runtime here.
    init.duplex = 'half';
  }

  return fetch(upstream, init);
}
