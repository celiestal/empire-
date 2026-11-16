# H3 pre-registration: regime-matched shorts added to the trend rule

Daily research run 2026-11-16. Committed **before** running. Results: `H3-shorts-results.md`. Fake money only.

## Rule
- **Long side:** the E1 trend rule exactly as validated (unchanged).
- **Short side (new):** short a coin for the next day when, at the previous daily close:
  - (a) the BTC gate is closed, **and**
  - (b) the coin's own 72-hour regime label is "down". The label comes from `classify` in `lib/paper/scalp/regime.ts`: 4h bars, 72 hours, trend threshold 0.30, range 0.15, read at the last 4h bar of that day.
- **Short size:** min(1, 40% / 20-day realised volatility) of the coin's slice (same sizing as longs). A coin is never long and short at once (longs need the gate open, shorts need it closed).
- **Costs:** (0.1% + 0.02%) × |change in position|, plus a **short funding/borrow cost of 0.03% per day** × short size.

## Data and windows (development data, identical to H1/H2)
5 coins and 8 coins; 2022-12-11 → 2024-11-13 and 2024-11-13 → 2026-11-13. Stress: 0.25% + 0.02%.

## Pass criteria (all required)
1. Positive in all 4 cells.
2. Sharpe ≥ 0.5 in all 4 cells.
3. Positive at stress cost in all 4 cells.
4. Max drawdown ≤ 25% in all 4 cells.
5. Neighbours: regime look-back 48h and 96h, trend threshold 0.25 and 0.35: ≥ 80% of 16 positive.
6. Better CAGR ÷ max DD than the long-only E1 rule in ≥ 3 of 4 cells.
7. The short side alone must be positive in ≥ 3 of 4 cells (shorts must add, not just ride along).
