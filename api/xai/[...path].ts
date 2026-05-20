/**
 * Edge proxy for xAI Grok — production drop-in for the Vite dev /xai
 * proxy. Vercel's vercel.json rewrites /xai/* → /api/xai/* so the
 * client code keeps calling its existing dev paths unchanged.
 *
 * Behavior:
 *   - Strips the /api/xai prefix and forwards every path + query to
 *     https://api.x.ai (so /xai/v1/chat/completions → api.x.ai/v1/chat/completions).
 *   - If the Vercel env var XAI_API_KEY is set, the proxy injects it as
 *     the Authorization header on the way out, replacing anything the
 *     client sent. This is the security upgrade over dev: the API key
 *     never leaves the edge, so you can stop shipping VITE_XAI_API_KEY
 *     to the browser bundle once you're ready.
 *   - When XAI_API_KEY is absent the client's existing Authorization
 *     header is forwarded as-is, so the dev → prod transition is
 *     non-breaking even before you migrate to server-only secrets.
 */

export const config = { runtime: 'edge' };

const UPSTREAM_ORIGIN = 'https://api.x.ai';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // /api/xai/v1/chat/completions → /v1/chat/completions
  const tail = url.pathname.replace(/^\/api\/xai/, '');
  const upstream = `${UPSTREAM_ORIGIN}${tail}${url.search}`;

  const headers = new Headers(req.headers);
  // Drop hop-by-hop and Vercel-injected request metadata so the upstream
  // sees a clean, well-formed request.
  for (const h of ['host', 'cookie', 'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'x-vercel-id', 'x-vercel-ip-country', 'x-vercel-deployment-url']) {
    headers.delete(h);
  }

  const serverKey = process.env.XAI_API_KEY;
  if (serverKey && serverKey.length > 0) {
    headers.set('Authorization', `Bearer ${serverKey}`);
  }

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body;

  return fetch(upstream, {
    method: req.method,
    headers,
    body,
    // duplex: 'half' is required when forwarding a streaming request body.
    // @ts-expect-error — types lag the runtime here.
    duplex: 'half',
    redirect: 'manual',
  });
}
