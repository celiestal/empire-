# H1 pre-registration: PAXG (tokenised gold) instead of cash in the trend rule

Daily research run 2026-11-14. Committed **before** running. Results: `H1-paxg-results.md`. Fake money only.

## Rule
The E1 market-filtered trend rule exactly as validated (`lib/paper/trend/daily.ts`, E1 parameters). The one change: each coin's slice keeps its idle part (1 − weight) in **PAXG_USD** instead of cash. Whenever a coin's weight changes by Δ, both legs trade, so the cost is 2 × |Δ| × (fee + slippage).

## Data and windows (development data only)
- Coin groups: 5 original (BTC, ETH, SOL, XRP, DOGE) and 8 (ADA, LINK, AVAX, LTC, DOT, XLM, NEAR, BCH).
- Windows: 2022-12-11 → 2024-11-13 (PAXG history starts 2022-10-11, plus 60 days of warm-up) and 2024-11-13 → 2026-11-13.
- Costs: 0.1% + 0.02% per side. Stress: 0.25% + 0.02%.

## Pass criteria (all required; from docs/research/hypotheses.md)
1. Positive return in all 4 cells (2 groups × 2 windows).
2. Sharpe ≥ 0.5 in all 4 cells.
3. Positive at stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. Neighbours: look-back 20 and 45 days, vol target 30% and 50% (4 neighbours × 4 cells): ≥ 80% positive.
6. Better return-per-drawdown (CAGR ÷ max DD) than the plain E1 rule (cash) in at least 3 of 4 cells.
