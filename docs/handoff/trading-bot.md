# Handoff: Paper trading bot

Last updated 2026-11-13. Read this first in a new chat about the trading bot.

## Background
The owner saw a "Grok Bot" trading post claiming $44 grew to $11K. Claude checked it and found it was mostly hype: the dashboard in it showed $133 going to $142, and its trades were labelled "illustrative". Instead, Claude built a **fake-money** bot so strategies can be tested safely. It never places real orders and has no exchange keys.

## Where it is
- Repo `celiestal/empire-`, branch `claude/dreamy-brahmagupta-ytbdi5`. It is part of the Empire site, at page `/paper`, visible to the owner only (`requireOwner`). There is a "Paper Trading" link in the nav for the owner.
- **Not live yet.** It goes live with the site deploy, which waits for the owner to reply "deploy".

## What's built
- `lib/paper/strategy.ts` (pure, tested):
  - `sma()`, plus `backtest(candles, { startCash, fast, slow, feeRate })`.
  - Strategy: moving-average crossover, all-in/all-out, long only, 0.1% fee per trade. Defaults: $1,000, fast 9, slow 21.
  - Returns end value, return %, buy-and-hold %, max drawdown, trades with profit per round trip, wins/losses, fees, the current signal (buy/sell/hold), and the equity curve.
- `lib/paper/market.ts`:
  - Fetches up to 300 candles from Crypto.com's public API (`api.crypto.com/exchange/v1/public/get-candlestick`, no key needed).
  - Markets: BTC, ETH, SOL, XRP, DOGE vs USD. Timeframes: 15m, 1h, 4h, 1D.
- `app/paper/page.tsx`:
  - Form: market, timeframe, fake cash, fast and slow averages.
  - Cards: fake balance, buy-and-hold comparison ("Bot beat/lost to holding"), current signal.
  - Also an SVG equity chart and a trade table, with a clear "fake money only" notice.
- `tests/paper.test.ts`: 6 tests, all passing.

## Not yet verified
- The cloud sandbox couldn't reach api.crypto.com because of its network policy. The page was only checked in a browser with mocked prices (rendering, chart and trades all looked right).
- The first real-data check will be on the deployed site. If it shows "Couldn't load prices", check the response shape and the instrument names (e.g. `BTC_USD` vs `BTCUSD-PERP`).

## Next steps
Owner:
1. Reply "deploy" (and add the Neon database first; see `docs/handoff/site.md`).
2. Open `/paper`, try different markets and settings, and see whether the bot beats buy and hold. Usually it won't by much, which is the point.

Possible next builds (only if the owner asks):
- Save paper runs over time: a daily cron that records the signal and a running fake balance in the store, i.e. forward testing instead of only replaying the past.
- More strategies (RSI, breakout) side by side, and walk-forward testing.
- Daily email with the bot's signal.
- **Do not** connect real money or exchange keys without an explicit, separate decision from the owner. Trading real money is risky and was never requested.
