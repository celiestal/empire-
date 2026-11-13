# Pre-registration: regime-gated scalper (S1)

Written and committed **before** running. Results go in `2026-11-13-scalper-results.md`. Fake money only.

## Idea
Every fast strategy tested so far lost to fees, and its entries were no better than random. The only validated edge is a *state*: E1's "coin's 30-day trend up AND BTC gate open". Hypothesis: fast entries taken **only inside that state** have positive expectancy after costs, because they trade with a confirmed up-move instead of against noise.

## Rules (exact; nothing tuned)
- **Universe:** 13 coins (BTC, ETH, SOL, XRP, DOGE, ADA, LINK, AVAX, LTC, DOT, XLM, NEAR, BCH). Long only.
- **Regime filter (daily, from the previous daily close):** `targetWeight(...) > 0` from `lib/paper/trend/daily.ts` with the E1 parameters (30-day return > 0, BTC gate open).
- **Bars:** 1 hour. Decide at an hourly close, fill at the next hour's open.
- **Variant S1-dip** (buy a short pullback in the up-regime): close > EMA(100), RSI(3) < 20.
- **Variant S1-break** (buy a short breakout in the up-regime): close > highest high of the previous 24 bars, volume > 1.5× its 20-bar average.
- **Exit (both):**
  - stop 1.5 × ATR(14), target 3 × ATR(14) (2R), time exit after 24 bars
  - the existing engine's risk rules: 0.5% risk per trade, no leverage, cost filters, 2% daily loss stop, cool-down, 10% kill switch.
- **Costs:** 0.1% fee + 0.02% slippage per side (engine default).

## Pass criteria (a variant must pass all)
1. ≥ 30 trades in each period × coin group.
2. Positive in **both** periods (B: 2021-09-01 → 2024-11-13; A: 2024-11-13 → 2026-11-13) for **both** coin groups (5 original, 8 H2).
3. Pooled t-statistic of per-trade R ≥ 2.
4. ≥ 90th percentile of the random-entry benchmark, with random entries drawn **only from regime-on hours** (tests the entry, not the regime).
5. Positive in both periods at 0.25% fee + 0.02% slippage.
6. Neighbours (dip: RSI threshold 15/25 and EMA 50/200; break: lookback 12/48 and volume ×1.2/×2.0): ≥ 80% positive in both periods.

Two variants are tested, so one could pass by luck. A pass makes it a *candidate* for a paper test, not a proven scalper.
A secondary check on the 30-day 1-minute data (15-minute bars, 5 coins) is reported but doesn't decide anything (too short).
