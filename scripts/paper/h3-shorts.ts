// H3: regime-matched shorts added to the trend rule (docs/research/hypotheses/H3-shorts-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime, classify } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";

const DAY = 86_400_000, H4 = 4 * 3_600_000;
const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const hourly = (dir: string, m: string) => JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8")) as Candle[];
const btcUp = btcUpByTime(resample(hourly(".paper-data/hist", "BTC_USD"), 240, 60));
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

type RP = { hours: number; erTrend: number };
/** Map day-start -> coin's regime label at the last 4h bar of the previous day. */
function downByDay(h: Candle[], rp: RP): Map<number, boolean> {
  const c4 = resample(h, 240, 60), lab = classify(c4, 240, { hours: rp.hours, erTrend: rp.erTrend, erRange: 0.15 });
  const m = new Map<number, boolean>();
  c4.forEach((x, i) => { if (new Date(x.t).getUTCHours() === 20) m.set(x.t + H4, lab[i] === "down"); });
  return m;
}
function run(coins: Record<string, { d: Candle[]; down: Map<number, boolean> }>, from: number, to: number, cost: number, withShorts: boolean, shortOnly = false) {
  const byDay = new Map<number, number>(); const n = Object.keys(coins).length;
  for (const { d: c, down } of Object.values(coins)) {
    let p0 = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const j = i - 1;
      let pos = shortOnly ? 0 : targetWeight(c, j, btcUp, E1_PARAMS); // +long
      const gateOpen = !!btcUp.get(c[j].t + DAY - H4);
      if (withShorts && pos === 0 && !gateOpen && down.get(c[i].t) && j > 21) {
        const vol = sd(Array.from({ length: 20 }, (_, k) => c[j - k].c / c[j - k - 1].c - 1)) * Math.sqrt(365);
        pos = vol > 0 ? -Math.min(1, 0.4 / vol) : 0;
      }
      const r = pos * (c[i].c / c[j].c - 1) - Math.abs(pos - p0) * cost - (pos < 0 ? -pos * 0.0003 : 0);
      p0 = pos;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / n);
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2) };
}

// Look-ahead guard on the regime label map: dropping later bars must not change earlier labels.
{
  const h = hourly(".paper-data/hist", "ETH_USD"), full = downByDay(h, { hours: 72, erTrend: 0.3 }), part = downByDay(h.slice(0, 20000), { hours: 72, erTrend: 0.3 });
  for (const [t, v] of part) if (full.get(t) !== v) throw new Error("look-ahead in regime label");
}

const BASE: RP = { hours: 72, erTrend: 0.3 };
const NB: RP[] = [{ hours: 48, erTrend: 0.3 }, { hours: 96, erTrend: 0.3 }, { hours: 72, erTrend: 0.25 }, { hours: 72, erTrend: 0.35 }];
const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanE1_3of4: false, shortsAlonePositive3of4: false };
let nbPos = 0, nbAll = 0, better = 0, shortsPos = 0;
for (const [gn, grp] of Object.entries(G)) {
  const raw = Object.fromEntries(grp.coins.map((m) => [m, hourly(grp.dir, m)]));
  const mk = (rp: RP) => Object.fromEntries(grp.coins.map((m) => [m, { d: resample(raw[m], 1440, 60), down: downByDay(raw[m], rp) }]));
  const base = mk(BASE);
  for (const [wn, [f, t]] of Object.entries(W)) {
    const both = run(base, f, t, 0.0012, true), e1 = run(base, f, t, 0.0012, false), shorts = run(base, f, t, 0.0012, true, true);
    const stress = run(base, f, t, 0.0027, true);
    const nb = NB.map((rp) => run(mk(rp), f, t, 0.0012, true).totalPct);
    cells[`${gn} ${wn}`] = { longPlusShort: both, e1LongOnly: e1, shortSideAlone: shorts, atStress: stress.totalPct, neighbours: nb };
    if (both.totalPct <= 0) g.positive = false;
    if (both.sharpe < 0.5) g.sharpe05 = false;
    if (stress.totalPct <= 0) g.stressPositive = false;
    if (both.maxDDPct > 25) g.dd25 = false;
    nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
    if (both.cagrPerDD > e1.cagrPerDD) better++;
    if (shorts.totalPct > 0) shortsPos++;
  }
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanE1_3of4 = better >= 3;
g.shortsAlonePositive3of4 = shortsPos >= 3;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanE1: `${better}/4`, shortsAlonePositive: `${shortsPos}/4` };
writeFileSync(".paper-data/h3-shorts.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
