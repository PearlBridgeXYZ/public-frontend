# WalletConnect QR repair

Outcome: selecting WalletConnect renders its scannable QR code without blanking PearlBridge.

Base: main e5ea2bb. A clean local build with the installed dependencies reproduces the live entry asset index-CP4MMYSn.js exactly. The next branch is not the live source.

Cause: cuer 0.0.3 calls qr 0.6.0 with border=0; that installed encoder now rejects zero. The scoped Vite resolver adapts only cuer's raw matrix request: add one empty module with the encoder and remove that module. All payload, error correction, version and encoding inputs remain unchanged. No package installation or dependency change.

Required acceptance: TypeScript check, existing frontend node test suite plus QR round-trip tests, production build, browser selection of WalletConnect with no page error and retained UI. Browser test uses an already installed Playwright/Chromium outside this repo; set PB_PLAYWRIGHT_MODULE and PB_CHROMIUM_PATH to existing local installations. PB_BROWSER_URL optionally selects the preview URL. Installed dependency tree is a linked operational input; package-lock alone does not prove its contents. Independent release audit and human candidate acceptance remain required. No wallet transaction was signed in browser tests.

This repairs QR rendering only. Customer mint recovery, relay nonce reconciliation and support account authentication are separate work under the same incident. No recovery authorization is expanded by this UI repair.
