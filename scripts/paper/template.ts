// T1: the shared guide's trend template (docs/research/2026-11-13-template-preregistration.md). Fake money only.
//   npx tsx scripts/paper/template.ts
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { atr, resample } from "../../lib/paper/scalp/indicators";
import { mergeSides, type EntrySignal } from "../../lib/paper/scalp/strategies";
import { assertNoLookahead, percentileOf, pooledT, portfolioStats, randomEntryBenchmark, runContinuous, tradeStats, type Sig } from "../../lib/paper/scalp/evaluate";
import type { RiskOptions, SimTrade } from "../../lib/paper/scalp/engine";

/** EMA that starts at the first non-NaN value (seeded with the simple average of the first `n` valid values). */
export function emaSafe(v: number[], n: number): number[] {
  const out = new Array(v.length).fill(NaN), k = 2 / (n + 1);
  let start = v.findIndex((x) => !Number.isNaN(x)), sum = 0, cnt = 0, prev = NaN;
  if (start < 0) return out;
  for (let i = start; i < v.length; i++) {
    if (cnt < n) { sum += v[i]; cnt++; if (cnt === n) { prev = sum / n; out[i] = prev; } continue; }
    prev = v[i] * k + prev * (1 - k); out[i] = prev;
  }
  return out;
}
export function macdHist(cl: number[]): number[] {
  const fast = emaSafe(cl, 12), slow = emaSafe(cl, 26);
  const line = fast.map((x, i) => x - slow[i]);
  const sig = emaSafe(line, 9);
  return line.map((x, i) => x - sig[i]);
}
/** Wilder's ADX. */
export function adx(c: Candle[], n = 14): number[] {
  const out = new Array(c.length).fill(NaN);
  let trS = 0, pS = 0, mS = 0, adxV = NaN; const dxs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
    const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    if (i <= n) { trS += tr; pS += pdm; mS += mdm; if (i < n) continue; }
    else { trS = trS - trS / n + tr; pS = pS - pS / n + pdm; mS = mS - mS / n + mdm; }
    const pdi = trS > 0 ? (100 * pS) / trS : 0, mdi = trS > 0 ? (100 * mS) / trS : 0;
    const dx = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    if (Number.isNaN(adxV)) { dxs.push(dx); if (dxs.length === n) { adxV = dxs.reduce((a, b) => a + b, 0) / n; out[i] = adxV; } }
    else { adxV = (adxV * (n - 1) + dx) / n; out[i] = adxV; }
  }
  return out;
}

type P = { emaLen: number; adxMin: number; atrMult: number };
export const T1: P = { emaLen: 200, adxMin: 20, atrMult: 2 };
export function t1Signals(c: Candle[], p: P, side: 1 | -1): Sig[] {
  const cl = c.map((x) => x.c), e = emaSafe(cl, p.emaLen), h = macdHist(cl), a = adx(c), at = atr(c, 14);
  const ok = c.map((x, i) => !Number.isNaN(e[i]) && !Number.isNaN(h[i]) && a[i] > p.adxMin && (side === 1 ? x.c > e[i] && h[i] > 0 : x.c < e[i] && h[i] < 0));
  return c.map((_, i): EntrySignal | null => (i > 0 && ok[i] && !ok[i - 1] && at[i] > 0 ? { side, stopDist: p.atrMult * at[i], targetDist: Infinity, trailDist: p.atrMult * at[i], maxBars: 500 } : null));
}
const sigs = (c: Candle[], p: P, mode: string) => (mode === "long" ? t1Signals(c, p, 1) : mergeSides(t1Signals(c, p, 1), t1Signals(c, p, -1)));

