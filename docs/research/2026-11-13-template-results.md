# Results: T1, the shared guide's trend template

Pre-registration: `2026-11-13-template-preregistration.md` (commit 0da7cd5, before this run). Script: `scripts/paper/template.ts` (one performance fix in the MACD calculation before the only completed run; no rule changed). Raw: `2026-11-13-intelligence/template.json`. TradingView version: `tradingview/guide-trend-template-T1.pine`.

## Verdict: FAILS every gate except trade count and drawdown, in both versions. Retired.

| | Long only | Long + short |
|---|---|---|
| Pooled t (per-trade R) | **−4.39** | **−4.93** |
| BTC 1h, 2021–24 / 2024–26 | −7.9% / −10.0% (PF 0.62 / 0.53) | −9.0% / −10.1% (PF 0.74 / 0.27) |
| BTC 4h | +5.1% / −10.2% | −4.6% / −10.1% |
| 13 coins 1h | −7.4% / −6.0% (PF 0.74 / 0.76) | −7.0% / −7.0% |
| 13 coins 4h | −3.8% / +0.9% | −4.3% / +6.9% |
| BTC random-entry percentile | 27 / 11 | 23 / 2 |
| BTC at 0.25% commission | −10.3% / −6.5% | −9.8% / −10.1% |
| BTC neighbours positive | 0 of 12 | 0 of 12 |

Reference: BTC buy and hold +86.9% (2021–24) and −18.9% (2024–26). Risk 1% per trade, 0.1% commission per side plus slippage. BTC 1h results near −10% mean the 10% kill switch stopped the account.

## Why it fails
- The entry fires when three trend signals agree. On 1h crypto, by then much of the move is already priced in, and a 2×ATR trailing stop is hit by ordinary noise. Win rate is 23–34% with too small an average win.
- This matches the earlier 1h findings (S1, the 1h walk-forward): at these costs, hourly entries on these coins have no edge.
- The guide's own warning applies: its best backtest (+$1.39M) was one its author wouldn't trade. A template is not a strategy; only the testing ladder decides.
