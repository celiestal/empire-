# H2 results: look-back ensemble (14/30/60) for the trend rule

Pre-registration: `H2-ensemble-preregistration.md` (commit dda1b10). Script: `scripts/paper/h2-ensemble.ts` (includes a look-ahead check). Raw: `H2-ensemble.json`. Run once.

## Verdict: FAILS gate 2 (Sharpe ≥ 0.5 in all cells): 0.31 in 8 coins, 2024–26. Rejected; the E1 rule stays unchanged.

| Cell | Ensemble: return / Sharpe / max DD | E1 rule: return / Sharpe / max DD |
|---|---|---|
| 5 coins, Dec 2022 → Nov 2024 | +79.2% / 1.64 / 12.8% | +79.7% / 1.58 / 14.8% |
| 5 coins, Nov 2024 → Nov 2026 | +20.5% / 0.60 / 16.8% | +25.2% / 0.67 / 18.0% |
| 8 coins, Dec 2022 → Nov 2024 | +40.1% / 1.00 / 15.9% | +34.6% / 0.87 / 16.8% |
| 8 coins, Nov 2024 → Nov 2026 | +8.3% / **0.31** / 20.7% | +5.4% / 0.23 / 21.9% |

Every other gate passed:
- positive at 0.25% per side (+0.5% to +62%)
- all 16 neighbours positive
- better return per drawdown than E1 in 3 of 4 cells.

## Reading it
- The ensemble is a **small, consistent risk reduction**: lower max drawdown in all 4 cells, by 1–2 points. It is **not a return improvement**: it lost to E1 on return in 2 of 4 cells.
- Its failure comes from the 2024–26 period on the 8 coins, where **every** trend variant is weak, E1 included (Sharpe 0.23). That window looks like a regime problem, not a parameter problem.
- No change to the running experiment. The differences are too small to justify a new paper experiment.
