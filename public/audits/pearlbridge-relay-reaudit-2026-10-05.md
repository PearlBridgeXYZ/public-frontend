# PearlBridge Relay Re-Audit and Fix Verification — October 2026

**Releases:** relay v1.8.33 (fix set), v1.8.34 (on-chain payout proof), v1.8.35 (reserve reporting) and v1.8.36 (public-endpoint limits); website RC5.57
**Dates:** re-audit 2026-10-04; fixes live 2026-10-05
**Type:** internal review by the PearlBridge team using independent automated (AI) reviewers. This is not an external audit.
**Contract code:** unchanged. The contracts on Ethereum are byte-identical to the RC5 code reviewed in May 2026, and none has been upgraded since deployment.

*Key: the relay is the bridge server that watches both chains. "PRL → WPRL" is a deposit; "WPRL → PRL" is a withdrawal.*

---

## 1. Summary

In early October we re-reviewed the bridge server ("relay") and the public website, and re-checked that the deployed contract code and WPRL supply still match what we published in May (last report: RC5.21).

- **Contracts:** code unchanged since May. Total WPRL supply matches every mint and burn recorded on Ethereum exactly, so no WPRL has been created outside the bridge's normal process.
- **Relay:** the review found several issues in the bridge server. The most serious could have paid a withdrawal twice, or let faulty data from a single source lead to an incorrect mint. **Every finding listed below is fixed, tested and verified, and the fixes are live.**
- **Website:** the classic site showed the WPRL → PRL redemption without its 0.5% fee. The fee is now shown on both sites.

Process: the initial review was five independent automated review passes over four areas (relay value handling, reviewed twice; relay Pearl-chain handling; public website and API; contract code and supply). The fixes then went through eight verification rounds: three reviewers from two AI model families in rounds 1–5, and two in the final three focused checks. Release followed only once every reviewer in the final round returned "ship". The relay releases passed the full automated test suite (more than 1,400 tests, including end-to-end bridge round trips on a local test chain) before deployment, and a live deposit-and-withdrawal round trip through the new website was verified on mainnet afterwards.

---

## 2. Findings and fixes

Severities are as assigned in the re-audit; where reviewers differed, both are shown. This report lists every Critical and High finding in code running in production, and the Medium findings fixed in these releases. Descriptions stay at the level of what could go wrong and how it is now prevented.

| # | Area | Severity | Issue | Status |
|---|------|----------|-------|--------|
| 1 | Withdrawals | High | After an interruption at the wrong moment, the relay could rebuild a payout without first confirming whether the original had already been sent, risking a double payout. | **Fixed.** Every payout's transaction is recorded before it is broadcast; recovery only ever re-sends or adopts that exact transaction and never builds a second one. |
| 2 | Deposits | Critical (one reviewer), High (another) | When deciding to mint, the relay could rely on a single source's view of the Pearl chain, and its cross-check did not confirm the deposit amount. | **Fixed.** A mint now requires several independent sources to agree on the deposit, including its amount and recipient; any disagreement stops the mint. |
| 3 | Alternate withdrawal path | High | Two withdrawals could be matched to a single payout, so a user could go unpaid; stalled payouts were not retried. | **Fixed.** Each payout belongs to exactly one withdrawal; the burn is re-proven on Ethereum before payment; stalled payouts are recovered or escalated. |
| 4 | Deposits | High | A deposit could stall without an alert if the relay stopped at one particular step before submitting the mint. | **Fixed.** That exit now returns the deposit to the queue, and stalled items alert the operators. |
| 5 | Alternate withdrawal path | Medium | Payouts proceeded after too few Ethereum confirmations. | **Fixed.** The full confirmation depth is required before payment. |
| 6 | Bug-report form | Medium | The public bug-report form could be abused to slow the relay. | **Fixed.** Per-user limits, size caps and input validation. |
| 7 | Classic website | Medium | The redemption preview showed no fee and over-stated the amount received by 0.5%. | **Fixed.** The fee and the net amount are shown before signing. |
| 8 | Internal operations tooling | High (latent: the component was off) | An internal diagnostic component would have run with more access than it needs. | **Fixed.** It remains switched off and cannot be started without an explicit operator override. |
| 9 | Withdrawals | Medium (one reviewer rated a related case High) | A burn caught in a brief Ethereum chain reorganisation could stay marked as reorganised even after it was mined again, leaving that withdrawal unpaid. | **Fixed.** A re-mined burn returns to the queue only after the relay re-confirms on Ethereum that the burn succeeded; reorganisation handling never overwrites a payout in progress. |
| 10 | Deposit-address registration | Medium | Anyone could register unlimited deposit addresses, each watched permanently, slowing deposit detection and reserve reporting for everyone. | **Fixed.** New registrations are limited per visitor and per hour, with a higher allowance for visitors who sign in with the wallet being registered. |

Lower-severity items raised during the verification rounds were fixed in the same releases. Code that is not deployed on mainnet is outside this report and stays switched off.

---

## 3. New since the re-audit

### 3.1 On-chain proof for every withdrawal payout (relay v1.8.34)

Every PRL payout now carries the Ethereum burn transaction it settles, written into the Pearl transaction itself. Anyone can check on the Pearl chain which burn a payout pays, and two payouts of the same amount to the same address can always be told apart. Reviewed by three independent automated reviewers; live since 2026-10-05.

### 3.2 Reserve reporting accuracy (relay v1.8.35)

The public reserves figure could briefly show the bridge holding less PRL than it does when funds moved between bridge addresses during a scan. The scan now accounts for such movements, so it never over-states reserves, and any temporary under-statement clears on the next scan. Reviewed over three rounds by an independent automated reviewer; live since 2026-10-05. A follow-up release (v1.8.36) made the full reserves scan roughly four times faster.

### 3.3 Website (RC5.57)

The new interface passed the full test suite, an end-to-end round trip and an independent automated review before release.

---

## 4. Conclusion

All relay and website findings listed in this report are fixed and verified, and the fixes are live. The contract code is unchanged from the May reviews.
