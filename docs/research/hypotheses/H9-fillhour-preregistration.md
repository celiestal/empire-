# H9 pre-registration: execution-hour robustness of the trend rule

Written and committed **before** the test runs. Run once.

## Why this replaces backlog item #9 as written
Item #9 asked whether E1 should avoid rebalancing in the 13–16 UTC high-volatility hours. **E1 never trades then.** It decides at the daily close and fills at 00:00 UTC, so the item as written has nothing to test. The useful version of the question is the reverse: **is E1's result an accident of the 00:00 fill?** If a strategy only works at one fill time, its backtest contains timing luck.

## Exact test
- E1 decision unchanged: weight w for day i is decided from daily bars up to the close of day i−1 (`targetWeight`, `E1_PARAMS`).
- Fill and hold from **00:00 + h hours** on day i to 00:00 + h hours on day i+1, for h ∈ {0, 4, 8, 12, 16, 20}.
  - Prices are hourly opens: the open of the hourly bar starting at that time.
  - With h = 0 this is the normal E1, up to the difference between the daily close and the next hourly open.
  - The decision for day i still uses only data up to 00:00 of day i. A later fill means the information is h hours older when used, never newer, so there is no look-ahead.
- Costs 0.1% + 0.02% per side on every weight change.
- Development data: 5 coins and 8 coins; windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13.

## Pass criteria (robustness check of E1, fixed now)
1. E1 is positive at **all 6** fill hours in all 4 cells (24/24).
2. The h = 0 result is **not the best** of the 6 hours in at least 2 of the 4 cells. If 00:00 is the best hour in 3 or 4 cells, E1's backtest is flagged as possibly carrying timing luck.
3. The spread (best − worst total return across the 6 hours) is reported per cell, for information.

**If it fails:** E1 stays validated, because its holdout result stands, but the report must flag that its paper results depend on the fill hour. Nothing in the running experiments changes either way.
