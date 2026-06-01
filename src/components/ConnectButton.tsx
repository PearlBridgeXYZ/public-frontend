import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { useSwitchChain } from "wagmi";
import { EXPECTED_CHAIN_ID } from "../lib/contracts";

// Thin styled wrapper around RainbowKit's ConnectButton. The default RK
// render uses its own theming; we use the custom render so the button
// matches PearlBridge's teal-gradient pill aesthetic.

export function ConnectButton() {
  // wagmi's switchChain triggers `wallet_switchEthereumChain` on the
  // connected provider. Used for the wrong-network branch below — we can't
  // use RainbowKit's openChainModal there because the wagmi config is
  // single-chain (only Ethereum mainnet), which renders an empty modal.
  const { switchChain, isPending: switching } = useSwitchChain();

  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openConnectModal,
        openAccountModal,
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
              onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
              disabled={switching}
              className="text-sm bg-red-500/20 border border-red-500/50 text-red-300 font-bold px-4 py-2 rounded-xl hover:bg-red-500/30 transition-all disabled:opacity-60"
            >
              {switching ? "Switching…" : "Switch to Ethereum"}
            </button>
          );
        }

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
