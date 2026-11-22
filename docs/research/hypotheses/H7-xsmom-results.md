# H7 results: cross-sectional momentum (top 3 of 13). **FAIL (0 of 6 gates)**

Pre-registration: `H7-xsmom-preregistration.md` (commit 5abf911, written before the run). Script: `scripts/paper/h7-xsmom.ts`. Raw output: `H7-xsmom.json`. Run once on 2026-11-22. The look-ahead guard passed.

## Results (13 coins, costs 0.1% + 0.02% per side)

| Window | Top 3: total / Sharpe / max DD / CAGR÷DD | E1 on 13 coins | Top 3 at stress | Neighbours (top 2, top 5, look 20, look 45) |
|---|---|---|---|---|
| 2022-12 → 2024-11 | +76.0% / 1.27 / 22.1% / 1.55 | +51.1% / 1.21 / 14.5% / 1.65 | +47.2% | 71.6, 90.5, 131.1, 108.9 |
| 2024-11 → 2026-11 | **−15.6%** / −0.20 / **42.8%** / −0.19 | +12.9% / 0.43 / 20.2% / 0.31 | −29.6% | −23.2, −10.0, −16.1, −4.3 |

| Gate | Result |
|---|---|
| Positive in both windows | **fail** |
| Sharpe ≥ 0.5 in both | **fail** |
| Positive at stress | **fail** |
| Max DD ≤ 25% | **fail** (42.8%) |
| Neighbours ≥ 80% positive | **fail** (4/8; every 2024–26 neighbour lost) |
| Better than E1 on return per DD in both | **fail** (0/2) |

## Why it failed
- **It works in a broad bull market and breaks in a choppy or falling one.** In 2022–24 the strongest coins kept rising (+76%). In 2024–26 last month's winners were often next month's sharpest losers: the "momentum crash" pattern known from the literature.
- **Concentration:** about 1.4–1.5 coins held on average (top 3 only while the gate is open). Drawdown doubled compared with E1.
- **Costs doubled:** 14.3–14.5% fees over two years against E1's 6.7–7.7%, from swapping coins as the ranking changes.
- E1's breadth (every coin with an up-trend, small slices) is what kept its 2024–26 result positive.

## What this means
- Rejected. E1 stays broad and equal-weighted.
- This is consistent with H2 (ensemble) and H3 (shorts): changes that concentrate or speed up E1 have hurt in 2024–26, and changes that slow it down (H10 band) have helped slightly.
