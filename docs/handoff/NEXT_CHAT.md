# Next chat: start here (trading bot, written 2026-11-13 ~17:05 UTC)

Paste this into a new Claude Code chat on repo `celiestal/empire-`, branch **`claude/practical-bell-772nzp`**:

> Read `docs/handoff/NEXT_CHAT.md`, then `CLAUDE.md`, then the newest file in `docs/research/daily/` (if any). Pull branch `claude/practical-bell-772nzp` first. Don't change any frozen experiment. Tell me where the paper tests stand and what the daily research found, then propose the next step.

---

## 1. What the owner wants
- **Goal:** an adaptive crypto trading system that finds a real, repeatable edge, picks strategies by evidence, knows when *not* to trade, learns from its wins and losses, and accounts for every cost.
- **Fake money only.** Real money needs a separate, explicit decision from the owner, plus weeks of good paper results, a small separate account, a trade-only key with withdrawals off, and hard loss limits.
- **Asked to:** test every day for two weeks, explain why each trade won or lost, keep searching for the best strategy, and use the YouTube "ALPHA framework" course as a guide (mapped in `docs/research/2026-11-13-alpha-framework-mapping.md`).
- **Return targets:** the owner first asked for 2% a day, then 1% a day. **Both were shown to be unrealistic.** 2%/day compounds to ×1,377 a year; 1%/day to ×38. Our best validated rule averages about **0.03% a day**. The recommended target is **15–30% a year with drawdowns under about 20%**.
- **Owner's scalping idea** (2 trades a day, 20% of the portfolio per trade, sell at +2–3%) was tested: **all 24 versions lost money** (−5% to −49%), with fees of 6–37% of starting capital.

## 2. Where things stand (verified)

