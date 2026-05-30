// Temporary wrapper that lets the user flip between the canonical
// bridge UI (paused) and the operator-trusted side door (default while
// the bridge is paused). Remove once the canonical bridge is healthy
// and re-enabled — at that point BridgeWidget goes back to being the
// sole entrypoint.

import { useState } from "react";
import { BridgeWidget } from "./BridgeWidget";
import { SideDoorUnwrap } from "./SideDoorUnwrap";

type Mode = "side_door" | "canonical";

export function BridgeCardSwitcher() {
  const [mode, setMode] = useState<Mode>("side_door");

  return (
    <div className="w-full max-w-lg mx-auto space-y-3">
      <div className="flex bg-white/5 rounded-2xl p-1 gap-1">
        <button
          onClick={() => setMode("side_door")}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
            mode === "side_door"
              ? "bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-lg shadow-amber-400/20"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Side door (open)
        </button>
        <button
          onClick={() => setMode("canonical")}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
            mode === "canonical"
              ? "bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black shadow-lg shadow-[#00e5d0]/20"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Canonical bridge (paused)
        </button>
      </div>

      {mode === "side_door" ? <SideDoorUnwrap /> : <BridgeWidget />}
    </div>
  );
}
