# Deploying GlobeRide to Vercel

## Hosted xAI is disabled

The `/xai/*` rewrite is retained as a fail-closed endpoint returning 503.
It does not forward requests, read server credentials, or accept caller keys.
The AI clients fail locally for explicit xAI selection. Static commentary
remains available; Ollama is supported in local development, not guaranteed
from the deployed origin (its CSP does not permit localhost). Do not enable hosted xAI without a separately
reviewed authenticated service with per-user and total spending limits.

Never configure an xAI credential with a `VITE_` prefix. Existing exposed keys
must remain disabled. This patch does not rotate credentials or delete old
Vercel deployments, downloaded bundles, browser caches, or service workers.
A production rebuild must be verified before calling the live site fixed.

GlobeRide is live at **https://globeride.vercel.app**.

It's a static Vite SPA plus a service worker. The only non-static piece
is the Strava upload proxy and disabled xAI endpoint — in production those
are **two Vercel Edge Functions**:
`api/xai.ts` and `api/strava-api.ts`. `vercel.json` rewrites `/xai/*`
and `/strava-api/*` onto them so the client keeps using its existing
dev paths unchanged.

## Current status

- Project: `globeride` under the `masonwyatt-6613s-projects` Vercel scope.
- GitHub repo `masonwyatt23/globeride` is connected — every push to
  `main` auto-redeploys.
- Verify the current deployment after each release; source changes are not live proof.
- Cesium and Strava require their own configuration. Hosted xAI stays
  disabled regardless of environment variables.

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
| `VITE_AI_PROVIDER` | `auto` uses local Ollama. Explicit `xai` selection is disabled. |
| `VITE_XAI_MODEL` | Defaults to `grok-4.3`. |
| `VITE_STRAVA_CLIENT_ID` | Strava client IDs are not secret. |
| `VITE_STRAVA_CLIENT_SECRET` | A placeholder is fine once `STRAVA_CLIENT_SECRET` is set server-side (see below). |
| `VITE_STRAVA_REFRESH_TOKEN` | Only relevant if you're hosting just for yourself. |

### Server-only vars — no `VITE_` prefix, read by the edge proxies

| Name | Notes |
| ---- | ----- |
| `STRAVA_CLIENT_SECRET` | The `api/strava-api.ts` proxy overrides `client_secret` on `/oauth/token` POSTs when this is set — so the real Strava secret never ships in the bundle. |
| `STRAVA_CLIENT_ID` | Optional; injected the same way to keep prod config in one place. |

The script derives the server-only `STRAVA_CLIENT_SECRET`
/ `STRAVA_CLIENT_ID` from the `VITE_`-prefixed values in your
`.env.local`, so you only need them defined once.

## Architecture notes

### Why edge functions instead of static-only?

Strava uses a Vite HTTP proxy in development and an Edge Function in
production. The former xAI forwarding function is disabled in all environments.

The proxies are **flat, static-route files** (`api/xai.ts`,
`api/strava-api.ts`) rather than `[...path]` catch-alls — Vercel's
zero-config `api/` directory compiles a `[...path]` catch-all into a
single-segment matcher, which silently breaks multi-segment upstream
paths like `/v1/chat/completions`. Instead, `vercel.json` rewrites
`/xai/(.*)` → `/api/xai?__tail=$1`; the containment handler ignores
`__tail` and returns 503 without an upstream request.

Other external APIs the client calls — OSRM cycling routing
(`router.project-osrm.org`), the Nominatim geocoder, and the
OpenTopoData / Open-Elevation services — all send permissive CORS
headers and are called directly from the browser, so they need no
proxy.

### Local development

`npm run dev` retains the Strava proxy. No development or preview xAI proxy
is configured. Local Ollama can still be used without a cloud credential.

### Re-deploying

Every push to `main` auto-redeploys. To redeploy manually:
`vercel deploy --prod --scope masonwyatt-6613s-projects`. Pull-request
branches get their own preview URLs automatically.

## Verify the deployment

Open https://globeride.vercel.app in Chrome or Edge (a Web Bluetooth
capable browser is needed to actually pair a Kickr):

- Globe renders (after the Cesium token is set or entered in-app).
- `/xai/v1/models` and `/api/xai?__tail=v1/models` return the local 503
  containment response without calling xAI. Verify built JS contains no client key.
- AI features selected as xAI show an unavailable message; commentary uses static fallback.
- Finish a Demo Mode ride → "Upload to Strava" — OAuth refresh + upload
  proxy through `/strava-api/*`.
- Tap **Install** in the header for the PWA install flow.
- Service worker: DevTools → Application → Service Workers shows
  `sw.js` activated.
