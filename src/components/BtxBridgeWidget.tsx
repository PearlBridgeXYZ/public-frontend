import { useState, useEffect } from "react";
import { useAccount, useChainId, useSwitchChain, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CopyButton } from "./CopyButton";
import { validateEthAddress } from "../lib/eth-address";
import {
  BTX,
  BTX_API_BASE,
  BTX_GRAINS_PER,
  btxConfirmationsRequired,
  btxWaitLabel,
  btxNetReceive,
  isBtxAddress,
} from "../lib/btxConfig";

// Minimal ERC-20 read ABI — confirm the user received WBTX after the relay mints.
const WBTX_READ_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

type DepositAddrResp = { depositAddress?: string; address?: string; error?: string };

function fmtBtx(grains: bigint): string {
  const whole = grains / BTX_GRAINS_PER;
  const frac = (grains % BTX_GRAINS_PER).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// BTX deposit widget. Lock native BTX → receive WBTX on Ethereum (Sepolia
// testnet preview). DERIVED-ADDRESS binding: the relay gives each recipient a
// unique BTX address — no OP_RETURN, nothing for the user to get wrong. Fully
// isolated from the Pearl/mainnet flow; targets Sepolia only.
export function BtxBridgeWidget() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const onSepolia = chainId === BTX.chainId;

  const [recipientInput, setRecipientInput] = useState("");
  useEffect(() => {
    if (address && !recipientInput) setRecipientInput(address);
  }, [address, recipientInput]);

  const recipientCheck = validateEthAddress(recipientInput);
  const recipient = recipientCheck.kind !== "invalid" ? recipientCheck.address : undefined;

  // Optional amount preview — drives the fee + confirmation-tier display.
  const [amountStr, setAmountStr] = useState("");
  const amountGrains =
    amountStr && /^\d*\.?\d*$/.test(amountStr) && Number(amountStr) > 0
      ? BigInt(Math.round(Number(amountStr) * 1e8))
      : null;

  // H6 — explicit testnet acknowledgment gates the deposit-address reveal, so a
  // user can't skim the banner and send real BTX for valueless testnet WBTX.
  const [ack, setAck] = useState(false);

  const [depositAddr, setDepositAddr] = useState<string | null>(null);
  // H4 — the recipient BOUND when the address was fetched (the balance watch
  // must track this, not the live input — editing the field afterwards must not
  // silently repoint the balance check and make a successful mint look failed).
  const [boundRecipient, setBoundRecipient] = useState<`0x${string}` | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Editing the recipient invalidates a previously-fetched deposit address.
  function onRecipientChange(v: string) {
    setRecipientInput(v);
    if (depositAddr) {
      setDepositAddr(null);
      setBoundRecipient(undefined);
    }
  }

  // WBTX receipt watch — poll the BOUND recipient's WBTX balance on Sepolia.
  const { data: wbtxBal } = useReadContract({
    address: BTX.wbtxAddress,
    abi: WBTX_READ_ABI,
    functionName: "balanceOf",
    args: boundRecipient ? [boundRecipient] : undefined,
    chainId: BTX.chainId,
    query: { enabled: !!depositAddr && !!boundRecipient, refetchInterval: 15_000 },
  });

  async function getDepositAddress() {
    if (!recipient) return;
    setErr(null);
    setDepositAddr(null);
    setBoundRecipient(undefined);
    setLoading(true);
    try {
      if (!BTX_API_BASE) {
        setErr("not-live");
        return;
      }
      const r = await fetch(`${BTX_API_BASE}/v1/deposit-address?ethAddress=${recipient}`);
      const j = (await r.json()) as DepositAddrResp;
      const a = j.depositAddress ?? j.address;
      if (!r.ok || !a) {
        setErr(j.error ?? `Could not get a deposit address (HTTP ${r.status})`);
        return;
      }
      // H3 — never instruct the user to send to an address we can't verify is a
      // well-formed BTX address (defense-in-depth vs a MITM'd/buggy relay).
      if (!isBtxAddress(a)) {
        setErr("The relay returned a malformed address — do NOT send funds. Try again.");
        return;
      }
      setDepositAddr(a);
      setBoundRecipient(recipient);
    } catch {
      setErr("BTX bridge endpoint unreachable — the relay may not be live yet.");
    } finally {
      setLoading(false);
    }
  }

  const preview = amountGrains !== null ? btxNetReceive(amountGrains) : null;
  const confs = amountGrains !== null ? btxConfirmationsRequired(amountGrains) : null;

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Loud testnet rail — real BTX in, TESTNET WBTX out. Do not use value you expect back. */}
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-relaxed">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30">
            Sepolia Testnet
          </span>
          <span className="text-amber-200 font-semibold">Preview — not for real value</span>
        </div>
        <p className="text-gray-300">
          This locks native {BTX.nativeSymbol} and mints {BTX.wrappedSymbol} on{" "}
          <span className="text-white">Ethereum Sepolia (testnet)</span>. Only bridge {BTX.nativeSymbol}
          {" "}you are explicitly testing with — testnet {BTX.wrappedSymbol} has no value and the
          {" "}{BTX.nativeSymbol} you send will not be returned.
        </p>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">
            Bridge {BTX.nativeSymbol} → {BTX.wrappedSymbol}
          </span>
        </div>

        {/* 1 — recipient */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 uppercase tracking-wide">
            Ethereum recipient (Sepolia)
          </label>
          <input
            value={recipientInput}
            onChange={(e) => onRecipientChange(e.target.value)}
            placeholder="0x… address to receive WBTX"
            spellCheck={false}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-[#00e5d0]/50 outline-none"
          />
          {recipientInput && recipientCheck.kind === "invalid" && (
            <p className="text-red-400 text-xs">{recipientCheck.reason}</p>
          )}
          {recipientCheck.kind === "valid-no-checksum" && (
            <p className="text-yellow-300/80 text-xs">Interpreted as {recipientCheck.address}</p>
          )}
        </div>

        {/* 2 — optional amount preview */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 uppercase tracking-wide">
            Amount (optional — preview fee &amp; confirmations)
          </label>
          <div className="relative">
            <input
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-[#00e5d0]/50 outline-none"
            />
            <span className="absolute right-3 top-2.5 text-xs text-gray-500">{BTX.nativeSymbol}</span>
          </div>
          {preview !== null && confs !== null && (
            preview.belowFloor ? (
              <p className="text-yellow-300/90 text-xs bg-yellow-500/10 rounded-lg p-2.5">
                Below the minimum — a deposit this small won&apos;t be bridged (the 1 {BTX.nativeSymbol}
                {" "}fee floor would consume it). Send more than 1 {BTX.nativeSymbol}.
              </p>
            ) : (
              <div className="text-xs text-gray-400 bg-black/20 rounded-lg p-2.5 space-y-1">
                <div className="flex justify-between"><span>Bridge fee (max 0.5%, 1 {BTX.nativeSymbol} min)</span><span className="text-gray-300">{fmtBtx(preview.fee)} {BTX.nativeSymbol}</span></div>
                <div className="flex justify-between"><span>You receive</span><span className="text-[#00e5d0]">{fmtBtx(preview.net)} {BTX.wrappedSymbol}</span></div>
                <div className="flex justify-between"><span>Confirmations required</span><span className="text-gray-300">{confs} ({btxWaitLabel(confs)})</span></div>
              </div>
            )
          )}
        </div>

        {/* 3 — testnet acknowledgment (H6) */}
        {isConnected && onSepolia && (
          <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 accent-[#00e5d0]"
            />
            <span>
              I understand this is a testnet preview: the {BTX.wrappedSymbol} I receive on Sepolia has
              no monetary value, and the {BTX.nativeSymbol} I send will not be returned.
            </span>
          </label>
        )}

        {/* 4 — action: connect / switch chain / get address */}
        {!isConnected ? (
          <button onClick={openConnectModal} className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black">
            Connect wallet
          </button>
        ) : !onSepolia ? (
          <button
            onClick={() => switchChain({ chainId: BTX.chainId })}
            disabled={switching}
            className="w-full py-3 rounded-xl font-semibold bg-amber-500/90 text-black disabled:opacity-60"
          >
            {switching ? "Switching…" : "Switch to Sepolia"}
          </button>
        ) : (
          <button
            onClick={getDepositAddress}
            disabled={!recipient || !ack || loading}
            className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black disabled:opacity-50"
          >
            {loading ? "Getting your deposit address…" : "Get my BTX deposit address"}
          </button>
        )}

        {/* not-live degradation */}
        {err === "not-live" && (
          <p className="text-xs text-amber-300/90 bg-amber-500/10 rounded-lg p-3">
            The BTX bridge relay isn&apos;t live yet — the deposit endpoint comes online with the
            testnet standup. The contracts and custody are already deployed (below); one-click
            deposits open once the relay is up.
          </p>
        )}
        {err && err !== "not-live" && (
          <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-3">{err}</p>
        )}

        {/* 5 — derived deposit address + instructions */}
        {depositAddr && (
          <div className="space-y-3 pt-1">
            <div className="rounded-xl bg-black/40 border border-[#00e5d0]/20 p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
                Your unique {BTX.nativeSymbol} deposit address
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#00e5d0] break-all">{depositAddr}</span>
                <CopyButton value={depositAddr} />
              </div>
            </div>
            <ol className="text-gray-400 text-xs leading-relaxed space-y-1 list-decimal list-inside">
              <li>Send native {BTX.nativeSymbol} to the address above from any {BTX.nativeSymbol} wallet — <span className="text-gray-300">no memo / OP_RETURN needed.</span></li>
              <li>After the required confirmations, the 2-of-3 PQ federation attests and {BTX.wrappedSymbol} mints to <span className="font-mono text-gray-300">{boundRecipient}</span>.</li>
              <li>This page watches your Sepolia {BTX.wrappedSymbol} balance below — it updates automatically when the mint lands.</li>
            </ol>
            <div className="rounded-lg bg-black/20 p-2.5 text-xs flex justify-between">
              <span className="text-gray-500">Your {BTX.wrappedSymbol} balance (Sepolia)</span>
              <span className="text-[#00e5d0] font-mono">
                {typeof wbtxBal === "bigint" ? `${fmtBtx(wbtxBal)} ${BTX.wrappedSymbol}` : "—"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
