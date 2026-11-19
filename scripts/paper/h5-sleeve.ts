// H5: 4h breakout trail+gate as a 20% sleeve on the E1 trend core (docs/research/hypotheses/H5-sleeve-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { applyBtcGate, btcUpByTime } from "../../lib/paper/scalp/regime";
import { applyRegime, applyTrail, strategyById, type Params } from "../../lib/paper/scalp/strategies";
import type { RiskOptions } from "../../lib/paper/scalp/engine";
import { DAY, assertNoLookahead, runContinuous, type CoinRun, type Sig } from "../../lib/paper/scalp/evaluate";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";

const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const hourly = (dir: string, m: string) => JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8")) as Candle[];
const btcUp = btcUpByTime(resample(hourly(".paper-data/hist", "BTC_USD"), 240, 60));
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

const BASE_P: Params = { n: 40, volMult: 1.5, stopAtr: 1.5, rr: 2, trend: 0, regimeHours: 0 };
const sleeveSignals = (c: Candle[], p: Params): Sig[] => {
  let x = applyRegime(c, strategyById("breakout").signals(c, p), 240, 0);
  x = applyTrail(c, x, 3, 120);
  return applyBtcGate(c, x, btcUp);
};

/** Day-start -> E1 core daily return (equal weight over the group). */
function coreDaily(daily: Record<string, Candle[]>, from: number, to: number, cost: number): Map<number, number> {
  const byDay = new Map<number, number>(); const n = Object.keys(daily).length;
  for (const c of Object.values(daily)) {
    let w0 = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const w = targetWeight(c, i - 1, btcUp, E1_PARAMS);
      const r = w * (c[i].c / c[i - 1].c - 1) - Math.abs(w - w0) * cost; w0 = w;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / n);
    }
  }
  return byDay;
}
/** Day-start -> sleeve daily return: equal-weight mean of the coins' compounded intraday equity changes. */
function sleeveDaily(runs: CoinRun[]): Map<number, number> {
  const per = runs.map((r) => {
    const m = new Map<number, number>(); const e = r.result.equity;
    for (let j = 1; j < e.length; j++) { const d = Math.floor(e[j].t / DAY) * DAY; m.set(d, (1 + (m.get(d) ?? 0)) * (e[j].v / e[j - 1].v) - 1); }
    return m;
  });
  const days = new Set(per.flatMap((m) => [...m.keys()]));
  return new Map([...days].map((d) => [d, per.reduce((s, m) => s + (m.get(d) ?? 0), 0) / per.length]));
}
function stats(d: number[]) {
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2) };
}
function combine(core: Map<number, number>, sleeve: Map<number, number>, share: number): number[] {
  return [...core.keys()].sort((a, b) => a - b).map((d) => (1 - share) * core.get(d)! + share * (sleeve.get(d) ?? 0));
}

// Look-ahead guard on the sleeve's signal chain (house rule).
assertNoLookahead("H5 sleeve breakout+trail+gate", (c) => sleeveSignals(c, BASE_P), resample(hourly(".paper-data/hist", "ETH_USD"), 240, 60));

const SHARE = 0.2;
const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanE1_3of4: false };
let nbPos = 0, nbAll = 0, better = 0;
for (const [gn, grp] of Object.entries(G)) {
  const raw = Object.fromEntries(grp.coins.map((m) => [m, hourly(grp.dir, m)]));
  const daily = Object.fromEntries(grp.coins.map((m) => [m, resample(raw[m], 1440, 60)]));
  for (const [wn, [f, t]] of Object.entries(W)) {
    const warm = f - 60 * DAY;
    const s4 = Object.fromEntries(grp.coins.map((m) => [m, resample(raw[m].filter((c) => c.t >= warm && c.t < t), 240, 60)]));
    const sleeveRuns = (p: Params, opt: Partial<RiskOptions> = {}) =>
      runContinuous(s4, Object.fromEntries(grp.coins.map((m) => [m, sleeveSignals(s4[m], p)])), f, t, opt);
    const core = coreDaily(daily, f, t, 0.0012), coreStress = coreDaily(daily, f, t, 0.0027);
    const baseRuns = sleeveRuns(BASE_P), sl = sleeveDaily(baseRuns);
    const comb = stats(combine(core, sl, SHARE)), e1 = stats(combine(core, sl, 0));
    const stress = stats(combine(coreStress, sleeveDaily(sleeveRuns(BASE_P, { feeRate: 0.0025, slippage: 0.0002 })), SHARE));
    const nb = [
      stats(combine(core, sl, 0.1)).totalPct,
      stats(combine(core, sl, 0.3)).totalPct,
      stats(combine(core, sleeveDaily(sleeveRuns({ ...BASE_P, n: 20 })), SHARE)).totalPct,
      stats(combine(core, sleeveDaily(sleeveRuns({ ...BASE_P, n: 60 })), SHARE)).totalPct,
    ];
    // Diagnostic: the sleeve alone and its correlation with the core.
    const days = [...core.keys()].sort((a, b) => a - b);
    const a = days.map((d) => core.get(d)!), b = days.map((d) => sl.get(d) ?? 0);
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    const corr = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / ((a.length - 1) * sd(a) * sd(b));
    const sleeveAlone = { ...stats(b), trades: baseRuns.reduce((s, r) => s + r.trades.length, 0), corrWithCore: +corr.toFixed(2) };
    cells[`${gn} ${wn}`] = { combined: comb, e1Alone: e1, sleeveAlone, combinedAtStress: stress.totalPct, neighbours: nb };
    if (comb.totalPct <= 0) g.positive = false;
    if (comb.sharpe < 0.5) g.sharpe05 = false;
    if (stress.totalPct <= 0) g.stressPositive = false;
    if (comb.maxDDPct > 25) g.dd25 = false;
    nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
    if (comb.cagrPerDD > e1.cagrPerDD) better++;
  }
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanE1_3of4 = better >= 3;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanE1: `${better}/4` };
writeFileSync(".paper-data/h5-sleeve.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
