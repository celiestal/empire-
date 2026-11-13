# Trading strategy audit: 2026-11-13

Fake money only. No code in `lib/` or `scripts/` was changed. The live test and its config were not touched.
Evidence scripts and raw outputs are in `docs/research/2026-11-13-audit/`. The scripts have absolute paths from the session sandbox, so adjust them before rerunning.

## 0. What was checked, and how

- I read `CLAUDE_HANDOFF.md`, `docs/handoff/scalp-bot.md`, the daily summary, all of `lib/paper/scalp/*`, and `scripts/paper/*`.
- `claude/determined-franklin-v7q3kf` has no commits that `claude/scalp-bot-daily-summary-fxn5vn` lacks, so the branch merge was a no-op. Tests: 58 passed, 1 skipped. `tsc` is clean.
- I wrote a diagnostic harness (`audit/diag.mts`) that **re-implements the walk-forward from `research.ts` exactly**: the same grids, REGIMES 0/12/48, a 90-day tune and 30-day trade, the score `ret − 0.5·DD`, at least 15 training trades, and the same simulator. It reproduces `research.ts` to the second decimal on identical data. It adds:
  - a breakdown of every out-of-sample trade (coin, side, regime, BTC trend, volatility tercile, exit reason, holding time, fees)
  - how far price moved for and against each trade, before and after the exit
  - a **random-entry benchmark**: the same windows, the same tuned stop/target/hold, the same signal density and the same long/short mix, but random entry bars, run over 200 seeds
  - a parameter plateau: every grid point held fixed
  - cost sensitivity, re-tuning at each cost level
  - portfolio Sharpe, Sortino and max drawdown
  - positions still open at a window's end are closed at the last price (paying exit fee and slippage), so trade statistics match equity.
- **Window-alignment test:** I ran the same procedure with start dates shifted by 5 hours and by 3 days.
- **Holdout H1 (new, never used for tuning):** Crypto.com hourly history goes back to Jul 2021 (SOL from Aug 2021). I ran the *unchanged* 4h strategies once on Sep 2021 → 13 Nov 2024, with three start offsets.
  - The period includes the 2021 top, the 2022 crash and the 2023–24 recovery. Buy & hold over its out-of-sample span: BTC +51%, ETH −28%, SOL 0%, XRP −33%, DOGE +73%.
- **Holdout H2 (reserved, not looked at):** ADA, LINK, AVAX, LTC, DOT, XLM, NEAR and BCH on Crypto.com. These are kept as the final out-of-universe test for any future candidate.

## 1. Headline findings

1. **No configuration has a demonstrated edge.** The best lead, 4h breakout long, made money in all 6 runs: 3 alignments × 2 periods, +0.9% to +5.6% per coin. That makes it the first method to survive an independent period. But:
   - its pooled t-statistic is about 1.9, before correcting for the ~20 configurations searched
   - its entries rank at the 93rd and 72nd percentiles of *random* long entries with the same exits
   - most of what it earns looks like **controlled long exposure while BTC is trending up**, not good entry timing.
2. **The reported results depend on arbitrary window alignment.** On the research period, moving the walk-forward start by 5 hours changes breakout long+short from +2.26% to −0.16%. Moving it 3 days changes breakout long from +3.07% to +0.89%, and tsmom long from −1.33% to −6.37%. Any single number from `research.ts` is therefore one draw from a wide distribution.
3. **Monthly re-tuning fits noise.** Breakout long picked 14 different settings in 21 windows, and 27 in 35 on H1. A typical *fixed* setting (median of the grid) earns about +1% per coin in both periods, with about 70% of settings positive. Re-tuning adds variance, not return.
4. **Fixed profit targets cut winners short.** In both periods, after a target exit price went on to a median of **4.7–5.9R** from entry within 30 bars, and about 60% of target exits ran at least 2R further. Breakout and trend strategies earn their money from the right tail, and the current exits cap it.
5. **The one pattern that repeats across periods is BTC trend.** Long trades taken while BTC was above a rising 7-day EMA (4h bars):

   | | Research period, BTC up | Research period, otherwise | H1, BTC up | H1, otherwise |
   |---|---|---|---|---|
   | Breakout long | +4.66% (187 trades) | −1.65% (22) | +6.34% (303) | −2.10% (49) |
   | tsmom long | +1.38% (241) | −2.87% (115) | +9.89% (378) | −3.58% (202) |

   The coin, volatility-tercile and ER-regime splits all flip sign between periods.
