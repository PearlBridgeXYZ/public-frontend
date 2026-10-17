// Pure-logic tests for src/lib/config.ts — the relay API-base resolution.
//
// config.ts reads `import.meta.env.VITE_RELAY_API_BASE` at module-evaluation
// time, so each case stubs the env, resets the module registry, and does a
// fresh dynamic import to observe the resolved constant. See config.ts:28,38.
import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_BASE = "https://api.pearlbridge.xyz";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig() {
  vi.resetModules();
  return import("../config");
}

describe("RELAY_API_BASE (config.ts:28)", () => {
  it("falls back to the default host when VITE_RELAY_API_BASE is unset", async () => {
    // Ensure the var is absent (?? catches undefined).
    vi.stubEnv("VITE_RELAY_API_BASE", undefined as unknown as string);
    const { RELAY_API_BASE } = await loadConfig();
    expect(RELAY_API_BASE).toBe(DEFAULT_BASE);
  });

  it("uses the override when VITE_RELAY_API_BASE is set", async () => {
    vi.stubEnv("VITE_RELAY_API_BASE", "https://relay.example.test");
    const { RELAY_API_BASE } = await loadConfig();
    expect(RELAY_API_BASE).toBe("https://relay.example.test");
  });
});

describe("PUBLIC_API_BASE (config.ts:38 — `||`, not `??`)", () => {
  it("falls back to the default host when the var is unset", async () => {
    vi.stubEnv("VITE_RELAY_API_BASE", undefined as unknown as string);
    const { PUBLIC_API_BASE } = await loadConfig();
    expect(PUBLIC_API_BASE).toBe(DEFAULT_BASE);
  });

  it("falls back to the default host on an EMPTY string (the `||` distinction)", async () => {
    // The mainnet build compiles VITE_RELAY_API_BASE to "" — PUBLIC_API_BASE
    // uses `||` so the empty string falls through to the absolute host, unlike
    // RELAY_API_BASE which uses `??` and would keep the empty string.
    vi.stubEnv("VITE_RELAY_API_BASE", "");
    const { PUBLIC_API_BASE, RELAY_API_BASE } = await loadConfig();
    expect(PUBLIC_API_BASE).toBe(DEFAULT_BASE);
    // Contrast: RELAY_API_BASE keeps the empty string under `??`.
    expect(RELAY_API_BASE).toBe("");
  });

  it("uses the override when set", async () => {
    vi.stubEnv("VITE_RELAY_API_BASE", "https://relay.example.test");
    const { PUBLIC_API_BASE } = await loadConfig();
    expect(PUBLIC_API_BASE).toBe("https://relay.example.test");
  });
});
