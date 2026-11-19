# H5 results: 4h breakout trail+gate as a 20% sleeve on the trend core. **FAIL (4 of 6 gates)**

Pre-registration: `H5-sleeve-preregistration.md` (commit 2aa3175, written before the run). Script: `scripts/paper/h5-sleeve.ts`. Raw output: `H5-sleeve.json`. Run once on 2026-11-19. The look-ahead guard passed.

## Results (costs 0.1% + 0.02% per side)

| Cell | Core 80% + sleeve 20%: total / Sharpe / max DD / CAGR÷DD | E1 alone | Sleeve alone: total / Sharpe / trades / correlation with core | Combined at stress | Neighbours |
|---|---|---|---|---|---|
| 5 coins 2022-12 → 2024-11 | +61.9% / 1.57 / 12.1% / 2.35 | +79.7% / 1.58 / 14.8% / 2.40 | +3.6% / 0.69 / 216 / 0.51 | +47.3% | 70.7, 53.5, 62.5, 61.7 |
| 5 coins 2024-11 → 2026-11 | +21.3% / 0.68 / 14.8% / 0.68 | +25.2% / 0.67 / 18.0% / 0.66 | +4.1% / 0.76 / 179 / 0.61 | +12.2% | 23.3, 19.3, 20.5, 20.9 |
| 8 coins 2022-12 → 2024-11 | +28.0% / 0.87 / 13.3% / 1.03 | +34.6% / 0.87 / 16.8% / 0.99 | +1.6% / 0.39 / 296 / 0.37 | +19.1% | 31.3, 24.7, 28.1, 27.7 |
| 8 coins 2024-11 → 2026-11 | +4.9% / 0.23 / 18.4% / 0.13 | +5.4% / 0.23 / 21.9% / 0.12 | +0.5% / 0.12 / 260 / 0.49 | **−1.6%** | 5.2, 4.6, 4.2, 5.1 |

| Gate | Result |
|---|---|
| Positive in all 4 cells | pass |
| Sharpe ≥ 0.5 in all cells | **fail** (0.23 in 8 coins 2024–26) |
| Positive at stress cost | **fail** (−1.6% in 8 coins 2024–26) |
| Max DD ≤ 25% | pass |
| Neighbours ≥ 80% positive | pass (16/16) |
| Better than E1 on return per drawdown in ≥ 3 of 4 cells | pass (3/4) |

## Why it failed
- **The sleeve is too small to matter.** At 0.5% risk per trade on 20% of the money, it made only +0.5% to +4.1% in two years. Combining it was mostly the same as holding 20% cash next to E1: about 20% less drawdown and about 20% less return.
- That is why return per drawdown improved slightly in 3 of 4 cells, and why the cells where E1 itself was weak (8 coins 2024–26, Sharpe 0.23) stayed weak and failed at stress cost.
- The sleeve is not a diversifier. Its daily returns correlate 0.37–0.61 with the core, because both are long only when the BTC gate is open. It adds the same bet in a smaller size.
- Reading: the 4h breakout has no meaningful edge to add on top of E1. The same thing showed up in P1, where its value was regime timing, which E1 already captures.

## What this means
- Rejected. The 4h breakout stays out of the core. The `exp-4h-2026-11` paper test continues unchanged as its own experiment.
- Not to be "fixed" by raising the sleeve's risk: that would be a new hypothesis and a risk increase, which the house rules forbid making in order to improve a result.
