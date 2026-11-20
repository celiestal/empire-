# H6 pre-registration: volatility target level for the trend rule (30% vs 40% vs 60%)

Written and committed **before** the test runs. Run once.

## Question
E1 sizes each coin's slice as min(1, volTarget / 20-day realised volatility), with volTarget = 40%. Is 40% a good risk level, or should the rule run **lower**? This is a risk decision, so drawdown is judged first.

**House rule:** a result must never be improved by loosening risk. This test therefore **cannot adopt a level above 40%**. The 60% row is reported for information only, to show the trade-off. It is not an option, whatever it shows.

## Exact rules compared
- E1 unchanged except `volTarget` ∈ {0.30, 0.40 (current), 0.60}; the cap of 1.0 per coin is unchanged.
- Daily, equal-weight over the coin group, costs 0.1% + 0.02% per side on every weight change (same as H1–H5).
- Development data: 5 coins and 8 coins; windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13.
- Stress: 0.25% + 0.02% per side.

## Decision rule (fixed now)
**30% replaces 40%** only if **all** of the following hold:
1. Lower max drawdown than 40% in all 4 cells.
2. CAGR ÷ max drawdown at least as good as 40% in ≥ 3 of 4 cells.
3. Positive return in all 4 cells, and positive at stress in all 4 cells.
4. Neighbours 25% and 35% are both positive in all 4 cells (16/16 positive).

Otherwise **40% stays**. Either way, the running paper experiment (`exp-trend-daily-2026-11`) is frozen and is not changed. A change would only apply to a future experiment, with the owner's OK.

**Diagnostic:** average weight held when invested, the number of rebalances, and fees at each level.
