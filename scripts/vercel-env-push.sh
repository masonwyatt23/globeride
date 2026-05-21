#!/usr/bin/env bash
#
# vercel-env-push.sh — one-shot: read .env.local, push every GlobeRide
# environment variable to the Vercel "globeride" project, then redeploy
# so the production bundle is rebuilt with the values baked in.
#
#   Run from the repo root:   bash scripts/vercel-env-push.sh
#
# Secrets are read from the gitignored .env.local and streamed to Vercel
# over stdin — values are never printed to the terminal.
#
set -euo pipefail

SCOPE="masonwyatt-6613s-projects"
ENVFILE=".env.local"
TARGET="production"

if [[ ! -f "$ENVFILE" ]]; then
  echo "ERROR: $ENVFILE not found — run this from the repo root." >&2
  exit 1
fi

# getval KEY -> prints KEY's value from .env.local (last definition wins),
# stripping a leading 'export ' and one layer of surrounding quotes.
getval() {
  local key="$1" line
  line=$(grep -E "^(export[[:space:]]+)?${key}=" "$ENVFILE" | tail -n1 || true)
  [[ -z "$line" ]] && return 0
  line="${line#export }"
  line="${line#*=}"
  if [[ "$line" == \"*\" ]]; then line="${line%\"}"; line="${line#\"}"; fi
  if [[ "$line" == \'*\' ]]; then line="${line%\'}"; line="${line#\'}"; fi
  printf '%s' "$line"
}

# push NAME VALUE -> idempotently set an env var on Vercel. --force
# overwrites any existing value; --yes skips the confirmation prompt;
# the value is streamed over stdin so it never lands in process args.
push() {
  local name="$1" value="$2"
  if [[ -z "$value" ]]; then
    echo "  skip  $name  (not set in $ENVFILE)"
    return 0
  fi
  printf '%s' "$value" | vercel env add "$name" "$TARGET" --force --yes --scope "$SCOPE" >/dev/null
  echo "  set   $name"
}

CESIUM=$(getval VITE_CESIUM_ION_TOKEN)
XAI_KEY=$(getval VITE_XAI_API_KEY)
XAI_MODEL=$(getval VITE_XAI_MODEL)
PROVIDER=$(getval VITE_AI_PROVIDER)
S_ID=$(getval VITE_STRAVA_CLIENT_ID)
S_SECRET=$(getval VITE_STRAVA_CLIENT_SECRET)
S_REFRESH=$(getval VITE_STRAVA_REFRESH_TOKEN)

# The cloud build can't reach a localhost Ollama, so force the xAI provider.
if [[ -z "$PROVIDER" || "$PROVIDER" == "ollama" || "$PROVIDER" == "auto" ]]; then
  PROVIDER="xai"
fi
[[ -z "$XAI_MODEL" ]] && XAI_MODEL="grok-4.3"

echo "Pushing GlobeRide env vars to Vercel ($TARGET)…"

# Client vars — VITE_ prefix, inlined into the JS bundle at build time.
push VITE_CESIUM_ION_TOKEN     "$CESIUM"
push VITE_AI_PROVIDER          "$PROVIDER"
push VITE_XAI_API_KEY          "$XAI_KEY"
push VITE_XAI_MODEL            "$XAI_MODEL"
push VITE_STRAVA_CLIENT_ID     "$S_ID"
push VITE_STRAVA_CLIENT_SECRET "$S_SECRET"
push VITE_STRAVA_REFRESH_TOKEN "$S_REFRESH"

# Server-only vars — no VITE_ prefix, read by the edge proxies in api/.
push XAI_API_KEY          "$XAI_KEY"
push STRAVA_CLIENT_SECRET "$S_SECRET"
push STRAVA_CLIENT_ID     "$S_ID"

echo
echo "Env vars set. Redeploying so the build bakes them in…"
vercel deploy --prod --yes --scope "$SCOPE"

echo
echo "Done — production live at https://globeride.vercel.app"
