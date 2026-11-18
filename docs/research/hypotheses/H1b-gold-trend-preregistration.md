# H1b pre-registration: gold for idle money only while gold is in an up-trend

Written and committed **before** the test runs. Run once; if it fails, it is rejected.

## Idea
H1 (PAXG instead of cash, always) failed on drawdown (26.6% / 29.3% > 25%), and most of its gain came from gold's bull market. H1b holds gold only while gold's own trend is up, and only half the idle money. Both changes aim directly at that drawdown.

## Exact rule
- **Coins:** E1 trend rule unchanged (`targetWeight`, `E1_PARAMS`). Each coin slice has weight w (0…1), decided at day d's close and held over day d+1.
- **Gold trend:** PAXG daily close at day d > PAXG close 30 days earlier → "gold up". The PAXG daily series is resampled from `.paper-data/hist/PAXG_USD_1h.json`.
- **Gold weight in each coin slice:** g = 0.5 × (1 − w) if gold is up, else 0. The rest stays in cash.
- **Daily return of a slice:** w × coin return + g × PAXG return − cost × (|Δw| + |Δg|), with cost = 0.1% fee + 0.02% slippage per side.
- PAXG return on a day with no PAXG bar = 0.

## Test
- Development data: 5 coins and 8 coins; windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13 (same as H1–H4).
- **Neighbours (4):** gold look-back 20 and 45 days; idle share 35% and 65%.
- **Stress:** 0.25% fee + 0.02% slippage per side.

## Gates (all must pass; same as H1)
1. Positive return in all 4 cells.
2. Sharpe ≥ 0.5 in all 4 cells.
3. Positive at the stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. ≥ 80% of the neighbour results are positive.
6. Better than E1 (cash) on CAGR ÷ max drawdown in ≥ 3 of 4 cells.

**Diagnostic, not a gate:** the gold sleeve's own contribution in each cell, and PAXG buy-and-hold in each window, so a pass that is just gold's bull market is visible.

## Look-ahead guard
The gold flag and the weights for day d must not change when bars after day d are removed. The test asserts this before running.
