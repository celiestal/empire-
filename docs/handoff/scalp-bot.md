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
- Daily summaries: `docs/handoff/daily/`. Second session's regime detector + 2-year/4h research: branch `claude/scalp-bot-daily-summary-fxn5vn` (merge, don't rebuild).
- Live spreads: BTC/ETH ~0%, SOL/XRP/DOGE ~0.01% median; XRP p90 ~0.08% (above the 0.02% slippage assumption).
- 25 sleeves × $400 (5 methods × 5 coins), clock started 2026-11-13 05:17 UTC. Report due ~24h later.
- **Do not** connect real money or exchange keys without a separate explicit decision from the owner.

## 24h live result + v2 (2026-11-14)
**Live test v1** (25 sleeves × $400, 2026-11-13 05:17 → 2026-11-14 05:31 UTC, 24.2h):
- $10,004.16 (**+$4.16, +0.04%**). Coins over the same day: BTC -2.5%, ETH -1.5%, SOL -4.0%, XRP -1.6%, DOGE -1.4%.
- 23 closed trades, 12 wins. Fees $9.26 (more than double the profit). Worst sleeve drawdown 1.9%. No daily-limit or kill-switch triggers.
- By method: 15m pullback +$1.55 (7 trades), 5m VWAP -$0.01 (15), 1m VWAP +$1.66 (1), 60m breakout +$0.97 (2 open shorts), 60m dip-buy no trades.
- Spreads over 12 samples: BTC/ETH ~0%, SOL/XRP/DOGE ~0.01–0.02%. All within the 0.02% slippage assumption.

**Why** (each trade tagged by the 24h efficiency-ratio regime at entry):
- Entries in **down-trends lost**: 7 trades, 2 wins, -$8.26. Pullback shorts into a falling market were stopped out by bounces (3/3). VWAP dip-buys in a falling market kept catching falling knives.
- Entries in **ranges won**: 5 trades, 4 wins, +$6.44. Short reversals in chop also won (3/4, +$6.97). VWAP longs in chop lost (3/7, -$4.28).
- Losers were nearly all full stop-outs (-1.2R). Winners were targets or time exits (+0.6 to +1.8R). No trade lost to fees alone.
- Same-time clusters: signals fire on several coins at once (e.g. 15:20 ETH+SOL, 02:35 ETH+DOGE+XRP), because the coins move together. Real diversification is lower than 25 sleeves suggests.
- 24h and ~23 trades is far too small a sample to call it an edge.

**Change tested on fresh 30 days** (`SKIP=` in research.ts; `skipRegimes()` in regime.ts):
- Skipping only down-trends helped a little. Skipping **down + chop** (trade only in range/up) improved nearly every row out of sample and roughly halved the Monte Carlo drawdown:
  - 60m pullback: +0.58% → +1.19%/coin, PF 1.16 → 1.46
  - 60m dip-buy: +0.36% → +0.56%, PF 0.92 → 1.48 (69% win)
  - 60m VWAP: -1.36% → +0.22%, PF 0.55 → 1.57
  - 15m VWAP: -1.35% → +0.11%
  - 95th-percentile drawdown, 60m VWAP: 10.7% → 2.3%
  - The 60m rows stay positive at 0.25% fees.
- It still rests on small samples: 12–37 trades per row over 20 test days, 2/4 windows positive.
- 1m–5m methods barely trade any more on fresh data, because the cost filters block them. Scalping at retail fees is dropped.
- 4h, 2 years: breakout long+short with no down-trend entries came out +3.6%/coin (PF 1.24, 10/21 windows) vs +0.0% without the filter. Still fragile at 0.25% fees.

**Now running, three separate forward tests ($10,000 fake each):**
- `live` (v1, unchanged), to build a longer record.
- `LIVE=v2`: 15m VWAP and 60m dip-buy/pullback/VWAP, long+short, no entries in down or chop markets. 20 sleeves × $500, from 2026-11-14 05:46 UTC.
- `LIVE=4h`: 4h breakout long+short, no entries in down-trends. 5 × $2,000, from 2026-11-14 05:46 UTC (`WARMUP_DAYS=20`).
- Run any test with `LIVE=<name> NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/live.ts [loop]`.

**Next ideas** (not yet built): a portfolio cap on same-direction trades across coins (correlation); judge v2 against v1 after 1–2 weeks.
**Real money:** not ready. The bar is several weeks of clearly positive forward results across different market conditions.

