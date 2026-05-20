import { useBridgeMode } from "../lib/bridgeMode";

// Tiny pill toggle in the header. "Normal" is the default; flipping to
// "Advanced" reveals a one-time confirmation tooltip and disables the
// extra signature gates (disclaimer remains required regardless of mode).

export function BridgeModeToggle() {
  const { mode, setMode } = useBridgeMode();

  function flip() {
    if (mode === "normal") {
      const ok = window.confirm(
        "Advanced mode disables the destination-confirmation signature gate.\n\n" +
          "Recommended only for power users who validate their own destination addresses.\n\n" +
          "Continue?",
      );
      if (!ok) return;
      setMode("advanced");
    } else {
      setMode("normal");
    }
  }

  const isAdv = mode === "advanced";

  return (
    <button
      onClick={flip}
      aria-pressed={isAdv}
      title={
        isAdv
          ? "Advanced mode: destination-confirmation skipped. Click to re-enable safety rails."
          : "Normal mode: every burn/lock requires a destination-confirmation signature. Click to switch to advanced."
      }
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        isAdv
          ? "border-yellow-500/40 text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20"
          : "border-[#00e5d0]/30 text-[#00e5d0] bg-[#00e5d0]/5 hover:bg-[#00e5d0]/15"
      }`}
    >
      {isAdv ? "Mode: Advanced" : "Mode: Normal"}
    </button>
  );
}
