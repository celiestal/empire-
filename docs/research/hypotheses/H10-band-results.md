# H10 results: 0.10 rebalance band. **FAIL (5 of 7 gates)**, but better than E1 in every cell

Pre-registration: `H10-band-preregistration.md` (commit f7e7475, written before the run). Script: `scripts/paper/h10-band.ts`. Raw output: `H10-band.json`. Run once on 2026-11-21.

## Results (costs 0.1% + 0.02% per side)

| Cell | Band 0.10: total / Sharpe / max DD / CAGR÷DD | E1: total / Sharpe / max DD / CAGR÷DD | Rebalances band / E1 | Fees band / E1 | At stress band / E1 | Neighbours (0.05 / 0.15 / 0.20) |
|---|---|---|---|---|---|---|
| 5 coins 2022–24 | +86.0% / 1.65 / 14.4% / 2.64 | +79.7% / 1.58 / 14.8% / 2.40 | 537 / 1,307 | 8.07% / 8.32% | +68.1% / +62.0% | 82.6, 88.3, 91.1 |
| 5 coins 2024–26 | +27.2% / 0.71 / 18.0% / 0.71 | +25.2% / 0.67 / 18.0% / 0.66 | 468 / 1,124 | 7.10% / 7.33% | +16.4% / +14.2% | 25.8, 25.8, 28.3 |
| 8 coins 2022–24 | +39.6% / 0.95 / 16.7% / 1.13 | +34.6% / 0.87 / 16.8% / 0.99 | 830 / 1,983 | 7.03% / 7.27% | +27.8% / +22.9% | 36.0, 40.8, 43.1 |
| 8 coins 2024–26 | +6.8% / 0.27 / 21.8% / 0.15 | +5.4% / 0.23 / 21.9% / 0.12 | 774 / 1,818 | 6.09% / 6.26% | **−1.0%** / −2.5% | 6.1, 8.5, 6.8 |

| Gate | Result |
|---|---|
| 1 Positive in all cells | pass |
| 2 Sharpe ≥ 0.5 in all cells | **fail** (0.27; E1 itself is 0.23, as flagged in the pre-registration) |
| 3 Positive at stress in all cells | **fail** (−1.0%; E1 is −2.5%) |
| 4 Max DD ≤ 25% | pass |
| 5 Neighbours ≥ 80% positive | pass (12/12) |
| 6 Better than E1 on return per DD in ≥ 3 of 4 | pass (**4/4**) |
| 7 Lower fees in all 4 cells | pass |

**Verdict by the written gates: FAIL.** Not adopted. The running paper experiment is unchanged.

## What actually happened (including a correction)
- **Correction to H6:** H6 said the 6–8% fees came mostly from "small daily rebalances". **That was wrong.** The band cut rebalances by about 60% but fees by only about 3% (0.2–0.25 points). Most of E1's cost comes from **full entries and exits** when the BTC gate or the 30-day trend flips, not from small adjustments. The H6 results file has a pointer to this correction.
- The band still improved return in every cell (+1.4 to +6.3 points), with the same or lower drawdown. Fees explain only a small part of that. The rest comes from the held weight lagging the target: positions are not trimmed when volatility rises briefly. That is a side effect, not the mechanism that was hypothesised. It was not predicted, so it is not evidence of a designed edge.
- The band is a **strict improvement over E1 in all 4 cells** (return, Sharpe, return per drawdown, stress result), but it fails the absolute gates 2 and 3. It inherits them from E1's weak 8-coin 2024–26 period.

## A structural point for the owner
Gates 2 and 3 are absolute. E1 itself does not meet them in the 8-coin 2024–26 cell (Sharpe 0.23, −2.5% at stress), so **no refinement of E1 can ever pass this gate set**, however much it improves E1. Deciding whether refinements should be judged against E1 (relative gates) instead is a change to the research rules. It is the owner's decision, and it may only apply to tests pre-registered after that decision, never retroactively to H10 or earlier.
