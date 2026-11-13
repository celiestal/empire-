// Crypto "core" rotation study (docs/research/2026-11-13-core-preregistration.md). Fake money only.
// Daily bars from hourly files in .paper-data/hist (download.ts ... 1h). Decide at the daily close, hold the next day.
//   npx tsx scripts/paper/core.ts
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { ema, resample, sma } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { assertNoLookahead } from "../../lib/paper/scalp/evaluate";

const S = JSON.parse(readFileSync("lib/paper/settings.json", "utf8"));
const DAY = 864e5;
const load = (m: string) => resample(JSON.parse(readFileSync(`.paper-data/hist/${m}_1h.json`, "utf8")) as Candle[], 1440, 60);
const TRAIN = S.periods.coreTrain.map((d: string) => Date.parse(d)) as [number, number];
const TEST = S.periods.coreTest.map((d: string) => Date.parse(d)) as [number, number];
const ENG: string[] = S.universe.engineCandidates;
const daily: Record<string, Candle[]> = Object.fromEntries([...ENG, "PAXG_USD", ...S.universe.development].map((m) => [m, load(m)]));
const ret = (m: string) => new Map(daily[m].map((x, i) => [x.t, i ? x.c / daily[m][i - 1].c - 1 : 0]));
const R: Record<string, Map<number, number>> = Object.fromEntries(Object.keys(daily).map((m) => [m, ret(m)]));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let n = 0, x = 0, y = 0; a.forEach((v, i) => { n += (v - ma) * (b[i] - mb); x += (v - ma) ** 2; y += (b[i] - mb) ** 2; }); return n / Math.sqrt(x * y); };

type Variant = { id: string; up: (c: Candle[]) => boolean[] };
const above = (c: Candle[], line: number[]) => c.map((x, i) => !Number.isNaN(line[i]) && x.c > line[i]);
const V: Record<string, Variant> = {
  sma200: { id: "sma200", up: (c) => above(c, sma(c.map((x) => x.c), 200)) },
  sma100: { id: "sma100", up: (c) => above(c, sma(c.map((x) => x.c), 100)) },
  sma150: { id: "sma150", up: (c) => above(c, sma(c.map((x) => x.c), 150)) },
  sma250: { id: "sma250", up: (c) => above(c, sma(c.map((x) => x.c), 250)) },
  ema200: { id: "ema200", up: (c) => above(c, ema(c.map((x) => x.c), 200)) },
  cross50_200: { id: "cross50_200", up: (c) => { const f = sma(c.map((x) => x.c), 50), s = sma(c.map((x) => x.c), 200); return c.map((_, i) => !Number.isNaN(s[i]) && f[i] > s[i]); } },
};
// Look-ahead guard on every variant (house rules): the up/down state must not change when later data is removed.
for (const v of Object.values(V)) assertNoLookahead(v.id, (c) => v.up(c).map((u) => (u ? { stopDist: 1, targetDist: 1, maxBars: 1 } : null)), daily.BTC_USD, 20);

/** Daily returns of the rotation over [from, to): hold engine if yesterday's close was "up", else safe. Costs on switches. */
function rotation(engine: string, safe: string, v: Variant, from: number, to: number, fee: number, slip: number) {
  const c = daily[engine], up = v.up(c), cost = fee + slip;
  const out: { t: number; r: number }[] = [];
  let prev: string | null = null, switches = 0;
  for (let i = 1; i < c.length; i++) {
    if (c[i].t < from || c[i].t >= to) continue;
    const hold = up[i - 1] ? engine : safe;
    let r = hold === "CASH" ? 0 : R[hold].get(c[i].t) ?? 0;
    if (prev !== null && hold !== prev) { r -= cost * ((prev === "CASH" ? 0 : 1) + (hold === "CASH" ? 0 : 1)); switches++; }
    if (prev === null && hold !== "CASH") r -= cost;
    prev = hold;
    out.push({ t: c[i].t, r });
  }
  return { days: out, switches };
}
function stats(days: { t: number; r: number }[], extra: Record<string, unknown> = {}) {
  const d = days.map((x) => x.r);
  let e = 1, pk = 1, dd = 0; const eq: number[] = [];
  for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); eq.push(e); }
  const wk: number[] = []; for (let i = 7; i < eq.length; i += 7) wk.push(eq[i] / eq[i - 7] - 1);
  const yrs = d.length / 365, cagr = e ** (1 / yrs) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), sharpe: +((mean(d) / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2), worstDayPct: +(100 * Math.min(...d)).toFixed(1), worstWeekPct: +(100 * Math.min(...wk)).toFixed(1), ...extra };
}
const hold = (m: string, from: number, to: number) => stats(daily[m].filter((x) => x.t >= from && x.t < to).map((x) => ({ t: x.t, r: R[m].get(x.t)! })));
const base = S.costs.base;
const out: Record<string, unknown> = {};

