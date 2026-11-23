# H8 pre-registration: faster exit (10-day low) for the trend rule

Written and committed **before** the test runs. Run once; if it fails, it is rejected.

## Idea
E1 leaves a coin only when its 30-day trend turns or the BTC gate closes. That can mean giving back a large part of a move. H8 adds an earlier exit: leave when the coin closes below its recent 10-day low. Nine tests so far suggest that faster or more concentrated changes hurt E1 (H2, H3, H7). H8 tests that directly, as written, without tuning.

## Exact rule (per coin, daily, decided at day j's close for day j+1)
- w* = E1 target weight (`targetWeight`, `E1_PARAMS`), unchanged.
- State `out` (starts false).
  - **Exit:** if close[j] < min(low[j−10 … j−1]) (the lowest low of the previous 10 days), set `out` = true.
  - **Re-entry:** while `out`, if close[j] > max(high[j−10 … j−1]) (the highest high of the previous 10 days), set `out` = false.
  - **Reset:** if w* = 0 (E1 itself is out), set `out` = false, so the next E1 entry is not blocked by an old exit.
- Held weight = 0 if `out`, else w*.
- Costs 0.1% + 0.02% per side on every weight change.

## Test
- Development data: 5 coins and 8 coins; windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13 (same as H1–H10).
- **Neighbours (4):** channel length 7 and 15 days (for both exit and re-entry); exit only with re-entry at 20 days; exit at 10 with re-entry only via reset (no channel re-entry).
- **Stress:** 0.25% + 0.02% per side.

## Gates (all must pass; same as H1–H5)
1. Positive return in all 4 cells.
2. Sharpe ≥ 0.5 in all 4 cells. *(As with H10, E1 itself is 0.23 in the 8-coin 2024–26 cell, a known handicap. The gate stays.)*
3. Positive at the stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. ≥ 80% of the neighbour results are positive.
6. Better than E1 on CAGR ÷ max drawdown in ≥ 3 of 4 cells.

**Diagnostic:** the number of early exits and re-entries, fees vs E1, and the average return of the coin over the 10 days after an early exit (did leaving help?).

## Look-ahead guard
The held weight for day j+1 must not change when bars after day j are removed. The test asserts this on sample bars before running.
