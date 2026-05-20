import { useEffect, useState, useCallback } from "react";

// Bridge mode controls the user-facing safety rails:
//   normal   = SIWE gate + EIP-712 destination confirmation required
//   advanced = bypasses both (signed disclaimer remains required regardless)
//
// Soft expiry: 7 days, so users who flip to advanced for one session don't
// stay in advanced forever. After 7 days the toggle resets to normal and
// the SIWE session must be re-established.

export type BridgeMode = "normal" | "advanced";

const STORAGE_KEY = "pearlbridge.mode";
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

type Stored = { mode: BridgeMode; setAt: number };

function read(): BridgeMode {
  if (typeof window === "undefined") return "normal";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return "normal";
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.mode || !parsed?.setAt) return "normal";
    if (Date.now() - parsed.setAt > EXPIRY_MS) return "normal";
    return parsed.mode === "advanced" ? "advanced" : "normal";
  } catch {
    return "normal";
  }
}

function write(mode: BridgeMode) {
  if (typeof window === "undefined") return;
  try {
    const payload: Stored = { mode, setAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota — fail closed: stay in normal */
  }
}

export function useBridgeMode(): {
  mode: BridgeMode;
  setMode: (next: BridgeMode) => void;
  isAdvanced: boolean;
} {
  const [mode, setModeState] = useState<BridgeMode>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setModeState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = useCallback((next: BridgeMode) => {
    write(next);
    setModeState(next);
  }, []);

  return { mode, setMode, isAdvanced: mode === "advanced" };
}
