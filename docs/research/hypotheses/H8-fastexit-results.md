# H8 results: faster exit (10-day low). **FAIL (3 of 6 gates)**, and it hardly ever triggers

Pre-registration: `H8-fastexit-preregistration.md` (commit 9bcff33, written before the run). Script: `scripts/paper/h8-fastexit.ts`. Raw output: `H8-fastexit.json`. Run once on 2026-11-23. The look-ahead guard passed.

## Results (costs 0.1% + 0.02% per side)

| Cell | Faster exit: total / Sharpe / max DD | E1 | Early exits in 2 years | Coin's move over the 10 days after an exit | At stress (H8 / E1) | Neighbours |
|---|---|---|---|---|---|---|
| 5 coins 2022–24 | +80.1% / 1.58 / 14.8% | +79.7% / 1.58 / 14.8% | 1 | −20.5% | +62.3% / +62.0% | 80.1, 79.7, 80.1, 80.1 |
| 5 coins 2024–26 | +25.2% / 0.67 / 18.0% | +25.2% / 0.67 / 18.0% | 0 | – | +14.2% / +14.2% | 24.1, 25.2, 25.2, 25.2 |
| 8 coins 2022–24 | +35.5% / 0.89 / 16.8% | +34.6% / 0.87 / 16.8% | 3 | −11.8% | +23.8% / +22.9% | 37.1, 34.6, 35.5, 35.5 |
| 8 coins 2024–26 | +2.5% / 0.16 / 22.9% | +5.4% / 0.23 / 21.9% | 6 | **+3.6%** | −5.2% / −2.5% | 2.2, 3.1, 2.8, 3.3 |

| Gate | Result |
|---|---|
| Positive in all cells | pass |
| Sharpe ≥ 0.5 in all cells | **fail** (0.16) |
| Positive at stress | **fail** (−5.2%) |
| Max DD ≤ 25% | pass |
| Neighbours ≥ 80% positive | pass (16/16) |
| Better than E1 on return per DD in ≥ 3 of 4 | **fail** (2/4) |

## Why
- **The rule almost never fires.** It triggered 0–6 times per cell in two years. A coin that closes below its 10-day low has usually already lost its 30-day up-trend, or the BTC gate has already closed. E1 is out before the extra rule matters, so in three cells the result is within ±1 point of E1.
- Where it did fire:
  - In 2022–24 it worked: the coin fell another 12–20% over the next 10 days.
  - In choppy 2024–26 it hurt: the coin rose 3.6% after the exit. The rule sold the dip and missed the bounce, which cost 2.9 points.
- This confirms the pattern across tests: E1's slow exits are not a weakness to fix. Speeding them up adds whipsaw in choppy markets and adds nothing in trending ones, because E1 already exits in time.

## What this means
Rejected. E1's exits stay as they are.
