import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { useReadContract, WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  RainbowKitAuthenticationProvider,
  AuthenticationStatus,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "../lib/wagmi";
import { siweAdapter, getInitialSiweStatus } from "../lib/siweAdapter";
import { getAuthStatus, subscribeAuthStatus } from "../lib/authStore";
import { ConnectButton } from "../components/ConnectButton";
import { BridgeWidget } from "../components/BridgeWidget";
import { BridgeStats } from "../components/BridgeStats";
import { BridgeModeToggle } from "../components/BridgeModeToggle";
import { LegalDisclaimer } from "../components/DisclaimerModal";
import { hasAcceptedDisclaimer } from "../lib/disclaimer";
import { BugBountyModal } from "../components/BugBountyModal";
import { Status } from "./Status";
import { History } from "./History";
import { Audit } from "./Audit";
import { Releases } from "./Releases";
import { Ecosystem } from "./Ecosystem";
import { Infrastructure } from "./Infrastructure";
import { Operator } from "./Operator";
import { OrderStatus } from "./OrderStatus";
import { UnwrapStatus } from "./UnwrapStatus";
import { NETWORK } from "../lib/config";
import { BRIDGE_CONTROLLER_ABI, CONTRACTS, EXPECTED_CHAIN_ID } from "../lib/contracts";
import { grainsToWholePrlWithCommas, hoursUntilEpochReset } from "../lib/utils";

// Mirror of BridgeController.WINDOW_DURATION (immutable, 86 400 s on mainnet).
// If the BC is ever redeployed with a different window, move this constant in
// tandem — the on-chain cap is enforced regardless; a wrong value here would
// only misrender the countdown copy, not the cap itself.
const WINDOW_DURATION_SEC = 86_400;

const queryClient = new QueryClient();

function PearlLogo() {
  return (
    <img
      src="/brand/logo-128.png"
      srcSet="/brand/logo-64.png 1x, /brand/logo-128.png 2x, /brand/logo-256.png 4x"
      width={36}
      height={36}
      alt="PearlBridge"
      className="rounded-lg select-none"
      draggable={false}
    />
  );
}

export function App() {
  // Subscribe to the module-singleton auth store so this component re-renders
  // when the SIWE adapter flips status after a sign-in or sign-out. The local
  // useState used to hydrate once on mount and never update, leaving the
  // ConnectButton stuck on "Sign in" after the user actually signed.
  const [authStatus, setAuthStatusLocal] = useState<AuthenticationStatus>(getAuthStatus);

  // Full-page legal disclaimer gate: read the cookie once on mount, render
  // the disclaimer until the user accepts (cookie write + state flip). The
  // gate sits ABOVE the wagmi/RainbowKit providers so it shows before any
  // wallet connection prompt.
  const [legalAccepted, setLegalAccepted] = useState<boolean>(hasAcceptedDisclaimer);

  useEffect(() => {
    const unsubscribe = subscribeAuthStatus(setAuthStatusLocal);
    getInitialSiweStatus();
    return unsubscribe;
  }, []);

  if (!legalAccepted) {
    return <LegalDisclaimer onAccept={() => setLegalAccepted(true)} />;
  }

  return (
    <BrowserRouter>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitAuthenticationProvider adapter={siweAdapter} status={authStatus}>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: "#00e5d0",
                accentColorForeground: "#000000",
                borderRadius: "large",
                fontStack: "system",
              })}
              modalSize="compact"
              appInfo={{
                appName: "PearlBridge",
                disclaimer: ({ Text, Link: RKLink }) => (
                  <Text>
                    By connecting your wallet you agree to the{" "}
                    <RKLink href="#disclaimer">PearlBridge user agreement &amp; risk disclosure</RKLink>.
                    Bridges are experimental software. Use at your own risk.
                  </Text>
                ),
              }}
            >
                {/* Animated background */}
              <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute inset-0 bg-[#050810]" />
                <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
                  style={{ background: 'radial-gradient(circle, #00e5d0 0%, transparent 70%)' }} />
                <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full opacity-10"
                  style={{ background: 'radial-gradient(circle, #0066ff 0%, transparent 70%)' }} />
                <div className="absolute inset-0 opacity-[0.03]"
                  style={{ backgroundImage: 'linear-gradient(#00e5d0 1px, transparent 1px), linear-gradient(90deg, #00e5d0 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
              </div>

              <div className="min-h-screen flex flex-col">
                <header className="sticky top-0 z-50 px-6 py-4 glass border-b border-white/5">
                  <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3">
                      <PearlLogo />
                      <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-[#00e5d0] to-white bg-clip-text text-transparent">
                        PearlBridge
                      </span>
                    </Link>
                    <nav className="flex items-center gap-4 text-sm">
                      {authStatus === "authenticated" ? (
                        <Link to="/history" className="text-gray-400 hover:text-white transition-colors hidden sm:inline">History</Link>
                      ) : null}
                      <Link to="/status" className="text-gray-400 hover:text-white transition-colors hidden sm:inline">Status</Link>
                      <Link to="/ecosystem" className="text-gray-400 hover:text-white transition-colors hidden sm:inline">Ecosystem</Link>
                      <Link to="/infrastructure" className="text-gray-400 hover:text-white transition-colors hidden sm:inline">Infrastructure</Link>
                      <Link to="/audit" className="text-gray-400 hover:text-white transition-colors hidden sm:inline">Audit</Link>
                      <Link to="/releases" className="text-gray-400 hover:text-white transition-colors hidden sm:inline">Releases</Link>
                      <a href="https://explorer.pearlresearch.ai" target="_blank" rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors hidden sm:inline">Explorer</a>
                      <a href="https://pearlwallet.xyz" target="_blank" rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white transition-colors hidden sm:inline">Wallet</a>
                      <BridgeModeToggle />
                      <ConnectButton />
                    </nav>
                  </div>
                </header>

                <main className="flex-1 w-full">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/bridge/:receiptId" element={<HomePage />} />
                    <Route path="/status" element={<Status />} />
                    <Route path="/order/:pearlTxId" element={<OrderStatus />} />
                    <Route path="/unwrap/:ethTxHash" element={<UnwrapStatus />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/audit" element={<Audit />} />
                    <Route path="/audit/:slug" element={<Audit />} />
                    <Route path="/releases" element={<Releases />} />
                    <Route path="/ecosystem" element={<Ecosystem />} />
                    <Route path="/infrastructure" element={<Infrastructure />} />
                    <Route path="/operator" element={<Operator />} />
                  </Routes>
                </main>

                <footer className="py-8 text-center text-xs text-gray-600 border-t border-white/5 space-y-2">
                  <p>PearlBridge is an independent bridge project. Use at your own risk. Not affiliated with Pearl Research Labs.</p>
                  <p><BugBountyModal /></p>
                  <p>
                    <a href="https://t.me/pearlbridgedev" target="_blank" rel="noopener noreferrer"
                      className="text-[#00e5d0] hover:underline">Need help? Reach the bridge dev on Telegram &rarr;</a>
                  </p>
                  <p className="text-gray-700">Build RC5.24 &middot; {NETWORK}</p>
                </footer>
              </div>

            </RainbowKitProvider>
          </RainbowKitAuthenticationProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  );
}

function HomePage() {
  // Pull the fast-lane cap directly from the deployed BridgeController so the
  // copy below always matches what the contract is actually enforcing — no
  // manual literal to drift when the Timelock changes setFastMintLimit.
  const { data: dailyFastCap } = useReadContract({
    address: CONTRACTS.BRIDGE_CONTROLLER,
    abi: BRIDGE_CONTROLLER_ABI,
    functionName: "dailyFastMintLimit",
    chainId: EXPECTED_CHAIN_ID,
  });
  const fastCapPrl =
    dailyFastCap !== undefined
      ? grainsToWholePrlWithCommas(dailyFastCap as bigint)
      : null;

  // Tick once per minute — one-decimal hours don't change faster than every
  // 6 minutes, so a per-minute cadence is sufficient and avoids any battery
  // cost on mobile from a per-second timer.
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(t);
  }, []);
  const hoursToReset = hoursUntilEpochReset(nowSec, WINDOW_DURATION_SEC);

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-16">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[#00e5d0] font-medium mb-6 border border-[#00e5d0]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0] animate-pulse" />
          {NETWORK === "mainnet" ? "Mainnet Live" : NETWORK === "devnet" ? "DevNet Live" : "Testnet Live"}
        </div>
        <h1 className="text-5xl font-extrabold mb-4 tracking-tight">
          Bridge PRL to{" "}
          <span className="bg-gradient-to-r from-[#00e5d0] to-[#0099ff] bg-clip-text text-transparent">
            Ethereum
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
          Lock native PRL. Receive WPRL on Ethereum &mdash; fully redeemable 1:1. 0.5% deposit fee (4 PRL minimum). No fee on redemption.
        </p>
      </div>

      <BridgeWidget />
      <BridgeStats />

      <div className="mt-6 max-w-lg mx-auto glass rounded-2xl p-5 text-sm">
        <div className="flex items-start gap-3">
          <span className="text-[#00e5d0] text-lg mt-0.5">&#9201;</span>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[#00e5d0] font-semibold text-xs uppercase tracking-wide">Two-Lane Mint</p>
              <p className="text-gray-500 text-[10px] font-medium">Fast lane resets in {hoursToReset.toFixed(1)}h</p>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              <span className="text-white">Fast lane:</span> the first {fastCapPrl ?? "—"} PRL bridged per 24h window mints to WPRL as soon as your deposit reaches 6 Pearl confirmations (~20 min).<br />
              <span className="text-white">Slow lane:</span> any single transaction larger than {fastCapPrl ?? "—"} PRL &mdash; or any transaction that exceeds the remaining fast-lane quota for the day &mdash; routes through a 24h timelock in full. No splitting. No action required from you. The mint settles automatically when the timelock matures.
            </p>
            <p className="text-gray-500 text-[11px] leading-relaxed pt-1.5 border-t border-white/5">
              <span className="text-gray-300">Why two lanes?</span> The fast lane caps how much value a 51% reorg of the Pearl chain could try to instantly double-spend through the bridge: at most {fastCapPrl ?? "—"} PRL per 24h window. Anything larger sits in the slow lane&apos;s 24h timelock, giving the validator set time to detect a reorg and cancel the pending mint before it settles on Ethereum.{" "}
              <Link to="/infrastructure#two-lane-mint" className="text-[#00e5d0] hover:underline">Read the security model &rarr;</Link>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 max-w-lg mx-auto glass rounded-2xl p-5 text-sm">
        <div className="flex items-start gap-3">
          <span className="text-yellow-400 text-lg mt-0.5">&#9888;</span>
          <div className="space-y-1.5">
            <p className="text-yellow-400 font-semibold text-xs uppercase tracking-wide">Security Notice</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Always verify the contract address on Etherscan.<br />
              Daily bridge limits apply. Bridge is administered by a Timelock-gated admin set with an N-of-M attester quorum.<br />
              Smart contracts are audited. See <a href="/audit" className="text-[#00e5d0] hover:underline">audit reports &rarr;</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
