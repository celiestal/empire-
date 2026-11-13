@AGENTS.md

# House rules for the trading research system (fake money only)

These apply to every Claude session that touches `lib/paper/`, `scripts/paper/`, `docs/research/` or the paper experiments.
Settings (bar size, universe, periods, costs, gates, risk) live in `lib/paper/settings.json`. Read it before any trading work.
Start with `CLAUDE_HANDOFF.md`, `docs/handoff/scalp-bot.md` and the newest file in `docs/research/`.

## Safety (absolute)
- Paper trading only. Never connect, enable or prepare real-money execution, exchange keys or order placement.
- Never open, print or log `.env` files or any secret. Never paste keys into chat.
- Never loosen a risk limit, add leverage or remove fees/slippage to improve a result.
- Never delete losing trades, research outputs or experiment records.

## Experiments
- Running experiments are frozen. Never edit `lib/paper/scalp/live-config.json` (1m test, owned by another session's schedule) or `lib/paper/scalp/live-4h-config.json` (`exp-4h-2026-11`). A change means a new experiment id, config file and status folder.
- Don't interfere with other sessions' scheduled tasks or their branches.

## Research protocol
- Every rule is written exactly before testing: market, setup, filter, entry (next bar's open), exit, stop, size.
- Decide at a bar's close, fill at the next bar's open. No look-ahead: signals must pass `assertNoLookahead` (lib/paper/scalp/evaluate.ts).
- The backtester itself must pass its self-checks (`tests/paper-backtester-selfcheck.test.ts`) before results are trusted.
- Pre-register (commit the rule and its pass criteria) before running any new variant. Results go in a separate file.
- Judge only on out-of-sample results with costs, at all three cost scenarios in settings.json.
- Required: enough trades, neighbouring settings also work, random-entry benchmark, buy-and-hold comparison, costs ×2.5 stress.
- The locked test runs once. If it fails, the idea is rejected; never tweak and re-run. H2 coins are reserved for this.
- No rule changes because of recent results (a bad week is not evidence). Claude may propose hypotheses but never declares its own strategy validated: only the written gates decide.
- No margin or borrowing (the video's prompt 5 margin option is deliberately not adopted).
