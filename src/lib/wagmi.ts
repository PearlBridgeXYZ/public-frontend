import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
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
//   1. "Recommended" — the most likely path for our actual user base:
//      MetaMask + Rabby (top desktop extensions), Coinbase, and
//      WalletConnect (the only viable path for mobile users not in an
//      in-app wallet browser; QR + deeplink to Trust/Rainbow/MetaMask
//      Mobile/Ledger Live/etc.).
//
//   2. "More wallets" — named entry points (with install links) for the
//      next tier: Trust, Rainbow, Phantom, Ledger, Brave, OKX, Frame.
//      New-to-crypto users who want one of these get a "Get" link in the
//      modal instead of having to know to install it first.
//
//   3. wagmi's bare `injected()` connector as a final fallback so wagmi
//      v2's built-in EIP-6963 multi-injected-provider discovery still
//      surfaces any OTHER installed extension we haven't named (Safe,
//      Backpack, Tally, etc.). RainbowKit dedupes against named wallets
//      by rdns so installed Metamask/Rabby/etc. won't appear twice.
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
  ? [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet]
  : [metaMaskWallet, rabbyWallet, coinbaseWallet];

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
        chains: [mainnet],
        transports: { [mainnet.id]: http(import.meta.env.VITE_ETH_RPC_URL || "") },
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
