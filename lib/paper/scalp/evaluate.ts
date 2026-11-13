// Robust evaluation for trading research. Pure functions, no I/O.
//
// What it adds over scripts/paper/research.ts (which is kept unchanged):
// - Continuous out-of-sample simulation: one account per coin runs through the whole test span, the
//   settings simply switch at each walk-forward window. No reset every month, so long trades and the
//   risk limits behave as they would live. (The old per-window reset is kept as "legacy" to compare.)
// - Start-offset runs: the same procedure from several start dates, because one walk-forward run is
//   one draw out of many.
// - A random-entry benchmark: the strategy's own exits at random times. An entry rule only has value
//   if it beats this.
// - Pooled trade statistics (t-stat, bootstrap), portfolio Sharpe/Sortino/drawdown, and explicit gates.
import type { Candle } from "../strategy";
import { DEFAULT_RISK, simulate, type RiskOptions, type SimResult, type SimTrade } from "./engine";
import type { EntrySignal } from "./strategies";

export const DAY = 86_400_000;
export type Sig = EntrySignal | null;

export function indexAt(c: Candle[], t: number): number {
  let lo = 0, hi = c.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface Window { trainFrom: number; from: number; to: number; k: number; score: number }

/**
 * Walk-forward selection, the same rule as research.ts: on each training span pick the setting with the best
 * sum over coins of (return% - 0.5 x max drawdown%), needing at least `minTrades` trades in total.
 */
export function walkForward(
  series: Record<string, Candle[]>,
  sigs: Record<string, Sig[][]>,
  o: { start: number; end: number; trainDays: number; testDays: number; minTrades: number; opt?: Partial<RiskOptions> },
): Window[] {
  const out: Window[] = [];
  for (let ws = o.start; ws + (o.trainDays + o.testDays) * DAY <= o.end + DAY / 2; ws += o.testDays * DAY) {
    const trainTo = ws + o.trainDays * DAY;
    const { k, score } = pickBest(series, sigs, ws, trainTo, o.minTrades, o.opt);
    out.push({ trainFrom: ws, from: trainTo, to: Math.min(o.end, trainTo + o.testDays * DAY), k, score });
  }
  return out;
}

/** The tuning rule on one span: best sum over coins of (return% - 0.5 x max drawdown%), with >= minTrades trades. k = -1 if none qualifies. */
export function pickBest(series: Record<string, Candle[]>, sigs: Record<string, Sig[][]>, from: number, to: number, minTrades: number, opt?: Partial<RiskOptions>): { k: number; score: number } {
  const markets = Object.keys(series);
  let best = -1, bestScore = -Infinity;
  for (let k = 0; k < sigs[markets[0]].length; k++) {
    let sc = 0, n = 0;
    for (const m of markets) {
      const c = series[m];
      const a = indexAt(c, from), b = indexAt(c, to);
      const r = simulate(c.slice(a, b), sigs[m][k].slice(a, b), opt);
      sc += r.returnPct - 0.5 * r.maxDrawdownPct;
      n += r.trades.length;
    }
    if (n >= minTrades && sc > bestScore) [best, bestScore] = [k, sc];
  }
  return { k: best, score: bestScore };
}

/** The signal array each window's chosen setting would have produced, stitched over the whole test span. */
export function stitch(c: Candle[], sigsByParam: Sig[][], windows: Window[]): Sig[] {
  const out: Sig[] = new Array(c.length).fill(null);
  for (const w of windows) {
    if (w.k < 0) continue;
    const a = indexAt(c, w.from), b = indexAt(c, w.to);
    for (let i = a; i < b; i++) out[i] = sigsByParam[w.k][i];
  }
  return out;
}

export interface CoinRun { market: string; result: SimResult; trades: SimTrade[]; candles: Candle[] }

/**
 * One continuous account per coin from `from` to `to`. Bars before `from` only warm up indicators.
 * A position still open at the end is closed at the last close, paying exit slippage and fee, so trade
 * statistics include every position.
 */
export function runContinuous(series: Record<string, Candle[]>, sig: Record<string, Sig[]>, from: number, to: number, opt: Partial<RiskOptions> = {}): CoinRun[] {
  return Object.keys(series).map((m) => {
    const c = series[m];
    const a = indexAt(c, from), b = indexAt(c, to);
    const slice = c.slice(a, b);
    const result = simulate(slice, sig[m].slice(a, b), opt);
    return { market: m, result, trades: withClosedEnd(result, slice, opt), candles: slice };
  });
}

/** research.ts's method: a fresh account in every test window. Kept to compare against the old numbers. */
export function runLegacy(series: Record<string, Candle[]>, sigsByParam: Record<string, Sig[][]>, windows: Window[], opt: Partial<RiskOptions> = {}): { avgReturnPct: number; trades: SimTrade[]; positiveWindows: number } {
  const markets = Object.keys(series);
  let total = 0, positive = 0;
  const trades: SimTrade[] = [];
  for (const w of windows) {
    if (w.k < 0) continue;
    let ws = 0;
    for (const m of markets) {
      const c = series[m];
      const a = indexAt(c, w.from), b = indexAt(c, w.to);
      const r = simulate(c.slice(a, b), sigsByParam[m][w.k].slice(a, b), opt);
      trades.push(...r.trades);
      ws += r.returnPct;
    }
    total += ws;
    if (ws > 0) positive++;
  }
  return { avgReturnPct: total / markets.length, trades, positiveWindows: positive };
}

export function withClosedEnd(r: SimResult, c: Candle[], opt: Partial<RiskOptions> = {}): SimTrade[] {
  if (!r.open || !c.length) return r.trades;
  const o = { ...DEFAULT_RISK, ...opt };
  const p = r.open;
  const last = c[c.length - 1];
  const exit = last.c * (1 - p.side * o.slippage);
  const entryFee = p.qty * p.entry * o.feeRate, exitFee = p.qty * exit * o.feeRate;
  const pnl = p.side * p.qty * (exit - p.entry) - entryFee - exitFee;
  const risk = p.qty * Math.abs(p.entry - p.stop);
  return [...r.trades, { side: p.side, entryT: p.entryT, exitT: last.t, entry: p.entry, exit, qty: p.qty, reason: "end", pnl, r: risk > 0 ? pnl / risk : 0, fees: entryFee + exitFee }];
}

export interface TradeStats {
  trades: number; winRate: number; avgWinR: number; avgLossR: number; profitFactor: number; expectancyR: number;
  tStat: number; bootstrapPNegative: number;
  /** Fees as a share of the profit before fees (NaN when that profit isn't positive). */
  feesPctOfPreFeeProfit: number; dropTop10Pct: number; sumPct: number;
}

/** Trade statistics. Percentages are of one coin's starting cash, averaged over `nMarkets` coins. */
export function tradeStats(trades: SimTrade[], startCash: number, nMarkets: number, seed = 11): TradeStats {
  const pct = (x: number) => ((x / startCash) * 100) / nMarkets;
  const n = trades.length;
  const rs = trades.map((t) => t.r);
  const mu = n ? rs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1)) : 0;
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = -losses.reduce((s, t) => s + t.pnl, 0);
  const fees = trades.reduce((s, t) => s + t.fees, 0);
  const preFee = trades.reduce((s, t) => s + t.pnl + t.fees, 0);
  const sorted = [...trades].sort((a, b) => b.pnl - a.pnl);
  let s = seed, neg = 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  if (n) for (let k = 0; k < 2000; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += trades[Math.floor(rand() * n)].pnl;
    if (sum <= 0) neg++;
  }
  const avg = (a: SimTrade[]) => (a.length ? a.reduce((q, t) => q + t.r, 0) / a.length : 0);
  return {
    trades: n,
    winRate: n ? wins.length / n : 0,
    avgWinR: avg(wins),
    avgLossR: avg(losses),
    profitFactor: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0,
    expectancyR: mu,
    tStat: sd > 0 ? mu / (sd / Math.sqrt(n)) : 0,
    bootstrapPNegative: n ? neg / 2000 : 1,
    feesPctOfPreFeeProfit: preFee > 0 ? (fees / preFee) * 100 : NaN,
    dropTop10Pct: pct(sorted.slice(Math.ceil(n * 0.1)).reduce((q, t) => q + t.pnl, 0)),
    sumPct: pct(trades.reduce((q, t) => q + t.pnl, 0)),
  };
}

