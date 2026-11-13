# Pre-registration: crypto "core" rotation (the video's prompt 3, adapted)

Written and committed **before** running. Results go in `2026-11-13-core-results.md`. Fake money only.

## Rule (daily bars, UTC 00:00 close; decide at a close, trade at the next bar's open)
1. **Engine:** from `engineCandidates` (BTC_USD, ETH_USD), pick the one with the biggest **trend gap** on the training window.
   - Trend gap = mean next-day return when yesterday's close was above its 200-day simple average, minus the same when it was below.
2. **Safe asset:** from `safeCandidates` (CASH = 0% return, PAXG_USD = tokenised gold).
   - Pick the one with the best mean daily return on the engine's below-average days in training.
   - It must beat cash, and its daily-return correlation with the engine in training must be below 0.5. Otherwise use cash.
3. **Switch:** hold the engine while its prior close is above its 200-day simple average; otherwise hold the safe asset.
   - Every switch pays a fee and slippage on both legs (sell one, buy the other).
   - Fully invested in one of the two (no leverage, no margin).
4. **Neighbours (training window):** 100-, 150- and 250-day simple averages, a 200-day exponential average, and the 50-day crossing the 200-day must **all** make money after costs.
5. **Test window, run once:** 2024-11-13 → 2026-11-13.
   - Honesty note: this period has been examined before for *other* rules, so it isn't untouched in the strict sense. This 200-day rule comes from outside (the video and standard practice) and is not tuned on it.

Training window: 2022-10-11 (first PAXG data) → 2024-11-13. Costs: base 0.1% + 0.02% per side. Also reported at 0.25% and at 0.5% + 0.05%, and at double base costs.

## Pass criteria (all required)
- Test-window return > 0 after base costs.
- Test-window return/max-drawdown better than buy-and-hold of the engine.
- Test-window max drawdown ≤ 35%.
- All five neighbours positive on training.
- Still positive on the test window at 0.25% per side.

If it passes, it becomes a **candidate** for an isolated daily paper experiment (owner approval needed). If it fails, it is rejected and not re-tuned.
Reported alongside for comparison only (no pass/fail): the market-filtered trend rule from the morning's audit, on the same windows.
