// Liability disclosure text. PearlBridge first-party language — we attempted
// to copy TaoBridge's verbatim but their RainbowKit disclaimer prop is the
// framework default (void 0), and /terms /tos /legal /disclaimer /risk all
// return 404. Nothing to mirror.
//
// Updating this text triggers a version bump — users re-accept once.
//
// Counsel review: deferred per G 2026-05-14 ("copy TaoBridge, skip our own
// counsel"). Since TaoBridge has nothing to copy, this is our boilerplate.
//
// Structure (RC2.6, audit M-4): rendered as JSX by `DisclaimerCopy` so React
// auto-escapes any future interpolation. The previous template-literal +
// dangerouslySetInnerHTML pattern was the audit footgun this replaces.

export const DISCLAIMER_VERSION = "4";

export interface DisclaimerClause {
  title: string;
  body: string;
}

export const DISCLAIMER_INTRO =
  "PearlBridge is an experimental, permissionless interface for moving value between the Pearl network and Ethereum. By connecting a wallet and using this service you represent and agree as follows:";

export const DISCLAIMER_CLAUSES: DisclaimerClause[] = [
  {
    title: "No warranty.",
    body: 'The interface and underlying smart contracts are provided strictly "as is" and "as available," without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, non-infringement, security, or freedom from defect.',
  },
  {
    title: "Sophisticated user.",
    body: "You are sufficiently familiar with custodial and self-custodial digital-asset systems, transaction finality, gas mechanics, signing semantics, and the operational risks of cross-chain bridges to evaluate this service. You are not relying on PearlBridge contributors for financial, legal, tax, or technical advice.",
  },
  {
    title: "Risk of loss.",
    body: "Digital assets are volatile and irrevocable. Sending an unsupported asset, sending to the wrong network, sending to a deposit address that is not the one issued to your connected wallet, or signing a malformed payload may result in PERMANENT AND TOTAL LOSS. Once a transaction is broadcast it cannot be reversed by us, by any validator, or by any court order.",
  },
  {
    title: "No fiduciary relationship.",
    body: "PearlBridge contributors are not your fiduciary, agent, broker, investment adviser, or counterparty. We do not custody your funds; we operate an interface and attestation set that you elect to use.",
  },
  {
    title: "Sanctions & eligibility.",
    body: "You represent that you are not (i) located in, ordinarily resident in, or incorporated under the laws of a jurisdiction subject to comprehensive U.S., EU, or U.K. sanctions; (ii) an individual or entity named on any sanctions or denied-party list maintained by OFAC, HM Treasury, the EU, or the United Nations; or (iii) accessing the service on behalf of any such person. PearlBridge may freeze, block, or refuse to relay transactions to or from addresses associated with sanctioned actors, theft, fraud, or other unlawful activity.",
  },
  {
    title: "No solicitation.",
    body: "Nothing on this site constitutes an offer to sell, a solicitation to buy, or a recommendation regarding any security, derivative, commodity, or digital asset. PRL and WPRL are utility assets of the Pearl network; we make no representation as to their legal classification in any jurisdiction.",
  },
  {
    title: "Tax responsibility.",
    body: "You are solely responsible for determining the tax treatment of any transaction you initiate, retaining records, and reporting and paying tax to the relevant authority.",
  },
  {
    title: "Third-party software.",
    body: "Wallets, RPC providers, light clients, block explorers, and on-chain protocols referenced by this interface are operated by independent third parties. We do not endorse them, are not responsible for their behavior, and accept no liability for outages, exploits, malware, phishing, or fraud originating from them.",
  },
  {
    title: "Data processing & privacy (GDPR).",
    body: "By using the service you consent to PearlBridge processing the following personal data under Art. 6(1)(a) and 6(1)(b) GDPR for the limited purposes of operating the bridge: (i) the public Ethereum and Pearl addresses you bridge between (cryptographic identifiers, recorded immutably on the respective public blockchains and indexed by the relay for transaction lookup), (ii) your IP address, hashed (SHA-256) for rate-limiting and abuse mitigation on relay endpoints, (iii) a strictly-necessary cookie storing your acceptance of this disclosure (no analytics, no advertising, no third-party tracking cookies), and (iv) any optional contact information you voluntarily submit through the bug-bounty form. We do not sell personal data, share it with advertisers, or use it for profiling or automated decision-making with legal effects. You retain the rights of access, rectification, erasure, restriction, portability, and objection under Arts. 15–22 GDPR — exercise them by emailing developers@pearlbridge.xyz; note that on-chain data is technically irreversible by anyone, including us. Acceptance of this clause is freely given and may be withdrawn at any time by clearing site data and discontinuing use.",
  },
  {
    title: "Bridge operator discretion.",
    body: "Attesters may, at their sole discretion and without prior notice, delay, reorder, batch, partially fulfill, or refuse to attest any transaction in order to comply with applicable law, to mitigate ongoing security incidents, to honor a daily-window rate limit, or to enforce a freeze on an address. Successful submission of a deposit or burn does not guarantee mint or unlock.",
  },
  {
    title: "Emergency exit.",
    body: "Contract administrators may invoke a one-way emergency-exit function that disables further mints. After invocation, the contract cannot be unpaused; users with outstanding WPRL retain the right to redeem to PRL only to the extent the on-chain logic and Pearl-side liquidity permit at that time. You acknowledge that emergency exit may be invoked at any time and that the post-exit experience may be materially worse than normal operation.",
  },
  {
    title: "Limitation of liability.",
    body: "To the maximum extent permitted by law, in no event shall PearlBridge contributors, affiliates, attesters, relayers, infrastructure providers, employees, or agents be liable to you for any indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost revenue, lost data, business interruption, or substitute-asset costs, even if advised of the possibility of such damages. In any event, aggregate cumulative liability for any and all claims arising out of or relating to the service shall not exceed one hundred U.S. dollars (USD 100).",
  },
  {
    title: "Indemnification.",
    body: "You agree to defend, indemnify, and hold harmless PearlBridge contributors and affiliates from and against any and all claims, damages, losses, and expenses (including reasonable attorneys' fees) arising from your use of the service, your violation of these terms, or your violation of any law or third-party right.",
  },
  {
    title: "Governing law & dispute resolution.",
    body: "These terms are governed by the laws of a jurisdiction to be elected by the contributors at the time of dispute, without regard to conflict-of-laws principles. Any dispute shall be finally resolved by binding individual arbitration administered under the JAMS Streamlined Arbitration Rules; you waive any right to a jury trial and any right to participate in a class action.",
  },
  {
    title: "Severability & assignment.",
    body: "If any provision is found unenforceable, the remainder remains in effect. You may not assign these terms; we may assign to a successor entity at our discretion.",
  },
  {
    title: "Acknowledgment.",
    body: "You acknowledge that you have read, understood, and agreed to be bound by these terms, and that you accept all risk of loss associated with the use of PearlBridge.",
  },
];

// Acceptance storage. Browser-scoped via cookie so the full-page legal
// disclaimer is shown once per browser on first load and never again until
// the version bumps or the user clears site data. Cookie (not localStorage)
// so it survives across subdomains and is visible to server logs if we
// ever need to prove a user saw it before any wallet action.

const COOKIE_NAME = "pearlbridge_legal_accepted";
const COOKIE_MAX_AGE_SECS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSecs: number): void {
  if (typeof document === "undefined") return;
  // Secure flag explicitly set on https origins (audit I-3: browsers do NOT
  // auto-add Secure when omitted, despite the previous comment).
  const isSecure = typeof location !== "undefined" && location.protocol === "https:";
  const secureFlag = isSecure ? "; Secure" : "";
  document.cookie =
    name + "=" + encodeURIComponent(value) +
    "; path=/; max-age=" + maxAgeSecs +
    "; SameSite=Lax" + secureFlag;
}

export function hasAcceptedDisclaimer(): boolean {
  return readCookie(COOKIE_NAME) === DISCLAIMER_VERSION;
}

export function markDisclaimerAccepted(): void {
  writeCookie(COOKIE_NAME, DISCLAIMER_VERSION, COOKIE_MAX_AGE_SECS);
}
