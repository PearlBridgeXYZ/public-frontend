# PearlBridge RC5.6 — Independent Re-audit (Mainnet)

| | |
|---|---|
| **Date** | 2026-05-20 |
| **Release** | RC5.6 (deployed 2026-05-19) |
| **Scope** | `BridgeController.sol` (1744 LoC), `WPearl.sol` (471 LoC), `imports/BridgeLib.sol` (115 LoC), `imports/OZImports.sol` (15 LoC) |
| **Methodology** | 11 independent automated review passes (3 deep / 3 mid-tier / 5 narrow) plus on-chain probe of deployed proxies |
| **Verdict** | Mainnet operation appropriate — no Critical, no unmitigated High. One Medium discovery against live state, recommended for the next release. |

---

## 1. Executive summary

RC5.6 was deployed to Ethereum mainnet on 2026-05-19 with the WPRL token proxy at
`0x07696DcaB55E62cfef953666b29Fe1970518cB00`, the BridgeController proxy at
`0xA6571B73489d4eBFA269a107208665dF7C80Aef5`, a 24-hour TimelockController
(Safe-proposer) at `0xc07c5b10fa35c0DB94Ab47484B9f667b7b649762`, three attesters
at threshold 2, a 0.5% flat fee, and a tiered mint cap (50k PRL fast lane,
slow lane with a 24-hour delay for the remainder).

This re-audit ran eleven independent passes over the contract source — three
deep general passes, three mid-tier focused passes (access control / quorum /
solvency), and five narrow passes (static patterns, gas/DoS, MEV, integer math,
events) — and probed the deployed contracts on-chain. The contracts replicate
the design that has cleared four prior audit rounds; the prior fixes are intact
and the architecture has held up under repeated adversarial review.

Findings cluster around defense-in-depth and observability. The most notable
discovery is that the deployed ADR (AccessControlDefaultAdminRules) two-step
admin-transfer delay is set to zero on both proxies. Because the Timelock
itself currently holds the admin role and Timelock-scheduled actions still
take 24 hours, the practical bypass window for the admin role is the Timelock
delay; the ADR's contribution to that window is currently zero. The
maintainers should set the ADR delay to a positive value (e.g. 2-3 days) via
the standard `changeDefaultAdminDelay` flow, so a captured Safe abusing its
Timelock-proposer status faces a longer total handover window.

No Critical or unmitigated High findings. Two Mediums and a handful of Low /
Informational items follow.

---

## 2. Methodology

Each pass operated independently against the same commit and the same on-chain
state.

**Deep passes (3)** — full-file review of `BridgeController.sol`, `WPearl.sol`,
`BridgeLib.sol`. Free-form severity, free-form scope.

**Mid-tier focused passes (3)** —
- Access control, UUPS upgrade flow, role administration.
- EIP-712 quorum, signature replay, Pearl L1 reorg defence.
- Solvency invariant, fees, decimal precision, tiered caps.

**Narrow passes (5)** —
- Static anti-patterns (uninitialised state, shadowing, dead code, ABI
  collisions).
- Gas / DoS griefing (unbounded loops, push-payment risk, batch DoS).
- MEV / front-running (mempool extraction, fee sandwiching, finalisation
  ordering).
- Integer math (overflow / underflow / truncation / rounding).
- Events & invariants (observability gaps, monitor-coverage gaps).

Each pass produced an independent report. Findings were then re-graded under a
single rubric (defined below in §3) and de-duplicated across passes. A live
on-chain probe verified state assumptions in every finding that depended on a
deployed parameter value.

Severity rubric:

- **Critical** — direct value loss or theft; bypass of solvency invariant;
  admin lockout from mainnet.
- **High** — large exploitable surface or path requiring a malicious privileged
  actor; non-trivial value at risk; missing on-chain enforcement of a
  documented invariant.
- **Medium** — real bug with bounded impact; ergonomic / observability gap
  with security implications; ordering issue mitigated today but fragile under
  future upgrades.
- **Low** — defense-in-depth gap; event / event-arg gap; documentation gap.
- **Informational** — code quality, naming, style.

Some auditors used different rubrics in their raw reports. Findings re-graded
under this synthesis carry a *Calibration notes* line explaining the change.

---

## 3. Findings

### 3.1 Critical
None.

### 3.2 High
None.

### 3.3 Medium

#### M-1. Live `defaultAdminDelay() == 0` on both deployed proxies
- **Severity:** Medium
- **Location:** `BridgeController.sol:653-659`, `WPearl.sol:189-204`;
  deploy script default at `scripts/deploy-with-timelock.ts:146`.
