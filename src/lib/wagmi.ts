import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet,
} from "@rainbow-me/rainbowkit/wallets";

const DEVNET_RPC_URL = import.meta.env.VITE_DEVNET_RPC_URL || "http://127.0.0.1:8545";

// Scope the chain set to the current build mode. Production (mainnet) ships
// Ethereum-only — surfacing Sepolia / Hardhat as switchable targets in the
// connect modal was confusing and not necessary.
const BUILD_NETWORK = (import.meta.env.VITE_NETWORK as "mainnet" | "sepolia" | "devnet" | undefined) ?? "mainnet";

// Connect-modal connectors. Two layers, stacked in this order:
//
//   1. RainbowKit's named wallets (MetaMask, Rabby, Coinbase) — these always
//      appear in the modal, and when the user doesn't have them installed
//      they render a "Get" / install link to the wallet's download page.
//      That's what surfaces install hints in the "Get a Wallet" panel for
//      new-to-crypto visitors who don't have any wallet yet. Each of these
//      uses dedicated rdns-based EIP-6963 discovery, so they connect to the
//      RIGHT provider when the user clicks them (no `window.ethereum`
//      snapshotting — see the snapshot-bug section below).
//
//   2. wagmi's bare `injected()` connector as a fallback so wagmi v2's
//      built-in EIP-6963 multi-injected-provider discovery still surfaces
//      *other* installed wallets (Phantom EVM, OKX, Brave, Frame, Trust,
//      etc.) as their own connectors in the modal. RainbowKit dedupes
//      against named wallets by rdns, so MetaMask / Rabby / Coinbase won't
//      appear twice when installed.
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
//
// `connectorsForWallets` requires a `projectId` for any WalletConnect-based
// entries; none of MetaMask/Rabby/Coinbase use WalletConnect (all injected),
// so the value is unused at runtime — a placeholder is fine.
const rkConnectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet],
    },
  ],
  { appName: "PearlBridge", projectId: "pearlbridge" },
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
