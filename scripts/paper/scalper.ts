// S1: regime-gated scalper (docs/research/2026-11-13-scalper-preregistration.md). Fake money only.
//   npx tsx scripts/paper/scalper.ts
// Fast (1h) long entries, allowed only while the E1 daily regime is on for that coin.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { atr, ema, priorHigh, resample, rsi, sma } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";
import { assertNoLookahead, percentileOf, pooledT, portfolioStats, randomEntryBenchmark, runContinuous, tradeStats, type Sig } from "../../lib/paper/scalp/evaluate";

const DAY = 86_400_000, H = 3_600_000;
const GROUPS: Record<string, { dir: string; coins: string[] }> = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const PERIODS = { B: [Date.parse("2021-09-01"), Date.parse("2024-11-13")], A: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const load = (dir: string, m: string): Candle[] => JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8"));
const btcH = load(".paper-data/hist", "BTC_USD");
const btcUp = btcUpByTime(resample(btcH, 240, 60));

/** For each bar of `c` (any timeframe), is the E1 regime on? Uses the daily bar decided at the previous daily close. */
export function regimeOn(c: Candle[], hourly: Candle[]): boolean[] {
  const daily = resample(hourly, 1440, 60);
  const idx = new Map(daily.map((d, i) => [d.t, i]));
  const onByDay = new Map<number, boolean>();
  for (const [t, i] of idx) onByDay.set(t, i > 0 && targetWeight(daily, i - 1, btcUp, E1_PARAMS) > 0);
  return c.map((x) => !!onByDay.get(Math.floor(x.t / DAY) * DAY));
}

type V = { variant: "dip" | "break"; emaLen?: number; rsiMax?: number; look?: number; volMult?: number };
export function signals(c: Candle[], on: boolean[], v: V): Sig[] {
  const cl = c.map((x) => x.c), a = atr(c, 14);
  const exit = (i: number) => ({ stopDist: 1.5 * a[i], targetDist: 3 * a[i], maxBars: 24 });
  if (v.variant === "dip") {
    const e = ema(cl, v.emaLen!), r = rsi(cl, 3);
    return c.map((x, i) => (on[i] && a[i] > 0 && x.c > e[i] && r[i] < v.rsiMax! ? exit(i) : null));
  }
  const hi = priorHigh(c, v.look!), va = sma(c.map((x) => x.v ?? 0), 20);
  return c.map((x, i) => (on[i] && a[i] > 0 && i > 0 && x.c > hi[i] && (x.v ?? 0) > v.volMult! * va[i - 1] ? exit(i) : null));
}

const BASE: Record<string, V> = { dip: { variant: "dip", emaLen: 100, rsiMax: 20 }, break: { variant: "break", look: 24, volMult: 1.5 } };
const NEIGH: Record<string, V[]> = {
  dip: [{ ...BASE.dip, rsiMax: 15 }, { ...BASE.dip, rsiMax: 25 }, { ...BASE.dip, emaLen: 50 }, { ...BASE.dip, emaLen: 200 }],
  break: [{ ...BASE.break, look: 12 }, { ...BASE.break, look: 48 }, { ...BASE.break, volMult: 1.2 }, { ...BASE.break, volMult: 2 }],
};

// Look-ahead guard on both variants (house rules).
{
  const c = btcH.slice(-4000), on = regimeOn(c, btcH);
  for (const k of Object.keys(BASE)) assertNoLookahead(`S1-${k}`, (cc) => signals(cc, on.slice(0, cc.length), BASE[k]), c, 15);
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const out: Record<string, unknown> = {};
for (const k of Object.keys(BASE)) {
  const cells: Record<string, unknown> = {};
  const allTrades: any[][] = [];
  const gates = { trades30: true, positiveEverywhere: true, random90: true, stressPositive: true, neighbours80: true };
  for (const [gName, g] of Object.entries(GROUPS)) {
    const hourly = Object.fromEntries(g.coins.map((m) => [m, load(g.dir, m)]));
    const on = Object.fromEntries(g.coins.map((m) => [m, regimeOn(hourly[m], hourly[m])]));
    const sigOf = (v: V) => Object.fromEntries(g.coins.map((m) => [m, signals(hourly[m], on[m], v)]));
    const base = sigOf(BASE[k]);
    for (const [pName, [from, to]] of Object.entries(PERIODS)) {
      const runs = runContinuous(hourly, base, from, to);
      const trades = runs.flatMap((r) => r.trades);
      allTrades.push(trades);
      const ts = tradeStats(trades, 1000, g.coins.length), ps = portfolioStats(runs);
      const rnd = randomEntryBenchmark(hourly, base, from, to, { seeds: 100, allowed: on });
      const stress = portfolioStats(runContinuous(hourly, base, from, to, { feeRate: 0.0025, slippage: 0.0002 })).avgReturnPct;
      const nb = NEIGH[k].map((v) => portfolioStats(runContinuous(hourly, sigOf(v), from, to)).avgReturnPct);
      const regimeShare = g.coins.reduce((s, m) => s + on[m].filter((x, i) => x && hourly[m][i].t >= from && hourly[m][i].t < to).length, 0) / g.coins.reduce((s, m) => s + hourly[m].filter((x) => x.t >= from && x.t < to).length, 0);
      const pct = percentileOf(rnd, ps.avgReturnPct);
      cells[`${gName} ${pName}`] = { returnPctPerCoin: r2(ps.avgReturnPct), trades: ts.trades, winRatePct: r2(ts.winRate * 100), avgWinR: r2(ts.avgWinR), avgLossR: r2(ts.avgLossR), expectancyR: r2(ts.expectancyR), t: r2(ts.tStat), sharpe: r2(ps.sharpe), maxDDPct: r2(ps.maxDrawdownPct), feesPctOfPreFeeProfit: r2(ts.feesPctOfPreFeeProfit), randomP50: r2(rnd[50]), randomPctile: Math.round(pct * 100), atStressCost: r2(stress), neighbours: nb.map(r2), regimeOnSharePct: r2(regimeShare * 100) };
      if (ts.trades < 30) gates.trades30 = false;
      if (ps.avgReturnPct <= 0) gates.positiveEverywhere = false;
      if (pct < 0.9) gates.random90 = false;
      if (stress <= 0) gates.stressPositive = false;
      if (nb.filter((x) => x > 0).length / nb.length < 0.8) gates.neighbours80 = false;
    }
  }
  const pt = pooledT(allTrades);
  const allGates = { ...gates, pooledT2: pt >= 2 };
  out[`S1-${k}`] = { cells, pooledT: r2(pt), gates: allGates, passed: Object.values(allGates).every(Boolean) };
  console.log(`\n=== S1-${k}: ${Object.values(allGates).every(Boolean) ? "PASSES" : "FAILS"}  pooled t ${r2(pt)}  gates ${JSON.stringify(allGates)}`);
  for (const [c, v] of Object.entries(cells)) console.log(`  ${c.padEnd(13)} ${JSON.stringify(v)}`);
}

// Secondary (does not decide): 15-minute bars on the last 30 days of 1-minute data, 5 coins.
if (existsSync(".paper-data/hist/BTC_USD_1m.json")) {
  const sec: Record<string, unknown> = {};
  for (const k of Object.keys(BASE)) {
    let tot = 0, n = 0;
    for (const m of GROUPS.original5.coins) {
      const c = resample(JSON.parse(readFileSync(`.paper-data/hist/${m}_1m.json`, "utf8")), 15);
      const on = regimeOn(c, load(".paper-data/hist", m));
      const [run] = runContinuous({ [m]: c }, { [m]: signals(c, on, BASE[k]) }, c[0].t + 3 * DAY, c[c.length - 1].t + 1);
      tot += run.result.returnPct; n += run.trades.length;
    }
    sec[`S1-${k} 15m, 30 days`] = { returnPctPerCoin: r2(tot / 5), trades: n };
  }
  out.secondary15m = sec;
  console.log("\nsecondary (15m, 30 days, 5 coins):", JSON.stringify(sec));
}
writeFileSync(".paper-data/scalper.json", JSON.stringify(out, null, 1));
