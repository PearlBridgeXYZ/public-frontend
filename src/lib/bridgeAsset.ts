// Which asset bridge the homepage is showing. PearlBridge (PRL) is the default;
// BTX is a second bridge selectable via a modern tab. A shareable URL can land
// a visitor straight on BTX: path /btx (any case) or a ?btx / ?BTX query flag.

export type BridgeAsset = "pearl" | "btx";

// Determine the initial asset from the URL. Defaults to "pearl".
export function detectInitialAsset(pathname: string, search: string): BridgeAsset {
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
  return asset === "btx" ? "/btx" : "/";
}