| Experiment | Config (frozen, don't edit) | Started | Status at handoff |
|---|---|---|---|
| 1-minute scalping test (another session's) | `lib/paper/scalp/live-config.json` | 2026-11-13 05:17 UTC | −0.09% after 11 h, 10 trades, 3 wins. Retirement candidates. Its 24h report fires 2026-11-14 05:30 UTC in the other session and may re-freeze it |
| `exp-4h-2026-11` (4h breakout long, breakout long+short, trend long+short, 5 coins, plus a random baseline) | `lib/paper/scalp/live-4h-config.json` | 2026-11-13 16:00 UTC | 0 trades yet. Kill lines in `docs/research/exp-4h-2026-11/kill-lines.json` |
| `exp-trend-daily-2026-11` (**the rule that passed E1**, 13 coins) | `lib/paper/trend/exp-trend-daily-config.json` | 2026-11-14 00:00 UTC | All cash at start (BTC gate closed). Kill line 43.8% |

**Dashboard "Paper Trading Desk":** https://claude.ai/artifact/KNpiWEphUDnAqC3GAfZYCk
- Live BTC 4h candles from the owner's Crypto.com connector.
- Experiments scoreboard, every paper trade on its price chart, and the E1 equity curve.
- The file-based parts are refreshed by the daily routine (`scripts/paper/dashboard-data.ts`).

**Scheduled tasks:**

| Task | Schedule | Where it runs | What it does |
|---|---|---|---|
| "4h paper experiment pass" | every 4h at :07 | this session | Runs `exp-4h-2026-11` |
| **"Daily trading research routine (2 weeks)"** | 00:41 UTC daily, 2026-11-14 → 27 | this session | Follows `docs/research/DAILY_ROUTINE.md`, writes `docs/research/daily/<date>.md`, disables itself after 27 Nov |
| 1m check-ins, 24h report, daily summary | various | other session (`claude/determined-franklin-v7q3kf`) | Not ours; don't touch |

## 3. Key findings (all in `docs/research/`)
1. **No edge in fast trading.** 1m/5m/1h strategies lose to fees; entries do no better than random.
2. **The old "+3.1% 4h breakout" was fragile.** It depended on the walk-forward start date. Pre-registered improvements (trailing exit, BTC gate) failed narrowly.
3. **Bitcoin's trend is the strongest signal found.** When BTC is above a rising 7-day average, altcoins crash about half as often. Breakouts against it lose.
4. **Each coin does NOT need its own strategy** (that lost −4.3% going forward). **Time of day** predicts volatility, not direction. **Machine learning** found nothing (AUC about 0.5).
5. **E1 passed** (`2026-11-13-e1-results.md`): "hold a coin only if its 30-day return is positive AND the BTC gate is open, sized to 40% volatility, else cash".
   - Result on 8 untouched coins, Dec 2022 → Nov 2026: **+42%, 0.03%/day, Sharpe 0.56, max DD 21.9%** (buy-and-hold: 77% DD).
   - A thin pass, and weak since 2025 (+3.1% in 2025, −6.5% in 2026 YTD). H2 is now used up; the future is the only clean test left.
6. **The video's core (ETH ↔ PAXG gold on the 200-day average) failed:** test max DD 40%. Gold as the "safe" leg did help.
7. **Regime-gated scalper S1 failed** (owner asked for a scalping algorithm built from all data): 1h entries even inside the E1 regime lose (pooled t −4.3 / −3.8, fees > pre-fee profit). The validated daily rule is available as a TradingView script: `docs/research/tradingview/market-filtered-trend.pine`.
8. **The backtester is self-checked:** a planted +1% edge returns 0.76% after 0.24% costs; noise returns −0.24%; look-ahead is caught.

## 4. Tools built (all tested; 91 tests pass)
- `lib/paper/scalp/engine.ts`: pessimistic simulator, plus an optional event log and trailing stop.
- `lib/paper/scalp/evaluate.ts`: walk-forward, continuous out-of-sample runs, random benchmark, gates, `assertNoLookahead`.
- `lib/paper/scalp/live-core.ts`: deterministic replay for paper tests, health/kill lines.
- `lib/paper/trend/daily.ts`: the E1 rule.
- `scripts/paper/`:
  - `robust.ts` (`wf` / `fixed`), `core.ts`, `e1.ts`, `kill-lines.ts`
  - `live.ts --config …`, `trend-live.ts`, `freeze-4h.ts`, `dashboard-data.ts`
- `CLAUDE.md` (house rules) and `lib/paper/settings.json` (universe, periods, three cost scenarios, gates, risk).
- Data (gitignored, re-downloadable):
  - `.paper-data/hist/` (5 coins + PAXG, hourly since 2021)
  - `.paper-data/h2/` (8 coins)
  - Download with `NODE_USE_ENV_PROXY=1 npx tsx docs/research/2026-11-13-audit/dl.mts <dir> 1h <since> <markets>` (fix its absolute import path first) or `scripts/paper/download.ts`.

## 5. Open questions for the owner (still unanswered)
1. **Actual Crypto.com fee rate.** It decides everything: E1's +42% falls to +20% at 0.25% per side and to about zero at 0.5%.
2. Connect an **Alpaca paper account** (real broker fills, fake money) as in the video? Needs owner-created keys in a `.env` Claude never reads, plus network access to Alpaca.
3. **Telegram phone alerts?** Needs a bot token and network access to api.telegram.org.
4. A weekly Saturday review task (the video's prompt 13)?
5. Should someone tell the other session (05:30 report) about this work, so it doesn't make a duplicate 4h test?

## 6. Next steps (in order)
1. Read the daily reports. Keep the frozen experiments running; judge them only on new days of data against their kill lines and expected ranges.
2. Work through `docs/research/hypotheses.md`, one pre-registered test at a time:
   - PAXG instead of cash
   - look-back ensemble
   - regime-matched shorts
   - funding-rate filter
   - breakout sleeve on top of the trend core
   - volatility-target level
   - cross-sectional momentum
   - faster exit
   - execution timing
3. Anything that passes goes on the "bench". A new paper experiment needs the owner's OK.
4. After ~2 weeks: a summary of forward paper results vs backtest expectations. Decide whether the trend rule stays the core.
5. Real money: **not before** weeks–months of paper results in line with tests, and the owner's explicit decision.

## 7. Rules that must not be broken
Paper only. Never edit frozen configs. Pre-register before testing. One locked test only. No leverage. Never remove fees. Never delete losing trades. Never touch the other session's branch or tasks. Full list in `CLAUDE.md`.
