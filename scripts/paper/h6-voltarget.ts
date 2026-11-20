// H6: volatility target level for the trend rule (docs/research/hypotheses/H6-voltarget-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight, type TrendParams } from "../../lib/paper/trend/daily";

const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const daily = (dir: string, m: string) => resample(JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8")) as Candle[], 1440, 60);
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

function run(coins: Record<string, Candle[]>, from: number, to: number, p: TrendParams, cost: number) {
  const byDay = new Map<number, number>(); const n = Object.keys(coins).length;
  let feeSum = 0, rebalances = 0, wSum = 0, wN = 0;
  for (const c of Object.values(coins)) {
    let w0 = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const w = targetWeight(c, i - 1, btcUp, p);
      const fee = Math.abs(w - w0) * cost;
      if (w !== w0) rebalances++;
      if (w > 0) { wSum += w; wN++; }
      feeSum += fee / n;
      const r = w * (c[i].c / c[i - 1].c - 1) - fee; w0 = w;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / n);
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2), avgWeightWhenIn: +(wSum / Math.max(1, wN)).toFixed(2), rebalances, feesPct: +(100 * feeSum).toFixed(1) };
}

const LEVELS = [0.25, 0.3, 0.35, 0.4, 0.6];
const cells: Record<string, Record<string, unknown>> = {};
let ddLower = 0, ratioOK = 0, posAll = true, stressAll = true, nbPos = 0, nbAll = 0;
for (const [gn, grp] of Object.entries(G)) {
  const coins = Object.fromEntries(grp.coins.map((m) => [m, daily(grp.dir, m)]));
  for (const [wn, [f, t]] of Object.entries(W)) {
    const r = Object.fromEntries(LEVELS.map((v) => [`vt${Math.round(v * 100)}`, run(coins, f, t, { ...E1_PARAMS, volTarget: v }, 0.0012)]));
    const stress30 = run(coins, f, t, { ...E1_PARAMS, volTarget: 0.3 }, 0.0027).totalPct;
    cells[`${gn} ${wn}`] = { ...r, vt30AtStress: stress30 };
    const a = r.vt30 as ReturnType<typeof run>, b = r.vt40 as ReturnType<typeof run>;
    if (a.maxDDPct < b.maxDDPct) ddLower++;
    if (a.cagrPerDD >= b.cagrPerDD) ratioOK++;
    if (a.totalPct <= 0) posAll = false;
    if (stress30 <= 0) stressAll = false;
    for (const k of ["vt25", "vt35"]) { nbAll++; if ((r[k] as ReturnType<typeof run>).totalPct > 0) nbPos++; }
  }
}
const gates = { lowerDDall4: ddLower === 4, ratioAtLeast3of4: ratioOK >= 3, positiveAndStressAll: posAll && stressAll, neighboursAllPositive: nbPos === nbAll };
const out = { cells, gates, adopt30: Object.values(gates).every(Boolean), ddLower: `${ddLower}/4`, ratioAtLeastAs40: `${ratioOK}/4`, neighboursPositive: `${nbPos}/${nbAll}`, note: "60% is reported for information only and cannot be adopted (house rule)." };
writeFileSync(".paper-data/h6-voltarget.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