/** Pooled t-stat of per-trade R over several samples (e.g. two periods). */
export function pooledT(samples: SimTrade[][]): number {
  const rs = samples.flat().map((t) => t.r);
  const n = rs.length;
  if (n < 2) return 0;
  const mu = rs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1));
  return sd > 0 ? mu / (sd / Math.sqrt(n)) : 0;
}

export interface PortfolioStats { avgReturnPct: number; annReturnPct: number; sharpe: number; sortino: number; maxDrawdownPct: number; days: number }

/** Equal-weight portfolio of the coins' equity curves (rebalanced each bar), measured on daily returns. */
export function portfolioStats(runs: CoinRun[]): PortfolioStats {
  const byT = new Map<number, number[]>();
  for (const r of runs) {
    const e = r.result.equity;
    for (let j = 1; j < e.length; j++) (byT.get(e[j].t) ?? byT.set(e[j].t, []).get(e[j].t)!).push(e[j].v / e[j - 1].v - 1);
  }
  const byDay = new Map<number, number>();
  for (const [t, v] of [...byT.entries()].sort((a, b) => a[0] - b[0])) {
    const d = Math.floor(t / DAY);
    const avg = v.reduce((a, b) => a + b, 0) / runs.length;
    byDay.set(d, (1 + (byDay.get(d) ?? 0)) * (1 + avg) - 1);
  }
  const dr = [...byDay.values()];
  const n = dr.length;
  const mu = n ? dr.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(dr.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1)) : 0;
  const down = n ? Math.sqrt(dr.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / n) : 0;
  let eq = 1, peak = 1, mdd = 0;
  for (const x of dr) {
    eq *= 1 + x;
    peak = Math.max(peak, eq);
    mdd = Math.max(mdd, 1 - eq / peak);
  }
  return {
    avgReturnPct: runs.reduce((s, r) => s + r.result.returnPct, 0) / Math.max(1, runs.length),
    annReturnPct: n ? (eq ** (365 / n) - 1) * 100 : 0,
    sharpe: sd > 0 ? (mu / sd) * Math.sqrt(365) : 0,
    sortino: down > 0 ? (mu / down) * Math.sqrt(365) : 0,
    maxDrawdownPct: mdd * 100,
    days: n,
  };
}

