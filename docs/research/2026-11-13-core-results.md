# Results: crypto core rotation (video prompt 3, adapted)

Pre-registration: `2026-11-13-core-preregistration.md` (commit 03c1409, before this run). Script: `scripts/paper/core.ts`. Raw output: `2026-11-13-intelligence/core-study.json`.

## Verdict: FAILS (max drawdown on the test window 40.1% > 35% limit). Rejected; not re-tuned.

| Step | Result |
|---|---|
| 1. Engine (trend gap, training) | ETH 9.2 bp/day vs BTC 8.8 → **ETH** |
| 2. Safe asset (engine's down days, training) | PAXG +43.5% annualised on those days vs cash 0%, correlation 0.10 → **PAXG (gold)** |
| 3. Rule | Hold ETH while its prior close is above its 200-day average, else hold PAXG |
| 4. Neighbours (training 2022-10 → 2024-11) | 100d +97%, 150d +163%, 200d +189%, 250d +155%, EMA200 +142%, 50/200 cross +76%. **All positive** (Sharpe 0.82–1.32) |
| 5. Test (2024-11 → 2026-11, once) | **+14.6%** (7.0%/yr), Sharpe 0.38, **max DD 40.1%**, 15 switches, worst week −15.1% |

Test window comparisons:

| | Return | Sharpe | Max DD |
|---|---|---|---|
| Core, base costs | +14.6% | 0.38 | 40.1% |
| Core, double costs | +10.4% | 0.34 | 41.1% |
| Core, 0.25%/side | +9.4% | 0.33 | 41.3% |
| Core, 0.5%/side + 0.05% slip | +0.3% | 0.23 | 43.7% |
| Same rule with cash instead of gold | −6.0% | 0.13 | 41.9% |
| Buy and hold ETH | −37.9% | −0.01 | 67.6% |
| Market-filtered trend (comparison only, not independent) | +40.6% | 0.71 | 25.1% |

## What it teaches
- **Training → test decay was large:** Sharpe 1.32 → 0.38. A strong-looking training result with all neighbours positive still isn't enough; this is exactly why the locked test exists.
- **The 200-day average is too slow for crypto drawdowns.** It held ETH through a 40% fall before switching.
- **Gold as the safe asset did add value** (+14.6% vs −6.0% with cash). PAXG is a candidate "safe" leg for future rules, as a hypothesis only.
- The market-filtered trend rule (30-day trend + BTC gate, across 5 coins) did better on every measure in both windows. It remains the leading candidate for a core and still needs its untouched H2 test (E1).
