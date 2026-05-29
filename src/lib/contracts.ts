export const WPRL_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const BRIDGE_CONTROLLER_ABI = [
  {
    name: "requestBurn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "grossAmount", type: "uint256" },
      { name: "pearlAddress", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "mintFeeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    name: "burnFeeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    name: "dailyMintLimit",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "mintWindowRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "burnWindowRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "dailyFastMintLimit",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "fastMintWindowRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "slowMintWindowRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "slowMintDelay",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "dailyBurnLimit",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "tvlCap",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "paused",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  // UUPS governance — methods exposed by the proxy for timelocked upgrades.
  {
    name: "proposeUpgrade",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newImplementation", type: "address" }],
    outputs: [],
  },
  {
    name: "cancelUpgradeProposal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "implementation", type: "address" }],
    outputs: [],
  },
  {
    name: "setUpgradeDelay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newDelay", type: "uint256" }],
    outputs: [],
  },
  {
    name: "upgradeToAndCall",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "newImplementation", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "upgradeDelay",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "pendingUpgradeReadyAt",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "implementation", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "BurnRequested",
    type: "event",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "grossAmount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "netAmount", type: "uint256", indexed: false },
      { name: "pearlAddress", type: "string", indexed: false },
    ],
  },
  // Mint-lane events from the tiered-cap BridgeController. The receipt watcher
  // in LockAndMint decodes these to distinguish "minted now" (MintExecuted,
  // fast lane) from "queued for 24h timelock" (MintQueued, slow lane). Without
  // this distinction the watcher flipped to "WPRL minted successfully" the
  // instant the executeMint tx confirmed — even when the deposit was actually
  // routed to the slow lane and the user was still waiting on the timelock.
  {
    name: "MintExecuted",
    type: "event",
    inputs: [
      { name: "pearlTxId", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "grossAmount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "netAmount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "MintQueued",
    type: "event",
    inputs: [
      { name: "pearlTxId", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "grossAmount", type: "uint256", indexed: false },
      { name: "readyAt", type: "uint256", indexed: false },
    ],
  },
  {
    name: "UpgradeProposed",
    type: "event",
    inputs: [
      { name: "implementation", type: "address", indexed: true },
      { name: "readyAt", type: "uint256", indexed: false },
    ],
  },
  {
    name: "UpgradeProposalCancelled",
    type: "event",
    inputs: [
      { name: "implementation", type: "address", indexed: true },
    ],
  },
  {
    name: "UpgradeDelayUpdated",
    type: "event",
    inputs: [
      { name: "oldDelay", type: "uint256", indexed: false },
      { name: "newDelay", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Upgraded",
    type: "event",
    inputs: [
      { name: "implementation", type: "address", indexed: true },
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for contract addresses across the entire frontend.
//
// To switch the build between networks, change ONE thing: `VITE_NETWORK` in
// the build env (mainnet | sepolia | devnet). Every component then imports the
// resolved `CONTRACTS` object below — there are no per-component address
// constants and no env-var address overrides. Address edits land here.
//
// C-4 fix: hard-code production addresses; never fall back to 0x0
// (domain-separator collision risk on EIP-712).
// devnet addresses updated 2026-05-16 — v0.3.1 redeploy with FEE_ADMIN_ROLE wiring.
// ─────────────────────────────────────────────────────────────────────────────
import { mainnet, sepolia, hardhat } from "wagmi/chains";

export type NetworkName = "mainnet" | "sepolia" | "devnet";

export const NETWORK: NetworkName =
  (import.meta.env.VITE_NETWORK as NetworkName | undefined) ?? "sepolia";

export const ADDRESSES = {
  mainnet: {
    // RC5 deploy 2026-05-19 — fresh redeploy w/ Timelock-governed UUPS proxies, BURN_FEE_BPS=0.
    // RC3 (0x5b2C/0xbE0D) and prior deprecated.
    WPRL: "0x07696DcaB55E62cfef953666b29Fe1970518cB00" as `0x${string}`,
    BRIDGE_CONTROLLER: "0xA6571B73489d4eBFA269a107208665dF7C80Aef5" as `0x${string}`,
    PEARL_LOCK_ADDRESS: "prl1p5f450a5540efskxv050tgscelscuztut6zfaqssq8vnlnw53wvdsmw4yvs",
    CHAIN_ID: mainnet.id,
    CHAIN_LABEL: "Ethereum Mainnet",
  },
  sepolia: {
    WPRL: "" as `0x${string}`,
    BRIDGE_CONTROLLER: "" as `0x${string}`,
    PEARL_LOCK_ADDRESS: "",
    CHAIN_ID: sepolia.id,
    CHAIN_LABEL: "Sepolia Testnet",
  },
  // Hardhat localnet (chainId 31337). Addresses are deterministic from
  // devnet-up.sh's deploy script — same nonce sequence every fresh `pkill -f
  // 'hardhat node' && devnet-up.sh` reproduces them. Pearl lock address is
  // the SAME mainnet address as `mainnet` because the bridge demos a hybrid
  // bring-up: real Pearl mainnet deposits mint DevNet WPRL.
  devnet: {
    // RC2.1 redeploy 2026-05-18 — fresh proxies (totalSupply=0, dailyMintLimit=1M,
    // burnFeeBps=0). Same Hardhat account[0] as default admin.
    WPRL: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9" as `0x${string}`,
    BRIDGE_CONTROLLER: "0x0165878A594ca255338adfa4d48449f69242Eb8F" as `0x${string}`,
    PEARL_LOCK_ADDRESS: "prl1pu9duf5m3tq6xndpmqwvg8ejza7ql87973k6zjcjh8khz34wdyl5qk9nv70",
    CHAIN_ID: hardhat.id,
    CHAIN_LABEL: "PearlBridge DevNet (Hardhat, chainId 31337)",
  },
} as const;

// THE resolved bundle for the active network. Every component imports this —
// no per-file `ADDRESSES[NETWORK]` repetition, no env-var address overrides.
export const CONTRACTS = ADDRESSES[NETWORK];
export const EXPECTED_CHAIN_ID = CONTRACTS.CHAIN_ID;
export const EXPECTED_CHAIN_LABEL = CONTRACTS.CHAIN_LABEL;