/**
 * Random-entry benchmark: takes the signals that actually became trades (their side and their stop/target/trail
 * as a fraction of price) and moves them to random bars inside [from, to), drawn only from bars where `allowed`
 * is true (e.g. where a filter would let a trade through). Same number of trades, same exits, random timing.
 * Returns the average return per coin for each seed, sorted ascending.
 */
export function randomEntryBenchmark(
  series: Record<string, Candle[]>, sig: Record<string, Sig[]>, from: number, to: number,
  o: { seeds: number; opt?: Partial<RiskOptions>; allowed?: Record<string, boolean[]>; seed?: number },
): number[] {
  let s = o.seed ?? 3;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const markets = Object.keys(series);
  const prep = markets.map((m) => {
    const c = series[m];
    const a = indexAt(c, from), b = indexAt(c, to);
    const real: { side: 1 | -1; stop: number; target: number; trail?: number; maxBars: number }[] = [];
    const sim = simulate(c.slice(a, b), sig[m].slice(a, b), o.opt);
    const entries = [...sim.trades.map((t) => t.entryT), ...(sim.open ? [sim.open.entryT] : [])];
    for (const t of entries) {
      const i = indexAt(c, t) - 1; // the signal bar is the one before the fill
      const x = sig[m][i];
      if (x) real.push({ side: x.side ?? 1, stop: x.stopDist / c[i].c, target: x.targetDist / c[i].c, trail: x.trailDist ? x.trailDist / c[i].c : undefined, maxBars: x.maxBars });
    }
    const slots: number[] = [];
    for (let i = a; i < b; i++) if (!o.allowed || o.allowed[m][i]) slots.push(i);
    return { m, c, a, b, real, slots };
  });
  const out: number[] = [];
  for (let k = 0; k < o.seeds; k++) {
    let tot = 0;
    for (const p of prep) {
      const rs: Sig[] = new Array(p.c.length).fill(null);
      if (p.slots.length) for (const x of p.real) {
        const i = p.slots[Math.floor(rand() * p.slots.length)];
        const px = p.c[i].c;
        rs[i] = { side: x.side, stopDist: x.stop * px, targetDist: x.target * px, maxBars: x.maxBars, ...(x.trail ? { trailDist: x.trail * px } : {}) };
      }
      tot += simulate(p.c.slice(p.a, p.b), rs.slice(p.a, p.b), o.opt).returnPct;
    }
    out.push(tot / markets.length);
  }
  return out.sort((x, y) => x - y);
}

export const percentileOf = (sorted: number[], x: number) => (sorted.length ? sorted.filter((v) => v < x).length / sorted.length : 0);

/** Share of total profit that came from the single best coin (1 = all of it). NaN if the total isn't positive. */
export function topCoinShare(runs: { market: string; trades: SimTrade[] }[]): number {
  const by = new Map<string, number>();
  for (const r of runs) by.set(r.market, (by.get(r.market) ?? 0) + r.trades.reduce((s, t) => s + t.pnl, 0));
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  return total > 0 ? Math.max(...by.values()) / total : NaN;
}

export interface GateResult { name: string; pass: boolean; detail: string }

/**
 * Look-ahead guard (the "cheating signal" check). Cuts the data off at `samples` random points and recomputes the
 * signals on the truncated history. If any signal at or before the cut changes, the rule was using bars that hadn't
 * happened yet, and this throws. Run it on every rule before trusting a backtest.
 */
export function assertNoLookahead(name: string, signalFn: (c: Candle[]) => Sig[], c: Candle[], samples = 30, seed = 17): void {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const full = signalFn(c);
  for (let k = 0; k < samples; k++) {
    const cut = Math.floor(c.length / 4 + rand() * (c.length * 0.75 - 1));
    const part = signalFn(c.slice(0, cut + 1));
    for (let i = 0; i <= cut; i++) {
      if (JSON.stringify(part[i]) !== JSON.stringify(full[i])) {
        throw new Error(`look-ahead in ${name}: signal at bar ${i} changes when data after bar ${cut} is removed`);
      }
    }
  }
}
