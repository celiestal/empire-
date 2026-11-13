# P1 pre-registration: trailing exit and BTC gate on 4h breakout long

Written and committed **before** any of these variants were run. Results go in a separate file. Nothing here may be changed after results are seen. If a variant fails, it fails.

## Variants (all 4h bars, long only, 5 coins BTC/ETH/SOL/XRP/DOGE, fee 0.1%/side, slippage 0.02%, 0.5% risk per trade)
Fixed parameters, no re-tuning. These are the middle of the existing breakout grid: `n=40, volMult=1.5, stopAtr=1.5, trend=0, regimeHours=0`.

| id | Entry | Exit | Filter |
|---|---|---|---|
| `base` | breakout | fixed target 2R, 60-bar time limit (as now) | none |
| `trail` | breakout | initial stop 1.5 ATR; then a trailing stop 3 ATR (ATR at entry) below the highest high since entry; no target; 120-bar time limit | none |
| `gate` | breakout | as `base` | BTC gate |
| `trail+gate` | breakout | as `trail` | BTC gate |

**BTC gate:** a long signal on bar *i* is allowed only if, on BTC's 4h bar with the same timestamp, close > EMA(42) **and** EMA(42) > EMA(42) six bars earlier. Only closed bars are used.

## Data
- Development period A ("research"): 5 coins, OOS span 2025-02-11 → 2026-11-13.
- Development period B ("H1"): 5 coins, 2021-12-01 → 2024-11-13.
- Final holdout H2 (only for variants that pass every development gate, run **once**): ADA, LINK, AVAX, LTC, DOT, XLM, NEAR, BCH, all available hourly history to 2026-11-13.

## Method
Continuous simulation per coin over each period (no reset between months), the existing pessimistic engine, and positions still open at the end closed at the last close with exit costs.

## Development gates (a variant must pass all of them)
1. Positive return in **both** periods (average per coin).
2. Pooled t-statistic of per-trade R across both periods ≥ 2.0.
3. At or above the 90th percentile of the random-entry benchmark (same exits, same filter, same signal density) in **both** periods.
4. Still positive in both periods at fee 0.2% per side + slippage 0.05%.
5. No single coin contributes more than 50% of total profit (both periods pooled).
6. Portfolio Sharpe (daily, equal-weight coins) ≥ 0.5 in both periods.
7. Neighbourhood robustness: of the settings one grid step away (n ∈ {20,60}, stopAtr ∈ {1,2}, trail ATR ∈ {2,4} where applicable), at least 80% are positive in both periods.

Four variants are tested, so one may pass by luck. Passing development is therefore **not** proof. Only H2, followed by paper trading, counts.

## H2 gate
Positive average per coin, and positive on at least 5 of the 8 coins, with nothing changed.
