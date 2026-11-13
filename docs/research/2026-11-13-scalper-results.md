# Results: S1 regime-gated scalper

Pre-registration: `2026-11-13-scalper-preregistration.md` (commit 9adbe7a, before this run). Script: `scripts/paper/scalper.ts`. Raw: `2026-11-13-intelligence/scalper.json`.

## Verdict: both variants FAIL every gate. Retired.

| | Pooled t (per-trade R) | Cells positive (of 8) | Neighbours positive | Fees vs pre-fee profit |
|---|---|---|---|---|
| S1-dip (RSI(3)<20 above EMA100, in the E1 regime) | **−4.28** | 0 | 1 of 16 | 240–325% (or no pre-fee profit at all) |
| S1-break (24-bar high + volume, in the E1 regime) | **−3.80** | 0 | 1 of 16 | 129–398% (or no pre-fee profit at all) |

Per cell, return per coin at 0.5% risk per trade:

| Variant | 5 coins 2021–24 | 5 coins 2024–26 | 8 coins 2021–24 | 8 coins 2024–26 |
|---|---|---|---|---|
| Dip | −5.3% | −7.0% | −3.3% | −6.6% |
| Break | −1.3% | −3.3% | −6.0% | −5.3% |

- 350–910 trades per cell. Win rates 32–39%, average win about 1.5–1.8R, average loss about 1.1R.
- Against random entries inside the same regime hours: 0th–98th percentile, no consistency.
- The secondary 15-minute check on the last 30 days had **zero trades**: the regime was off the whole month.

## What it means
- Even inside the one market state where an edge exists (E1), **hourly entries lose to costs**. The edge lives in *holding* during that state (daily, about 20 trades per coin a year), not in trading in and out of it.
- This is the fourth independent confirmation that scalping (1m → 1h) doesn't work on these coins at retail costs: the original live sleeves, the 1h walk-forward, the owner's take-profit idea, and S1.
- What goes on real charts instead: the validated daily rule, as a TradingView script, in `docs/research/tradingview/market-filtered-trend.pine`.