6. **Costs decide everything.**
   - At 0.1% per side, fees are 39–55% of gross profit for breakout.
   - Breakout long turns negative at 0.2–0.25% per side in both periods. Raising slippage to 0.1% cuts it to +0.8% / +1.6%.
   - **Your actual Crypto.com fee tier is unknown.** Third-party sources disagree, from 0.075% to 0.25% maker / 0.50% taker at the entry tier. At 0.5% taker, every strategy here loses money.
7. **`tsmom` as implemented does not work.**
   - Long+short: −4.0% to +7.2% across runs, which is noise.
   - Long only: +6.5% to +8.3% on H1 (a mixed or up market) but −6.4% to +0.1% on the research period (a bear market). That's market exposure, not edge: it ranks at the 35th–44th percentile of random entries.
   - It fires on almost every bar of a trend, so it re-enters straight after each stop. It also uses fixed 3–6R targets and 4–12-day time exits, which isn't how trend following is meant to work.
8. **Shorts are unreliable and under-costed.**
   - Breakout short ranks at the **1st** percentile of random shorts in the research period, worse than shorting at random during a crash, but at the 93rd percentile on H1.
   - Adding shorts to breakout made long+short worse than long only in 4 of 6 runs.
   - The simulator has no borrow or funding cost for shorts.
9. **The ER regime detector is redundant for breakout.** 99% of breakout-long trades already happen in the "up" regime, because a breakout *is* an up move. That explains why forcing the detector on didn't help.

## 2. Why the live paper bot "isn't performing"

- **It's one hour old.** At 06:12 UTC: 1 closed trade (5m VWAP, −$2.60), 1 open, equity $9,997.40. No conclusion is possible.
- **Few trades are intentional.** Over the last 28 days with the frozen settings:

  | Sleeve (5 coins) | Signals/day/coin | Rejected by cost filter | Trades/day | Gross P&L | Fees | Net |
  |---|---|---|---|---|---|---|
  | 1m VWAP | 121 | 99% | 1.1 | +$5.87 | $10.15 | −$4.28 |
  | 5m VWAP | 26 | 85% | 4.1 | +$30.65 | $40.10 | −$3.08 |
  | 15m pullback | 4.1 | 74% | 1.9 | +$27.80 | $18.44 | +$8.83 |
  | 60m meanrev | 0.65 | 22% | 1.1 | +$17.33 | $10.18 | +$7.15 |
  | 60m breakout | 0.71 | 4% | 1.8 | −$25.55 | $13.63 | −$28.25 |

  That's about 10 trades a day across all 25 sleeves. The settings were tuned on the last 10 days of this period, so these P&L figures flatter the sleeves. Even so, the 1m and 5m sleeves pay more in fees than they make before fees.
- **What is not the problem:**
  - data: 0 missing 1-minute candles in 30 days, so no resampled bars are dropped
  - backtest/live mismatch: `live.ts` replays the same `simulate()` on closed candles
  - risk limits: the daily stop and kill switch rarely trigger at 0.5% risk per trade
- **The real bottlenecks, in order:**
  1. no entry edge: entries do about as well as random entries with the same exits
  2. costs comparable to the edge
  3. exits that cap winners
  4. research that can't tell signal from noise (alignment sensitivity, re-tuning, best-of-many selection)
  5. shorts modelled too kindly

  More trades would make results worse.

## 3. Assessment table (4h, out-of-sample % per coin, summed; 0.5% risk per trade)

| Config | Research period (3 alignments) | H1 2021–24 (3 alignments) | vs random entries (research / H1 percentile) | Verdict |
|---|---|---|---|---|
| Breakout long | +2.32 / +3.07 / +0.89 | +4.35 / +5.58 / +2.26 | 93 / 72 | Best lead; unproven entry edge. Develop: exits + BTC gate. |
| Breakout long+short | −0.16 / +2.26 / +0.77 | −2.24 / +1.37 / +3.02 | 84 / 71 | Shorts add variance. Keep only as a control. |
| Breakout short | +2.84 / +2.22 / — | +4.66 / +5.09 / +3.36 | 1 / 93 | Inconsistent, under-costed. Don't develop. |
| tsmom long+short | +1.48 / +0.79 / −1.26 | −3.98 / +1.63 / +7.19 | 40 / 68 | Noise. Retire this implementation. |
| tsmom long | +0.13 / −1.33 / −6.37 | +6.50 / +6.52 / +8.30 | 35 / 44 | Pure market exposure. Rebuild as proper slow trend following. |
| tsmom short | −1.87 / −2.25 / — | +1.19 / +3.62 / +1.51 | 0 / 98 | Noise. Retire. |

Breakout long in detail:

