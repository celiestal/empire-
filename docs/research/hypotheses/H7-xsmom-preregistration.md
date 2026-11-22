# H7 pre-registration: cross-sectional momentum (top 3 of 13 coins) inside the BTC gate

Written and committed **before** the test runs. Run once; if it fails, it is rejected.

## Idea
Liu, Tsyvinski and Wu (Journal of Finance, 2022) find that cross-sectional momentum in crypto, holding past winners, earns a premium. E1 holds every coin whose own trend is up (time-series momentum). H7 instead concentrates in the strongest coins.

## Exact rule
- Universe: all 13 researched coins together (BTC, ETH, SOL, XRP, DOGE, ADA, LINK, AVAX, LTC, DOT, XLM, NEAR, BCH), daily bars.
- At day d's close: if the BTC gate is closed (same gate as E1), hold nothing on day d+1.
- If it is open: rank coins by return over the last **30 days** (close d ÷ close d−30) and pick the **top 3**. Coins with fewer than 31 days of history, or missing the bar for day d, are skipped.
- **Weight per selected coin** = (1/3) × min(1, 0.40 / its 20-day annualised volatility), the same volatility scaling as E1. The rest is cash.
- Costs 0.1% + 0.02% per side on every change of weight, per coin.

## Baseline
E1 on the same 13 coins, equal slices of 1/13 (`targetWeight`, `E1_PARAMS`), same costs.

## Test
- Windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13: **2 cells**, since the universe is one group of 13.
- **Neighbours (4):** top 2; top 5; look-back 20 days; look-back 45 days.
- **Stress:** 0.25% + 0.02% per side.

## Gates (all must pass)
1. Positive return in both cells.
2. Sharpe ≥ 0.5 in both cells.
3. Positive at the stress cost in both cells.
4. Max drawdown ≤ 25% in both cells.
5. ≥ 80% of the neighbour results are positive (8 results).
6. Better than E1-13 on CAGR ÷ max drawdown in **both** cells.

**Diagnostic:** turnover (number of weight changes), fees, the average number of coins held, and the share of profit from the single best coin.

## Look-ahead guard
The selection for day d+1 must not change when bars after day d are removed. The test asserts this on sample days before running.
