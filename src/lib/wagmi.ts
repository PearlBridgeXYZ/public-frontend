import { http, createConfig } from "wagmi";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";

const DEVNET_RPC_URL = import.meta.env.VITE_DEVNET_RPC_URL || "http://127.0.0.1:8545";

// Scope the chain set to the current build mode. Production (mainnet) ships
// Ethereum-only — surfacing Sepolia / Hardhat as switchable targets in the
// connect modal was confusing and not necessary.
const BUILD_NETWORK = (import.meta.env.VITE_NETWORK as "mainnet" | "sepolia" | "devnet" | undefined) ?? "mainnet";

// RC2.1: stripped to a single `injectedWallet` connector.
//
// We previously used RainbowKit's `getDefaultConfig`, which bundles
// CoinbaseWalletSDK + WalletConnect v2 + Safe + Ledger + Rainbow.
// At least one of those (and/or MetaMask's own SDK pulled in by
// `metaMaskWallet`) triggers Chrome's
//   "pearlbridge.xyz wants to access other apps and services on this device"
// prompt on page load by touching `navigator.registerProtocolHandler` or
// equivalent capability surfaces. Trust suicide for a bridge.
//
// `injectedWallet` alone is enough — MetaMask, Rabby, Brave, Frame, the
// Coinbase Wallet extension, and any other EIP-1193 extension all inject
// `window.ethereum` and will be picked up. No SDK, no deeplinks, no QR. If
// a visitor is on mobile without an injected wallet they'll see no connect
// option, which is the correct UX for a desktop-first dApp at this stage.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Browser wallets",
      wallets: [injectedWallet],
    },
  ],
  {
    appName: "PearlBridge",
    // projectId is required by the type but unused without WalletConnect.
    projectId: "pearlbridge-injected-only",
  },
);

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
