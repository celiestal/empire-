// Builds the data files for the Paper Trading Desk dashboard (https://claude.ai/artifact/KNpiWEphUDnAqC3GAfZYCk)
// into .paper-data/dash/: trades.json, trade-prices.json, experiments.json, e1-curve.json.
// Run after the experiment passes:  npx tsx scripts/paper/dashboard-data.ts
// Needs .paper-data/live (1m test replay), .paper-data/hist and .paper-data/h2 hourly files.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, runTrend } from "../../lib/paper/trend/daily";
mkdirSync(".paper-data/dash", { recursive: true });
const R = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const out = ".paper-data/dash";
const s1 = R(".paper-data/live/status.json");
// 1) trades of the 1m live paper test
const trades = s1.tradeLog.map((t: any, i: number) => ({ id: i + 1, market: t.market.replace("_USD", ""), method: t.method, side: t.side, entryAt: t.entryAt, exitAt: t.exitAt, entry: t.entry, exit: t.exit, reason: t.reason, pnl: t.pnl, r: t.r, result: t.pnl > 0 ? "win" : "loss" }));
writeFileSync(`${out}/trades.json`, JSON.stringify(trades));
// 2) 15m prices since the 1m test started, for coins that traded
const start = Date.parse(s1.startedAt);
const coins = [...new Set(s1.tradeLog.map((t: any) => t.market))] as string[];
const prices: any[] = [];
for (const m of coins) for (const c of resample(R(`.paper-data/live/${m}.json`).filter((x: any) => x.t >= start - 3600e3), 15)) prices.push({ market: m.replace("_USD", ""), t: new Date(c.t).toISOString(), close: c.c });
writeFileSync(`${out}/trade-prices.json`, JSON.stringify(prices));
// 3) experiments scoreboard
const s4 = R("docs/research/exp-4h-2026-11/status.json"), st = R("docs/research/exp-trend-daily/status.json");
const exps = [
 { experiment: "1-minute scalping test", kind: "Paper (live prices)", started: s1.startedAt.slice(0, 16).replace("T", " "), equity: +s1.equity.toFixed(2), returnPct: +s1.returnPct.toFixed(3), trades: s1.trades, status: "Running (other session)", note: "Retirement candidates; measures execution" },
 { experiment: "4-hour breakout + trend test", kind: "Paper (live prices)", started: s4.startedAt.slice(0, 16).replace("T", " "), equity: +s4.equity.toFixed(2), returnPct: +s4.returnPct.toFixed(3), trades: s4.trades, status: "Running, waiting for first signal", note: "3 setups x 5 coins; checked every 4h" },
 { experiment: "Market-filtered trend (daily)", kind: "Paper (live prices)", started: st.startedAt.slice(0, 16).replace("T", " "), equity: st.equity, returnPct: st.returnPct, trades: st.orders.length, status: st.btcGateOpenNow ? "BTC gate open" : "In cash: BTC gate closed", note: "The rule that passed E1; 13 coins" },
];
writeFileSync(`${out}/experiments.json`, JSON.stringify(exps));
// 4) E1 holdout equity curve vs buy and hold ($1,250 per coin, never rebalanced)
{
  const C = ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"];
  const d = Object.fromEntries(C.map((m) => [m, resample(R(`.paper-data/h2/${m}_1h.json`), 1440, 60).filter((x: any) => x.t < Date.parse("2026-11-13"))]));
  const btc = btcUpByTime(resample(R(".paper-data/hist/BTC_USD_1h.json"), 240, 60));
  const from = Date.parse("2022-12-11");
  const r = runTrend(d, btc, from, 10000, E1_PARAMS);
  const bh = new Map<number, number>();
  for (const m of C) { const c = d[m]; const a = c.findIndex((x: any) => x.t >= from); const base = c[a - 1].c; for (let i = a; i < c.length; i++) bh.set(c[i].t, (bh.get(c[i].t) ?? 0) + (1250 * c[i].c) / base); }
  const rows = r.equity.filter((_, i) => i % 3 === 0 || i === r.equity.length - 1).map((e) => ({ day: new Date(e.t).toISOString().slice(0, 10), trendRule: +e.v.toFixed(0), buyAndHold: +(bh.get(e.t) ?? 0).toFixed(0) }));
  writeFileSync(`${out}/e1-curve.json`, JSON.stringify(rows));
}
console.log("wrote .paper-data/dash/*.json");
