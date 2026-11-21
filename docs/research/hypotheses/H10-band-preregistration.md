# H10 pre-registration: rebalance band for the trend rule

Written and committed **before** the test runs. Run once; if it fails, it is rejected.

## Idea
H6 measured that E1's volatility-scaled weight changes a little almost every day. That is 1,100–2,000 rebalances per coin group over two years, costing 6–8% of capital at 0.12% per side. Skipping tiny adjustments should keep the same exposure for much less cost. This is pure execution hygiene: no new signal and no extra risk.

## Exact rule
- E1 target weight w* per coin per day, unchanged (`targetWeight`, `E1_PARAMS`).
- Held weight w (starts at 0). Each day:
  - if w* = 0 or w = 0 (an entry or exit), set w = w*
  - else if |w* − w| > **0.10**, set w = w*
  - else keep w unchanged (no trade, no cost)
- Costs 0.1% + 0.02% per side on every actual change of w.
- The held weight never exceeds the cap of 1.0, because w* ≤ 1 and w is always a past w*.

## Test
- Development data: 5 coins and 8 coins; windows w1 = 2022-12-11 → 2024-11-13 and w2 = 2024-11-13 → 2026-11-13 (same as H1–H6).
- **Neighbours (3):** band 0.05, 0.15 and 0.20.
- **Stress:** 0.25% + 0.02% per side.

## Gates (all must pass)
1. Positive return in all 4 cells.
2. Sharpe ≥ 0.5 in all 4 cells. *Known handicap: E1 itself is at 0.23 in the 8-coin 2024–26 cell, so this gate is unlikely to pass. It stays, because the gates are not loosened for a test.*
3. Positive at the stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. ≥ 80% of the neighbour results are positive.
6. Better than E1 on CAGR ÷ max drawdown in ≥ 3 of 4 cells.
7. Fees lower than E1's in all 4 cells.

**Diagnostic:** the number of rebalances and fees vs E1, and the mean absolute gap between held and target weight (how far the band lets exposure drift).

**If it passes**, it goes on the bench like H1b. Applying it to a paper experiment needs the owner's OK and a new experiment id; the running E1 test stays frozen.
