# Handoff: Scalping bot (paper trading)

Started 2026-11-13. Fake money only: no exchange keys, no real orders.

## What it is
- `lib/paper/scalp/`: indicators, 4 methods (dip-buy Bollinger+RSI, breakout, trend pullback, VWAP snap-back),
  each long or long+short, plus a pessimistic fill simulator with risk controls
  (0.5% risk per trade, no leverage, fee/slippage filters, 2% daily loss stop, cool-down after 3 losses, 10% kill switch).
- `scripts/paper/download.ts`: 30 days of 1-minute Crypto.com candles into `.paper-data/` (not committed).
- `scripts/paper/research.ts`: walk-forward test (tune on 10 days across all 5 coins, trade the next 5 days), plus stress tests.
- `scripts/paper/live.ts`: forward paper test on live prices. `freeze` locks settings into `lib/paper/scalp/live-config.json`;
  `loop` runs every minute; no argument = one pass + report. Results replay from the frozen start time, so restarts don't change them.
- In the cloud sandbox run with `NODE_USE_ENV_PROXY=1` (the `empire-` environment allows api.crypto.com).

## Findings so far (30 days to 2026-11-13, a falling market: coins -15% to -24%)
- No method showed a reliable edge out of sample. Best were roughly break-even (profit factor 0.92–1.05).
- 1-minute scalping at 0.1% fees is structurally a loser: fees + slippage are bigger than a typical 1-minute stop.
- The cost filters were the biggest improvement: they cut out-of-sample losses from about -10–20% to about 0–2% per coin.

## Regime detector (tested 2026-11-13, not adopted)
- `lib/paper/scalp/regime.ts`: labels each candle up-trend / down-trend / range / chop with an hourly efficiency ratio
  (net move ÷ total hour-to-hour travel over 12–24h). Trend methods trade only with the trend, dip-buy and VWAP only in ranges, nothing in chop.
- `research.ts` now also splits every method's out-of-sample P&L by the regime at entry. `SWITCH=1` searches the detector
  settings; `RG=24,0.3,0.15` forces one setting on. Use `TFS=5,15,60` with `SWITCH=1` (the 1m grid runs out of memory).
- Time in each regime over the last 20 days: range 39–44%, chop 28–36%, down 16–22%, up only 3–11%.
- Where losses came from: most out-of-sample losses were trades opened during down-trends. Even the shorts lost there:
  the falls were jerky, so sharp bounces hit the stops. Mean-reversion and pullback trades in ranges were the only steady small winners.
- Result: with the walk-forward free to switch it on or off, out-of-sample results were the same or slightly worse
  (e.g. 15m pullback -0.34% → -0.59%). Forced on, it helped some methods (15m VWAP -1.12% → -0.02%, 60m pullback -1.99% → -0.01%)
  and hurt others (15m pullback → -1.37%, 60m breakout → -0.51%). It mostly cuts trades. It doesn't create an edge, so the live test is unchanged.
- Worth retrying once the market has had a real up-trend or a long range; 20 days with almost no up-trend can't test the trend half.

## Longer history: 2 years of hourly prices, trend following, shorts (tested 2026-11-13)
- Owner's direction (2026-11-13): shorting is fine. The bot should read the market and pick the method itself, following what trading research teaches.
- What the research says: time-series momentum / trend following on longer bars (hours to days) has the most support in crypto,
  long side stronger than short side. Intraday time-of-day effects don't persist, and ML intraday models usually fail out of sample.
  The standard safeguard is strict walk-forward testing with costs.
- New method `tsmom` (trend following) in `lib/paper/scalp/strategies.ts`. Shorts come from the existing mirror logic (`mode: both`).
- `download.ts 730 "" 1h` gets 2 years of hourly candles. `research.ts` takes `BASE=60` (hourly files), `TRAIN_DAYS`, `TEST_DAYS`, `MIN_TRAIN_TRADES`, `STRATS`.
  Run used: `BASE=60 TFS=60,240 TRAIN_DAYS=90 TEST_DAYS=30` (tune 90 days, trade the next 30, 21 windows from Feb 2025 to Nov 2026).
