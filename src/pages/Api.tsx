import { Link } from "react-router-dom";

// Static reference for the public /v1 REST API served at
// https://api.pearlbridge.xyz. Shapes documented here are a published
// contract: additive changes only — renames/removals go to /v2.
// Keep the examples in lockstep with the relay's v1 routes; the relay's
// /v1 index endpoint is the machine-readable source of truth.

const API_BASE = "https://api.pearlbridge.xyz";

type Endpoint = {
  method: "GET";
  path: string;
  title: string;
  description: string;
  params?: { name: string; in: "path" | "query"; description: string }[];
  curl: string;
  response: string;
  notes?: string[];
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/v1/status",
    title: "Bridge status",
    description:
      "Live operational state read from the BridgeController contract on Ethereum mainnet: pause flag, fee schedule, daily caps with the remaining capacity in the current 24h windows, slow-lane delay, and the Pearl confirmation policy. Cached for 30 seconds.",
    curl: `curl ${API_BASE}/v1/status`,
    response: `{
  "paused": false,
  "fees": { "mintFeeBps": 0, "burnFeeBps": 0 },
  "limits": {
    "dailyMintLimitGrains": "500000000000000",
    "dailyBurnLimitGrains": "100000000000000",
    "dailyFastMintLimitGrains": "50000000000000",
    "mintWindowRemainingGrains": "499604390509712",
    "fastMintWindowRemainingGrains": "49604390509712",
    "burnWindowRemainingGrains": "99788751193552",
    "slowMintDelaySeconds": 86400
  },
  "confirmations": { "pearlMinConfirmations": 6 },
  "contracts": {
    "network": "mainnet",
    "wprl": "0x07696DcaB55E62cfef953666b29Fe1970518cB00",
    "bridgeController": "0xA6571B73489d4eBFA269a107208665dF7C80Aef5"
  },
  "decimals": 8,
  "timestamp": 1781067290202
}`,
    notes: [
      "Deposits that fit inside fastMintWindowRemaining mint synchronously after confirmation; the excess queues for slowMintDelaySeconds (24h slow lane).",
    ],
  },
  {
    method: "GET",
    path: "/v1/supply",
    title: "WPRL total supply",
    description:
      "WPRL totalSupply on Ethereum, as raw grains and as a fixed-point decimal string. For the plain-text number consumed by aggregators (CoinGecko/CMC), use /api/supply.",
    curl: `curl ${API_BASE}/v1/supply`,
    response: `{
  "totalSupplyGrains": "76175838130195",
  "totalSupply": "761758.38130195",
  "decimals": 8,
  "timestamp": 1781067290216
}`,
  },
  {
    method: "GET",
    path: "/v1/stats",
    title: "Bridge volume",
    description:
      "Per-direction transfer counts and grain totals over the last 24 hours, 7 days, and all time. Directions: mint (PRL→WPRL), burn (WPRL→PRL), intermediary (partner-funded unwrap).",
    curl: `curl ${API_BASE}/v1/stats`,
    response: `{
  "volume": {
    "24h": { "mint": { "count": 72, "grains": "6574698578130" },
             "burn": { "count": 10, "grains": "1127822855771" },
             "intermediary": { "count": 0, "grains": "0" } },
    "7d":  { "...": "same shape" },
    "all": { "...": "same shape" }
  },
  "decimals": 8,
  "timestamp": 1781065826758
}`,
  },
  {
    method: "GET",
    path: "/v1/custody",
    title: "Proof of reserves",
    description:
      "Pearl-side custody snapshot vs. WPRL supply — the same data backing the Audit page's solvency card. Heavy UTXO scan under the hood; served from a cache with stale-while-revalidate semantics, so the timestamp tells you snapshot age.",
    curl: `curl ${API_BASE}/v1/custody`,
    response: `{
  "lockGrains": "…",
  "treasuryGrains": "…",
  "supplyGrains": "…",
  "timestamp": 1781067290000
}  // see live response for the full field set`,
  },
  {
    method: "GET",
    path: "/v1/quote/mint",
    title: "Mint quote",
    description:
      "Quote a prospective PRL→WPRL deposit before funds move: fee, net WPRL, and whether the amount clears the fast lane (mints right after confirmation) or queues in the 24h slow lane. Quotes derive from the same 30s-cached status the /v1/status route serves.",
    params: [
      { name: "amountGrains", in: "query", description: "deposit amount in grains (positive integer)" },
    ],
    curl: `curl "${API_BASE}/v1/quote/mint?amountGrains=10000000000"`,
    response: `{
  "direction": "mint",
  "amountGrains": "10000000000",
  "feeBps": 0, "feeGrains": "0", "netGrains": "10000000000",
  "paused": false,
  "lane": "fast",
  "slowLaneDelaySeconds": 0,
  "withinDailyCap": true,
  "fastLaneRemainingGrains": "49592906146322",
  "dailyRemainingGrains": "499592906146322",
  "confirmationsRequired": 6,
  "next": "GET /v1/deposit-address?ethAddress=0x… then send PRL to the derived address",
  "timestamp": 1781069735508
}`,
  },
  {
    method: "GET",
    path: "/v1/quote/burn",
    title: "Burn quote + transaction plan",
    description:
      "Quote a WPRL→PRL redemption AND get the exact contract calls to submit: a conditional ERC-20 approve (only when the user's WPRL allowance for the BridgeController is below the amount) followed by requestBurn. A wallet can sign the returned steps as-is — no ABI archaeology required. Pass pearlAddress to have the payout address pre-validated in the same call.",
    params: [
      { name: "amountGrains", in: "query", description: "burn amount in grains (positive integer)" },
      { name: "pearlAddress", in: "query", description: "optional — Pearl payout address to validate (P2TR, prl1p…)" },
    ],
    curl: `curl "${API_BASE}/v1/quote/burn?amountGrains=10000000000&pearlAddress=prl1p…"`,
    response: `{
  "direction": "burn",
  "amountGrains": "10000000000",
  "feeBps": 0, "feeGrains": "0", "netGrains": "10000000000",
  "paused": false,
  "withinDailyCap": true,
  "burnWindowRemainingGrains": "99788751193552",
  "addressCheck": { "pearlAddress": "prl1p…", "valid": true, "format": "p2tr" },
  "transaction": {
    "chainId": 1,
    "steps": [
      { "step": "approve",
        "requiredWhen": "allowance(owner, bridgeController) < amountGrains",
        "to": "0x07696Dca… (WPRL)",
        "abi": "function approve(address spender, uint256 amount) returns (bool)",
        "args": ["0xA6571B73… (BridgeController)", "10000000000"] },
      { "step": "requestBurn",
        "to": "0xA6571B73… (BridgeController)",
        "abi": "function requestBurn(uint256 grossAmount, string pearlAddress)",
        "args": ["10000000000", "prl1p…"] }
    ],
    "track": "GET /v1/burns/{ethTxHash of the requestBurn transaction}"
  },
  "timestamp": 1781069737123
}`,
  },
  {
    method: "GET",
    path: "/v1/validate-address",
    title: "Pearl address validation",
    description:
      "Validate a Pearl payout address before burning. Runs the same strict decode the payout signer enforces — P2TR only (witness v1, 32-byte program, prl prefix) — so valid: true is a guarantee the unlock path can actually pay the address. Always call this before requestBurn.",
    params: [
      { name: "pearlAddress", in: "query", description: "Pearl address to check (prl1p…)" },
    ],
    curl: `curl "${API_BASE}/v1/validate-address?pearlAddress=prl1p…"`,
    response: `{ "pearlAddress": "prl1p…", "valid": true, "format": "p2tr" }
// or { "valid": false, "format": null, "reason": "Not a witness v1 address" }`,
  },
  {
    method: "GET",
    path: "/v1/deposits/recent",
    title: "Recent deposit discovery",
    description:
      "Most recent in-flight deposit bound to an ETH wallet. Use it when your user funded the derived deposit address from an exchange withdrawal and you never saw the Pearl txid — once the watcher indexes the deposit, this returns the txid to track.",
    params: [
      { name: "ethAddress", in: "query", description: "0x-prefixed Ethereum address the deposit address was derived for" },
    ],
    curl: `curl "${API_BASE}/v1/deposits/recent?ethAddress=0xYourAddress"`,
    response: `{
  "txid": "…",
  "state": "pending",
  "amountGrains": "10000000000",
  "createdAt": 1781069000000
}
// or { "txid": null } when nothing is in flight`,
  },
  {
    method: "GET",
    path: "/v1/mints/{pearlTxid}",
    title: "Mint (deposit) status",
    description:
      "Lifecycle of a Pearl→Ethereum deposit by its Pearl txid. States pass through the relay's pipeline: pending → attested → submitted → minted, with queued (slow lane), under_review, cancelled, failed, stuck, and refund fields where applicable.",
    params: [
      { name: "pearlTxid", in: "path", description: "64-hex-char Pearl transaction id (0x prefix optional)" },
    ],
    curl: `curl ${API_BASE}/v1/mints/<pearl-txid>`,
    response: `{
  "txid": "…",
  "state": "minted",
  "amountGrains": "123000000",
  "recipient": "0x…",
  "mintTxHash": "0x…",
  "queuedAt": null,
  "readyAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "anomalyReason": null,
  "refundPrlTxId": null,
  "refundedAt": null
}`,
    notes: ["404 means the relay has never indexed the txid — deposits become visible after the watcher sees them on Pearl (≈1–2 minutes after broadcast)."],
  },
  {
    method: "GET",
    path: "/v1/burns/{ethTxHash}",
    title: "Burn (unlock) status",
    description:
      "Status of a WPRL burn and its native-PRL payout, by the Ethereum transaction hash of the burn.",
    params: [
      { name: "ethTxHash", in: "path", description: "0x-prefixed 64-hex-char Ethereum tx hash" },
    ],
    curl: `curl ${API_BASE}/v1/burns/0x<eth-tx-hash>`,
    response: `{
  "hash": "0x…",
  "state": "unlocked",
  "pearlTxId": "…",
  "anomalyReason": null
}`,
    notes: ["Unknown hashes return 200 with state: null (poll-friendly) — the watcher may simply not have indexed the burn yet."],
  },
  {
    method: "GET",
    path: "/v1/pearl-tx/{txid}",
    title: "Pearl transaction lookup",
    description:
      "Live confirmation count for any Pearl transaction, served by the bridge's federated Pearl RPC pool. Useful while waiting for a deposit to reach the confirmation threshold.",
    params: [
      { name: "txid", in: "path", description: "64-hex-char Pearl transaction id (0x prefix optional)" },
    ],
    curl: `curl ${API_BASE}/v1/pearl-tx/<pearl-txid>`,
    response: `{ "found": true, "confirmations": 6, "blockHeight": 512345 }
// or { "found": false } when the txid is unknown to the pool`,
  },
  {
    method: "GET",
    path: "/v1/deposit-address",
    title: "Deposit address derivation",
    description:
      "Derives the unique Pearl deposit address bound to an Ethereum wallet. PRL sent to this address bridges to the given wallet automatically — no OP_RETURN construction needed.",
    params: [
      { name: "ethAddress", in: "query", description: "0x-prefixed Ethereum address that will receive the WPRL" },
    ],
    curl: `curl "${API_BASE}/v1/deposit-address?ethAddress=0xYourAddress"`,
    response: `{
  "pearlAddress": "prl1p…",
  "ethAddress": "0xyouraddress"
}`,
    notes: ["Rate-limited per IP. Funds sent to a derived address are credited to the bound ETH wallet only — double-check the ethAddress you derive for."],
  },
];

