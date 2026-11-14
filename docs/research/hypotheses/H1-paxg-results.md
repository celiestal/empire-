# H1 results: PAXG instead of cash in the trend rule

Pre-registration: `H1-paxg-preregistration.md` (commit ce734ca). Script: `scripts/paper/h1-paxg.ts`. Raw: `H1-paxg.json`. Run once.

## Verdict: FAILS gate 4 (max drawdown ≤ 25%): 26.6% (5 coins, 2024–26) and 29.3% (8 coins, 2024–26). Rejected.

| Cell | Gold: return / Sharpe / max DD | Cash (E1 rule): return / Sharpe / max DD |
|---|---|---|
| 5 coins, Dec 2022 → Nov 2024 | +136.9% / 1.93 / 16.9% | +79.7% / 1.58 / 14.8% |
| 5 coins, Nov 2024 → Nov 2026 | +98.1% / 1.27 / **26.6%** | +25.2% / 0.67 / 18.0% |
| 8 coins, Dec 2022 → Nov 2024 | +74.9% / 1.30 / 22.8% | +34.6% / 0.87 / 16.8% |
| 8 coins, Nov 2024 → Nov 2026 | +68.2% / 1.01 / **29.3%** | +5.4% / 0.23 / 21.9% |

Every other gate passed: positive at 0.25%/side (+43.8% to +92.4%), all 16 neighbours positive, and better return-per-drawdown than cash in 4/4 cells.

## Reading it
- **The improvement is mostly gold's own bull market**, not a crypto edge. PAXG rose strongly over 2023–26, so holding it while out of crypto earned its trend. This would reverse in a falling gold market, and those years aren't in the data.
- Gold also added risk: drawdowns rose 2–7 points in every cell, which is why it failed.
- Per protocol it is not re-tuned. A *different* hypothesis (a smaller gold share, or gold only while gold is itself in an up-trend) is added to the backlog as H1b and must be pre-registered on its own.
