# H5 pre-registration: 4h breakout (trail + BTC gate) as a small sleeve on top of the trend core

Written and committed **before** the test runs. Run once; if it fails, it is rejected.

## Idea
The video's "core + sleeves" structure. P1's best variant, trail+gate (4h breakout long, trailing exit, BTC gate), failed on its own: t 1.96, and the cost stress failed. It makes money in different weeks from the daily trend rule, though. A small allocation could improve the combined account's return per drawdown even if the sleeve is weak alone.

## Exact rule
- **Core (80%):** E1 trend rule unchanged, equal-weight over the coin group, daily, costs 0.1% + 0.02% per side (as in H1–H4).
- **Sleeve (20%):** P1's `trail+gate` exactly, with no changes:
  - 4h bars, breakout long `n=40, volMult=1.5, stopAtr=1.5, trend=0, regimeHours=0`
  - trailing stop 3 ATR, 120-bar limit (`applyTrail(c, x, 3, 120)`)
  - BTC gate (`applyBtcGate` with `btcUpByTime` on BTC 4h bars)
  - default engine: 0.5% risk per trade, fee 0.1% + slippage 0.02% per side
  - one continuous account per coin (`runContinuous`), equal weight across the group's coins, open positions closed at the end
  - sleeve daily return = the equal-weight mean of the coins' daily equity changes
- **Combined daily return:** 0.8 × core + 0.2 × sleeve (rebalanced daily; no extra cost charged for the rebalance, a stated simplification).
- **Warm-up:** sleeve indicators use the 60 days before each window.

## Test
- Development data: 5 coins and 8 coins; windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13 (same as H1–H4). BTC gate from `.paper-data/hist/BTC_USD_1h.json` for both groups.
- **Neighbours (4):** sleeve share 10% and 30%; breakout n = 20 and 60.
- **Stress:** core at 0.25% + 0.02%, sleeve at fee 0.25% + slippage 0.02%.

## Gates (all must pass; same as H1–H4)
1. Combined return positive in all 4 cells.
2. Sharpe ≥ 0.5 in all 4 cells.
3. Positive at the stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. ≥ 80% of the neighbour results are positive.
6. Better than E1 alone on CAGR ÷ max drawdown in ≥ 3 of 4 cells.

**Diagnostic, not a gate:** the sleeve's own return, Sharpe and trade count per cell, and the correlation of its daily returns with the core's.

## Look-ahead guard
`assertNoLookahead` is run on the sleeve's signal function (breakout → trail → gate) before any result is computed.
