import type { BridgeAsset } from "../lib/bridgeAsset";

// Modern segmented tabs to flip the homepage between the PearlBridge (PRL) and
// BTX bridges. Mirrors the visual language of BridgeCardSwitcher's pill tabs.
export function BridgeAssetTabs({
  asset,
  onSelect,
}: {
  asset: BridgeAsset;
  onSelect: (a: BridgeAsset) => void;
}) {
  const Tab = ({ id, label }: { id: BridgeAsset; label: string }) => {
    const active = asset === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => onSelect(id)}
        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
          active
            ? "bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black shadow-lg shadow-[#00e5d0]/20"
            : "text-gray-400 hover:text-white"
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="w-full max-w-lg mx-auto mb-3" role="tablist" aria-label="Select bridge">
      <div className="flex bg-white/5 rounded-2xl p-1 gap-1">
        <Tab id="pearl" label="PearlBridge" />
        <Tab id="btx" label="BTX Bridge" />
      </div>
    </div>
  );
}
