# H4 results: funding-rate crowding filter. **FAIL (3 of 6 gates)**

Pre-registration: `H4-funding-preregistration.md` (commit 4e0265e, written before the run). Script: `scripts/paper/h4-funding.ts`. Raw output: `H4-funding.json`. Run once on 2026-11-17. The look-ahead guard passed.

## Results (costs 0.1% + 0.02% per side)

| Cell | With filter: total / Sharpe / max DD | E1 alone: total / Sharpe / max DD | Filter at stress cost | Neighbours |
|---|---|---|---|---|
| 5 coins 2022-12 → 2024-11 | +55.1% / 1.37 / 11.2% | +79.7% / 1.58 / 14.8% | +38.9% | 52.7, 60.4, 55.6, 32.8 |
| 5 coins 2024-11 → 2026-11 | +16.4% / 0.50 / 18.0% | +25.2% / 0.67 / 18.0% | +5.7% | 9.2, 20.4, 11.7, 7.9 |
| 8 coins 2022-12 → 2024-11 | +16.8% / 0.57 / 17.3% | +34.6% / 0.87 / 16.8% | +6.3% | 18.6, 25.5, 17.1, 0.5 |
| 8 coins 2024-11 → 2026-11 | +0.2% / 0.09 / 21.9% | +5.4% / 0.23 / 21.9% | −7.6% | −4.0, 0.4, −3.4, −5.0 |

| Gate | Result |
|---|---|
| Positive in all 4 cells | pass (barely: +0.2% in one cell) |
| Sharpe ≥ 0.5 in all cells | **fail** (0.09) |
| Positive at stress cost | **fail** (−7.6%) |
| Max DD ≤ 25% | pass |
| Neighbours ≥ 80% positive | pass (13/16) |
| Better than E1 on return per drawdown in ≥ 3 of 4 cells | **fail (0 of 4)** |

## Why it failed
- **The filter lowered return in every cell and reduced drawdown in only one.**
- The diagnostic shows why. On days after high funding, the coins the trend rule held went on to rise **more**, not less:

  | Cell | Next day after high funding | Next day after normal funding | t |
  |---|---|---|---|
  | 5 coins w1 | +0.74% | +0.33% | 1.0 |
  | 5 coins w2 | +1.66% | +0.16% | 1.6 |
  | 8 coins w1 | +0.89% | +0.20% | 1.3 |
  | 8 coins w2 | +2.50% | −0.08% | 1.9 |

- High funding marked strong up-moves, which carried on. Cutting exposure on those days cut out some of the trend rule's best days.
- Each cell is individually weak (t 1.0–1.9), and there are few crowded invested days in 2024–26 (18). Still, the direction is the same in all four cells. The "crowding precedes a sell-off" effect does not show up at a one-day horizon.

## What this means
- Rejected. The trend rule keeps no funding filter.
- A **new, separate** hypothesis could test the opposite (high funding as a continuation signal: hold *more* when funding is high). It was suggested by this result, so it must be pre-registered fresh and judged on its own gates. It is also leverage-adjacent, because it can only add exposure up to the existing cap of 1.0 per coin, so it stays bounded by the current risk limits. It is listed as #4b, low priority.