// Step 1: engine by trend gap on training.
const gaps = ENG.map((m) => {
  const c = daily[m], up = V.sma200.up(c); const a: number[] = [], b: number[] = [];
  for (let i = 1; i < c.length; i++) if (c[i].t >= TRAIN[0] && c[i].t < TRAIN[1] && !Number.isNaN(sma(c.map((x) => x.c), 200)[i - 1])) (up[i - 1] ? a : b).push(R[m].get(c[i].t)!);
  return { m, gapBpPerDay: +((mean(a) - mean(b)) * 1e4).toFixed(1), upDays: a.length, downDays: b.length };
});
const engine = gaps.sort((x, y) => y.gapBpPerDay - x.gapBpPerDay)[0].m;
out.step1_engine = { gaps, engine };

// Step 2: safe asset on the engine's down days in training.
const ec = daily[engine], eUp = V.sma200.up(ec);
const downDays = ec.filter((x, i) => i > 0 && x.t >= TRAIN[0] && x.t < TRAIN[1] && !eUp[i - 1]).map((x) => x.t);
const trainDays = ec.filter((x) => x.t >= TRAIN[0] && x.t < TRAIN[1] && R.PAXG_USD.has(x.t)).map((x) => x.t);
const paxgDown = mean(downDays.map((t) => R.PAXG_USD.get(t) ?? 0)) * 365 * 100;
const paxgCorr = corr(trainDays.map((t) => R.PAXG_USD.get(t)!), trainDays.map((t) => R[engine].get(t)!));
const safe = paxgDown > 0 && paxgCorr < 0.5 ? "PAXG_USD" : "CASH";
out.step2_safe = { engineDownDaysInTrain: downDays.length, paxgAnnualisedOnThoseDaysPct: +paxgDown.toFixed(1), cashPct: 0, paxgCorrWithEngine: +paxgCorr.toFixed(2), safe };

// Steps 3-4: switch and neighbours on training.
out.step4_neighbours_train = Object.fromEntries(Object.values(V).map((v) => { const r = rotation(engine, safe, v, TRAIN[0], TRAIN[1], base.feePerSide, base.slippage); return [v.id, stats(r.days, { switches: r.switches })]; }));
const neighboursOk = Object.values(out.step4_neighbours_train as Record<string, { totalPct: number }>).every((x) => x.totalPct > 0);

// Step 5: the test window, once.
const T = (fee: number, slip: number) => { const r = rotation(engine, safe, V.sma200, TEST[0], TEST[1], fee, slip); return stats(r.days, { switches: r.switches }); };
const test = T(base.feePerSide, base.slippage);
const bh = hold(engine, TEST[0], TEST[1]);
const costs = { base: test, doubleBase: T(2 * base.feePerSide, 2 * base.slippage), stress: T(S.costs.stress.feePerSide, S.costs.stress.slippage), retailTaker: T(S.costs.retailTaker.feePerSide, S.costs.retailTaker.slippage) };
out.step5_test = { engine, safe, rule: "sma200", ...costs, buyHoldEngine: bh, cashVariantForComparison: stats(rotation(engine, "CASH", V.sma200, TEST[0], TEST[1], base.feePerSide, base.slippage).days) };

// Comparison only (no pass/fail): market-filtered trend, 5 coins, 30-day + BTC gate, same windows.
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
function mft(from: number, to: number, cost: number) {
  const byDay = new Map<number, number>(); const M: string[] = S.universe.development;
  for (const m of M) { const c = daily[m]; let w0 = 0; for (let i = 31; i < c.length; i++) { if (c[i].t < from || c[i].t >= to) continue; const w = c[i - 1].c > c[i - 31].c && btcUp.get(c[i - 1].t + DAY - 4 * 36e5) ? 1 / M.length : 0; byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + w * R[m].get(c[i].t)! - Math.abs(w - w0) * cost); w0 = w; } }
  return stats([...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([t, r]) => ({ t, r })));
}
out.comparison_marketFilteredTrend = { train: mft(TRAIN[0], TRAIN[1], base.feePerSide + base.slippage), test: mft(TEST[0], TEST[1], base.feePerSide + base.slippage) };

const gates = {
  testPositive: test.totalPct > 0,
  betterReturnPerDDThanBuyHold: test.cagrPerDD > bh.cagrPerDD,
  maxDDAtMost35: test.maxDDPct <= 35,
  allNeighboursPositiveOnTrain: neighboursOk,
  positiveAtStressCost: costs.stress.totalPct > 0,
};
out.gates = gates;
out.passed = Object.values(gates).every(Boolean);
writeFileSync(".paper-data/core-study.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