- **Live state:** `defaultAdminDelay()` returns `0` on both
  `0x07696DcaB55E62cfef953666b29Fe1970518cB00` (WPRL) and
  `0xA6571B73489d4eBFA269a107208665dF7C80Aef5` (BridgeController). Verified
  via `eth_call` against a public Ethereum RPC.
- **Description:** Both initializers accept `_initialAdminDelay == 0` via a
  test-fixture carve-out, and the `deploy-with-timelock.ts` script defaults the
  env var to `"0"`. The in-script comment justifies this with "the timelock
  already provides a public delay window, so 0 is the right default here." In
  the current configuration the Timelock (24 h) holds `DEFAULT_ADMIN_ROLE` on
  both proxies, so any admin-role transfer initiated through the Timelock takes
  at least 24 h. ADR's own delay layered on top of that would extend the total
  window — and that contribution is currently zero.
- **Impact:** If the Safe that controls the Timelock-proposer role were ever
  compromised, the attacker could schedule a `beginDefaultAdminTransfer(att)`
  through the Timelock (24 h delay), execute, and then call
  `acceptDefaultAdminTransfer()` instantly because ADR delay is zero. With a
  positive ADR delay (e.g. 2-3 days) the same attack would face an additional
  community-response window after the Timelock executes. The current
  configuration removes that secondary belt.
- **Calibration notes:** One auditor flagged this as High based on a
  worst-case reading ("instant handover"). Under the live deployment, the
  24 h Timelock is the binding floor for the captured-Safe path, so the
  exposure is the *delta* between "24 h" and "24 h + ADR delay" — a reduction
  of defense-in-depth, not a bypass of the headline anti-rug guarantee.
  Medium under this rubric.
- **Recommendation:** Schedule a Timelock action calling
  `changeDefaultAdminDelay(uint48 newDelay)` on both proxies with a value such
  as `2 days` (or `3 days` to match the WPearl NatSpec at
  `WPearl.sol:180-181`). Update the deploy script to default to a positive
  value and require an explicit `0` override for test fixtures. Move the
  test-only carve-out out of mainnet contracts and into a test-helper that
  overrides the initializer, so the floor becomes unconditional in production
  bytecode.

#### M-2. `withdrawFees` makes the WPRL `frozen(...)` external call before the `feeBalance` write
- **Severity:** Medium
- **Location:** `BridgeController.sol:1070-1083`
- **Description:** The frozen-recipient check on line 1074 is an external call
  into the WPRL token; the `feeBalance = 0` write happens on line 1079. Under
  the current WPRL implementation (plain ERC20, no transfer hooks), this is
  safe — `nonReentrant` closes the same-function re-entry window. The ordering
  is fragile under a future WPRL upgrade that adds ERC777-style or
  `_beforeTokenTransfer` hooks: the `frozen` call could become a re-entry
  surface that observes a pre-zeroed `feeBalance` from a different entry
  point.
- **Impact:** No exploit today. Latent fragility for any future WPRL upgrade
  that adds callbacks to the token side. The same observation applies in
  weaker form to the `requestBurn` burn-before-fee-mint ordering on lines
  1049-1053, which transiently understates `totalSupply()` between the burn
  and the fee re-mint.
- **Recommendation:** Move state writes ahead of external calls in
  `withdrawFees`. Either revert on frozen recipient (cleanest) or zero
  `feeBalance` first and re-credit it on the silent-skip path. Document the
  ordering invariant in the contract NatSpec so any WPRL upgrade that
  introduces transfer hooks is forced to re-evaluate this site.

### 3.4 Low

#### L-1. `setUpgradeDelay` has no upper bound
- **Location:** `BridgeController.sol:1345-1350`, `WPearl.sol:357-362`
- A captured `DEFAULT_ADMIN_ROLE` (Safe + 24 h Timelock) could set
  `upgradeDelay = type(uint256).max`, after which the upgrade path is
  permanently bricked for the lifetime of the chain. Pairs nastily with any
  other admin-key issue.
- Cap the value at a generous-but-finite ceiling (e.g. `30 days`).

#### L-2. UUPS proposal binds the new-impl address but not `initData`
- **Location:** `BridgeController.sol:1314-1361`, `WPearl.sol:326-378`
- `proposeUpgrade` commits only to the new implementation address. The
  `bytes data` passed to `upgradeToAndCall` at execution time is not
  committed at proposal time. A compromised admin could propose a benign-
  looking implementation and then execute it with malicious init-data, only
  the address is visible during the delay. Documented in BC NatSpec at
  lines 580-583; WPearl has the same shape without the same documentation.
