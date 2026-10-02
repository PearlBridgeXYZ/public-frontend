# Frontend deployment completion

Use `scripts/deploy.sh main` for production and `scripts/deploy.sh next` for staging. A successful upload alone is not a completed production deployment.

After a production upload, the script runs the read-only canary diff. A changed baseline makes the command fail until the operator has:

1. Compared the live HTML and changed assets to the authorized build (allow only known Cloudflare beacon injection/whitespace), verified the intended browser behavior, and checked security-header changes against the reviewed deployment.
2. Run `/home/openclaw/projects/pearlbridge-canary/check.py pin` only for that verified authorized deployment.
3. Run `bash scripts/verify-deployed-canary.sh main` again and obtained a clean result.

Never re-pin an unexplained mismatch or a failed fetch. Do not disable the canary to finish a release. If an attended release requires direct upload tooling, the same explicit verification and baseline steps remain mandatory before reporting success. Staging does not modify the production pin.

Regression checks: `python3 scripts/verify-deployed-canary.test.py` and `bash -n scripts/deploy.sh scripts/verify-deployed-canary.sh`.
