# H9 results: execution-hour robustness of E1. **Criterion 1 FAILS (20/24 positive); criterion 2 passes (00:00 is never the best hour)**

Pre-registration: `H9-fillhour-preregistration.md` (commit d4db4bc, written before the run). Script: `scripts/paper/h9-fillhour.ts`. Raw output: `H9-fillhour.json`. Run once on 2026-11-24. No hourly bars were missing.

## Results: E1 total return by fill hour (UTC), costs 0.1% + 0.02% per side

| Cell | 00:00 | 04:00 | 08:00 | 12:00 | 16:00 | 20:00 | Spread | Rank of 00:00 |
|---|---|---|---|---|---|---|---|---|
| 5 coins 2022–24 | +79.6% | +83.7% | +97.4% | +109.2% | +113.2% | +122.3% | 42.7 pts | 6th (worst) |
| 5 coins 2024–26 | +25.1% | +23.7% | +28.9% | +18.8% | **−2.4%** | +2.9% | 31.3 pts | 2nd |
| 8 coins 2022–24 | +34.7% | +42.6% | +52.9% | +64.4% | +71.3% | +75.7% | 41.0 pts | 6th (worst) |
| 8 coins 2024–26 | +4.6% | +5.5% | +7.4% | **−0.2%** | **−12.1%** | **−8.4%** | 19.5 pts | 3rd |

- **Criterion 1 (positive at every hour in every cell): FAIL.** 4 of 24 negative, all in 2024–26 with late-day fills.
- **Criterion 2 (00:00 not the best in ≥ 2 cells): PASS.** 00:00 ranks 6th, 2nd, 6th and 3rd. The backtest is **not** flattered by a lucky fill time; in 2022–24 it is the *least* favourable hour.

**Over the full E1 holdout period** (8 coins, Dec 2022 → Nov 2026, w1 and w2 compounded), E1 is positive at every fill hour:

| Fill hour | 00:00 | 04:00 | 08:00 | 12:00 | 16:00 | 20:00 |
|---|---|---|---|---|---|---|
| Return | +40.9% | +50.4% | +64.2% | +64.1% | +50.6% | +61.0% |

## What this means
- **E1's validation stands.** Over its full holdout it is positive at every fill hour, and the 00:00 result used in the holdout is at the low end, not the high end.
- **But its two-year results are very sensitive to *when* trades fill:** 19–43 points of spread. In the choppy 2024–26 period the rule is close to break-even, and a different fill hour turns it negative. Over short windows like the paper test, luck in execution timing can dominate the result.
- **Practical consequence for paper/real use:** the fill time should be fixed in advance and never chosen after the fact. The running experiment fills at 00:00, which is fixed in its frozen config, so this is already satisfied.
- **Not actionable as an "improvement":** later fills were better in 2022–24 and worse in 2024–26. Picking an hour now would be curve-fitting to one regime.
- A fair future test (owner's call) would split each daily trade across several fill hours, for example 1/6 at each of the six times. That averages away the timing luck and reduces variance without changing the expected return. Logged as backlog #11.
