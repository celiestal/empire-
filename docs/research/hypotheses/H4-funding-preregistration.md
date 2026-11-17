# H4 pre-registration: funding-rate crowding filter on the trend rule

Written and committed **before** the test runs. Run once; if it fails, it is rejected (a tweak is a new hypothesis).

## Idea
When perpetual-futures funding is unusually high, longs are crowded and paying a lot to stay in. Carry research (BIS, "Crypto carry", 2023) finds high funding precedes weaker spot returns and sharper sell-offs. If true, the trend rule should hold less on those days.

## Data (checked 2026-11-17)
- Crypto.com public API `public/get-valuations`, `BTCUSD-PERP`, `valuation_type=funding_hist`: hourly values from 2021-05-19 to now (48,177 hours). Since 2022-09 there is one gap longer than 3h, and no values look broken.
- Stored at `.paper-data/funding/BTCUSD-PERP_1h.json` (gitignored, same as the candles). One market-wide signal: BTC funding is used for every coin.

## Exact rule
- **Base:** E1 trend rule unchanged (`targetWeight`, `E1_PARAMS`, BTC gate). Daily bars; the weight is decided at day d's close and held over day d+1.
- **Funding for day d:** F(d) = the mean of the hourly funding values stamped from d 00:00 to d 22:00 UTC (the 23:00 stamp is excluded so that nothing near the close can leak). If fewer than 12 values exist, the day is "not crowded".
- **Crowded:** F(d) ≥ the 90th percentile of F over days d−365 … d−1 (needs ≥ 180 valid days, else "not crowded").
- **Action:** if crowded, the weight for day d+1 = 0.5 × the E1 weight. Otherwise E1 is unchanged.
- **Costs:** 0.1% fee + 0.02% slippage per side on every weight change (same as E1).

## Test
- Development data: 5 coins (`.paper-data/hist`) and 8 coins (`.paper-data/h2`); windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13.
- **Neighbours (4):** 85th percentile; 95th percentile; F as a 3-day mean (d−2 … d); skip (× 0) instead of halve.
- **Stress:** 0.25% fee + 0.02% slippage per side.

## Gates (all must pass; same as H2)
1. Positive return in all 4 cells.
2. Sharpe ≥ 0.5 in all 4 cells.
3. Positive at the stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. ≥ 80% of the neighbour results are positive.
6. Better than E1 on CAGR ÷ max drawdown in ≥ 3 of 4 cells.

**Diagnostic, not a gate:** the share of days that are crowded, and the average next-day return of the coins (equal weight, on days E1 is invested) on crowded vs normal days, with a t-statistic. This shows whether the idea itself has any signal.

## Look-ahead guard
The crowded flag for day d must not change when funding data after day d's 22:00 stamp is removed. The test asserts this on sample days before running.
