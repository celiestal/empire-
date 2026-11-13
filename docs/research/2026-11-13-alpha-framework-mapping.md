# The video's ALPHA framework vs this system

The owner shared a course transcript (an "ALPHA" framework: Architecture, Logic, Proof, Harness, Adapt; built for daily ETF bars with Alpaca) and asked to use it as a guide. This maps every part to what exists here.
- **Adopted**: built the video's way.
- **Adapted**: changed for crypto or because of our measurements.
- **Not adopted**: with the reason.

## A: Architecture
| Video | Here | Status |
|---|---|---|
| Prompt 0: house rules in `CLAUDE.md`, a "my settings" block | `CLAUDE.md` (trading house rules) + `lib/paper/settings.json` (universe, periods, three cost scenarios, gates, risk) | **Adopted** (commit a13b6f3) |
| Keys only in a `.env` Claude never reads | No keys exist or are needed (public data, simulated fills). The rule is written into CLAUDE.md for the future | **Adopted** |
| Trading bot vs trading system (data → regime → strategies → risk → orders → logs/alerts → review) | Same layers: feed → regime/BTC gate → strategies → engine risk limits → simulated fills → event log/reports → kill lines/gates | **Already had; extended** |
| Core + sleeves portfolio | Concept adopted. A crypto core was tested (below) and **failed**; the leading core candidate is the market-filtered trend rule (needs its holdout test). Sleeves = 4h breakout family in paper | **Adapted** |

## L: Logic
| Video | Here | Status |
|---|---|---|
| Prefer daily bars; costs grow with trade count | Our data agrees: everything faster than 4h lost to costs; the best candidates are daily | **Adopted** |
| Asset study labels ("keeps going" / "snaps back") pick strategies per asset | Measured on crypto: labels **don't persist** between periods (variance ratios ≈ 1, flip sign), and choosing strategies per coin **lost −4.3%** forward vs +8.0% for one fixed strategy | **Not adopted** for crypto. Labels kept only as descriptions; any per-asset rule must first show persistence |
| Regime = above/below 200-day + calm/volatile sizing | BTC trend gate (faster than 200-day: rising 7-day EMA) has the strongest cross-period evidence. Volatility sizing tested: cut drawdown 34% → 17% | **Adapted** |
| Exact 7-part rules (market, setup, filter, entry, exit, stop, size) | Required by CLAUDE.md; every pre-registration lists them | **Adopted** |
| VIX + breadth market filter | No VIX for crypto. Candidate equivalents: funding rate / open interest (Crypto.com API has them), BTC gate. Untested | **Adapted** (future E3) |

## P: Proof
| Video | Here | Status |
|---|---|---|
| Train 2022–24, locked test 2025+, run once | Core study used exactly this split (train 2022-10 → 2024-11, test → 2026-11). Our general protocol adds a reserved coin holdout (H2), because 2024–26 had already been looked at | **Adopted + stricter** |
| Test the backtester: planted edge, pure noise, cheating signal | `tests/paper-backtester-selfcheck.test.ts`: planted +1% → **0.76%/trade** (= 1% − 0.24% costs); noise → **−0.24%**; cheating signal **caught**; every real strategy passes the guard. `assertNoLookahead` now runs before every `robust.ts` run | **Adopted** |
| Seven minimum checks (costs, next-open fills, recent data, locked test, return/drawdown, enough trades, neighbours) | All in `robust.ts` gates, plus random-entry benchmark, pooled t, start offsets, and three cost levels | **Already had; stricter** |
| Prompt 3: find a core (engine by trend gap, safe asset, 200-day switch, neighbours, locked test) | Run for crypto: engine ETH, safe PAXG (tokenised gold). Training +189% (Sharpe 1.32, all neighbours positive) → test +14.6% vs ETH −37.9%, but **max DD 40.1% > 35% limit → rejected** | **Adopted; result: fail** (`2026-11-13-core-results.md`) |
| Prompt 4: funnel of sleeve ideas through gates | Same idea: the P1 breakout variants went through written gates; all 4 failed (best missed narrowly) | **Already had** |
| Prompt 5: combine core + sleeves, **margin allowed** | Combining: yes, once two parts pass. **Margin: not adopted** (owner's rules: no added risk, no leverage) | **Partly** |
| Prompt 6: test the quarterly sleeve re-pick routine itself | Done in effect: a rolling per-coin re-pick routine lost −4.3% vs a fixed strategy. Re-picking will only be used if the routine passes | **Adopted (result: fail)** |
| Prompt 7: AI layer reading Fed statements | Not backtestable cleanly (the video says so too); our ML test found no signal | **Not adopted now** |
| Extra checks: walk-forward, Monte Carlo, double cost, other markets | All present (walk-forward + offsets, Monte Carlo drawdown, cost scenarios, H2 = other coins) | **Already had** |

## H: Harness
| Video | Here | Status |
|---|---|---|
| Real orders on an Alpaca **paper** account | Fills are simulated by our pessimistic engine; Crypto.com has no paper account. An Alpaca paper crypto account would add real-broker fills, but needs owner keys and a new network host | **Owner decision** (not done) |
| Decide after the close, fill at next open | Same in the simulator and the live replay | **Already had** |
| Reconcile broker vs bot, lock file, no double orders, stops held at broker | Not applicable without a broker: the replay is deterministic and can't double-order. Would be needed with Alpaca paper | **N/A for now** |
| Loss limits (3%/5% day, pause file, borrowing stop) | Engine has 2% daily stop, cool-down, 10% kill switch; no borrowing. A pause file only makes sense with a long-running bot | **Already had (stricter)** |
| Scheduler + Telegram alerts | Scheduled 4h pass exists (cloud scheduled task, every 4h). Telegram needs a bot token from the owner and network access to api.telegram.org | **Owner decision** |

## A: Adapt
| Video | Here | Status |
|---|---|---|
| Paper vs backtest comparison | By construction identical here (same code replays the candles); verified trade-for-trade (15 sleeves, 315 trades). Real gaps would only appear with a broker | **Already had** |
| Kill line = 2× worst tested drawdown; keep/watch/review/out | Added to experiment reports (`docs/research/exp-4h-2026-11/kill-lines.json`): breakout-long 4.0%, breakout-long-short 8.8%, tsmom-long-short 7.7%. Reporting only; never changes the frozen experiment's trades | **Adopted** (commit 9969eeb) |
| Bench + rotation, change log | Bench = strategies that passed every gate. Currently empty (nothing has passed) | **Waiting on a passing strategy** |
| Weekly Claude review on a schedule | Proposed; needs an OK because it adds a recurring scheduled task | **Owner decision** |
| No rule changes after a bad week | In CLAUDE.md | **Adopted** |

## Where the video and our evidence disagree
1. **Costs:** the video uses 0.05% per side (ETFs). Crypto is higher; the video itself quotes Alpaca crypto at 0.25%. That's why every result here is shown at 0.1%, 0.25% and 0.5%.
2. **Per-asset strategy choice:** works in the video's ETF universe; failed forward on our crypto data.
3. **200-day core:** gave the video ~25%/yr on ETFs; in crypto it allowed a 40% drawdown. The faster BTC-trend gate did better in every window.
4. **The video's returns** (~29%/yr on its locked test) come from one ETF bull period. They say nothing about crypto and are not a target.
