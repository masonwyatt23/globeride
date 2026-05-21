# Deploying GlobeRide to Vercel

GlobeRide is live at **https://globeride.vercel.app**.

It's a static Vite SPA plus a service worker. The only non-static piece
is the dev-time HTTP proxy for the xAI workout generator and Strava
upload — in production those are **two Vercel Edge Functions**:
`api/xai.ts` and `api/strava-api.ts`. `vercel.json` rewrites `/xai/*`
and `/strava-api/*` onto them so the client keeps using its existing
dev paths unchanged.

## Current status

- Project: `globeride` under the `masonwyatt-6613s-projects` Vercel scope.
- GitHub repo `masonwyatt23/globeride` is connected — every push to
  `main` auto-redeploys.
- Routing + both edge proxies are deployed and verified.
- **Remaining:** environment variables. Until they're set, the globe
  asks for a Cesium token in-app on first load (it persists to
  localStorage), and the AI / Strava features are inert. Set the env
  vars to light everything up — see below.

## Set the environment variables (one command)

`scripts/vercel-env-push.sh` reads your gitignored `.env.local`, pushes
every variable to the Vercel project, and redeploys so the build bakes
them in. Secrets are streamed over stdin — never printed. From the repo
root:

```bash
bash scripts/vercel-env-push.sh
```

That's it. The script handles the client/server split for you:

### Client vars — `VITE_` prefix, inlined into the JS bundle at build time

| Name | Notes |
| ---- | ----- |
| `VITE_CESIUM_ION_TOKEN` | 3D globe. Cesium intentionally allows public tokens — fine to expose. Free + unlimited at `ion.cesium.com/tokens`. |
| `VITE_AI_PROVIDER` | Forced to `xai` for the cloud build (a deployed site can't reach a localhost Ollama). |
| `VITE_XAI_API_KEY` | Optional in the bundle — see `XAI_API_KEY` below. |
| `VITE_XAI_MODEL` | Defaults to `grok-4.3`. |
| `VITE_STRAVA_CLIENT_ID` | Strava client IDs are not secret. |
| `VITE_STRAVA_CLIENT_SECRET` | A placeholder is fine once `STRAVA_CLIENT_SECRET` is set server-side (see below). |
| `VITE_STRAVA_REFRESH_TOKEN` | Only relevant if you're hosting just for yourself. |

### Server-only vars — no `VITE_` prefix, read by the edge proxies

| Name | Notes |
| ---- | ----- |
| `XAI_API_KEY` | The `api/xai.ts` proxy injects this as `Authorization: Bearer …` on every xAI request, so the key never has to ship in the client bundle. |
| `STRAVA_CLIENT_SECRET` | The `api/strava-api.ts` proxy overrides `client_secret` on `/oauth/token` POSTs when this is set — so the real Strava secret never ships in the bundle. |
| `STRAVA_CLIENT_ID` | Optional; injected the same way to keep prod config in one place. |

The script derives the server-only `XAI_API_KEY` / `STRAVA_CLIENT_SECRET`
/ `STRAVA_CLIENT_ID` from the `VITE_`-prefixed values in your
`.env.local`, so you only need them defined once.

## Architecture notes

### Why edge functions instead of static-only?

The xAI API and Strava's REST endpoints don't send permissive CORS
headers, so the browser can't call them cross-origin. Dev uses Vite's
HTTP proxy; production uses two Vercel Edge Functions.

The proxies are **flat, static-route files** (`api/xai.ts`,
`api/strava-api.ts`) rather than `[...path]` catch-alls — Vercel's
zero-config `api/` directory compiles a `[...path]` catch-all into a
single-segment matcher, which silently breaks multi-segment upstream
paths like `/v1/chat/completions`. Instead, `vercel.json` rewrites
`/xai/(.*)` → `/api/xai?__tail=$1`; the function reads `__tail` to
reconstruct the upstream URL.

Other external APIs the client calls — OSRM cycling routing
(`router.project-osrm.org`), the Nominatim geocoder, and the
OpenTopoData / Open-Elevation services — all send permissive CORS
headers and are called directly from the browser, so they need no
proxy.

### Why `process.env.XAI_API_KEY` not `VITE_XAI_API_KEY` server-side?

Anything `VITE_`-prefixed is inlined into the client bundle at build
time — fine for non-secret values, inappropriate for API keys. Vercel's
edge runtime exposes server-only env vars via `process.env` at request
time; they never reach the browser.

### Local development

`npm run dev` keeps using `/xai` and `/strava-api` via the Vite proxy in
`vite.config.ts`. Nothing changes for local dev.

### Re-deploying

Every push to `main` auto-redeploys. To redeploy manually:
`vercel deploy --prod --scope masonwyatt-6613s-projects`. Pull-request
branches get their own preview URLs automatically.

## Verify the deployment

Open https://globeride.vercel.app in Chrome or Edge (a Web Bluetooth
capable browser is needed to actually pair a Kickr):

- Globe renders (after the Cesium token is set or entered in-app).
- AI Workout Designer generates a workout — request goes `/xai/*` →
  edge proxy → `api.x.ai`.
- Finish a Demo Mode ride → "Upload to Strava" — OAuth refresh + upload
  proxy through `/strava-api/*`.
- Tap **Install** in the header for the PWA install flow.
- Service worker: DevTools → Application → Service Workers shows
  `sw.js` activated.
