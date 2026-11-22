// H7: cross-sectional momentum, top 3 of 13 inside the BTC gate (docs/research/hypotheses/H7-xsmom-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";

const DAY = 86_400_000, H4 = 4 * 3_600_000;
const COINS: [string, string][] = [
  ...["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"].map((m) => [".paper-data/hist", m] as [string, string]),
  ...["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"].map((m) => [".paper-data/h2", m] as [string, string]),
];
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const daily: Record<string, Candle[]> = Object.fromEntries(COINS.map(([d, m]) => [m, resample(JSON.parse(readFileSync(`${d}/${m}_1h.json`, "utf8")) as Candle[], 1440, 60)]));
const idx: Record<string, Map<number, number>> = Object.fromEntries(Object.entries(daily).map(([m, c]) => [m, new Map(c.map((x, i) => [x.t, i]))]));
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

type P = { top: number; look: number };
/** Weights for the day after `dayT` closes. Uses bars with t <= dayT only. */
function weightsAt(dayT: number, p: P, data = daily, ix = idx): Record<string, number> {
  const out: Record<string, number> = {};
  if (!btcUp.get(dayT + DAY - H4)) return out;
  const cand: { m: string; r: number; vol: number }[] = [];
  for (const [m, c] of Object.entries(data)) {
    const j = ix[m].get(dayT);
    if (j === undefined || j < Math.max(p.look, E1_PARAMS.volLen + 1)) continue;
    const vol = sd(Array.from({ length: E1_PARAMS.volLen }, (_, k) => c[j - k].c / c[j - k - 1].c - 1)) * Math.sqrt(365);
    cand.push({ m, r: c[j].c / c[j - p.look].c - 1, vol });
  }
  cand.sort((a, b) => b.r - a.r);
  for (const x of cand.slice(0, p.top)) out[x.m] = x.vol > 0 ? (1 / p.top) * Math.min(1, E1_PARAMS.volTarget / x.vol) : 0;
  return out;
}
function stats(d: number[]) {
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2) };
}
/** Daily portfolio returns for days D in [from, to); `wf(prevDay)` gives weights for D. */
function run(from: number, to: number, wf: (prevT: number) => Record<string, number>, cost: number) {
  let w0: Record<string, number> = {}; const rets: number[] = []; let changes = 0, fees = 0, held = 0;
  const pnl: Record<string, number> = {};
  for (let D = from; D < to; D += DAY) {
    const w = wf(D - DAY); let r = 0;
    for (const m of new Set([...Object.keys(w), ...Object.keys(w0)])) {
      const a = w0[m] ?? 0, b = w[m] ?? 0;
      if (a !== b) { changes++; fees += Math.abs(b - a) * cost; r -= Math.abs(b - a) * cost; }
      if (b > 0) {
        const j = idx[m].get(D);
        if (j !== undefined && j > 0) { const x = b * (daily[m][j].c / daily[m][j - 1].c - 1); r += x; pnl[m] = (pnl[m] ?? 0) + x; }
      }
    }
    held += Object.values(w).filter((x) => x > 0).length;
    rets.push(r); w0 = w;
  }
  const pos = Object.values(pnl).filter((x) => x > 0), totPos = pos.reduce((a, b) => a + b, 0);
  return { ...stats(rets), changes, feesPct: +(100 * fees).toFixed(1), avgCoinsHeld: +(held / rets.length).toFixed(2), topCoinShareOfGains: totPos > 0 ? +(Math.max(...pos) / totPos).toFixed(2) : 0 };
}
const e1w = (prevT: number) => {
  const out: Record<string, number> = {};
  for (const [m, c] of Object.entries(daily)) { const j = idx[m].get(prevT); if (j !== undefined) { const w = targetWeight(c, j, btcUp, E1_PARAMS); if (w > 0) out[m] = w / 13; } }
  return out;
};

// Look-ahead guard: dropping bars after the decision day must not change the selection.
{
  const p = { top: 3, look: 30 };
  for (const d of [Date.parse("2023-03-01"), Date.parse("2023-11-15"), Date.parse("2024-12-05"), Date.parse("2025-10-01"), Date.parse("2026-04-20")]) {
    const cut = Object.fromEntries(Object.entries(daily).map(([m, c]) => [m, c.filter((x) => x.t <= d)]));
    const cix = Object.fromEntries(Object.entries(cut).map(([m, c]) => [m, new Map(c.map((x, i) => [x.t, i]))]));
    if (JSON.stringify(weightsAt(d, p, cut, cix)) !== JSON.stringify(weightsAt(d, p))) throw new Error("look-ahead in H7 selection");
  }
}

const BASE: P = { top: 3, look: 30 };
const NB: P[] = [{ ...BASE, top: 2 }, { ...BASE, top: 5 }, { ...BASE, look: 20 }, { ...BASE, look: 45 }];
const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanE1both: false };
let nbPos = 0, nbAll = 0, better = 0;
for (const [wn, [f, t]] of Object.entries(W)) {
  const h = run(f, t, (d) => weightsAt(d, BASE), 0.0012), e1 = run(f, t, e1w, 0.0012);
  const stress = run(f, t, (d) => weightsAt(d, BASE), 0.0027);
  const nb = NB.map((p) => run(f, t, (d) => weightsAt(d, p), 0.0012).totalPct);
  cells[wn] = { xsmom: h, e1_13coins: e1, atStress: stress.totalPct, neighbours: nb };
  if (h.totalPct <= 0) g.positive = false;
  if (h.sharpe < 0.5) g.sharpe05 = false;
  if (stress.totalPct <= 0) g.stressPositive = false;
  if (h.maxDDPct > 25) g.dd25 = false;
  nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
  if (h.cagrPerDD > e1.cagrPerDD) better++;
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanE1both = better === 2;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanE1: `${better}/2` };
writeFileSync(".paper-data/h7-xsmom.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
