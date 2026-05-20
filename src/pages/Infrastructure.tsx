import { useReadContract } from "wagmi";
import { BRIDGE_CONTROLLER_ABI, CONTRACTS, EXPECTED_CHAIN_ID } from "../lib/contracts";
import { grainsToWholePrlWithCommas } from "../lib/utils";

function TopologyDiagram() {
  return (
    <svg
      viewBox="0 0 800 380"
      className="w-full h-auto"
      role="img"
      aria-label="PearlBridge topology: Pearl P2P, sentries, validators, BridgeController"
    >
      <defs>
        <linearGradient id="edge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00e5d0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0099ff" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="nodeFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00e5d0" />
          <stop offset="100%" stopColor="#0099ff" />
        </linearGradient>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4"
          orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 L2,4 Z" fill="#00e5d0" opacity="0.7" />
        </marker>
      </defs>

      <g fontFamily="ui-monospace, monospace" fontSize="10" fill="#6b7280">
        <text x="8" y="50">PEARL P2P</text>
        <text x="8" y="140">SENTRIES</text>
        <text x="8" y="240">VALIDATORS</text>
        <text x="8" y="330">ETHEREUM</text>
      </g>

      <ellipse cx="400" cy="45" rx="160" ry="22"
        fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
      <text x="400" y="50" textAnchor="middle"
        fontFamily="Inter, system-ui" fontSize="13" fill="#e5e7eb">
        Public Pearl P2P network
      </text>

      {[180, 280, 380, 480, 580].map((x, i) => (
        <g key={`s-${i}`}>
          <rect x={x - 22} y={120} width="44" height="32" rx="6"
            fill="rgba(0,229,208,0.10)" stroke="#00e5d0" strokeOpacity="0.5" />
          <text x={x} y={140} textAnchor="middle"
            fontFamily="ui-monospace, monospace" fontSize="10" fill="#00e5d0">
            S{i + 1}
          </text>
          <line x1={x} y1={67} x2={x} y2={120}
            stroke="url(#edge)" strokeWidth="1" opacity="0.5" />
        </g>
      ))}

      <rect x="120" y="170" width="560" height="50" rx="8"
        fill="rgba(0,153,255,0.05)" stroke="rgba(0,153,255,0.20)"
        strokeDasharray="4 3" />
      <text x="400" y="200" textAnchor="middle"
        fontFamily="ui-monospace, monospace" fontSize="11" fill="#7dd3fc">
        WireGuard mesh · validators have no public ingress
      </text>

      {[230, 400, 570].map((x, i) => (
        <g key={`v-${i}`}>
          <rect x={x - 50} y={235} width="100" height="44" rx="8"
            fill="rgba(0,229,208,0.08)" stroke="url(#nodeFill)" strokeWidth="1.5" />
          <text x={x} y={255} textAnchor="middle"
            fontFamily="Inter, system-ui" fontWeight="600" fontSize="13"
            fill="#ffffff">V{i + 1}</text>
          <text x={x} y={270} textAnchor="middle"
            fontFamily="ui-monospace, monospace" fontSize="9" fill="#9ca3af">
            pearld
          </text>

          <line x1={180} y1={152} x2={x} y2={235}
            stroke="#0099ff" strokeOpacity="0.18" strokeWidth="1" />
          <line x1={380} y1={152} x2={x} y2={235}
            stroke="#0099ff" strokeOpacity="0.18" strokeWidth="1" />
          <line x1={580} y1={152} x2={x} y2={235}
            stroke="#0099ff" strokeOpacity="0.18" strokeWidth="1" />

          <line x1={x} y1={279} x2={400} y2={310}
            stroke="url(#edge)" strokeWidth="1.5"
            markerEnd="url(#arrow)" />
        </g>
      ))}

      <rect x="240" y="315" width="320" height="50" rx="10"
        fill="rgba(0,229,208,0.10)" stroke="#00e5d0" strokeWidth="1.5" />
      <text x="400" y="338" textAnchor="middle"
        fontFamily="Inter, system-ui" fontWeight="600" fontSize="14"
        fill="#ffffff">
        BridgeController (Ethereum)
      </text>
      <text x="400" y="354" textAnchor="middle"
        fontFamily="ui-monospace, monospace" fontSize="10" fill="#9ca3af">
        on-chain threshold check · mint / release WPRL
      </text>
    </svg>
  );
}

