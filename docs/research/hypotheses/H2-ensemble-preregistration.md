# H2 pre-registration: look-back ensemble for the trend rule

Daily research run 2026-11-15. Committed **before** running. Results: `H2-ensemble-results.md`. Fake money only.

## Rule
The E1 market-filtered trend rule with one change. The coin's trend score is the **average of three checks**: close above its close 14, 30 and 60 days earlier (score 0, 1/3, 2/3 or 1).
- Weight = score × min(1, 40% / 20-day realised volatility), only while the BTC gate is open; else cash.
- Costs (0.1% + 0.02%) × |change in weight|, as in E1.

## Data and windows (development data only, identical to H1)
- Coin groups: 5 original and 8 others.
- Windows: 2022-12-11 → 2024-11-13 and 2024-11-13 → 2026-11-13. Stress: 0.25% + 0.02%.

## Pass criteria (all required; docs/research/hypotheses.md)
1. Positive in all 4 cells.
2. Sharpe ≥ 0.5 in all 4 cells.
3. Positive at stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. Neighbours: look-back sets {10, 30, 90} and {20, 40, 80}, vol target 30% and 50%: ≥ 80% of the 16 positive.
6. Better CAGR ÷ max DD than the plain E1 rule in ≥ 3 of 4 cells.
