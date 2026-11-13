# Hypothesis backlog

Ordered by expected value. Each item gets a pre-registration commit before it's run. Status: open / pass (bench) / fail.
Development data: 5 coins (BTC, ETH, SOL, XRP, DOGE) and 8 coins (ADA, LINK, AVAX, LTC, DOT, XLM, NEAR, BCH; used once in E1, now development), periods 2021-09 → 2024-11 and 2024-11 → 2026-11.
**Gates:** positive in both periods and both coin groups; Sharpe ≥ 0.5; positive at 0.25%/side; neighbours ≥ 80% positive; max DD ≤ 25%; better than the E1 rule on return per drawdown (the baseline to beat).

| # | Hypothesis | Source | Status |
|---|---|---|---|
| 1 | **PAXG instead of cash** when the trend rule is out (gold as the safe leg) | Video prompt 3; core study (gold beat cash) | open |
| 2 | **Look-back ensemble**: average of 14/30/60-day trend signals instead of 30 only (less dependence on one setting) | Neighbour results | open |
| 3 | **Regime-matched direction**: add shorts only when the coin's own 72h trend label is "down" and the BTC gate is closed | Audit §5 (t 2.2 / 1.3) | open |
| 4 | **Funding-rate crowding filter**: skip or halve longs when the BTC perp funding rate is in its top decile (Crypto.com public API) | BIS crypto carry; audit §12 | open (check history depth first) |
| 5 | **4h breakout trail+gate as a sleeve** on top of the trend core, sized small; does the combined account improve return per drawdown? | Video prompt 5 (core + sleeves), P1 near-miss | open |
| 6 | **Volatility target level**: 30% vs 40% vs 60% (risk, not return, is the decision) | Video "sizing by risk" | open |
| 7 | **Cross-sectional momentum**: hold the top 3 of 13 coins by 30-day return, only when the BTC gate is open | Liu-Tsyvinski-Wu (JF 2022) | open |
| 8 | **Faster exit**: leave when the coin closes below its 10-day low, even if the 30-day trend is still up | Trade-level losses (to be confirmed by the daily analysis) | open |
| S1 | **Regime-gated scalper** (1h dip or breakout entries only inside the E1 regime) | Owner request: a scalping algorithm from all data | **fail** (pooled t −4.3 / −3.8; `2026-11-13-scalper-results.md`) |
| T1 | **Guide's trend template** (EMA200 + MACD + ADX, ATR band stop, 1h) | Owner-shared DaviddTech guide | **fail** (pooled t −4.4 / −4.9; `2026-11-13-template-results.md`) |
| 9 | **Execution timing**: avoid rebalancing in the 13–16 UTC high-volatility hours (slippage) | Audit §9 (volatility by hour, r = 0.92) | open |
