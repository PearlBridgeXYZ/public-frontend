# pearlbridge.xyz — frontend

The web UI for the PearlBridge protocol — a trust-minimized bridge between
the native PRL on the Pearl Network and Wrapped Pearl (WPRL, ERC-20) on
Ethereum.

This repository is the canonical source for what's served at
[pearlbridge.xyz](https://pearlbridge.xyz). Builds are reproducible from
this source.

## Quick start

```bash
nvm use            # picks up .nvmrc — Node 22.22.2
npm ci             # install exact dependencies from package-lock.json
npm run dev        # local dev server at http://localhost:5173

# Production build (the bundle that goes to pearlbridge.xyz)
npm run build -- --mode mainnet
```

The build emits to `dist/`. The deployed site is a static drop of `dist/`
onto Cloudflare Pages — no server-side runtime.

## Stack

- **Build:** [Vite](https://vitejs.dev) + TypeScript
- **UI:** React 18, Tailwind CSS
- **Web3:** [wagmi](https://wagmi.sh) v2, [viem](https://viem.sh) v2,
  [RainbowKit](https://www.rainbowkit.com) v2
- **Pearl-side encoding:** [bech32](https://github.com/bitcoinjs/bech32)
- **Hosting:** Cloudflare Pages (static), HSTS + CSP headers via
  `public/_headers`

## What this app does

1. Lets a user lock native PRL on the Pearl Network and mint WPRL on
   Ethereum (the "lock-and-mint" flow)
2. Lets a user burn WPRL on Ethereum to release PRL on the Pearl Network
   (the "burn-and-unlock" flow)
3. Reads the on-chain bridge state directly from the deployed
   `BridgeController` (paused status, daily fast-mint cap, pending mint
   queue) — no centralized indexer in the user path
4. Routes through a small relay API (`api.pearlbridge.xyz`) for off-chain
   proof gathering

## Build modes

| Mode | Env file | Use |
|------|----------|-----|
| `mainnet` | `.env.mainnet` | Production build (this is what ships) |
| `devnet` | `.env.devnet` (gitignored) | Local Hardhat dev — see `.env.devnet.example` |

To set up a local DevNet, copy `.env.devnet.example` to `.env.devnet`,
point the URLs at your local Hardhat node, then `npm run dev -- --mode devnet`.

## Versioning

The footer renders `Build {BUILD_LABEL}`, where `BUILD_LABEL` lives in
[`src/lib/buildLabel.ts`](src/lib/buildLabel.ts). Releases use an RC
scheme (RC5.27, RC5.28, …) tracked in [`src/pages/Releases.tsx`](src/pages/Releases.tsx).

Every change that lands on `main` or `next` **must** bump `BUILD_LABEL`
to the next RC tag (RC5.27 → RC5.28 → RC5.29 …). Bump on every push, even
tiny copy tweaks. This lets operators verify a deploy landed just by
reading the footer — no guesswork about which build the CDN is serving.

## Deploying

Production deploys run **only from the ops VPS**, never from CI. The
Cloudflare API token is IP-allowlisted to that one host — narrow
allowlist as defense-in-depth, deliberate trade-off vs auto-deploy
convenience.

```bash
# from the ops VPS, on the branch you want to deploy
bash scripts/deploy.sh next   # → next.pearlbridge.xyz
bash scripts/deploy.sh main   # → pearlbridge.xyz
```

`scripts/deploy.sh` builds `dist/`, pulls the CF token from the vault,
and pushes via `wrangler pages deploy` with IPv4 DNS forced
(`NODE_OPTIONS=--dns-result-order=ipv4first`) — IPv6 default-routing
silently bypasses the IP allowlist and CF returns `code 1000 / 9109`.

CI still builds + uploads `dist` as an artifact on every push so the
reproducibility check (below) keeps working, but it does **not** ship
to the CDN.

## Reproducibility

The `npm ci && npm run build -- --mode mainnet` command, run with the
Node version pinned in `.nvmrc` and the `package-lock.json` in this repo,
produces a `dist/` whose file SHA-256s match the deployed site.

CI publishes `bundle-shas.txt` on every push — see `.github/workflows/build.yml`.

A separate 5-minute external watchdog (the "Layer-5 canary") compares the
live SHA-256 of `/`, `/_headers`, `/architecture.html`, the discovered
`/assets/index-*` chunks, and the published audit MD against a pinned
manifest, and alerts on drift.

## Audit

The published RC5.6 re-audit lives under
[`public/audits/pearlbridge-reaudit-rc56-2026-05-20.md`](public/audits/pearlbridge-reaudit-rc56-2026-05-20.md).
An independent external security audit is in progress.

## Security policy

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).
