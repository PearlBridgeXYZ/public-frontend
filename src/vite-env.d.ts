/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: "mainnet" | "sepolia";
  readonly VITE_MINT_FEE_BPS?: string;
  readonly VITE_BURN_FEE_BPS?: string;
  readonly VITE_PEARL_LOCK_ADDRESS?: string;
  readonly VITE_RELAY_API_BASE?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_ETH_RPC_URL?: string;
  readonly VITE_SEPOLIA_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
