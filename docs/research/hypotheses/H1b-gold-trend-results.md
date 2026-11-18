# H1b results: gold for idle money only in gold's own up-trend. **PASS (6 of 6 gates) → bench**

Pre-registration: `H1b-gold-trend-preregistration.md` (commit 4ebd31e, written before the run). Script: `scripts/paper/h1b-gold-trend.ts`. Raw output: `H1b-gold-trend.json`. Run once on 2026-11-18.

The first attempt stopped inside the look-ahead guard, before any result was computed: the guard sampled day 1600, but the PAXG daily series has only about 1,494 days (it starts 2022-10-11). The guard's sample days were changed to 200/600/1000/1400 and nothing else. The guard then passed.

## Results (costs 0.1% + 0.02% per side)

| Cell | H1b: total / Sharpe / max DD / CAGR÷DD | E1 (cash): total / Sharpe / max DD / CAGR÷DD | Gold's share of H1b's return | H1b at stress | Neighbours |
|---|---|---|---|---|---|
| 5 coins 2022-12 → 2024-11 | +89.6% / 1.65 / 14.9% / 2.64 | +79.7% / 1.58 / 14.8% / 2.40 | +11.6 pts | +58.6% | 86.8, 86.8, 86.7, 92.4 |
| 5 coins 2024-11 → 2026-11 | +52.6% / 1.07 / 14.1% / 1.67 | +25.2% / 0.67 / 18.0% / 0.66 | +25.4 pts | +31.4% | 53.1, 53.9, 44.1, 61.3 |
| 8 coins 2022-12 → 2024-11 | +41.1% / 0.95 / 20.1% / 0.98 | +34.6% / 0.87 / 16.8% / 0.99 | +10.9 pts | +19.8% | 38.3, 39.9, 39.2, 42.9 |
| 8 coins 2024-11 → 2026-11 | +28.5% / 0.70 / 16.6% / 0.80 | +5.4% / 0.23 / 21.9% / 0.12 | +25.5 pts | +12.0% | 31.8, 32.0, 21.3, 35.8 |

| Gate | Result |
|---|---|
| Positive in all 4 cells | pass |
| Sharpe ≥ 0.5 in all cells | pass (lowest 0.70) |
| Positive at stress cost | pass (lowest +12.0%) |
| Max DD ≤ 25% | pass (highest 20.1%; H1 was 26.6% / 29.3%) |
| Neighbours ≥ 80% positive | pass (16/16) |
| Better than E1 on return per drawdown in ≥ 3 of 4 cells | pass (3/4; the 8-coin 2022–24 cell was 0.98 vs 0.99) |

## Average daily return (backtest, development data)
- **0.04–0.10% a day**, against E1's 0.01–0.07% in the same cells.
- In the weakest recent cell (8 coins 2024–26), H1b made +28.5% where E1 made +5.4%.

## Caveats (why this is "bench", not "validated")
1. **Gold had a bull market in every test window:** PAXG +42% in w1 and +52% in w2. Gold contributed 11–26 points of return. The trend filter should keep gold out of a falling gold market, but there is **no gold bear market in the data** (PAXG history starts Oct 2022), so that claim is untested.
2. **Development data only.** Both coin groups have been used before (E1 used the 8 coins as its holdout). There is no untouched history left for a locked test.
3. **The return-per-drawdown gate passed by the minimum** (3/4, one cell lost by 0.01).
4. PAXG trades on Crypto.com, but its spread and depth were not checked. The costs assume it trades like the other coins.

## Next step
Per the house rules, a pass goes on the **bench**. The only honest remaining test is **forward paper trading** (untouched future data). Starting that needs the owner's OK. The proposal would be a new experiment id, `exp-trend-gold-2026-11`, running alongside the unchanged E1 paper test so the two can be compared on the same days.
