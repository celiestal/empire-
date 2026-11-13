// Daily paper experiment for the market-filtered trend rule (exp-trend-daily). Fake money only: no keys, no orders.
//   tsx scripts/paper/trend-live.ts freeze   Write lib/paper/trend/exp-trend-daily-config.json once (refuses to overwrite).
//   tsx scripts/paper/trend-live.ts          One pass: refetch, replay every closed daily candle since the start, report.
// Deterministic replay from the frozen start, so restarts and fresh containers never change results.
// Needs NODE_USE_ENV_PROXY=1 in the cloud sandbox.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { fetchCandlesSince } from "../../lib/paper/scalp/feed";
import { E1_PARAMS, runTrend, type TrendParams } from "../../lib/paper/trend/daily";

const CONFIG = "lib/paper/trend/exp-trend-daily-config.json";
const DAY = 86_400_000, H = 3_600_000;
interface Cfg { experimentId: string; startedAt: number; startedAtIso: string; totalCash: number; why: string; markets: string[]; params: TrendParams; warmupDays: number; statusDir: string; reportPath: string; feeScenarios: { label: string; feePerSide: number; slippage: number }[]; killLinePct: number }

if (process.argv[2] === "freeze") {
  if (existsSync(CONFIG)) throw new Error(`${CONFIG} exists; the experiment is frozen`);
  const startedAt = Math.ceil(Date.now() / DAY) * DAY; // next UTC midnight
  const cfg: Cfg = {
    experimentId: "exp-trend-daily-2026-11",
    startedAt, startedAtIso: new Date(startedAt).toISOString(), totalCash: 10_000,
    why: "Market-filtered trend rule exactly as it passed E1 (docs/research/2026-11-13-e1-results.md), on all 13 researched coins, equal weight. Forward evidence only; thin pass, not proven.",
    markets: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD", "ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"],
    params: E1_PARAMS, warmupDays: 60, statusDir: ".paper-data/live-trend", reportPath: "docs/research/exp-trend-daily/status.json",
    feeScenarios: [{ label: "fee 0.25% + slip 0.02%", feePerSide: 0.0025, slippage: 0.0002 }, { label: "fee 0.5% + slip 0.05%", feePerSide: 0.005, slippage: 0.0005 }],
    killLinePct: 43.8, // 2 x the 21.9% max drawdown it had on the E1 holdout
  };
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 1) + "\n");
  console.log(`Frozen ${cfg.experimentId}; clock starts ${cfg.startedAtIso}`);
} else {
  const cfg: Cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
  mkdirSync(cfg.statusDir, { recursive: true });
  const hourly: Record<string, Candle[]> = {};
  for (const m of [...new Set([...cfg.markets, "BTC_USD"])]) {
    const file = `${cfg.statusDir}/${m}.json`;
    const have: Candle[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    const since = have.length ? have[have.length - 1].t : cfg.startedAt - cfg.warmupDays * DAY;
    const fresh = (await fetchCandlesSince(m, since, "1h")).filter((c) => c.t + H <= Date.now());
    have.push(...fresh);
    writeFileSync(file, JSON.stringify(have));
    hourly[m] = have;
  }
  const daily = Object.fromEntries(cfg.markets.map((m) => [m, resample(hourly[m], 1440, 60)]));
  const btcUp = btcUpByTime(resample(hourly.BTC_USD, 240, 60));
  const run = runTrend(daily, btcUp, cfg.startedAt, cfg.totalCash, cfg.params);
  const eq = run.equity.length ? run.equity[run.equity.length - 1].v : cfg.totalCash;
  let peak = cfg.totalCash, dd = 0; for (const e of run.equity) { peak = Math.max(peak, e.v); dd = Math.max(dd, 1 - e.v / peak); }
  const days = run.equity.length;
  const hold = Object.fromEntries(cfg.markets.map((m) => { const c = daily[m]; const a = c.find((x) => x.t >= cfg.startedAt); return [m, a ? +((c[c.length - 1].c / c[c.indexOf(a) - 1].c - 1) * 100).toFixed(2) : 0]; }));
  const scen = Object.fromEntries(cfg.feeScenarios.map((f) => { const r = runTrend(daily, btcUp, cfg.startedAt, cfg.totalCash, { ...cfg.params, feePerSide: f.feePerSide, slippage: f.slippage }); const v = r.equity.length ? r.equity[r.equity.length - 1].v : cfg.totalCash; return [f.label, +((v / cfg.totalCash - 1) * 100).toFixed(3)]; }));
  const status = {
    experimentId: cfg.experimentId, updatedAt: new Date().toISOString(), startedAt: cfg.startedAtIso,
    dataThrough: new Date(Math.min(...Object.values(daily).map((c) => c[c.length - 1]?.t ?? 0)) + DAY).toISOString(),
    daysLive: days, startCash: cfg.totalCash, equity: +eq.toFixed(2), returnPct: +((eq / cfg.totalCash - 1) * 100).toFixed(3),
    avgDailyReturnPct: days ? +(((eq / cfg.totalCash) ** (1 / days) - 1) * 100).toFixed(4) : 0,
    maxDrawdownPct: +(dd * 100).toFixed(3), killLinePct: cfg.killLinePct, health: dd * 100 >= cfg.killLinePct ? "out" : dd * 100 >= cfg.killLinePct / 2 ? "watch" : days < 14 ? "watch (too early)" : "keep",
    fees: +run.fees.toFixed(2), feeScenarios: scen, buyHoldPctSinceStart: hold,
    buyHoldAvgPct: +(Object.values(hold).reduce((a, b) => a + b, 0) / cfg.markets.length).toFixed(2),
    btcGateOpenNow: !!btcUp.get(Math.max(...[...btcUp.keys()])),
    targetWeightsForNextDay: run.weights, perCoinPnl: Object.fromEntries(Object.entries(run.perCoinPnl).map(([k, v]) => [k, +v.toFixed(2)])),
    orders: run.orders, equityCurve: run.equity.map((e) => ({ day: new Date(e.t).toISOString().slice(0, 10), equity: +e.v.toFixed(2) })),
  };
  writeFileSync(`${cfg.statusDir}/status.json`, JSON.stringify(status, null, 1));
  mkdirSync(dirname(cfg.reportPath), { recursive: true });
  writeFileSync(cfg.reportPath, JSON.stringify(status, null, 1) + "\n");
  const { orders, equityCurve, ...brief } = status;
  console.log(JSON.stringify(brief, null, 1));
  console.log(`${orders.length} weight changes so far; ${equityCurve.length} days`);
}
