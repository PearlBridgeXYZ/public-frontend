# Security policy

## Reporting a vulnerability

If you discover a security issue in this frontend or in the underlying
PearlBridge contracts, please report it privately so we can fix it before
public disclosure.

**Email:** [bridgedev@mailbox.org](mailto:bridgedev@mailbox.org)

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof-of-concept
- Any constraints on disclosure timing

We aim to acknowledge reports within 72 hours and to coordinate a fix and
disclosure timeline with you.

## Scope

In scope:

- This repository — `pearlbridge.xyz` frontend, build configuration,
  Cloudflare Pages headers, and the CSP
- Misconfigurations that could enable supply-chain attacks (e.g. a stray
  third-party script that bypasses CSP)
- Phishing surfaces that could be exploited via the deployed UI

Out of scope (handle via the relevant project directly):

- The PearlBridge smart contracts on Ethereum (mainnet contract addresses
  are listed in `public/architecture.html`)
- The Pearl Network protocol
- Third-party RPC providers (publicnode.com, etc.)

## Bundle verification

Every CI run publishes a `bundle-shas.txt` artifact listing the SHA-256
of each shipped asset under `dist/`. To verify what's live on
`pearlbridge.xyz` matches a CI build:

```bash
# Hash the bundle locally after `npm ci && npm run build`
find dist -type f -exec sha256sum {} + | sort

# Compare against the artifact from the matching commit's CI run
```

A 5-minute external watchdog also compares the live SHA-256 of `/`,
`/_headers`, `/architecture.html`, the discovered `/assets/index-*` chunks,
and the published audit MD against a pinned manifest.