const COINS = ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD", "ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"];
const dir = (m: string) => (["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"].includes(m) ? ".paper-data/hist" : ".paper-data/h2");
const H1: Record<string, Candle[]> = Object.fromEntries(COINS.map((m) => [m, JSON.parse(readFileSync(`${dir(m)}/${m}_1h.json`, "utf8"))]));
const PER = { B: [Date.parse("2021-09-01"), Date.parse("2024-11-13")], A: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const OPT: Partial<RiskOptions> = { riskPerTrade: 0.01 };
const r2 = (x: number) => Math.round(x * 100) / 100;

// Look-ahead guard (house rules).
assertNoLookahead("T1 long", (cc) => t1Signals(cc, T1, 1), H1.BTC_USD.slice(-5000), 15);
assertNoLookahead("T1 short", (cc) => t1Signals(cc, T1, -1), H1.BTC_USD.slice(-5000), 15);

function evalSet(series: Record<string, Candle[]>, p: P, mode: string, from: number, to: number, opt = OPT) {
  const s = Object.fromEntries(Object.keys(series).map((m) => [m, sigs(series[m], p, mode)]));
  const runs = runContinuous(series, s, from, to, opt);
  const trades = runs.flatMap((r) => r.trades), ts = tradeStats(trades, 1000, runs.length), ps = portfolioStats(runs);
  return { s, runs, trades, row: { returnPct: r2(ps.avgReturnPct), annPct: r2(ps.annReturnPct), trades: ts.trades, winPct: r2(ts.winRate * 100), profitFactor: r2(ts.profitFactor), expectancyR: r2(ts.expectancyR), sharpe: r2(ps.sharpe), maxDDPct: r2(ps.maxDrawdownPct), avgWeeklyPct: r2((((1 + ps.annReturnPct / 100) ** (1 / 52)) - 1) * 100), feesPctOfPreFeeProfit: r2(ts.feesPctOfPreFeeProfit) } };
}

const out: Record<string, any> = {};
for (const mode of ["long", "both"]) {
  const res: Record<string, any> = {}; const pooled: SimTrade[][] = [];
  const g = { trades400: false, pf13: true, dd20: true, h1and4hPositive: true, positiveBtcAnd13: true, random90: true, stressPositive: true, neighbours80: true, pooledT2: false };
  let total1h = 0;
  for (const [pn, [f, t]] of Object.entries(PER)) {
    const btc = evalSet({ BTC_USD: H1.BTC_USD }, T1, mode, f, t);
    const btc4 = evalSet({ BTC_USD: resample(H1.BTC_USD, 240, 60) }, T1, mode, f, t);
    const all = evalSet(H1, T1, mode, f, t);
    const all4 = evalSet(Object.fromEntries(COINS.map((m) => [m, resample(H1[m], 240, 60)])), T1, mode, f, t);
    const rnd = randomEntryBenchmark({ BTC_USD: H1.BTC_USD }, btc.s, f, t, { seeds: 100, opt: OPT });
    const stress = evalSet({ BTC_USD: H1.BTC_USD }, T1, mode, f, t, { ...OPT, feeRate: 0.0025 }).row.returnPct;
    const nb = [{ ...T1, emaLen: 150 }, { ...T1, emaLen: 250 }, { ...T1, adxMin: 15 }, { ...T1, adxMin: 25 }, { ...T1, atrMult: 1.5 }, { ...T1, atrMult: 3 }].map((p) => evalSet({ BTC_USD: H1.BTC_USD }, p, mode, f, t).row.returnPct);
    pooled.push(all.trades); total1h += all.row.trades;
    res[pn] = { "BTC 1h": btc.row, "BTC 4h": btc4.row, "13 coins 1h": all.row, "13 coins 4h": all4.row, btcRandomP50: r2(rnd[50]), btcRandomPctile: Math.round(percentileOf(rnd, btc.row.returnPct) * 100), btcAt025Fee: stress, btcNeighbours: nb };
    if (btc.row.profitFactor < 1.3 || all.row.profitFactor < 1.3) g.pf13 = false;
    if (btc.row.maxDDPct > 20 || all.row.maxDDPct > 20) g.dd20 = false;
    if (btc.row.returnPct <= 0 || btc4.row.returnPct <= 0) g.h1and4hPositive = false;
    if (btc.row.returnPct <= 0 || all.row.returnPct <= 0) g.positiveBtcAnd13 = false;
    if (percentileOf(rnd, btc.row.returnPct) < 0.9) g.random90 = false;
    if (stress <= 0) g.stressPositive = false;
    if (nb.filter((x) => x > 0).length / nb.length < 0.8) g.neighbours80 = false;
  }
  g.trades400 = total1h >= 400;
  const pt = pooledT(pooled); g.pooledT2 = pt >= 2;
  out[mode] = { periods: res, pooledT: r2(pt), gates: g, passed: Object.values(g).every(Boolean) };
  console.log(`\n=== T1 ${mode}: ${out[mode].passed ? "PASSES" : "FAILS"}  pooled t ${r2(pt)}  ${JSON.stringify(g)}`);
  for (const [pn, r] of Object.entries(res)) { console.log(` [${pn}]`); for (const [k, v] of Object.entries(r)) console.log(`   ${k.padEnd(16)} ${JSON.stringify(v)}`); }
}
// BTC buy and hold for reference
for (const [pn, [f, t]] of Object.entries(PER)) { const c = H1.BTC_USD; const a = c.find((x) => x.t >= f)!, b = [...c].reverse().find((x) => x.t < t)!; console.log(`BTC buy & hold ${pn}: ${r2((b.c / a.o - 1) * 100)}%`); }
writeFileSync(".paper-data/template.json", JSON.stringify(out, null, 1));
