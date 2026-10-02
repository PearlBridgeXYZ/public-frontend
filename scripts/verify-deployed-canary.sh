#!/usr/bin/env bash
# Read-only post-deploy gate; does not change pins, cooldowns or alert state.
set -euo pipefail
case "${1:-}" in
  next) exit 0 ;;
  main) ;;
  *) echo "usage: $0 main|next" >&2; exit 2 ;;
esac
if python3 /home/openclaw/projects/pearlbridge-canary/check.py diff; then
  echo "Production canary matches its reviewed baseline."
else
  echo "Deployment incomplete: canary differs or could not be verified. Compare the live artifacts and security headers against the authorized build, then update the baseline and rerun this check. Do not blindly re-pin." >&2
  exit 1
fi
