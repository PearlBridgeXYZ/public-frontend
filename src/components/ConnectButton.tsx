import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";

// Thin styled wrapper around RainbowKit's ConnectButton. The default RK
// render uses its own theming; we use the custom render so the button
// matches PearlBridge's teal-gradient pill aesthetic.

export function ConnectButton() {
  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openConnectModal,
        openAccountModal,
        openChainModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        if (!ready) {
          return <div aria-hidden style={{ opacity: 0, pointerEvents: "none", userSelect: "none" }} />;
        }

        if (!connected) {
          // Unauthenticated states: not connected, or connected-but-SIWE-pending.
          const label =
            authenticationStatus === "unauthenticated" && account
              ? "Sign in"
              : "Connect Wallet";
          return (
            <button
              onClick={openConnectModal}
              className="text-sm bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] hover:from-[#00f0da] hover:to-[#00c5b5] text-black font-bold px-5 py-2 rounded-xl transition-all shadow-lg shadow-[#00e5d0]/20"
            >
              {label}
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="text-sm bg-red-500/20 border border-red-500/50 text-red-300 font-bold px-4 py-2 rounded-xl"
            >
              Wrong network
            </button>
          );
        }

        // The chain switcher pill is intentionally not rendered: PearlBridge
        // is wired to a single network per build (Ethereum on mainnet), so
        // there is nothing to switch to. Wrong-network is still surfaced via
        // the `chain.unsupported` branch above.
        return (
          <button
            onClick={openAccountModal}
            className="text-sm glass border border-white/10 hover:border-[#00e5d0]/40 text-gray-300 hover:text-white px-4 py-2 rounded-xl transition-all font-medium"
          >
            {account.displayName}
          </button>
        );
      }}
    </RKConnectButton.Custom>
  );
}
