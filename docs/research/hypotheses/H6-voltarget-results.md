# H6 results: volatility target level. **40% stays** (30% missed one condition; 60% is not an option)

Pre-registration: `H6-voltarget-preregistration.md` (commit f107dec, written before the run). Script: `scripts/paper/h6-voltarget.ts`. Raw output: `H6-voltarget.json`. Run once on 2026-11-20.

## Results (costs 0.1% + 0.02% per side)

| Cell | 25% | **30%** | 35% | **40% (current)** | 60% (info only) |
|---|---|---|---|---|---|
| 5 coins 2022–24: total / max DD | +49.6% / 9.6% | +60.8% / 11.3% | +70.6% / 13.1% | +79.7% / 14.8% | +106.4% / 17.6% |
| 5 coins 2024–26 | +19.2% / 11.7% | +21.2% / 14.0% | +23.1% / 16.1% | +25.2% / 18.0% | +31.4% / 23.0% |
| 8 coins 2022–24 | +21.1% / 11.5% | +25.6% / 13.6% | +30.1% / 15.5% | +34.6% / 16.8% | +51.4% / 19.3% |
| 8 coins 2024–26 | +5.0% / 13.7% | +5.5% / 16.4% | +5.7% / 19.1% | +5.4% / 21.9% | +5.1% / **29.7%** |

| CAGR ÷ max DD | 30% | 40% |
|---|---|---|
| 5 coins 2022–24 | 2.47 | 2.40 |
| 5 coins 2024–26 | 0.72 | 0.66 |
| 8 coins 2022–24 | 0.92 | 0.99 |
| 8 coins 2024–26 | 0.16 | 0.12 |

| Condition for 30% to replace 40% | Result |
|---|---|
| Lower max DD in all 4 cells | pass (4/4: about 15–25% lower) |
| Return per drawdown ≥ 40% in ≥ 3 of 4 cells | pass (3/4) |
| Positive in all cells **and** positive at stress in all cells | **fail**: −0.7% at stress in 8 coins 2024–26 |
| Neighbours 25% and 35% positive everywhere | pass (8/8; the pre-registration's "16/16" was a counting slip, since 2 neighbours × 4 cells = 8; the condition as written, "both positive in all 4 cells", is met) |

**Decision by the written rule: 40% stays.** Nothing changes; the paper experiment is frozen in any case.

## What we learned
- **Sharpe barely changes with the level (within about 0.05).** The volatility target is a pure risk dial: it scales return and drawdown roughly together. There is no "better" level, only more or less risk.
- **60% would be a mistake even apart from the house rule.** In the hard 2024–26 period on the 8 coins it made no more money (+5.1% vs +5.4%), while drawdown rose to 29.7%. That is past the 25% limit every other test uses.
- **30% came close.** It cut drawdown by 15–25% everywhere for about 20–25% less return. It failed only the stress-cost test in the one weak cell. If the owner prefers a smoother ride, that is a legitimate risk *preference*, but it is the owner's call, not a research result.
- **New finding, costs:** the vol-scaled weight changes a little almost every day. That means 1,100–2,000 small rebalances per coin group over two years, costing 6–8% of capital at 40%. A **no-trade band** (rebalance only when the target weight moves by more than, say, 0.1) could cut most of that without changing the strategy's exposure. Added to the backlog as #10.

> **Correction (2026-11-21, from H10):** the claim above that the 6–8% fees come mostly from small daily rebalances is wrong. A 0.10 rebalance band cut rebalances by about 60% but fees by only about 3%; most of the cost is full entries and exits. See `H10-band-results.md`. The original text is left unchanged above for the record.
