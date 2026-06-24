// BTX bridge section. Mirrors the PearlBridge flow (wrap native BTX -> WBTX on
// Ethereum, unwrap back) but isn't live yet — the BTX contracts + relay are
// still being deployed. Rendered when the BTX tab is selected so the UX and the
// /btx + ?btx deep links are testable now; the wrap/unwrap widget drops in here
// once the BTX backend ships.
export function BtxBridgeSection() {
  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="glass rounded-2xl p-6 border border-white/5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">BTX Bridge</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30">
            Coming soon
          </span>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">
          Bridge BTX between the BTX network and Ethereum — wrap native BTX into
          WBTX (an ERC-20 in your wallet) and unwrap it back, the same 1:1
          custody model PearlBridge uses for PRL.
        </p>
        <p className="text-gray-400 text-xs leading-relaxed">
          The BTX bridge is being built and isn't live yet. Wrapping and
          unwrapping will open here once the BTX contracts and relay are
          deployed. Switch to <span className="text-[#00e5d0] font-semibold">PearlBridge</span> above
          to bridge PRL today.
        </p>
      </div>
    </div>
  );
}