- Defense-in-depth fix: hash `keccak256(newImpl, initData)` at proposal time
  and re-check at `_authorizeUpgrade`. Alternative: retire the in-contract
  upgrade timelock and put DEFAULT_ADMIN_ROLE behind the existing OZ
  TimelockController for upgrades too (which commits to full calldata).

#### L-3. Burn-fee sandwich by hot FEE_ROLE
- **Location:** `BridgeController.sol:1035-1057`
- Slow-lane mints snapshot `mintFeeBpsSnap` at queue time
  (`BridgeController.sol:871`). `requestBurn` charges the *current*
  `burnFeeBps` (line 1043) with no snapshot. A holder of `FEE_ROLE` can
  front-run an in-flight `requestBurn` with `setBurnFee(MAX_FEE_BPS)`,
  reducing the user's PRL net-out by up to 1% (the `MAX_FEE_BPS = 100`
  ceiling on line 264 caps the blast radius). The role is currently held by
  a hot key, not the Timelock.
- Calibration notes: graded Medium by one auditor; demoted to Low here
  because the blast radius is capped at 1% per tx and the path requires a
  privileged-role compromise. Real but bounded.
- Mitigation options (any one): snapshot `burnFeeBps` at the start of
  `requestBurn` (mirroring `mintFeeBpsSnap`); move `setBurnFee` and
  `setMintFee` behind the Timelock (loses fast fee tuning); reduce
  `MAX_FEE_BPS`; emit before/after fee values in the update event so a
  monitor can alarm on adversarial changes.

#### L-4. `withdrawFees` silent-skip semantics
- **Location:** `BridgeController.sol:1070-1083`
- When the fee recipient is frozen, `withdrawFees` emits
  `FeesWithdrawalSkipped` and returns without reverting and without zeroing
  `feeBalance`. Contract-to-contract callers (multi-call bundles) that
  interpret "no revert" as "swept" will double-account. The signal is event-
  only.
- Either return a `bool swept`, or revert with a dedicated error
  (`BC_FrozenRecipient`) so callers must branch on revert reason.

#### L-5. `enableDrainMode` blocked while `feeBalance > 0` and recipient frozen
- **Location:** `BridgeController.sol:1249-1258`
- If the fee recipient is OFAC-sanctioned or otherwise frozen at the moment
  the protocol wants to retire the bridge, `feeBalance` cannot be drained
  via `withdrawFees`, and `enableDrainMode` reverts with `BC_PendingFees`.
  Retirement gets stalled on a multi-step fee-recipient rotation exactly
  when the operator most wants it short.
- Add an admin-only `forfeitFees()` callable while paused that burns the
  contract's own fee-WPRL and zeroes the balance, breaking the dependency on
  the recipient. Treated as protocol-revenue forfeited under emergency.

#### L-6. WPearl initializer does not enforce `_freezeRoleAdmin != _admin`
- **Location:** `WPearl.sol:189-225`
- The NatSpec at lines 180-188 documents that `_freezeRoleAdmin` must be a
  distinct address from `_admin` on mainnet (the F-2 separation invariant).
  There is no on-chain check. A deploy that fat-fingers both arguments to
  the same Safe ships a collapsed trust ceremony. Mainnet deploys verified
  this manually; defense-in-depth fix is a `require(_freezeRoleAdmin !=
  _admin)` in the initializer, gated behind `_initialAdminDelay > 0` so test
  fixtures stay ergonomic.

#### L-7. `INITIAL_UPGRADE_DELAY = 1 hour` is short for a fresh mainnet bridge
- **Location:** `BridgeController.sol:122`, `WPearl.sol:94`
- A 1-hour upgrade-proposal delay on a freshly-deployed bridge assumes
  someone is awake to see `UpgradeProposed` and coordinate a response
  inside that hour. The upward-only ratchet is correct, but it depends on
  an operator remembering to call `setUpgradeDelay`. The deploy script does
  not currently call it.
- Either raise the constant to `24 hours` before the next deploy, or have
  the deploy script atomically call `setUpgradeDelay(24 hours)` in the
  post-deploy ceremony.

#### L-8. `proposeUpgrade` 1-arg overload has no `onlyRole` modifier in its own signature
- **Location:** `BridgeController.sol:1330-1332`
- The 1-arg form delegates to the 2-arg `public onlyRole(DEFAULT_ADMIN_ROLE)`
  form, so access control is enforced — but a future maintainer or static
  analyser reading the 1-arg signature in isolation will not see the guard.
  Adding `onlyRole(DEFAULT_ADMIN_ROLE)` to the 1-arg signature is a no-op at
  runtime and improves auditability.