- Out of sample, the coins fell 30% (BTC) to 76% (DOGE). Results per coin, summed over 21 months, at 0.5% risk per trade:
  - 1h: every method lost (-1.7% to -30%). Costs still too big at 1h.
  - **4h breakout, long only: +3.1%** (PF 1.20, 10/21 windows up). All its profit came in up-trends. It fails at 0.25% fees (-1.3%) and without its best 10% of trades (-3.0%).
  - **4h breakout, long + short: +2.3%**. 4h trend following, long + short: +0.8%, with shorts making money in down-trends and longs losing in up-trends.
  - 4h dip-buy, VWAP, pullback: -2% to -7%.
  - Daily bars: too few trades to judge (23–98 in 18 months).
- Takeaway: slower is better. 4h breakout and trend following are the first methods to come out slightly ahead over 2 years in a falling market,
  but the edge is thin and fragile (fees, a few big trades). Not proven. Next step: forward paper test the 4h set alongside the current one.

## Live test
- 25 sleeves × $400 (5 methods × 5 coins), clock started 2026-11-13 05:17 UTC. Report due ~24h later.
- **Do not** connect real money or exchange keys without a separate explicit decision from the owner.

## 2026-11-13 (afternoon): audit, hardened research, P1 test, separate 4h paper experiment
Approved by the owner ("yes i agree to everything") after the audit in `docs/research/2026-11-13-strategy-audit.md`.
- **Audit:** no proven edge. The 4h results swing with the walk-forward start date; monthly re-tuning fits noise; fixed targets cut winners short. The only cross-period pattern is "longs work when BTC trends up". Fees decide everything (owner's real fee tier still unknown).
- **New data:** Crypto.com hourly history back to Jul 2021, used once as holdout H1 (Sep 2021 to Nov 2024). **H2 = ADA, LINK, AVAX, LTC, DOT, XLM, NEAR, BCH is reserved: never use it for tuning or exploration.**
- **Engine:** optional `onEvent` audit log and optional `trailDist` trailing stop. Both are off by default; `research.ts` output was verified unchanged.
- **Hardened research:** `lib/paper/scalp/evaluate.ts` + `scripts/paper/robust.ts` (`wf` / `fixed`). Provides continuous out-of-sample runs, 5 start offsets, a random-entry benchmark, pooled t, portfolio Sharpe/Sortino and written gates. Legacy mode reproduces `research.ts` exactly. Data: `.paper-data/hist/<MKT>_1h.json`.
- **P1 (pre-registered, `docs/research/2026-11-13-p1-*.md`):** trailing exit and BTC gate on breakout long. **All 4 variants failed the gates**. trail+gate was best on every measure but just short (t 1.96, cost stress negative on H1). Not promoted; H2 unused. Don't re-tune these on the same data.
- **Retired from development (owner agreed):** 1m/5m VWAP, all 1h methods, 4h reversion methods, `tsmom` as implemented, breakout short alone, the per-coin volatility and ER-regime filters. The 1m live test keeps running unchanged.
- **4h paper experiment `exp-4h-2026-11`:** config `lib/paper/scalp/live-4h-config.json` (frozen with `scripts/paper/freeze-4h.ts`, refuses to overwrite). Clock starts 2026-11-13 16:00 UTC.
  - 3 configurations × 5 coins × $666.67: breakout long, breakout long+short, tsmom long+short. Plus a random-entry shadow baseline (not counted).
  - Hourly feed, 60-day warm-up. Fee scenarios 0.25% and 0.5% reported alongside the 0.1% default.
  - Full event log (signals, orders, fills, exits, rejections with reasons).
  - Data in `.paper-data/live-4h/`; committed report `docs/research/exp-4h-2026-11/status.json`.
  - Run it with `NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/live.ts --config lib/paper/scalp/live-4h-config.json`. Deterministic replay, so it needs no long-running loop: a scheduled task runs one pass after each 4h close.
  - Verified: the live replay matches the research harness trade for trade (15 sleeves, 315 trades since 2026-06-01). The 1m test's output is byte-identical after the refactor (`lib/paper/scalp/live-core.ts`).
- **Expectations:** about 10 trades a month per configuration. Paper trading checks execution and catches failure; proving a thin edge statistically would take years.