function MethodBadge({ method }: { method: string }) {
  return (
    <span className="inline-block rounded bg-[#00e5d0]/10 text-[#00e5d0] border border-[#00e5d0]/30 px-2 py-0.5 text-xs font-bold tracking-wide">
      {method}
    </span>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-black/40 border border-white/10 rounded-lg p-4 text-xs leading-relaxed text-gray-300 overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}

export function Api() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <div className="space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight">
          API <span className="bg-gradient-to-r from-[#00e5d0] to-white bg-clip-text text-transparent">reference</span>
        </h1>
        <p className="text-gray-400 text-base leading-relaxed max-w-3xl">
          PearlBridge exposes a public, read-only REST API for integrators: bridge status, supply,
          volume, proof of reserves, and per-transaction lifecycle lookups. No authentication, no
          API key. CORS is open (<code className="text-gray-300">Access-Control-Allow-Origin: *</code>),
          so it works from browsers, servers, and curl alike.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3 text-sm text-gray-300">
        <div>
          <span className="text-gray-500">Base URL</span>{" "}
          <code className="text-[#00e5d0]">{API_BASE}</code>
        </div>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>
            <span className="text-gray-300">Amounts are grains:</span> 1 PRL = 10<sup>8</sup> grains,
            serialized as decimal strings to avoid float precision loss. WPRL has 8 decimals.
          </li>
          <li>
            <span className="text-gray-300">Versioning:</span> shapes under <code>/v1</code> only change
            additively. Breaking changes ship as <code>/v2</code>.
          </li>
          <li>
            <span className="text-gray-300">Rate limits:</span> enforced at the edge; sustained
            high-volume polling may be throttled. Status/supply/stats responses are cached ~30s
            server-side — polling faster than that buys nothing.
          </li>
          <li>
            <span className="text-gray-300">Discovery:</span> <code>GET /v1</code> returns a
            machine-readable index of all endpoints.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-[#00e5d0]/20 bg-[#00e5d0]/[0.03] p-5 space-y-5">
        <h2 className="text-xl font-bold tracking-tight text-gray-100">Integration flows</h2>
        <div className="grid sm:grid-cols-2 gap-6 text-sm">
          <div className="space-y-2">
            <h3 className="font-semibold text-[#00e5d0]">PRL → WPRL (deposit &amp; mint)</h3>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-400 leading-relaxed">
              <li><code>GET /v1/quote/mint</code> — fee, net WPRL, fast-vs-slow lane for the amount</li>
              <li><code>GET /v1/deposit-address</code> — the unique Pearl address bound to the recipient ETH wallet</li>
              <li>User sends PRL to that address — any wallet or exchange withdrawal, no OP_RETURN needed</li>
              <li>Track confirmations via <code>GET /v1/pearl-tx/{"{txid}"}</code>; if you never saw the txid (exchange withdrawal), poll <code>GET /v1/deposits/recent</code></li>
              <li>Poll <code>GET /v1/mints/{"{pearlTxid}"}</code> until <code>state: "minted"</code> — <code>mintTxHash</code> is the Ethereum tx</li>
            </ol>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-[#00e5d0]">WPRL → PRL (burn &amp; unlock)</h3>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-400 leading-relaxed">
              <li><code>GET /v1/validate-address</code> — reject payout-address typos before funds move</li>
              <li><code>GET /v1/quote/burn</code> — fee, net PRL, window fit, and the exact contract calls</li>
              <li>User submits the returned steps from their own wallet (approve only when allowance is short)</li>
              <li>Poll <code>GET /v1/burns/{"{ethTxHash}"}</code> until <code>state: "unlocked"</code> — <code>pearlTxId</code> is the Pearl payout</li>
            </ol>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          The API never holds keys and never signs: deposits are plain Pearl sends to a derived
          address, and burns are transactions the user signs in their own wallet. The machine-readable
          version of these flows ships in <code>GET /v1</code>.
        </p>
      </div>

      <div className="space-y-10">
        {ENDPOINTS.map((ep) => (
          <section key={ep.path} className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <MethodBadge method={ep.method} />
              <code className="text-base text-white font-semibold">{ep.path}</code>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-gray-100">{ep.title}</h2>
            <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">{ep.description}</p>
            {ep.params && (
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-gray-500 border-b border-white/10">
                    <th className="py-1 pr-4 font-medium">Parameter</th>
                    <th className="py-1 pr-4 font-medium">In</th>
                    <th className="py-1 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {ep.params.map((p) => (
                    <tr key={p.name} className="border-b border-white/5">
                      <td className="py-1.5 pr-4"><code className="text-[#00e5d0]">{p.name}</code></td>
                      <td className="py-1.5 pr-4 text-gray-500">{p.in}</td>
                      <td className="py-1.5 text-gray-400">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <CodeBlock>{ep.curl}</CodeBlock>
            <CodeBlock>{ep.response}</CodeBlock>
            {ep.notes?.map((n) => (
              <p key={n} className="text-xs text-gray-500 leading-relaxed">— {n}</p>
            ))}
          </section>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-gray-400 leading-relaxed">
        Building something on the bridge? The{" "}
        <Link to="/audit" className="text-[#00e5d0] hover:underline">audit reports</Link> cover the
        on-chain contracts. Found an issue? Use the bug-bounty link in the footer.
      </div>
    </div>
  );
}
