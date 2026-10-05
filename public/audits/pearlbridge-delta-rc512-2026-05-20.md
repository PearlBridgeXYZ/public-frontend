# PearlBridge RC5.12 Delta Audit

**Release:** RC5.12
**Date:** 2026-05-20
**Scope:** Relay anomaly alerting path + frontend display formatting.
**Solidity changes:** None.

---

## 1. Summary

RC5.12 is an operations release. The anomaly detector that has shipped
since RC5.6 already trips on (a) any single mint/burn larger than 0.5%
of the WPRL supply and (b) any hourly volume spike of more than 10x the
rolling weekly baseline. Until RC5.12, those trips were observable only
in metrics and structured logs. RC5.12 turns each trip into an
operator-facing alert with a paired read-only automated investigation.

There are no contract changes and no relay business-logic changes. The
detector's thresholds, denominators, and on-chain pause path are
identical to RC5.11. Only the notification side-channel is new.

---

## 2. What changed

### 2.1 Relay — operator alert sink

A new alerting module exposes two side-effects that fire on every
anomaly trip:

1. **Operator alert** to the private operator channel. The message is
   escaped, names the direction (mint/burn), the amount in whole PRL,
   the reason emitted by the detector, and the relevant tx identifier
   (Ethereum tx hash for burns; Pearl tx id for mints).
2. **Read-only automated investigation.** A read-only review process is
   started with the anomaly fields and public architecture pointers.
   It may not write any state or send any transactions — it reads
   logs, contract state, the public Pearl explorer and Etherscan, then
   posts a single verdict (LIKELY LEGITIMATE / SUSPICIOUS /
   INCONCLUSIVE) to the operator channel with its evidence and a
   recommendation. It is fire-and-forget, so the relay's hot path is
   never blocked on the investigation.

The on-chain pause path remains wired through `PAUSER_ROLE`, but with
VLayer providing centralized cancellation upstream of mint settlement
it is no longer the primary brake — the alert + manual review loop
is.

### 2.2 Relay — tx context plumbed into the detector

`anomalyCheck` now takes an optional `AnomalyTxContext` ({ ethTxHash?,
pearlTxId? }) so the alert message and the investigation can name
the specific transaction that tripped the detector. The mint path
passes `pearlTxId`; the burn path passes `ethTxHash`. No change to
detector logic; no change to false-positive rate.

### 2.3 Frontend — whole-PRL display

`BridgeStats` (TVL and Fast Lane Left tiles on the home page) now
floors the on-chain bigint values to whole PRL with thousands
separators. The "8 decimals of dust" rendering that crept in via the
default formatter is gone. The audit page's solvency card still shows
full precision so backing can be reconciled exactly.

---

## 3. Risk assessment

| Risk | Status |
| --- | --- |
| Investigation runs with excess privilege. | Mitigated. It runs read-only, has no access to the relay signing key and has no signer wired in. |
| Alert path adds a hot-path failure mode. | Mitigated. The alert and the investigation are both fire-and-forget — they catch their own errors, never throw back into the detector, and never await child processes. |
| Alert-channel outage silences operator visibility. | Pre-existing. Metrics + structured logs continue to record every trip; the relay's `/metrics` endpoint (Bearer-gated since RC5.11) is still the canonical record. |
| Investigation input leaks operator infrastructure. | Mitigated. It is given only the live-published architecture (contract addresses, public explorer URL, lock wallet) — nothing that isn't already on this audit page. |

---

## 4. What is unchanged

- All Solidity bytecode on mainnet (`WPRL` 0x07696Dca…, `BridgeController` 0xA6571B73…, `Timelock` 0xc07c5B10…).
- Anomaly detector thresholds: `MAX_SINGLE_MINT_BPS=50` (0.5% of supply), `HOURLY_SPIKE_MULTIPLIER=10`, `MIN_WEEKLY_BASELINE_GRAINS=1e12`.
- Mint quorum guard, signing-order fix, recovery prologue filter, `/metrics` Bearer auth — all carried forward from RC5.11.
- Solvency invariant (WPRL minted ≤ PRL custodied) and the per-address custody breakdown JSON.

---

## 5. Carried-over governance / ops items

The three items tracked since RC5.6 are still open and unchanged by
this release:

- **GOV-1:** `defaultAdminDelay()` is currently 0 on the live proxies. Timelock action #228 (changeDefaultAdminDelay to 2 days) is queued; on schedule with the existing 24h Timelock minDelay.
- **GOV-2:** Confirm Timelock `minDelay` should remain 1 day or step to 3 days.
- **OPS-1:** Top up the `PAUSER_ROLE` wallet (`0x10AE51…`) with ETH so the on-chain pause remains an executable fallback.

These are out of scope for RC5.12.

---

## 6. Verdict

Mainnet operation appropriate. The detector's behavior is unchanged
from RC5.11; the new code is strictly additive on the notification
path. Operators now get a verifiable, real-time alert plus an
automated read-only triage for every detector trip, which is the
correct posture for a bridge ramping from a zero baseline where manual
review is the right brake during early volume growth.
