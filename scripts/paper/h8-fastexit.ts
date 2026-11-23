// H8: faster exit (10-day low) for the trend rule (docs/research/hypotheses/H8-fastexit-preregistration.md). Run once.
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

type P = { exitN: number; reN: number | null } | null; // null = plain E1
const lowN = (c: Candle[], j: number, n: number) => { let x = Infinity; for (let k = j - n; k < j; k++) x = Math.min(x, c[k].l); return x; };
const highN = (c: Candle[], j: number, n: number) => { let x = -Infinity; for (let k = j - n; k < j; k++) x = Math.max(x, c[k].h); return x; };

/** Held weights for the day after each bar j (index j -> weight). Stateful but causal: uses bars <= j only. */
function heldWeights(c: Candle[], p: P, upTo = c.length - 1): { w: number[]; exits: number[] } {
  const w: number[] = new Array(c.length).fill(0), exits: number[] = [];
  let out = false;
  for (let j = 0; j <= upTo; j++) {
    const tw = targetWeight(c, j, btcUp, E1_PARAMS);
    if (!p) { w[j] = tw; continue; }
    const n = Math.max(p.exitN, p.reN ?? 0);
    if (tw === 0) out = false;
    else if (j > n) {
      if (!out && c[j].c < lowN(c, j, p.exitN)) { out = true; exits.push(j); }
      else if (out && p.reN !== null && c[j].c > highN(c, j, p.reN)) out = false;
    }
    w[j] = out ? 0 : tw;
  }
  return { w, exits };
}
function run(coins: Record<string, Candle[]>, from: number, to: number, p: P, cost: number) {
  const byDay = new Map<number, number>(); const n = Object.keys(coins).length;
  let fees = 0, exitsN = 0; const after10: number[] = [];
  for (const c of Object.values(coins)) {
    const { w, exits } = heldWeights(c, p);
    for (const j of exits) if (c[j + 1] && c[j + 1].t >= from && c[j + 1].t < to && c[j + 10]) { exitsN++; after10.push(c[j + 10].c / c[j].c - 1); }
    let w0 = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const wi = w[i - 1], fee = Math.abs(wi - w0) * cost;
      fees += fee / n;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + (wi * (c[i].c / c[i - 1].c - 1) - fee) / n);
      w0 = wi;
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  const a10 = after10.length ? after10.reduce((a, b) => a + b, 0) / after10.length : NaN;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2), feesPct: +(100 * fees).toFixed(2), earlyExits: exitsN, coinMove10dAfterExitPct: +(100 * a10).toFixed(2) };
}

// Look-ahead guard: the held weight at bar j must not change when later bars are removed.
{
  const c = daily(".paper-data/hist", "SOL_USD"), p = { exitN: 10, reN: 10 }, full = heldWeights(c, p).w;
  for (const j of [300, 700, 1100, 1500]) if (heldWeights(c.slice(0, j + 1), p).w[j] !== full[j]) throw new Error("look-ahead in H8 weights");
}

const BASE = { exitN: 10, reN: 10 as number | null };
const NB = [{ exitN: 7, reN: 7 }, { exitN: 15, reN: 15 }, { exitN: 10, reN: 20 }, { exitN: 10, reN: null }];
const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanE1_3of4: false };
let nbPos = 0, nbAll = 0, better = 0;
for (const [gn, grp] of Object.entries(G)) {
  const coins = Object.fromEntries(grp.coins.map((m) => [m, daily(grp.dir, m)]));
  for (const [wn, [f, t]] of Object.entries(W)) {
    const h = run(coins, f, t, BASE, 0.0012), e1 = run(coins, f, t, null, 0.0012);
    const stress = run(coins, f, t, BASE, 0.0027), e1s = run(coins, f, t, null, 0.0027);
    const nb = NB.map((p) => run(coins, f, t, p, 0.0012).totalPct);
    cells[`${gn} ${wn}`] = { fastExit: h, e1, atStress: stress.totalPct, e1AtStress: e1s.totalPct, neighbours: nb };
    if (h.totalPct <= 0) g.positive = false;
    if (h.sharpe < 0.5) g.sharpe05 = false;
    if (stress.totalPct <= 0) g.stressPositive = false;
    if (h.maxDDPct > 25) g.dd25 = false;
    nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
    if (h.cagrPerDD > e1.cagrPerDD) better++;
  }
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanE1_3of4 = better >= 3;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanE1: `${better}/4` };
writeFileSync(".paper-data/h8-fastexit.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
