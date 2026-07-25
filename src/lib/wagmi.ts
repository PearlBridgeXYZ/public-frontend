import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rabbyWallet,
  coinbaseWallet,
  walletConnectWallet,
  trustWallet,
  rainbowWallet,
  phantomWallet,
  ledgerWallet,
  braveWallet,
  okxWallet,
  frameWallet,
} from "@rainbow-me/rainbowkit/wallets";

const DEVNET_RPC_URL = import.meta.env.VITE_DEVNET_RPC_URL || "http://127.0.0.1:8545";

// Scope the chain set to the current build mode. Production (mainnet) ships
// Ethereum-only — surfacing Sepolia / Hardhat as switchable targets in the
// connect modal was confusing and not necessary.
const BUILD_NETWORK = (import.meta.env.VITE_NETWORK as "mainnet" | "sepolia" | "devnet" | undefined) ?? "mainnet";

// WalletConnect projectId. Required for the WalletConnect connector to
// initialize — without it WC silently drops out of the modal. The value
// is a PUBLIC client-side identifier (it ships in the bundle, and that's
// fine — WalletConnect Cloud uses it only for project-level analytics and
// allowlist gating). Provision from https://dashboard.reown.com.
//
// Falsy → WalletConnect is omitted from the modal (graceful degrade to
// injected-only). Don't throw — desktop-extension users should still be
// able to connect even if the projectId isn't configured.
const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

// Connect-modal wallets. Three groups:
//
//   1. "Recommended" — Rabby (top desktop EVM extension, our pick over
//      MetaMask), Coinbase (broadest end-user reach), and WalletConnect
//      (the only viable path for mobile users not in an in-app wallet
//      browser; QR + deeplink to Trust/Rainbow/MetaMask Mobile/Ledger
//      Live/etc.). MetaMask is NOT in the named list — see below.
//
//   2. "More wallets" — named entry points (with install links) for the
//      next tier: Trust, Rainbow, Phantom, Ledger, Brave, OKX, Frame.
//      New-to-crypto users who want one of these get a "Get" link in the
//      modal instead of having to know to install it first.
//
//   3. wagmi's bare `injected()` connector as a final fallback so wagmi
//      v2's built-in EIP-6963 multi-injected-provider discovery still
//      surfaces any installed extension we haven't named — including
//      MetaMask. Users who already have MetaMask installed will see it
//      auto-discovered via EIP-6963; users without it won't see a
//      MetaMask button at all (intentional — see below).
//
// MetaMask is deliberately omitted from the named list (G ask 2026-06-01,
// msg #34652). Two reasons:
//   - RainbowKit's `metaMaskWallet` falls into a WalletConnect-deeplink
//     fallback path when no MM extension is detected, and that path
//     reliably blanks the connect modal in current RK v2 (reproduced on
//     desktop without MM installed — modal closes / page goes blank
//     mid-flow). Removing the named entry removes the broken click path.
//   - We don't want to recommend MetaMask given Rabby's better security
//     posture (clearer txn previews, fewer phishing surfaces).
// Net effect: MM-installed users still connect (via the injected fallback
// + EIP-6963 auto-discovery); MM-not-installed users never see a button
// to click → no blank-screen bug.
//
// We deliberately do NOT use RainbowKit's `injectedWallet()` here. That
// wrapper snapshots `window.ethereum.providers[0]` (or `window.ethereum`)
// at module-load time and captures it in closure forever. On Windows with
// multiple wallet extensions installed (e.g. Phantom for Solana + MetaMask
// + Coinbase Wallet), Chrome loads them in a non-deterministic order and
// the snapshotted provider is frequently NOT the one the user picked. The
// user clicks "Connect" on MetaMask, the modal shows MetaMask's address,
// then `personal_sign` routes through the snapshotted handle (now stale
// because Phantom/Coinbase reset `window.ethereum` after our snapshot) —
// the signature comes back signed by a different key, the recovered signer
// doesn't match the address in the SIWE message, the backend returns 401,
// and RainbowKit shows "An error occurred while verifying the signature."
// The bare `wagmi/connectors` `injected()` does a fresh `window.ethereum`
// lookup every call (no snapshot), and the EIP-6963 connectors that wagmi
// auto-creates each have a direct reference to their specific wallet's
// provider object — no shared `window.ethereum` to race over.
const recommendedWallets = WC_PROJECT_ID
  ? [rabbyWallet, coinbaseWallet, walletConnectWallet]
  : [rabbyWallet, coinbaseWallet];

const rkConnectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: recommendedWallets,
    },
    {
      groupName: "More wallets",
      wallets: [
        trustWallet,
        rainbowWallet,
        phantomWallet,
        ledgerWallet,
        braveWallet,
        okxWallet,
        frameWallet,
      ],
    },
  ],
  { appName: "PearlBridge", projectId: WC_PROJECT_ID || "pearlbridge" },
);

const connectors = [...rkConnectors, injected()];

export const wagmiConfig =
  BUILD_NETWORK === "mainnet"
    ? createConfig({
        connectors,
        // Pearl runs on mainnet; the BTX bridge (isolated, second asset) targets
        // Sepolia for its testnet preview, so the mainnet build ALSO carries
        // Sepolia — the BTX widget switches the wallet to it. The Pearl flow
        // gates strictly on EXPECTED_CHAIN_ID (mainnet), so the extra chain is
        // inert for it; only the BTX widget reads/switches to Sepolia.
        chains: [mainnet, sepolia],
        transports: {
          [mainnet.id]: http(import.meta.env.VITE_ETH_RPC_URL || ""),
          [sepolia.id]: http(
            import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
          ),
        },
        ssr: false,
      })
    : BUILD_NETWORK === "sepolia"
      ? createConfig({
          connectors,
          chains: [sepolia],
          transports: { [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || "") },
          ssr: false,
        })
      : createConfig({
          connectors,
          chains: [hardhat],
          transports: { [hardhat.id]: http(DEVNET_RPC_URL) },
          ssr: false,
        });
