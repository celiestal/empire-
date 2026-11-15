// H2: look-back ensemble for the trend rule (docs/research/hypotheses/H2-ensemble-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";

const DAY = 86_400_000, H4 = 4 * 3_600_000;
const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const daily = (dir: string, m: string) => resample(JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8")) as Candle[], 1440, 60);
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

type P = { looks: number[]; volTarget: number; volLen: number; cost: number };
/** Ensemble weight for the day after bar j closes; uses bars up to j only. */
function weightEnsemble(c: Candle[], j: number, p: P): number {
  const maxLook = Math.max(...p.looks);
  if (j < Math.max(maxLook, p.volLen + 1) || !btcUp.get(c[j].t + DAY - H4)) return 0;
  const score = p.looks.filter((L) => c[j].c > c[j - L].c).length / p.looks.length;
  const vol = sd(Array.from({ length: p.volLen }, (_, k) => c[j - k].c / c[j - k - 1].c - 1)) * Math.sqrt(365);
  return vol > 0 ? score * Math.min(1, p.volTarget / vol) : 0;
}
function run(coins: Record<string, Candle[]>, from: number, to: number, wf: (c: Candle[], j: number) => number, cost: number) {
  const byDay = new Map<number, number>(); const n = Object.keys(coins).length;
  for (const c of Object.values(coins)) {
    let w0 = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const w = wf(c, i - 1);
      const r = w * (c[i].c / c[i - 1].c - 1) - Math.abs(w - w0) * cost; w0 = w;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / n);
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2) };
}

// Look-ahead guard: the weight for a day must not change when later bars are removed.
{
  const c = daily(".paper-data/hist", "ETH_USD"), p: P = { looks: [14, 30, 60], volTarget: 0.4, volLen: 20, cost: 0.0012 };
  for (const j of [200, 600, 1000, 1500]) if (weightEnsemble(c.slice(0, j + 1), j, p) !== weightEnsemble(c, j, p)) throw new Error("look-ahead in ensemble weight");
}

const BASE: P = { looks: [14, 30, 60], volTarget: 0.4, volLen: 20, cost: 0.0012 };
const NB: P[] = [{ ...BASE, looks: [10, 30, 90] }, { ...BASE, looks: [20, 40, 80] }, { ...BASE, volTarget: 0.3 }, { ...BASE, volTarget: 0.5 }];
const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanE1_3of4: false };
let nbPos = 0, nbAll = 0, better = 0;
for (const [gn, grp] of Object.entries(G)) {
  const coins = Object.fromEntries(grp.coins.map((m) => [m, daily(grp.dir, m)]));
  for (const [wn, [f, t]] of Object.entries(W)) {
    const ens = run(coins, f, t, (c, j) => weightEnsemble(c, j, BASE), BASE.cost);
    const e1 = run(coins, f, t, (c, j) => targetWeight(c, j, btcUp, E1_PARAMS), BASE.cost);
    const stress = run(coins, f, t, (c, j) => weightEnsemble(c, j, BASE), 0.0027);
    const nb = NB.map((p) => run(coins, f, t, (c, j) => weightEnsemble(c, j, p), p.cost).totalPct);
    cells[`${gn} ${wn}`] = { ensemble: ens, e1Baseline: e1, ensembleAtStress: stress.totalPct, neighbours: nb };
    if (ens.totalPct <= 0) g.positive = false;
    if (ens.sharpe < 0.5) g.sharpe05 = false;
    if (stress.totalPct <= 0) g.stressPositive = false;
    if (ens.maxDDPct > 25) g.dd25 = false;
    nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
    if (ens.cagrPerDD > e1.cagrPerDD) better++;
  }
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanE1_3of4 = better >= 3;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanE1: `${better}/4` };
writeFileSync(".paper-data/h2-ensemble.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
