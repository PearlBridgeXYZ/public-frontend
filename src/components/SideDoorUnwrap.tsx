// Operator-trusted side-door unwrap UI. Temporary card surfaced while the
// canonical bridge is paused. See ../lib/sideDoorUnwrap.ts for the API
// contract and relay/docs/INTERMEDIARY-UNWRAP-AUDIT.md for the trust model.
//
// User flow:
//   1. Connect wallet (already plumbed at App level)
//   2. Enter Pearl destination
//   3. Sign binding (personal_sign over the EIP-191 payload)
//   4. Send WPRL to the intermediary hot address (one-click via wagmi)
//   5. Poll /api/unwrap/status by tx hash → render state machine

import { useEffect, useRef, useState } from "react";
import { useAccount, useBlockNumber, useChainId, useSignMessage, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { type Hex } from "viem";
import { WPRL_ABI, ADDRESSES, NETWORK } from "../lib/contracts";
import { isPlausiblePearlAddress } from "../lib/pearlAddress";
import { shortAddress, parseToGrains, grainsToDisplay } from "../lib/utils";
import { CopyButton } from "./CopyButton";
import {
  fetchSideDoorConfig,
  fetchBinding,
  postBind,
  fetchStatusByTx,
  buildBindingPayload,
  generateNonce,
  DEFAULT_BINDING_TTL_MS,
  isTerminalState,
  type SideDoorConfig,
  type BindingRow,
  type UnwrapRow,
} from "../lib/sideDoorUnwrap";

const ADDRS = ADDRESSES[NETWORK];

type Step = "input" | "binding" | "ready_to_send" | "sending" | "tracking" | "done";

export function SideDoorUnwrap() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();

  const [cfg, setCfg] = useState<SideDoorConfig | null>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [binding, setBinding] = useState<BindingRow | null>(null);
  const [pearlAddress, setPearlAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [rows, setRows] = useState<UnwrapRow[]>([]);

  // -- Config + existing binding bootstrap ----------------------------------
  useEffect(() => {
    fetchSideDoorConfig().then(setCfg).catch((e) => setCfgErr(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!address || !cfg?.enabled) return;
    fetchBinding(address).then((b) => {
      if (b) {
        setBinding(b);
        setPearlAddress(b.pearlAddress);
        setStep("ready_to_send");
      }
    }).catch(() => { /* no binding yet — stay on input */ });
  }, [address, cfg?.enabled]);

  // -- WPRL balance ---------------------------------------------------------
  const { data: wprlBalance } = useReadContract({
    address: ADDRS.WPRL as `0x${string}` | undefined,
    abi: WPRL_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!cfg?.enabled, refetchInterval: 15_000 },
  });

  // -- After tx broadcast, wait for receipt then start polling -------------
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (!receipt) return;
    setStep("tracking");
  }, [receipt]);

  // -- Live head — used to compute "X / Y confirmations" --------------------
  // Use the object-form `watch` so the watcher's polling interval is
  // explicit. The boolean form inherits the chain default and we saw it
  // get stuck at the initial block on at least one RPC provider.
  const trackingActive = !!receipt && step === "tracking";
  const { data: currentBlock } = useBlockNumber({
    watch: { enabled: trackingActive, pollingInterval: 4_000 },
    query: { enabled: trackingActive, refetchInterval: 4_000 },
  });

  // -- Smooth countdown: 1s tick + track when the head last advanced --------
  // Used to interpolate the confirmation bar between blocks and to render a
  // shrinking "~Ns remaining" estimate. 14s = canonical mainnet block time.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [lastBlockChangeMs, setLastBlockChangeMs] = useState<number | null>(null);
  const lastSeenBlockRef = useRef<bigint | null>(null);

  useEffect(() => {
    if (currentBlock != null && currentBlock !== lastSeenBlockRef.current) {
      lastSeenBlockRef.current = currentBlock;
      setLastBlockChangeMs(Date.now());
    }
  }, [currentBlock]);

  useEffect(() => {
    if (!trackingActive || rows.length > 0) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [trackingActive, rows.length]);

  // -- Status poll ---------------------------------------------------------
  useEffect(() => {
    if (step !== "tracking" || !txHash) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetchStatusByTx(txHash);
        if (cancelled) return;
        setRows(r);
        if (r.length > 0 && r.every((row) => isTerminalState(row.state))) {
          setStep("done");
        }
      } catch (e) {
        if (!cancelled) console.warn("status poll failed", e);
      }
    };
    void tick();
    const id = setInterval(tick, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [step, txHash]);

  // ------------- early states ---------------------------------------------

  if (cfgErr) {
    return (
      <Card>
        <p className="text-red-300 text-sm">Side door unreachable: {cfgErr}</p>
      </Card>
    );
  }

  if (!cfg) {
    return <Card><p className="text-gray-400 text-sm">Loading side door…</p></Card>;
  }

  if (!cfg.enabled) {
    return (
      <Card>
        <p className="text-amber-300 text-sm font-semibold">Side door disabled</p>
        <p className="text-gray-400 text-xs mt-2 leading-relaxed">
          The operator-trusted side channel is not currently enabled on this
          relay (<code className="text-xs">{cfg ? "config returned enabled:false" : "404"}</code>).
          Set <code>VITE_SIDE_DOOR_API_BASE</code> on the build to point at a
          relay where the feature flag is on, or enable
          <code> INTERMEDIARY_UNWRAP_ENABLED=true</code> on the current relay.
        </p>
      </Card>
    );
  }

  if (!address) {
    return (
      <Card>
        <p className="text-gray-300 text-sm">Connect a wallet to use the side door.</p>
      </Card>
    );
  }

  if (chainId !== cfg.chainId) {
    return (
      <Card>
        <p className="text-red-300 text-sm font-semibold">Wrong network</p>
        <p className="text-gray-400 text-xs mt-2">
          Side door expects chain ID {cfg.chainId}; your wallet is on {chainId}.
        </p>
      </Card>
    );
  }

  // Refuse to render the Send button if the relay is watching a different
  // WPRL contract than the frontend would transfer from. Sending canonical
  // WPRL to the hot wallet while the relay watches a fork = silent loss.
  if (
    cfg.wprlAddress &&
    ADDRS.WPRL &&
    cfg.wprlAddress.toLowerCase() !== ADDRS.WPRL.toLowerCase()
  ) {
    return (
      <Card>
        <p className="text-red-300 text-sm font-semibold">WPRL mismatch</p>
        <p className="text-gray-400 text-xs mt-2 break-all">
          Relay watches <span className="font-mono">{cfg.wprlAddress}</span>;
          frontend would transfer from <span className="font-mono">{ADDRS.WPRL}</span>.
          Refusing to send.
        </p>
      </Card>
    );
  }

  // ------------- main UI --------------------------------------------------

  // Trim trailing zeros so 50 bps → "0.5", 30 bps → "0.3", 25 bps → "0.25".
  const feePct = ((cfg.feeBps ?? 0) / 100).toFixed(2).replace(/\.?0+$/, "");
  const intermediary = cfg.intermediaryHotAddress!;

  const handleBind = async () => {
    setErr(null);
    if (!isPlausiblePearlAddress(pearlAddress)) {
      setErr("Pearl address looks malformed.");
      return;
    }
    setStep("binding");
    try {
      const nonce = generateNonce();
      const issuedAt = Date.now();
      const payload = buildBindingPayload({
        ethAddress: address,
        pearlAddress,
        intermediaryAddress: intermediary,
        chainId: cfg.chainId!,
        nonce,
        issuedAt,
        bindingTtlMs: DEFAULT_BINDING_TTL_MS,
      });
      const signature = await signMessageAsync({ message: payload });
      const row = await postBind({
        ethAddress: address,
        pearlAddress,
        signature: signature as `0x${string}`,
        nonce,
        issuedAt,
        bindingTtlMs: DEFAULT_BINDING_TTL_MS,
      });
      setBinding(row);
      setStep("ready_to_send");
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? String(e));
      setStep("input");
    }
  };

  const handleSend = async () => {
    setErr(null);
    if (!amount || !cfg.intermediaryHotAddress) return;
    const amountGrains = parseToGrains(amount);
    if (amountGrains == null) {
      setErr("Amount could not be parsed.");
      return;
    }
    if (cfg.minPayoutWei && amountGrains <= cfg.minPayoutWei) {
      setErr(`Below dust floor (${grainsToDisplay(cfg.minPayoutWei)} WPRL).`);
      return;
    }
    if (cfg.perTxCapWei && cfg.perTxCapWei > 0n && amountGrains > cfg.perTxCapWei) {
      setErr(`Above per-tx cap (${grainsToDisplay(cfg.perTxCapWei)} WPRL).`);
      return;
    }
    setStep("sending");
    try {
      const hash = await writeContractAsync({
        address: ADDRS.WPRL as `0x${string}`,
        abi: WPRL_ABI,
        functionName: "transfer",
        args: [intermediary, amountGrains],
      });
      setTxHash(hash);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? String(e));
      setStep("ready_to_send");
    }
  };

  const handleRebind = () => {
    setBinding(null);
    setPearlAddress("");
    setStep("input");
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <p className="text-amber-300 text-xs uppercase tracking-wide font-semibold">
            Side Door
          </p>
          <p className="text-gray-500 text-[10px]">
            fee {feePct}% · {cfg.minConfirmations} eth confs
          </p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-100/90 leading-relaxed">
          Temporary side door opened to allow unwrapping WPRL to PRL
          while the bridge is paused. Fee {feePct}%.
        </div>

        {/* ---- Input step ------------------------------------------------ */}
        {step === "input" && (
          <>
            <Field label="Pearl destination">
              <input
                type="text"
                value={pearlAddress}
                onChange={(e) => setPearlAddress(e.target.value)}
                placeholder="prl1p…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-400"
              />
            </Field>
            <button
              onClick={handleBind}
              disabled={!pearlAddress}
              className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 text-black font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sign &amp; bind destination
            </button>
          </>
        )}

        {step === "binding" && (
          <p className="text-gray-300 text-sm">Sign the binding in your wallet…</p>
        )}

        {/* ---- Ready to send -------------------------------------------- */}
        {(step === "ready_to_send" || step === "sending") && binding && (
          <>
            <div className="bg-white/5 rounded-lg px-3 py-2 text-xs space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>From</span>
                <span className="font-mono text-white">{shortAddress(address)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>To (Pearl)</span>
                <span className="font-mono text-white">{shortAddress(binding.pearlAddress)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Binding expires</span>
                <span className="text-white">{new Date(binding.expiresAt).toLocaleDateString()}</span>
              </div>
              <button
                onClick={handleRebind}
                className="text-amber-400 text-[10px] hover:underline pt-1"
              >
                change destination
              </button>
            </div>

            <Field label="Amount (WPRL)">
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-400"
                />
                {wprlBalance != null && (
                  <button
                    onClick={() => setAmount(grainsToDisplay(wprlBalance as bigint))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 text-[10px] hover:underline"
                  >
                    MAX {grainsToDisplay(wprlBalance as bigint)}
                  </button>
                )}
              </div>
            </Field>

            <div className="text-[11px] text-gray-500 leading-relaxed">
              Sends to <span className="font-mono text-gray-300">{intermediary}</span>{" "}
              <CopyButton value={intermediary} />.{" "}
              Daily cap{" "}
              {cfg.daily24hCapWei
                ? `${grainsToDisplay(cfg.daily24hCapWei)} WPRL`
                : "—"}
              {cfg.perTxCapWei && cfg.perTxCapWei > 0n
                ? ` · per-tx cap ${grainsToDisplay(cfg.perTxCapWei)} WPRL`
                : ""}
              .
            </div>

            <button
              onClick={handleSend}
              disabled={step === "sending" || !amount}
              className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 text-black font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === "sending" ? "Confirm in wallet…" : "Send WPRL"}
            </button>
          </>
        )}

        {/* ---- Tracking ------------------------------------------------- */}
        {(step === "tracking" || step === "done") && txHash && (
          <div className="space-y-2">
            <p className="text-gray-300 text-sm">
              ETH tx{" "}
              <span className="font-mono text-white">{shortAddress(txHash)}</span>{" "}
              broadcast.
            </p>
            {rows.length === 0 && (() => {
              const minConfs = cfg.minConfirmations ?? 12;
              const SEC_PER_BLOCK = 14;
              if (!receipt) {
                return (
                  <ConfirmationBar
                    smoothedConfs={0}
                    integerConfs={0}
                    minConfs={minConfs}
                    label="Waiting for transaction to be mined…"
                  />
                );
              }
              const integerConfs = currentBlock
                ? Math.max(0, Number(currentBlock - receipt.blockNumber) + 1)
                : 1;
              if (integerConfs >= minConfs) {
                return (
                  <ConfirmationBar
                    smoothedConfs={minConfs}
                    integerConfs={minConfs}
                    minConfs={minConfs}
                    label="Confirmations reached — waiting for the relay to observe…"
                    done
                  />
                );
              }
              // Smooth: interpolate confs by (time since last block) / 14s,
              // clamped so the bar never overshoots integer confs+1.
              const elapsedMs = lastBlockChangeMs
                ? Math.max(0, nowMs - lastBlockChangeMs)
                : 0;
              const partialBlock = Math.min(1, elapsedMs / (SEC_PER_BLOCK * 1000));
              const smoothedConfs = Math.min(minConfs, integerConfs + partialBlock);
              const blocksRemaining = Math.max(0, minConfs - integerConfs);
              const etaSec = Math.max(
                0,
                Math.ceil((blocksRemaining * SEC_PER_BLOCK * 1000 - elapsedMs) / 1000),
              );
              const etaStr =
                etaSec >= 60
                  ? `~${Math.floor(etaSec / 60)}m ${String(etaSec % 60).padStart(2, "0")}s`
                  : `~${etaSec}s`;
              return (
                <ConfirmationBar
                  smoothedConfs={smoothedConfs}
                  integerConfs={integerConfs}
                  minConfs={minConfs}
                  label={`Waiting for confirmations · ${etaStr} remaining`}
                />
              );
            })()}
            {rows.map((row) => (
              <div key={row.ethLogIndex} className="bg-white/5 rounded-lg px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between text-gray-400">
                  <span>WPRL in</span>
                  <span className="font-mono text-white">
                    {grainsToDisplay(BigInt(row.wprlAmount))}
                  </span>
                </div>
                {row.pearlAmount && (
                  <div className="flex justify-between text-gray-400">
                    <span>PRL out (net of fee)</span>
                    <span className="font-mono text-white">
                      {grainsToDisplay(BigInt(row.pearlAmount))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-gray-400">
                  <span>State</span>
                  <StateBadge state={row.state} />
                </div>
                {row.pearlTxId && (
                  <div className="flex justify-between text-gray-400">
                    <span>Pearl tx</span>
                    <span className="font-mono text-white">{row.pearlTxId.slice(0, 12)}…</span>
                  </div>
                )}
                {row.reviewReason && (
                  <p className="text-amber-300 text-[10px] pt-1">
                    Under review: {row.reviewReason}
                  </p>
                )}
                {row.lastError && (
                  <p className="text-red-300 text-[10px] pt-1">Last error: {row.lastError}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {err && <p className="text-red-300 text-xs">{err}</p>}
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-lg mx-auto glass-strong rounded-3xl p-6 shadow-2xl shadow-black/50 border border-amber-500/20">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</label>
      {children}
    </div>
  );
}

function ConfirmationBar({
  smoothedConfs,
  integerConfs,
  minConfs,
  label,
  done,
}: {
  smoothedConfs: number;
  integerConfs: number;
  minConfs: number;
  label: string;
  done?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (smoothedConfs / minConfs) * 100));
  // Transition just under the 1s tick interval so the bar eases between
  // ticks without ever falling behind the next update.
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-gray-400 text-[11px]">{label}</span>
        {!done && (
          <span className="text-gray-500 text-[10px] tabular-nums">
            {integerConfs}/{minConfs}
          </span>
        )}
      </div>
      <div
        className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={minConfs}
        aria-valuenow={integerConfs}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-[900ms] ease-linear ${
            done
              ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
              : "bg-gradient-to-r from-amber-400 to-amber-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: UnwrapRow["state"] }) {
  const color: Record<UnwrapRow["state"], string> = {
    awaiting_address: "text-gray-300",
    pending: "text-yellow-300",
    signing: "text-cyan-300",
    submitted: "text-cyan-300",
    finalized: "text-emerald-300",
    failed: "text-red-300",
    reorged: "text-red-300",
    under_review: "text-amber-300",
  };
  return <span className={`font-semibold ${color[state]}`}>{state}</span>;
}
