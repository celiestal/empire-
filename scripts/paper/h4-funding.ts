// H4: funding-rate crowding filter on the trend rule (docs/research/hypotheses/H4-funding-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";

const DAY = 86_400_000, HOUR = 3_600_000;
const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const daily = (dir: string, m: string) => resample(JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8")) as Candle[], 1440, 60);
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const FUND = JSON.parse(readFileSync(".paper-data/funding/BTCUSD-PERP_1h.json", "utf8")) as { t: number; v: number }[];
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

type FP = { pct: number; meanDays: number; mult: number };
/** Day-start -> crowded flag for that day (decided at its close). Uses funding stamps <= day start + 22h only. */
function crowdedByDay(fund: { t: number; v: number }[], p: FP): Map<number, boolean> {
  const sum = new Map<number, { s: number; n: number }>();
  for (const x of fund) {
    const d = Math.floor(x.t / DAY) * DAY;
    if (x.t - d > 22 * HOUR) continue;
    const e = sum.get(d) ?? { s: 0, n: 0 }; e.s += x.v; e.n++; sum.set(d, e);
  }
  const days = [...sum.keys()].sort((a, b) => a - b);
  const F1 = new Map<number, number>();
  for (const d of days) { const e = sum.get(d)!; if (e.n >= 12) F1.set(d, e.s / e.n); }
  const F = new Map<number, number>();
  for (const d of days) {
    const xs: number[] = [];
    for (let k = 0; k < p.meanDays; k++) { const v = F1.get(d - k * DAY); if (v !== undefined) xs.push(v); }
    if (F1.has(d) && xs.length === p.meanDays) F.set(d, xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  const out = new Map<number, boolean>();
  for (const d of days) {
    const f = F.get(d); if (f === undefined) { out.set(d, false); continue; }
    const hist: number[] = [];
    for (let k = 1; k <= 365; k++) { const v = F.get(d - k * DAY); if (v !== undefined) hist.push(v); }
    if (hist.length < 180) { out.set(d, false); continue; }
    hist.sort((a, b) => a - b);
    out.set(d, f >= hist[Math.min(hist.length - 1, Math.floor(p.pct * hist.length))]);
  }
  return out;
}
function run(coins: Record<string, Candle[]>, from: number, to: number, crowd: Map<number, boolean> | null, mult: number, cost: number) {
  const byDay = new Map<number, number>(); const n = Object.keys(coins).length;
  for (const c of Object.values(coins)) {
    let w0 = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      let w = targetWeight(c, i - 1, btcUp, E1_PARAMS);
      if (crowd && crowd.get(c[i - 1].t)) w *= mult;
      const r = w * (c[i].c / c[i - 1].c - 1) - Math.abs(w - w0) * cost; w0 = w;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / n);
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2) };
}

// Look-ahead guard: dropping funding after day d's 22:00 stamp must not change day d's flag.
{
  const BASEp: FP = { pct: 0.9, meanDays: 1, mult: 0.5 }, full = crowdedByDay(FUND, BASEp);
  for (const d of [Date.parse("2023-03-10"), Date.parse("2024-03-12"), Date.parse("2025-01-20"), Date.parse("2026-06-05")]) {
    const part = crowdedByDay(FUND.filter((x) => x.t <= d + 22 * HOUR), BASEp);
    if (part.get(d) !== full.get(d)) throw new Error("look-ahead in funding flag");
  }
}

const BASE: FP = { pct: 0.9, meanDays: 1, mult: 0.5 };
const NB: FP[] = [{ ...BASE, pct: 0.85 }, { ...BASE, pct: 0.95 }, { ...BASE, meanDays: 3 }, { ...BASE, mult: 0 }];
const crowdBase = crowdedByDay(FUND, BASE);
const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanE1_3of4: false };
let nbPos = 0, nbAll = 0, better = 0;
const diag: Record<string, unknown> = {};
for (const [gn, grp] of Object.entries(G)) {
  const coins = Object.fromEntries(grp.coins.map((m) => [m, daily(grp.dir, m)]));
  for (const [wn, [f, t]] of Object.entries(W)) {
    const h4 = run(coins, f, t, crowdBase, BASE.mult, 0.0012), e1 = run(coins, f, t, null, 1, 0.0012);
    const stress = run(coins, f, t, crowdBase, BASE.mult, 0.0027);
    const nb = NB.map((p) => run(coins, f, t, crowdedByDay(FUND, p), p.mult, 0.0012).totalPct);
    cells[`${gn} ${wn}`] = { withFilter: h4, e1Baseline: e1, filterAtStress: stress.totalPct, neighbours: nb };
    if (h4.totalPct <= 0) g.positive = false;
    if (h4.sharpe < 0.5) g.sharpe05 = false;
    if (stress.totalPct <= 0) g.stressPositive = false;
    if (h4.maxDDPct > 25) g.dd25 = false;
    nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
    if (h4.cagrPerDD > e1.cagrPerDD) better++;
    // Diagnostic: next-day equal-weight return of coins E1 holds, crowded vs normal days.
    const cr: number[] = [], nm: number[] = [];
    let crowdedDays = 0, allDays = 0;
    const ref = Object.values(coins)[0];
    for (let i = 1; i < ref.length; i++) if (ref[i].t >= f && ref[i].t < t) { allDays++; if (crowdBase.get(ref[i - 1].t)) crowdedDays++; }
    const byDay = new Map<number, number[]>();
    for (const c of Object.values(coins)) for (let i = 1; i < c.length; i++) {
      if (c[i].t < f || c[i].t >= t || targetWeight(c, i - 1, btcUp, E1_PARAMS) <= 0) continue;
      (byDay.get(c[i - 1].t) ?? byDay.set(c[i - 1].t, []).get(c[i - 1].t)!).push(c[i].c / c[i - 1].c - 1);
    }
    for (const [d, rs] of byDay) (crowdBase.get(d) ? cr : nm).push(rs.reduce((a, b) => a + b, 0) / rs.length);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const tstat = cr.length > 2 && nm.length > 2 ? (mean(cr) - mean(nm)) / Math.sqrt(sd(cr) ** 2 / cr.length + sd(nm) ** 2 / nm.length) : NaN;
    diag[`${gn} ${wn}`] = { crowdedShareOfDays: +(crowdedDays / allDays).toFixed(3), investedCrowdedDays: cr.length, investedNormalDays: nm.length, nextDayPctCrowded: +(100 * mean(cr)).toFixed(3), nextDayPctNormal: +(100 * mean(nm)).toFixed(3), tCrowdedMinusNormal: +tstat.toFixed(2) };
  }
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanE1_3of4 = better >= 3;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanE1: `${better}/4`, diagnostic: diag };
writeFileSync(".paper-data/h4-funding.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
