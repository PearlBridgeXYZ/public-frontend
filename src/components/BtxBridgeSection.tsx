import { useState } from "react";
import { CopyButton } from "./CopyButton";
import { BtxBridgeWidget } from "./BtxBridgeWidget";
import { BtxBurnWidget } from "./BtxBurnWidget";
import { BTX, btxSepoliaAddrUrl } from "../lib/btxConfig";

// BTX bridge section. Two flows side-by-side: the deposit widget (lock native BTX
// → mint WBTX, DERIVED-ADDRESS binding, NO OP_RETURN — G directive 2026-06-24)
// and the burn widget (burn WBTX → release native BTX). Both are Sepolia testnet
// previews and are fully isolated from the Pearl/mainnet path.
//
// All addresses come from the single source of truth in lib/btxConfig — there is
// no local config object here (previously a stale duplicate of the deploy
// addresses lived inline, a second source of truth; MED audit fix 2026-06-26).
const SEPOLIA_ADDR = btxSepoliaAddrUrl;

function AddressRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-500 uppercase tracking-wide pt-0.5 shrink-0">{label}</span>
      <span className="flex items-center gap-1 min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-[#00e5d0] hover:underline truncate"
          >
            {value}
          </a>
        ) : (
          <span className="text-xs font-mono text-gray-300 truncate">{value}</span>
        )}
        <CopyButton value={value} />
      </span>
    </div>
  );
}

type BtxFlow = "deposit" | "burn";

export function BtxBridgeSection() {
  const [flow, setFlow] = useState<BtxFlow>("deposit");

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Deposit ↔ Burn toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-black/30 border border-white/5">
        <button
          onClick={() => setFlow("deposit")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            flow === "deposit" ? "bg-[#00e5d0]/15 text-[#00e5d0]" : "text-gray-400 hover:text-white"
          }`}
        >
          {BTX.nativeSymbol} → {BTX.wrappedSymbol}
        </button>
        <button
          onClick={() => setFlow("burn")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            flow === "burn" ? "bg-[#00e5d0]/15 text-[#00e5d0]" : "text-gray-400 hover:text-white"
          }`}
        >
          {BTX.wrappedSymbol} → {BTX.nativeSymbol}
        </button>
      </div>

      {/* Interactive flow (Sepolia preview) */}
      {flow === "deposit" ? <BtxBridgeWidget /> : <BtxBurnWidget />}

      {/* Reference: verified deployment + custody model */}
      <div className="glass rounded-2xl p-6 border border-amber-500/20 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">Deployment &amp; custody</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30">
            Reference
          </span>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">
          The {BTX.wrappedSymbol} contracts are deployed and verified on Sepolia.
          Verify the addresses independently before depositing or burning.
        </p>

        <div className="rounded-xl bg-black/30 p-4">
          <AddressRow label={`${BTX.wrappedSymbol} token`} value={BTX.wbtxAddress} href={SEPOLIA_ADDR(BTX.wbtxAddress)} />
          <AddressRow label="BridgeController" value={BTX.bridgeController} href={SEPOLIA_ADDR(BTX.bridgeController)} />
          <AddressRow label="Federation lock (custody — NOT a deposit address)" value={BTX.lockAddress} />
        </div>
      </div>

      <div className="glass rounded-2xl p-5 text-sm">
        <p className="text-[#00e5d0] font-semibold text-xs uppercase tracking-wide mb-2">How a BTX deposit works</p>
        <ol className="text-gray-400 text-xs leading-relaxed space-y-1.5 list-decimal list-inside">
          <li>
            Use the widget above to get <span className="text-gray-300">your unique {BTX.nativeSymbol} deposit
            address</span> — it&apos;s bound to your Ethereum address by the relay.
          </li>
          <li>
            Send native {BTX.nativeSymbol} to that address from any wallet —{" "}
            <span className="text-gray-300">no memo or OP_RETURN needed.</span> Do NOT send to the
            federation lock address; that is custody only, not a deposit destination.
          </li>
          <li>
            After the size-scaled confirmation count, the 2-of-3 federation attests
            and {BTX.wrappedSymbol} mints to your Ethereum address — redeemable 1:1.
          </li>
        </ol>
      </div>

      <div className="glass rounded-2xl p-5 text-sm">
        <p className="text-[#00e5d0] font-semibold text-xs uppercase tracking-wide mb-2">Custody model</p>
        <p className="text-gray-400 text-xs leading-relaxed">
          BTX is locked under a <span className="text-white">post-quantum (ML-DSA-44)</span> 2-of-3
          multisig federation. The bridge mints {BTX.wrappedSymbol} only against confirmed,
          locked {BTX.nativeSymbol}, so wrapped supply never exceeds native locked —
          the same solvency invariant as the Pearl side.
        </p>
      </div>
    </div>
  );
}
