# E1 pre-registration: market-filtered trend on the untouched H2 coins

Written and committed **before** any H2 data is loaded. Run once. Results go in `2026-11-13-e1-results.md`. Fake money only.

## Rule (fixed; nothing tuned on H2)
- Coins: ADA, LINK, AVAX, LTC, DOT, XLM, NEAR, BCH (USD books on Crypto.com), equal weight (1/8 each).
- Daily bars (UTC). At each daily close, for each coin:
  - **In** if its close is above its close 30 days earlier **and** the BTC gate is open (BTC 4h close above a rising EMA(42), rising over 6 bars, read at the last 4h bar of the day).
  - Size = min(1, 40% / the coin's 20-day realised annualised volatility). Otherwise cash.
- Rebalance daily; cost = (0.1% fee + 0.02% slippage) × |change in weight|.
- Period: from the first date all 8 coins have 60 days of history (≥ 2021-09-01) to 2026-11-13.

## Pass criteria (all required)
1. Positive total return on H2 (equal-weight portfolio).
2. Positive on at least 5 of the 8 coins individually.
3. Sharpe ≥ 0.5.
4. Still positive at 0.25% fee + 0.02% slippage per side.
5. Max drawdown ≤ 25%.

Reported for context: buy-and-hold of the same 8 coins, and per-year results.
If it passes: a candidate for an isolated daily paper experiment (`exp-trend-daily`). If it fails: retired, not re-tuned.
