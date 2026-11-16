# H3 results: regime-matched shorts added to the trend rule

Pre-registration: `H3-shorts-preregistration.md` (commit 689ff83). Script: `scripts/paper/h3-shorts.ts` (includes a look-ahead check). Raw: `H3-shorts.json`. Run once.

## Verdict: FAILS all 7 gates. Rejected. The trend rule stays long-only.

| Cell | Long + short | E1 long-only | Short side alone |
|---|---|---|---|
| 5 coins, Dec 2022 → Nov 2024 | +54.2%, Sharpe 1.06, DD 22.3% | +79.7%, 1.58, 14.8% | **−14.2%** |
| 5 coins, Nov 2024 → Nov 2026 | −0.5%, 0.12, 25.0% | +25.2%, 0.67, 18.0% | **−20.5%** |
| 8 coins, Dec 2022 → Nov 2024 | +38.4%, 0.82, 16.8% | +34.6%, 0.87, 16.8% | +2.8% |
| 8 coins, Nov 2024 → Nov 2026 | −21.7%, −0.41, **40.9%** | +5.4%, 0.23, 21.9% | **−25.7%** |

Other results: at 0.25% per side −34.7% to +23.7%; neighbours 10/16 positive; better than E1 in 1/4; short side positive in 1/4.

## Reading it
- **Shorting lost even in the falling 2024–26 market**: −20.5% and −25.7% on the short side alone, while the coins fell 30–75%. The audit found the same in its first days: crypto down-trends have violent rebounds that hit short positions, and the 0.03%/day funding cost (about 11%/yr while short) keeps draining them.
- Shorts also raised drawdowns, to 40.9% in the worst cell.
- This is the third independent rejection of shorts (audit 2026-11-13, P1 breakout short, H3).
- The 4h paper test's winning shorts (4 of 4 so far) come from a single 3-day sell-off. Too few to count against this, and day 3 of the 1m test showed the same shorts losing in a bounce (25 shorts, 5 wins, −$38.84).