export function Infrastructure() {
  // Read the actual fast-lane cap from the deployed BridgeController so the
  // security-properties bullet and the two-lane-mint explainer below stay in
  // lockstep with whatever the Timelock has currently set on chain.
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
      <section className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[#00e5d0] font-medium border border-[#00e5d0]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5d0]" />
          Infrastructure
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          Federated multi-validator architecture
        </h1>
        <p className="text-gray-400 text-base max-w-2xl mx-auto leading-relaxed">
          PearlBridge runs as a federation of independent{" "}
          <code className="text-[#00e5d0] text-sm">pearld</code> validators
          that observe Pearl chain deposits and authorize WPRL mints through{" "}
          <code className="text-[#00e5d0] text-sm">BridgeController</code> on
          Ethereum. An on-chain threshold check enforces that no single
          operator can move value alone.
        </p>
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Topology</h2>
        <TopologyDiagram />
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            ["Sentries", "Public-facing Pearl nodes that speak the P2P protocol. The only tier with inbound exposure to the public network."],
            ["Validators", "Independent pearld nodes with no public ingress. Each observes deposits via WireGuard tunnels to assigned sentries."],
            ["Controller", "BridgeController on Ethereum verifies validator authorizations on-chain before minting or releasing WPRL."],
          ].map(([title, copy]) => (
            <div key={title as string} className="bg-white/5 border border-white/10 rounded-xl px-3 py-3">
              <div className="font-semibold text-white text-sm mb-1.5">{title as string}</div>
              <div className="text-gray-400 leading-relaxed">{copy as string}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Security properties</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            {
              title: "Geographic + provider diversity",
              copy: "Validators run in distinct regions on distinct cloud SKUs. A regional outage or provider-level compromise does not by itself remove a quorum.",
            },
            {
              title: "Sentry isolation",
              copy: "Validators do not speak the public Pearl P2P protocol directly. They reach the chain through WireGuard tunnels to assigned sentries, bounding public-facing surface area to the sentry tier.",
            },
            {
              title: "On-chain threshold check",
              copy: "Authorization is enforced inside BridgeController, not by an off-chain coordinator. The signature count required to mint is a public on-chain parameter.",
            },
            {
              title: "Role mutex on the controller",
              copy: "PAUSER and UNPAUSER are mutually exclusive at the contract level. A single compromised admin key cannot both pause the bridge and authorize value movement through it.",
            },
            {
              title: "Dynamic confirmation depth",
              copy: "Required Pearl confirmations scale with deposit size. Larger deposits clear only after deeper confirmation windows that any reorg attempt would have to overcome.",
            },
            {
              title: "Two-lane mint (51% reorg bound)",
              copy: `The fast lane is capped at ${fastCapPrl ?? "—"} PRL per 24h. Anything above the cap, or above the remaining daily quota, routes through a 24h timelock in full. Caps the value a successful Pearl reorg could attempt to double-spend through the fast lane and gives validators time to cancel pending mints.`,
            },
            {
              title: "Timelock-gated admin",
              copy: "Privileged contract changes route through a Timelock with a minimum delay. Role grants, upgrades, and parameter changes are publicly visible before they take effect.",
            },
          ].map((p) => (
            <div key={p.title} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className="font-semibold text-white mb-1">{p.title}</div>
              <div className="text-gray-400 text-xs leading-relaxed">{p.copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="two-lane-mint" className="space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">Two-lane mint &mdash; 51% reorg bound</h2>
        <div className="glass rounded-2xl p-5 text-sm text-gray-300 leading-relaxed space-y-3">
          <p>
            Every cross-chain bridge that mints on chain B against a deposit on
            chain A is exposed to chain-A reorganisations. If chain A reorgs
            deeply enough to bury the deposit transaction, the asset on chain B
            was minted against a deposit that no longer exists. Pearl uses a
            useful-work proof-of-work consensus; like any PoW chain, sufficient
            hashrate can finalise a competing fork and roll back recent blocks.
            We treat that as a real, bounded risk and design for it.
          </p>
          <p>
            <span className="font-semibold text-white">Fast lane.</span>{" "}
            The first <span className="text-[#00e5d0]">{fastCapPrl ?? "—"} PRL</span> bridged in any rolling
            24-hour window mints to WPRL as soon as the Pearl deposit reaches 6
            confirmations (~20 minutes). This is the on-demand path for normal
            user volume.
          </p>
          <p>
            <span className="font-semibold text-white">Slow lane.</span>{" "}
            Any single transaction larger than the fast-lane cap &mdash; or any
            transaction that would exceed the remaining fast-lane quota for the
            day &mdash; routes through the slow lane{" "}
            <span className="italic">in full</span>. The whole transaction
            queues in the controller and finalises automatically after a 24-hour
            timelock. No splitting, no partial fast-mint, no user action required.
          </p>
          <p>
            <span className="font-semibold text-white">Why this matters.</span>{" "}
            The fast-lane cap is the maximum value a successful Pearl reorg
            could attempt to double-spend through the instant path in a
            24-hour window. Anything larger sits in the 24-hour timelock,
            giving the validator set a full day to detect a reorg, run
            anomaly checks, and cancel the pending mint before it settles
            on Ethereum. The trade-off is explicit: small bridges are fast,
            large bridges are slow but safer.
          </p>
          <p>
            <span className="font-semibold text-white">Parameters are
            on-chain and visible.</span>{" "}
            <code className="text-[#00e5d0] text-xs">dailyFastMintLimit</code>,{" "}
            <code className="text-[#00e5d0] text-xs">slowMintDelay</code>, and{" "}
            the remaining quota for the current window are all readable directly
            on the BridgeController. The slow-lane delay is upward-only with a
            24-hour floor; it can be raised as the hashrate environment changes,
            never relaxed. The fast-lane cap can be moved by{" "}
            <code className="text-[#00e5d0] text-xs">DAILY_LIMITS_ROLE</code>{" "}
            (held by the Timelock-gated admin Safe), bounded to ≤50% of the
            overall daily mint cap so the slow lane can never be disabled
            silently.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Industry context</h2>
        <div className="glass rounded-2xl p-5 text-sm text-gray-300 leading-relaxed space-y-3">
          <p>
            Federated validator quorums with threshold signing are the
            standard architecture for production cross-chain bridges. A known,
            finite set of independent operators replaces either a single
            custodian or a fully trustless verification primitive — the latter
            remains expensive and only recently practical for general bridge
            messaging.
          </p>
          <p>
            Comparable production systems: Wormhole secures cross-chain
            messaging through a 19-node Guardian set with a supermajority
            requirement. LayerZero verifies messages via N-of-M Decentralized
            Verifier Networks selected per application. Chainlink CCIP pairs
            its validator committee with an independent Risk Management
            Network. Liquid (Blockstream) has run BTC peg-in/peg-out on an
            11-of-15 federation since 2018.
          </p>
          <p>
            PearlBridge sits at the small-quorum end of this design space.
            Validator count and the on-chain threshold are upgradeable
            parameters on the contract; the federation can grow without
            redeploying the bridge.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Operator transparency</h2>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl px-5 py-4 text-sm text-gray-300 leading-relaxed space-y-2">
          <p>
            The validator set is operated by the PearlBridge team while the
            network bootstraps. The bridge is <em>federated</em>, not
            decentralised. Validator slots are intended to be opened to
            independent third parties over time, under the same on-chain
            threshold check.
          </p>
          <p>
            The set of addresses authorised on the controller and the
            threshold they must meet are publicly verifiable on-chain on{" "}
            <code className="text-[#00e5d0]">BridgeController</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
