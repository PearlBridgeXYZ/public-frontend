#!/usr/bin/env bash
# deploy.sh — push a fresh build to Cloudflare Pages from the ops VPS.
#
# Why this lives outside CI: the CF API token is IP-allowlisted to the
# ops VPS for an extra layer of security (G's call 2026-05-31). GH
# Actions runners draw from a wide Azure IP pool and can't be on the
# allowlist, so we deploy from the box that the token trusts.
#
# Usage:
#   bash scripts/deploy.sh next   # → pearlbridge-next  (next.pearlbridge.xyz)
#   bash scripts/deploy.sh main   # → pearlbridge-xyz   (pearlbridge.xyz)
#
# Picks up CF creds from vault entry "Services/Cloudflare". Token is
# IPv4-only — wrangler is invoked with NODE_OPTIONS=--dns-result-order=ipv4first
# so it never default-routes via IPv6.

set -euo pipefail

BRANCH="${1:-}"
if [ "$BRANCH" != "next" ] && [ "$BRANCH" != "main" ]; then
  echo "usage: $0 next|main" >&2
  exit 2
fi

if [ "$BRANCH" = "main" ]; then
  PROJECT="pearlbridge-xyz"
else
  PROJECT="pearlbridge-next"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Verify we're on the requested branch and clean.
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT" != "$BRANCH" ]; then
  echo "deploy.sh: HEAD is on '$CURRENT' but you asked to deploy '$BRANCH'." >&2
  echo "Either checkout $BRANCH first, or invoke with the matching branch." >&2
  exit 3
fi

COMMIT="$(git rev-parse HEAD)"
COMMIT_MSG="$(git log -1 --pretty=%s)"

echo "→ Building $BRANCH @ ${COMMIT:0:8} for $PROJECT…"
npm run build -- --mode mainnet

# Load CF creds from vault. Token is IPv4-only.
VAULT="/home/openclaw/.openclaw/workspace/scripts/vault.sh"
CF_TOKEN="$(PW=$(grep '^VAULT_MASTER_PASSWORD=' /home/openclaw/.openclaw/.env | cut -d= -f2-); \
  echo "$PW" | keepassxc-cli show /home/openclaw/.openclaw/vault.kdbx '/Services/Cloudflare' -s -q | \
  awk -F': ' '/^Password: /{print $2}')"
CF_ACCOUNT="44f2bb921824a11ee84bc9050cf72899"

if [ -z "$CF_TOKEN" ]; then
  echo "deploy.sh: could not read CF token from vault Services/Cloudflare." >&2
  exit 4
fi

echo "→ Deploying dist/ to $PROJECT…"
CLOUDFLARE_API_TOKEN="$CF_TOKEN" \
CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" \
NODE_OPTIONS="--dns-result-order=ipv4first" \
npx -y wrangler@4 pages deploy dist \
  --project-name="$PROJECT" \
  --branch="$BRANCH" \
  --commit-hash="$COMMIT" \
  --commit-message="$COMMIT_MSG"
