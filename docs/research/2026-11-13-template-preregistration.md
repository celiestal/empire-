# Pre-registration: the guide's trend template (T1)

Source: the owner shared a trading-bot guide (DaviddTech). Its template for its best strategies: "1 indicator for trend direction, 2 for confirmation, 1 for volatility, stop loss on the ATR bands, trend-following, BTC 1h, 0.1% commission per side plus slippage, every rule computable, no multi-timeframe take profits". Written and committed **before** running. Results go in `2026-11-13-template-results.md`. Fake money only.

## Rules (exact)
- **Trend (1 indicator):** EMA(200). Long only while close > EMA(200); in the long+short version, short only while close < EMA(200).
- **Confirmation 1:** MACD(12, 26, 9) histogram > 0 for longs (< 0 for shorts).
- **Confirmation 2:** ADX(14) > 20 (a trend is present).
- **Entry:** on the bar where all three first become true (they weren't all true on the bar before); fill at the next bar's open.
- **Volatility and stop (1 indicator):** ATR(14). Initial stop 2 × ATR from entry; then a trailing stop 2 × ATR from the best price since entry (the ATR band). No take-profit. Time limit 500 bars as a safety net.
- **Size:** risk 1% of equity per trade (the guide's 1–2%), never more than 100% of equity (no leverage).
- **Costs:** 0.1% commission per side + 0.02% slippage (engine), cost filters on, the engine's daily loss limit and kill switch on.

## Data (real Crypto.com prices)
- Main: BTC/USD, 1-hour bars, two periods: B = 2021-09-01 → 2024-11-13 and A = 2024-11-13 → 2026-11-13.
- Checks the guide asks for: the same rules on **4-hour** bars, and on **all 13 coins** (multiple markets).
- Two versions: long only, and long + short.

## Pass criteria (a version must pass all)
The guide's own:
1. At least 400 closed trades on 1h across the 13 coins and both periods.
2. Profit factor ≥ 1.3 in both periods.
3. Max drawdown ≤ 20%.
4. Positive on 1h **and** 4h (both periods, BTC).

Ours:

5. Positive in both periods on BTC and on the 13-coin average.
6. Pooled t ≥ 2.
7. ≥ 90th percentile of random entries with the same exits.
8. Positive at 0.25% commission.
9. Neighbours (EMA 150/250, ADX 15/25, ATR stop 1.5/3) ≥ 80% positive on BTC 1h in both periods.

A pass makes it a candidate for paper incubation (the guide's step 2), nothing more.
