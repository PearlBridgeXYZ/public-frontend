import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, sepolia, hardhat } from "wagmi/chains";

const DEVNET_RPC_URL = import.meta.env.VITE_DEVNET_RPC_URL || "http://127.0.0.1:8545";

// Scope the chain set to the current build mode. Production (mainnet) ships
// Ethereum-only — surfacing Sepolia / Hardhat as switchable targets in the
// connect modal was confusing and not necessary.
const BUILD_NETWORK = (import.meta.env.VITE_NETWORK as "mainnet" | "sepolia" | "devnet" | undefined) ?? "mainnet";

// Use wagmi's native `injected()` connector and let wagmi v2's built-in
// EIP-6963 multi-injected-provider discovery surface each installed wallet
// as its own connector. Every modern wallet extension (MetaMask, Rabby,
// Phantom EVM, Coinbase Wallet, OKX, Brave, Frame, etc.) announces itself
// over EIP-6963 with its own name, icon, and dedicated provider handle.
//
// We *intentionally* do NOT wrap with RainbowKit's `injectedWallet()` here.
// That wrapper snapshots `window.ethereum.providers[0]` (or `window.ethereum`)
// at module-load time and captures it in the connector's closure forever.
// On Windows with multiple wallet extensions installed (e.g. Phantom for
// Solana + MetaMask + Coinbase Wallet), Chrome loads them in a non-
// deterministic order and the snapshotted provider is frequently NOT the
// one the user picked in the connect modal. The user clicks "Connect" on
// MetaMask, the modal shows MetaMask's address, but then `personal_sign`
// routes through the snapshotted handle (which is now stale because
// Phantom/Coinbase reset `window.ethereum` after our snapshot) — the
// signature comes back signed by a different key, the recovered signer
// doesn't match the address in the SIWE message, and the backend returns
// 401 → RainbowKit shows "An error occurred while verifying the signature,
// please try again!".
//
// The bare `wagmi/connectors` `injected()` does a fresh `window.ethereum`
// lookup every call (no snapshot), and the EIP-6963 connectors that wagmi
// auto-creates each have a direct reference to their specific wallet's
// provider object — no shared `window.ethereum` to race over. The bare
// `injected()` stays as a fallback for extensions that don't announce via
// EIP-6963 (rare in 2026); it does not eager-connect (wagmi gates that
// behind the `injected.connected` storage flag) so it won't clash with the
// EIP-6963-discovered ones.
const connectors = [injected()];

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
