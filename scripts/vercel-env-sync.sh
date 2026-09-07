#!/usr/bin/env bash
#
# Mirror greekgift's env from CI (GitHub Environment = source of truth) into the
# Vercel project for one target, via the Vercel REST API with upsert. Runs in
# CI before `vercel pull`, so the deployed functions receive runtime secrets and
# the build can bake NEXT_PUBLIC_*. Anything edited in the Vercel dashboard is
# overwritten on the next deploy.
#
# Values are read from this process's environment (mapped from GitHub
# vars/secrets at the job level in .github/workflows/ci.yml). Every listed key
# is required: env.ts refuses to build without all of them, so a missing value
# fails here, with the key named, rather than three minutes later.
#
# Usage: TARGET=production bash scripts/vercel-env-sync.sh
# Requires: curl, jq (preinstalled on GitHub ubuntu runners), VERCEL_TOKEN,
#   VERCEL_PROJECT_ID, and VERCEL_ORG_ID (only used when it names a team).
set -euo pipefail

# The key list — the one place in this file to touch when a variable is added.
# `encrypted` = ordinary value (readable in the dashboard, pulled by `vercel pull`).
# `sensitive` = write-only in Vercel; never pulled, so ci.yml must also inject
#               it into `vercel build`.
ENCRYPTED_KEYS=(
  BETTER_AUTH_URL
  NEXT_PUBLIC_APP_URL
  ADMIN_EMAILS
  EMAIL_FROM
  NEXT_PUBLIC_ENGINE_NODES
  NEXT_PUBLIC_ENGINE_BUILD
)
SENSITIVE_KEYS=(
  DATABASE_URL
  BETTER_AUTH_SECRET
  BREVO_API_KEY
)

: "${VERCEL_TOKEN:?VERCEL_TOKEN required}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID required}"
: "${TARGET:?TARGET (production|preview) required}"

# A personal (Hobby) account's orgId is a user id, not a team; the API rejects
# it as teamId. Only teams get the query parameter.
team_qs=""
case "${VERCEL_ORG_ID:-}" in
  team_*) team_qs="&teamId=${VERCEL_ORG_ID}" ;;
esac
url="https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?upsert=true${team_qs}"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# upsert <key> <type:encrypted|sensitive>
upsert() {
  local key="$1" type="$2" value="${!1:-}"
  if [ -z "$value" ]; then
    echo "::error::${key} is empty — set it in the GitHub Environment '${TARGET}'."
    exit 1
  fi
  local body http
  body="$(jq -n --arg k "$key" --arg v "$value" --arg t "$type" --arg tg "$TARGET" \
    '{key:$k, value:$v, type:$t, target:[$tg]}')"
  http="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$url" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$body")"
  if [ "$http" -ge 300 ]; then
    echo "::error::Vercel env upsert failed for ${key} (HTTP ${http}): $(cat "$tmp")"
    exit 1
  fi
  echo "synced $key -> $TARGET ($type)"
}

for key in "${ENCRYPTED_KEYS[@]}"; do upsert "$key" encrypted; done
for key in "${SENSITIVE_KEYS[@]}"; do upsert "$key" sensitive; done

echo "Env sync to Vercel ($TARGET) complete: $(( ${#ENCRYPTED_KEYS[@]} + ${#SENSITIVE_KEYS[@]} )) keys."
