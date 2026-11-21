// H10: rebalance band for the trend rule (docs/research/hypotheses/H10-band-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";

const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const daily = (dir: string, m: string) => resample(JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8")) as Candle[], 1440, 60);
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** band = 0 reproduces E1 exactly (every change of target is traded). */
function run(coins: Record<string, Candle[]>, from: number, to: number, band: number, cost: number) {
  const byDay = new Map<number, number>(); const n = Object.keys(coins).length;
  let fees = 0, rebalances = 0, gapSum = 0, gapN = 0;
  for (const c of Object.values(coins)) {
    let w = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const tw = targetWeight(c, i - 1, btcUp, E1_PARAMS);
      let nw = w;
      if (tw === 0 || w === 0 || Math.abs(tw - w) > band) nw = tw;
      const fee = Math.abs(nw - w) * cost;
      if (nw !== w) rebalances++;
      if (tw > 0) { gapSum += Math.abs(nw - tw); gapN++; }
      fees += fee / n;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + (nw * (c[i].c / c[i - 1].c - 1) - fee) / n);
      w = nw;
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2), rebalances, feesPct: +(100 * fees).toFixed(2), meanGap: +(gapSum / Math.max(1, gapN)).toFixed(3) };
}

const BAND = 0.1, NB = [0.05, 0.15, 0.2];
const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanE1_3of4: false, lowerFeesAll4: true };
let nbPos = 0, nbAll = 0, better = 0;
for (const [gn, grp] of Object.entries(G)) {
  const coins = Object.fromEntries(grp.coins.map((m) => [m, daily(grp.dir, m)]));
  for (const [wn, [f, t]] of Object.entries(W)) {
    const h = run(coins, f, t, BAND, 0.0012), e1 = run(coins, f, t, 0, 0.0012);
    const stress = run(coins, f, t, BAND, 0.0027), e1Stress = run(coins, f, t, 0, 0.0027);
    const nb = NB.map((b) => run(coins, f, t, b, 0.0012).totalPct);
    cells[`${gn} ${wn}`] = { band10: h, e1, bandAtStress: stress.totalPct, e1AtStress: e1Stress.totalPct, neighbours: nb };
    if (h.totalPct <= 0) g.positive = false;
    if (h.sharpe < 0.5) g.sharpe05 = false;
    if (stress.totalPct <= 0) g.stressPositive = false;
    if (h.maxDDPct > 25) g.dd25 = false;
    if (h.feesPct >= e1.feesPct) g.lowerFeesAll4 = false;
    nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
    if (h.cagrPerDD > e1.cagrPerDD) better++;
  }
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanE1_3of4 = better >= 3;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanE1: `${better}/4` };
writeFileSync(".paper-data/h10-band.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