**Restart commands** (cloud sandbox; each loop replays from its frozen start, so gaps don't change results):
- v1: `NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 setsid nohup npx tsx scripts/paper/live.ts loop >> .paper-data/live/loop.log 2>&1 < /dev/null & disown`
- v2: same, prefixed with `LIVE=v2`
- 4h: same, prefixed with `LIVE=4h WARMUP_DAYS=20`
- Scheduled in the original session: a keep-alive every 6h (:48), and the daily report + handoff summary at 06:13 UTC.

## Day 2 (2026-11-15) and v3
- The coins fell another 4–8% in 24h (11-14 → 11-15).
- **v1:** $9,972.14 (-0.28% since start). 93 trades, 38 wins. Fees $30. Worst pot drawdown 3.2%. 2 daily-loss stops hit.
  - 1m VWAP -$34 (32 trades, 9 wins) and 5m VWAP -$30 (42 trades, 17 wins).
  - 15m pullback +$15 and 60m breakout +$21 (shorts).
- **Why (last 24h):**
  - Entries in down-trends: 61 trades, 18 wins, -$58.56. Nearly all of it was VWAP dip-buy/snap-back scalps.
  - Chop and range entries: 9 trades, 8 wins, +$28.
  - Trend shorts (60m breakout, 15m pullback) made money in the fall.
  - All 40 stop-outs lost; all 22 targets won.
- **v2:** sat out the fall as designed. 1 trade (-$2.70), $9,997.30 (-0.03%).
- **4h:** no trades (it skips down-trends).
- **Fresh 30-day walk-forward** (coins -20% to -30%), 15m/60m, long+short:
  - **Regime switch** (trend methods only with the trend, reversion only in ranges): worse or neutral again. **Rejected** for the third time.
  - **v2 set** (skip down + chop): only 60m pullback is still positive (+1.38%/coin, PF 1.75). 15m VWAP -0.38%, 60m VWAP -1.05%, 60m dip-buy -0.01%. Reversion is weakening as the fall deepens.
  - **Trend following, no filter:** 60m breakout +1.08% (PF 1.34, 3/4 windows), 60m tsmom +0.98% (PF 1.13).
    Both survive 3× slippage, with Monte Carlo p95 drawdown 5.5–7.1%. 15m tsmom was +2.36% but had an 11.5% drawdown and failed 3× slippage, so it was left out.
- **New test v3** (`LIVE=v3 WARMUP_DAYS=20`): 60m breakout + 60m tsmom, long+short, no filter. 10 × $1,000, from 2026-11-15 06:21 UTC.
  - v1, v2 and 4h keep running unchanged.
  - Restart: `env NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 LIVE=v3 WARMUP_DAYS=20 setsid nohup npx tsx scripts/paper/live.ts loop >> .paper-data/live-v3/loop.log 2>&1 < /dev/null & disown`

## Day 3 (2026-11-16)
The market went sideways after the fall: in the last 24h, mostly range/chop, coins about -0.8% to +0.9%.

| Test | Since start | Last 24h |
|---|---|---|
| v1 | $9,957.79 (-0.42%), 105 trades, 42 wins | -$10.91 |
| v2 | $9,995.63 (-0.04%), 1 closed trade | 6 open (4 × 60m pullback shorts, 2 × 60m VWAP longs) |
| 4h | $10,000 | no signal yet |
| v3 | $9,978.55 (-0.21%), 4 closed trades | all 4 lost |

v1 details:
- Last 24h: 15m pullback shorts 0/5 (-$11.66); 5m VWAP in range +$1.50; 60m dip-buy +$1.80.
- Fees since start: $33.54.

v3 detail: the 60m tsmom shorts were opened as the fall ended and were stopped out as price went sideways.

**Why:** trend methods won during the fall (day 2) and lost when it stalled (day 3). Reversion did the opposite. Over 3 days no single method wins in every market state, which is the textbook pattern.
**No change:** one day isn't evidence. The question for the coming weeks is whether v2's state filter or v3's trend following comes out ahead over a full mix of market states.

## Day 4 (2026-11-17)
Sideways market all day (range 18–22 of 23 hours on every coin), drifting slightly up.

| Test | Since start | Last 24h |
|---|---|---|
| v1 | $9,954.36 (-0.46%), 121 trades | -$4.48 |
| v2 | $9,999.93 (≈0.00%), 10 trades, 8 wins | +$7.73 |
| 4h | $10,000 | no signal yet |
| v3 | $9,964.16 (-0.36%), 6 trades, 0 wins | -$10.89 |

Last-24h detail:
- v1: 15m pullback shorts 0/6 in range (-$14.32); 5m VWAP 5/6 shorts won (+$11.30).
- v2: 15m VWAP 8 for 8 in range (+$8.36).
- v3: 60m breakout longs stopped out in chop (-$10.89).

**Pattern after 4 days:**
- Reversion (VWAP) wins in sideways markets and loses in steady falls.
- Trend methods win in steady falls and lose in sideways markets.
- v2's filter (no entries in down or chop) has avoided the worst of both and is the best test so far: about flat while the coins fell 3–6% over its life.
- Still only 4 days. No changes.