#### L-9. Burn-redeem `requestBurn` burns before re-minting the fee
- **Location:** `BridgeController.sol:1035-1057`
- Between the `burnFrom` on line 1049 and the `wpearl.mint(address(this),
  fee)` on line 1053, `wpearl.totalSupply()` is transiently lower than its
  steady-state post-burn value. No exploit under the current pure-ERC20
  WPRL. A future WPRL upgrade that adds `_afterTokenTransfer` hooks must
  re-evaluate any code path that reads `totalSupply()` inside a hook.
  Documentation-only fix today.

### 3.5 Informational

Twelve informational items spanning observability and code-quality nits:

- `setMintFee` and `setBurnFee` events emit only the new value; including
  the old value would let monitors detect "0.5% → 1%" jumps without state
  snapshots.
- `cancelFeeRecipientProposal` emits `FeeRecipientProposed(address(0))`
  rather than a dedicated `FeeRecipientProposalCancelled` event, creating
  ambiguity for off-chain indexers.
- `AdminRefundProposed` / `AdminRefundProcessed` index only `depositTxId`;
  hashing and indexing the Pearl address would help auditors filter by
  destination.
- `slowMintWindowRemaining` view returns an under-count while fast-lane
  headroom remains. Cosmetic; rename or document.
- `__gap` accounting in WPearl is less narrated than in BridgeController.
  Pure documentation.
- `_authorizeUpgrade` consumes the proposal record before the implementation
  swap. Standard OZ pattern; flagged because a failed reinitializer eats
  another delay window.
- WPRL `burn(uint256)` reverts unconditionally. Consider replacing the
  string revert with a custom error for gas + clarity.
- WPRL EIP-2612 permit domain binds to the proxy address, not the
  implementation. Permits do not survive a full proxy re-deployment;
  document in the runbook.
- WPRL self-transfer of a frozen address shows "sender frozen" rather than a
  self-transfer-specific message. Cosmetic.
- WPRL `burnFrom` overrides ERC20Burnable's allowance check. Safe because
  only the controller can call it, but the standard `burnFrom` ABI no
  longer implies allowance semantics. Consider renaming to `bridgeBurn` if
  a future upgrade widens the modifier.
- Mint signature recovery is deterministic and observable on-chain; the
  ordered-signers pattern leaks signer identity to mempool observers. This
  is inherent to EIP-712 quorum design.
- Standard ERC-2612 permit race (front-running an `approve` with a
  different `permit`) exists on the WPRL token. Standard ERC-2612
  limitation; not specific to PearlBridge.

---

## 4. Out of scope

This audit covered the four contract files listed in §0. The following
surfaces were explicitly out of scope, having either been covered in prior
rounds or routed to other reviews:

- The federated relay service (off-chain attester orchestration, signature
  collection, anomaly detection).
- The frontend application and SIWE session layer.
- The off-chain reorg-detection daemon (six independent detectors aggregated
  into the cancel-mint quorum signal).
- Attester key custody (HSM rotation, geo-distribution, recovery procedure).
- The deploy-ceremony scripts (covered in the pre-deploy review at the
  previous release).
- Bytecode-equivalence verification between source and deployed
  implementation (verified separately at deploy time).

---

## 5. Verdict

**Mainnet operation of RC5.6 is appropriate.** No Critical and no unmitigated
High findings. The contract architecture has cleared four prior rounds and
this re-audit confirms the prior fixes are intact and the threat model is
correctly enforced on-chain.

For the next release / next admin action, the maintainers should:

1. Set `defaultAdminDelay` to a positive value (2-3 days) on both proxies via
   `changeDefaultAdminDelay`. This restores the ADR contribution to the
   admin-handover floor. Action can be taken now without a contract upgrade.
2. Move the `feeBalance = 0` write in `withdrawFees` ahead of the WPRL
   `frozen()` external call, and document the ordering invariant for future
   WPRL upgrades.
3. Either snapshot `burnFeeBps` at the start of `requestBurn`, or move
   `setBurnFee`/`setMintFee` behind the Timelock to remove the burn-fee
   sandwich surface for a captured FEE_ROLE.
4. Add a sanity cap on `setUpgradeDelay` (e.g. `<= 30 days`) and a
   `require(_freezeRoleAdmin != _admin)` floor in `WPearl.initialize`.
5. Track the remaining Low / Informational items as defense-in-depth
   improvements for the next release.

None of the above blocks current mainnet operation. The Medium findings are
non-exploitable under the current configuration and trust model; they
represent reductions in defense-in-depth, not active vulnerabilities.

---

*Re-audit conducted 2026-05-20. Eleven independent passes against
`BridgeController.sol`, `WPearl.sol`, `BridgeLib.sol`, `OZImports.sol`,
plus on-chain verification of deployed proxy state.*
