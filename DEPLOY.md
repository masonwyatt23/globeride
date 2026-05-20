# Deploying GlobeRide to Vercel

GlobeRide is a static Vite SPA plus a service worker. The only piece that
isn't pure-static is the dev-time HTTP proxy for the xAI workout
generator and Strava upload — in production those become **two Vercel
Edge Functions** that live in `api/xai/[...path].ts` and
`api/strava-api/[...path].ts`. `vercel.json` rewrites `/xai/*` →
`/api/xai/*` and `/strava-api/*` → `/api/strava-api/*` so the client
code keeps using its existing dev paths unchanged.

## One-time setup (~5 minutes)

### 1. Push the deployment config

The files Claude added in this turn:

- `vercel.json` — framework + SPA rewrites + proxy rewrites + asset
  cache headers
- `api/xai/[...path].ts` — edge proxy for `api.x.ai`
- `api/strava-api/[...path].ts` — edge proxy for `www.strava.com`
- `DEPLOY.md` — this file

Commit and push:

```bash
git add vercel.json api/ DEPLOY.md
git commit -m "feat: Vercel deployment — edge proxies + SPA rewrites"
git push origin main
```

### 2. Connect the repo to Vercel

1. Open <https://vercel.com/new>.
2. **Import Git Repository** → pick `masonwyatt23/globeride`.
3. Vercel auto-detects Vite. Leave the build command (`npm run build`)
   and output directory (`dist`) — `vercel.json` overrides them anyway.
4. **Don't deploy yet.** Click "Environment Variables" first.

### 3. Set environment variables

In the Vercel project's **Settings → Environment Variables**, add the
following. Scope = Production (or also Preview if you want PR previews):

#### Client-side, baked into the bundle (must use `VITE_` prefix)

| Name | Value | Notes |
| ---- | ----- | ----- |
| `VITE_CESIUM_ION_TOKEN` | your Cesium ion token | Cesium intentionally allows public tokens — fine to expose |
| `VITE_AI_PROVIDER` | `xai` | Ollama is local-only; the cloud build can't reach localhost:11434 |
| `VITE_XAI_MODEL` | `grok-4.3` | Current model name on your xAI account |
| `VITE_STRAVA_CLIENT_ID` | `228676` | Strava client IDs are not secret |

#### Server-only, never in the bundle (no `VITE_` prefix)

| Name | Value | Notes |
| ---- | ----- | ----- |
| `XAI_API_KEY` | `xai-...` from your local `.env.local` | The edge proxy injects this as `Authorization: Bearer …` on every xAI request, so you can later drop `VITE_XAI_API_KEY` from production entirely. While `XAI_API_KEY` is present in Vercel, the client doesn't need to ship the key. |

#### Optional (initial parity with dev — bundled into the client)

If you want the **initial deploy** to behave exactly like `npm run dev`
without touching client code, set these. They're bundled into the JS
bundle (so technically visible to anyone who reads the bundle), but if
you're the only user this is a reasonable starting trade-off.

| Name | Value | Notes |
| ---- | ----- | ----- |
| `VITE_XAI_API_KEY` | same as `XAI_API_KEY` | Make this empty / unset once you're ready to rely on server-side injection only |
| `VITE_STRAVA_CLIENT_SECRET` | your Strava app's secret | Same trade-off as `VITE_XAI_API_KEY`; the harder fix is to move this to a `STRAVA_CLIENT_SECRET` server env var and have the proxy inject it during the `/oauth/token` exchange (left as a follow-up) |
| `VITE_STRAVA_REFRESH_TOKEN` | your Strava refresh token | Only relevant if you're hosting just for yourself |

### 4. Deploy

Click **Deploy**. First build is ~2 min (Cesium is heavy). Vercel
returns a `globeride-xxx.vercel.app` URL. Add a custom domain in
**Settings → Domains** if you have one (HTTPS is provisioned
automatically).

### 5. Verify the deployment

Open the production URL in Chrome (or Edge — must be a Web Bluetooth
capable browser to actually pair the Kickr):

- Service worker installed: **DevTools → Application → Service
  Workers**. You should see `sw.js` activated.
- AI Workout Designer: try generating a workout. The request goes to
  `/xai/v1/chat/completions` → rewritten to `/api/xai/v1/chat/completions`
  → forwarded to `api.x.ai`. Should succeed.
- Strava upload: finish a Demo Mode ride and tap "Upload to Strava".
  The OAuth refresh + upload both hit `/strava-api/*` → proxied
  successfully. If you see a 401 with `insufficient_scope`, re-authorize
  the Strava app once (the in-app guided re-auth handles this).
- Install: tap the **Install** button in the header. On Chrome it
  triggers the native install dialog. On iOS Safari it opens the
  Add-to-Home-Screen popover.
- Keyboard shortcuts: open `/ride` (load any route + tap **Enter the
  world**) and press `?` for the overlay.

## Architecture notes

### Why edge functions instead of static-only?

The xAI API does NOT send permissive CORS headers, so a browser can't
call it directly from a different origin. Same for Strava's REST
endpoints. The dev story used Vite's built-in HTTP proxy. In
production the equivalent is one of:

1. Edge functions on Vercel / Cloudflare Pages / Netlify (chosen here).
2. A self-hosted reverse proxy.
3. A user-facing CORS proxy service (not recommended — third-party
   privacy concerns, rate limits).

Vercel edge functions are the right fit: zero cold-start, run at every
edge POP, free for personal use.

### Why `process.env.XAI_API_KEY` not `VITE_XAI_API_KEY` server-side?

Anything prefixed with `VITE_` is **inlined into the client bundle at
build time**. That's fine for non-secret values (Cesium token, model
name, Strava client ID) but inappropriate for API keys. Vercel's edge
runtime exposes server-only env vars via `process.env` at request
time — they never reach the browser. The proxy reads them there.

### Local development

The Vite dev server keeps using `/xai` and `/strava-api` via the
existing proxy in `vite.config.ts`. Nothing changes for `npm run dev`.

### Re-deploying

Every push to `main` triggers a fresh deploy. Pull request branches
get their own preview URLs automatically.