| Period | Win rate | Avg win / loss (R) | Expected R per trade | t | Annual return | Sharpe | Sortino | Max DD |
|---|---|---|---|---|---|---|---|---|
| Research period | 36% | +2.30 / −1.09 | +0.14 | 1.2 | 1.7% | 0.65 | 1.44 | 3.6% |
| H1 | 40% | +1.90 / −1.05 | +0.12 | 1.5 | 1.5% | 0.73 | 1.22 | 2.6% |

It makes about 2 trades per coin per month. Remove the best 10% of trades and it goes negative (−3.2% / −6.3%). **That test on its own shouldn't disqualify a trend or breakout strategy**: their returns depend on a few large winners by nature. What should be required instead is that profit isn't concentrated in one coin or one window.

## 4. Five biggest opportunities

| # | Opportunity | Expected benefit | Risks | Testing | Components |
|---|---|---|---|---|---|
| 1 | **Fix the measurement first**: continuous out-of-sample simulation (no account reset each window), results over ≥5 start offsets, a random-entry benchmark, pooled t / bootstrap, fixed small grids instead of monthly re-tuning, locked H2 holdout | Stops us chasing noise. Every later decision depends on it. | Some current "leads" will look worse. | Must reproduce today's numbers when set to the old settings (regression test). | `scripts/paper/research.ts`, new `lib/paper/scalp/evaluate.ts`, tests |
| 2 | **Trailing exits for breakout** (ATR trailing stop, no fixed target; one setting k ∈ {2,3,4}, chosen in advance) | Captures the 4.7–5.9R moves that currently go to waste. This is the main payoff mechanism of breakout trading. | Gives back open profit; lower win rate. | Development data (research period + H1) with offsets, then H2 once. | `engine.ts` (add optional trailing stop, default off so current results are unchanged), `strategies.ts` |
| 3 | **BTC-trend gate for longs** (trade longs only when BTC is above a rising 7-day EMA) | Removes the long trades that lost in both periods. "Sometimes the best trade is no trade." | It was found by slicing results, so it could be chance. Fewer trades. | Fixed rule, no tuning. Development data, then H2 once. | `strategies.ts`/`regime.ts` (cross-asset input), research harness |
| 4 | **Cut costs**: confirm your real fee tier; test limit (maker) entries at the breakout level; trade fewer, larger moves; prefer the most liquid books | Each 0.05% per side ≈ 0.5–1.5% per coin over 2 years for breakout. At 0.5% taker this is the difference between viable and not. | Limit orders sometimes don't fill (the move leaves without us). | Model missed fills pessimistically. | `engine.ts` (limit-entry fill model), config |
| 5 | **Replace `tsmom` with standard slow trend following**: long/flat (shorts later), a 2–8-week look-back, sized to target volatility, rebalanced daily or every 4h, a wide trailing exit, no fixed target | This is the form with the most published support. It complements breakout as a slower, steadier exposure. | It is mostly market exposure. In a long bear market it sits in cash, which is fine. | Same protocol. Compare against buy & hold and the BTC gate alone. | New strategy plus a portfolio-level sizing helper |

## 5. Keep / retire

- **Develop:** 4h breakout long (exits + BTC gate); rebuilt slow trend following (long/flat); the BTC gate as a shared filter.
- **Retire (recommendation; not changed without your approval):**
  - 1m and 5m VWAP: fees exceed gross profit
  - all 1h methods (lost over 2 years)
  - 4h dip-buy / VWAP / pullback (−2% to −7%)
  - `tsmom` as implemented
  - breakout short as its own strategy
  - the per-coin volatility and ER-regime filters (they flip sign between periods)
- The **live 1m test** consists almost entirely of retirement candidates. It costs nothing, so letting it run to its planned report is fine: it measures execution and spreads. Don't expect it to show an edge. Stopping or changing it is your call.

## 6. Research protocol from now on (proposed)

- **Data roles:**
  - development = 5 coins, Jul 2021 → Nov 2026 (both periods, now both seen)
  - **final holdout = H2 coins**, used once per candidate
  - then forward paper trading
- **Promotion gates (explicit, no AI self-certification):**
  1. *Development:* positive in ≥ 80% of 5 start offsets in **both** periods; pooled t ≥ 2; ≥ 90th percentile of the random-entry benchmark; still positive at 0.2% fee and 0.05% slippage; no single coin > 50% of profit; Sharpe ≥ 0.5.
  2. *H2 holdout:* positive in aggregate and on the majority of H2 coins, with no re-tuning.
  3. *Paper:* runs in its own experiment until at least 30 trades per configuration. Results must fall inside the backtest's 5–95% range; gross failure (outside the range or a drawdown above the Monte-Carlo p95) means demote.
- **What paper trading can and can't prove:** an edge of +0.13R per trade with a spread of about 1.6R needs about 600 trades to reach t = 2. At about 10 trades a month (4h breakout, 5 coins) that's years. Paper trading checks that execution matches the backtest and catches failure. It cannot statistically prove a thin edge within months. This is a key reason not to rush to real money.

