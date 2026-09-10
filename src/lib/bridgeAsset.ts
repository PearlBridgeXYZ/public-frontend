// Which asset bridge the homepage is showing. PearlBridge (PRL) is the default;
// BTX is a second bridge selectable via a modern tab. A shareable URL can land
// a visitor straight on BTX: path /btx (any case) or a ?btx / ?BTX query flag.

export type BridgeAsset = "pearl" | "btx";

// TEMPORARY (G, 2026-09-10 TG #58185): the BTX tab is hidden on the public site.
// One flag hides the tab AND makes /btx and ?btx fall back to PearlBridge, so a
// stale shared link can't land a visitor on a section with no way back. All BTX
// code, config and tests stay in place — flip this back to true to restore it.
export const BTX_TAB_ENABLED = false;

// Determine the initial asset from the URL. Defaults to "pearl".
export function detectInitialAsset(pathname: string, search: string): BridgeAsset {
  if (!BTX_TAB_ENABLED) return "pearl";
  const p = (pathname || "").toLowerCase();
  if (p === "/btx" || p.startsWith("/btx/") || p.startsWith("/btx?")) return "btx";
  const params = new URLSearchParams(search || "");
  for (const key of params.keys()) {
    if (key.toLowerCase() === "btx") return "btx";
  }
  return "pearl";
}

// URL path for an asset, so a tab switch can keep the address bar shareable
// without a full reload. pearl -> "/", btx -> "/btx".
export function assetToPath(asset: BridgeAsset): string {
  if (!BTX_TAB_ENABLED) return "/";
  return asset === "btx" ? "/btx" : "/";
}
