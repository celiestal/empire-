# Daily research routine (2026-11-14 → 2026-11-27)

The owner asked: "test every day for two weeks, check why each test won or lost, keep looking for the most profitable and best strategy, take inspiration from the video." This file is the routine's instructions. Each day runs in a fresh session, so everything needed is here and in `CLAUDE.md`.

## Ground rules (from CLAUDE.md, repeated because they matter most)
- Fake money only. Never touch exchange keys, real orders or `.env` files.
- Never edit frozen experiment configs:
  - `lib/paper/scalp/live-config.json` (1m test, another session's)
  - `lib/paper/scalp/live-4h-config.json` (`exp-4h-2026-11`)
  - `lib/paper/trend/exp-trend-daily-config.json` (`exp-trend-daily-2026-11`)
- **Re-testing the same history over and over is overfitting, not progress.** Real new evidence comes only from new days of data (paper) and from pre-registered tests.
  - H2 is used up (E1). Don't use any coin outside the 13 researched ones without the owner.
- A loss is not a defect. Call something a defect only if it recurs with statistical support across many trades.

## Every day
1. `git pull` on `claude/practical-bell-772nzp`; `npm ci` if `node_modules` is missing.
2. **Passes:**
   - `NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/trend-live.ts`
   - `NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/live.ts --config lib/paper/scalp/live-4h-config.json`
   - `NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/live.ts` (1m test; read only, don't commit its files)
3. **Why each trade won or lost.** For every trade or weight change closed since the last report, using the event logs and candles, record:
   - market state at entry (BTC gate, coin trend, volatility tercile, regime label)
   - exit reason, how far price moved for and against the trade, holding time, fees as a share of the trade's P&L
   - one plain-English reason, sorted into: right regime / wrong regime / stopped by noise / gave back profit / costs / data issue.
4. **Running scoreboard:** for each experiment, the return since start, **average daily return**, max drawdown, health versus kill line, random baseline and buy-and-hold. Compare with what the backtest expected.
5. **One research test** from `docs/research/hypotheses.md` (top open item):
   - first commit a pre-registration (exact rule + gates)
   - then run it on development data (5 coins and 8 coins, both periods) with `scripts/paper/robust.ts` or a small script
   - record pass/fail in the hypothesis file. Never re-run a failed test with tweaks; a tweak is a new hypothesis.
   - Anything that passes goes on the **bench** (listed in the report). Starting a *new* paper experiment needs the owner's OK.
6. **Write `docs/research/daily/<YYYY-MM-DD>.md`:**
   - what the market did; how each experiment did; best and worst trades and why
   - mistakes found (only with evidence); today's research test and result
   - the current best strategy and its average daily return (labelled "paper", "backtest" or "holdout", never mixed)
   - recommendations
7. **Refresh the dashboard** "Paper Trading Desk" (https://claude.ai/artifact/KNpiWEphUDnAqC3GAfZYCk):
   - run `npx tsx scripts/paper/dashboard-data.ts` (after the 1m replay in step 2)
   - upload each of `.paper-data/dash/{experiments,trades,trade-prices,e1-curve}.json` with the Artifact tool (`url` above, `asset: true`)
   - for datasets `experiments`, `trades`, `tradePrices` and `e1curve`, `update` the dataset with the new `source.url`, plus `updated: {at, by: "Claude (daily research run)"}` and `edit: {via: "claude", at}`, pinned to the version you read
   - delete the replaced old asset once nothing names it. The live Bitcoin chart (dataset `btc4h`) needs nothing.
8. Commit (report, hypothesis file, experiment status files) and push. Finish with a short summary.
9. If today's date is after 2026-11-27, write a two-week summary instead, then disable this routine's scheduled task.