## 7. Strategy selection and allocation (proposed, deliberately simple)

1. **Registry**: each strategy configuration has an id, a status (`research → candidate → paper → retired`), its gate results and its backtest distribution. Only `paper` strategies get fake capital. Nothing gets real capital.
2. **Allocation**: equal *risk* per qualifying strategy, scaled down by realised volatility. Strategies with negative or unproven expected return get zero.
3. **Correlation guard**: the 5 coins move together (they are effectively one bet in a selloff). Cap the total open long risk and the risk per coin across *all* sleeves, and allow only one entry per coin per bar across correlated strategies.
4. **Deterioration**: a rolling expected-R per trade, shrunk toward zero, with demotion if its lower bound falls below the backtest's 5th percentile, or if drawdown exceeds 1.5× the Monte-Carlo p95.
5. **Kill rules stay as they are**, plus a portfolio-level daily and peak-to-trough stop.

No machine-learning allocator until at least 2 strategies pass the gates. With one thin lead there is nothing to allocate between.

## 8. Separate 4h paper experiment: plan (needs approval)

**Infrastructure check: `live.ts` cannot run 4h today.**
- The config path, status folder and `PICKS` are hard-coded.
- It only fetches 1m candles (`fetchCandlesSince` hard-codes `"1m"`).
- The 10-day warm-up is too short: tsmom's 168-bar look-back needs 28 days, and breakout's EMA-100 trend filter needs about 20.
- `freeze` reads `research.json`, which a 4h run would overwrite.
- The engine counts rejected signals but doesn't log them.

**Changes:** none of these alter the 1m test's config, data folder or results.
1. Parameterise `live.ts`: a config path, a status folder, the base timeframe (`1h`), the warm-up length (≥ 60 days), and an experiment id. The defaults stay exactly as now.
2. `fetchCandlesSince(market, since, tf = "1m")`.
3. An optional event-log callback in `simulate()` covering signal, order, fill, exit, and rejection with its reason (cost filter, position open, cool-down, daily stop, kill). It's off by default, and a test asserts results are byte-identical when it's off.
4. New `lib/paper/scalp/live-4h-config.json`: experiment `exp-4h-2026-11`, status in `.paper-data/live-4h/`. Configurations: breakout long, breakout long+short, tsmom long+short (your three), each on 5 coins, tracked separately. Shadow baselines: buy & hold, and random entries with the same exits.
5. Costs: report each configuration at 0.1%/0.02% **and** at your real fee tier.
6. No continuous loop is needed: the replay is deterministic, so a scheduled run every 4h refreshes and reports. That's more robust than a process in another session's container.

**Verify before calling it running:** unit tests (4h resampling from 1h, config loader, replay determinism, logger off = identical results); a historical replay that matches the research harness trade-for-trade on overlapping data; then the first live pass completes and its status file is committed. Only then is it "running".

## 9. Roadmap (prioritised)

| Priority | Task | Benefit | Risk | Verification |
|---|---|---|---|---|
| P0 | You confirm the actual Crypto.com fee tier, and whether shorting would be via margin or perpetuals | Decides whether anything here can work | None | — |
| P0 | Research harness hardening (§4 #1) | Trustworthy numbers | Low; new code path, old one kept | Reproduces today's figures |
| P1 | 4h paper experiment (§8) | Starts the clock on forward evidence | Low; isolated | Tests + replay matches research |
| P1 | Trailing exit + BTC gate on breakout long (fixed, chosen in advance) | Most likely real improvement | Medium (could fail H2) | Gates in §6 |
| P2 | Slow trend following rebuild | A second, complementary strategy | Medium | Gates in §6 |
| P2 | Portfolio risk layer (correlation guard, exposure caps) | Prevents 5 copies of one bet | Low | Unit tests, replay |
| P3 | Limit-entry fill model | Lower costs | Missed fills | Pessimistic fill tests |
| P3 | Strategy registry + allocation | Automates promote/demote | Over-engineering | Only once ≥ 2 strategies pass |

## 10. Discrepancies with CLAUDE_HANDOFF.md

- "2 years" isn't all the history: hourly data on Crypto.com goes back to Jul 2021.
- The +3.1% / +2.3% / +0.8% figures reproduce only at the original start time. They are fragile to alignment, as shown above.
- tsmom's return comes mostly from the market value of positions still open at window ends (one setting: closed trades −4.6%, open positions +4.4%). That is legitimate accounting, but its trade-level statistics were weaker than they looked.
- The 0.1% fee assumption may be below what a small Crypto.com account actually pays.
