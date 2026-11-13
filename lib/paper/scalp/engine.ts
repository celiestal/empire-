// Fake-money trade simulator for the scalping bot. Pure and deterministic.
//
// Fill model (deliberately pessimistic):
// - Entries are market orders at the NEXT candle's open, plus slippage, plus the fee.
// - The stop is a market order: filled at the stop minus slippage, or at the open if price gapped through it.
// - The target is a resting limit order: filled at the target, fee still charged, no slippage.
// - If one candle touches both the stop and the target, we assume the stop hit first.
//
// Risk controls (all on by default):
// - Each trade risks a fixed small slice of equity (default 0.5%), sized from the stop distance.
// - Never more than 100% of equity in one position (no leverage). Shorts are optional and off unless a signal asks for one.
// - Skips trades whose target is too small to beat fees ("min edge"), or whose stop is so tight that
//   fees would be a big share of the risk ("min stop").
// - Daily loss limit: stops trading for the rest of the UTC day after losing 2% that day.
// - Cool-down: after 3 losses in a row, sits out the next 30 bars.
// - Kill switch: stops trading for good after a 10% drawdown from the peak.
import type { Candle } from "../strategy";
import type { EntrySignal } from "./strategies";

export interface RiskOptions {
  startCash: number;
  /** Fraction of equity lost if the stop is hit (before costs). */
  riskPerTrade: number;
  /** Largest position as a fraction of equity. */
  maxPositionFrac: number;
  /** Fee per side as a fraction of the traded amount. */
  feeRate: number;
  /** Slippage on market orders as a fraction of price. */
  slippage: number;
  /** Skip a trade unless the target distance is at least this many times the round-trip cost. */
  minEdge: number;
  /** Skip a trade unless the stop distance is at least this many times the round-trip cost, so fees stay a small part of the risk. */
  minStopCost: number;
  dailyLossLimit: number;
  maxConsecutiveLosses: number;
  cooldownBars: number;
  killDrawdown: number;
  /** Only open trades on candles at or after this time (earlier candles just warm up the indicators). */
  tradeFrom?: number;
  /** Optional audit log of every signal, order, fill, exit and rejected trade. Off by default; never changes results. */
  onEvent?: (e: SimEvent) => void;
}

export type RejectReason = "invalid" | "cost" | "position-open" | "cooldown" | "daily-stop" | "killed" | "last-bar" | "not-filled";
export type SimEvent =
  | { type: "signal"; t: number; side: 1 | -1; price: number; stopDist: number; targetDist: number; trailDist?: number }
  | { type: "reject"; t: number; side: 1 | -1; reason: RejectReason }
  | { type: "order"; t: number; side: 1 | -1 }
  | { type: "fill"; t: number; side: 1 | -1; price: number; qty: number; fee: number; stop: number; target: number }
  | { type: "exit"; t: number; side: 1 | -1; price: number; reason: SimTrade["reason"]; pnl: number; fee: number; r: number };

export const DEFAULT_RISK: RiskOptions = {
  startCash: 1000,
  riskPerTrade: 0.005,
  maxPositionFrac: 1,
  feeRate: 0.001,
  slippage: 0.0002,
  minEdge: 2,
  minStopCost: 4,
  dailyLossLimit: 0.02,
  maxConsecutiveLosses: 3,
  cooldownBars: 30,
  killDrawdown: 0.1,
};

export interface SimTrade {
  /** 1 = long (bought, sold later), -1 = short (sold first, bought back later). */
  side: 1 | -1;
  entryT: number;
  exitT: number;
  entry: number;
  exit: number;
  qty: number;
  reason: "target" | "stop" | "time" | "end";
  pnl: number;
  /** Profit as a multiple of the money that was at risk. */
  r: number;
  fees: number;
}

export interface SimResult {
  endEquity: number;
  returnPct: number;
  trades: SimTrade[];
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  maxDrawdownPct: number;
  fees: number;
  /** Share of candles spent holding a position. */
  exposure: number;
  killed: boolean;
  skippedForEdge: number;
  daysStopped: number;
  equity: { t: number; v: number }[];
  /** A position still open at the last candle, if any. */
  open: { side: 1 | -1; entryT: number; entry: number; qty: number; stop: number; target: number } | null;
}

const DAY = 86_400_000;

export function simulate(c: Candle[], signals: (EntrySignal | null)[], opt: Partial<RiskOptions> = {}): SimResult {
  const o = { ...DEFAULT_RISK, ...opt };
  let cash = o.startCash;
  let peak = o.startCash;
  let maxDd = 0;
  let pos: { side: 1 | -1; entryT: number; entry: number; qty: number; stop: number; target: number; bars: number; maxBars: number; risk: number; entryFee: number; trail?: number; best: number } | null = null;
  const emit = o.onEvent;
  /** Value of the open position at `price`: the coin for a long, the locked-up collateral plus/minus profit for a short. */
  const posValue = (price: number) => (pos ? (pos.side === 1 ? pos.qty * price : pos.qty * (2 * pos.entry - price)) : 0);
  const trades: SimTrade[] = [];
  const equity: { t: number; v: number }[] = [];
  let fees = 0;
  let consecLosses = 0;
  let cooldownUntil = -1;
  let killed = false;
  let day = -1;
  let dayStartEq = o.startCash;
  let dayStopped = false;
  let daysStopped = 0;
  let skippedForEdge = 0;
  let barsIn = 0;
  let pending: EntrySignal | null = null;

  const close = (i: number, price: number, reason: SimTrade["reason"]) => {
    const p = pos!;
    const fee = p.qty * price * o.feeRate;
    fees += fee;
    cash += posValue(price) - fee;
    const pnl = p.side * p.qty * (price - p.entry) - fee - p.entryFee;
    trades.push({ side: p.side, entryT: p.entryT, exitT: c[i].t, entry: p.entry, exit: price, qty: p.qty, reason, pnl, r: p.risk > 0 ? pnl / p.risk : 0, fees: fee + p.entryFee });
    emit?.({ type: "exit", t: c[i].t, side: p.side, price, reason, pnl, fee, r: p.risk > 0 ? pnl / p.risk : 0 });
    if (pnl > 0) consecLosses = 0;
    else if (++consecLosses >= o.maxConsecutiveLosses) {
      cooldownUntil = i + o.cooldownBars;
      consecLosses = 0;
    }
    pos = null;
  };

  for (let i = 0; i < c.length; i++) {
    const bar = c[i];
    const d = Math.floor(bar.t / DAY);
    if (d !== day) {
      day = d;
      dayStartEq = cash + posValue(bar.o);
      dayStopped = false;
    }

    // 1. Fill the entry decided at the previous close.
    if (pending && !pos && !killed && !dayStopped) {
      const side = pending.side ?? 1;
      const entry = bar.o * (1 + side * o.slippage);
      const eq = cash;
      const riskCash = eq * o.riskPerTrade;
      let qty = riskCash / pending.stopDist;
      qty = Math.min(qty, (eq * o.maxPositionFrac) / (entry * (1 + o.feeRate)));
      if (qty > 0) {
        const fee = qty * entry * o.feeRate;
        fees += fee;
        cash -= qty * entry + fee;
        pos = { side, entryT: bar.t, entry, qty, stop: entry - side * pending.stopDist, target: entry + side * pending.targetDist, bars: 0, maxBars: pending.maxBars, risk: qty * pending.stopDist, entryFee: fee, trail: pending.trailDist, best: entry };
        emit?.({ type: "fill", t: bar.t, side, price: entry, qty, fee, stop: pos.stop, target: pos.target });
      } else emit?.({ type: "reject", t: bar.t, side, reason: "not-filled" });
    } else if (pending) emit?.({ type: "reject", t: bar.t, side: pending.side ?? 1, reason: "not-filled" });
    pending = null;

    // 2. Manage the open position on this bar.
    if (pos) {
      barsIn++;
      pos.bars++;
      const sd = pos.side;
      if (sd === 1 ? bar.l <= pos.stop : bar.h >= pos.stop) close(i, (sd === 1 ? Math.min(bar.o, pos.stop) : Math.max(bar.o, pos.stop)) * (1 - sd * o.slippage), "stop");
      else if (sd === 1 ? bar.h >= pos.target : bar.l <= pos.target) close(i, sd === 1 ? Math.max(bar.o, pos.target) : Math.min(bar.o, pos.target), "target");
      else if (pos.bars >= pos.maxBars) close(i, bar.c * (1 - sd * o.slippage), "time");
      // Trailing stop: ratchet only after this bar is finished, so it applies from the next bar (no look-ahead).
      if (pos && pos.trail) {
        pos.best = sd === 1 ? Math.max(pos.best, bar.h) : Math.min(pos.best, bar.l);
        const trailStop = pos.best - sd * pos.trail;
        if (sd === 1 ? trailStop > pos.stop : trailStop < pos.stop) pos.stop = trailStop;
      }
    }

    // 3. Book-keeping and risk limits.
    const eqNow = cash + posValue(bar.c);
    equity.push({ t: bar.t, v: eqNow });
    peak = Math.max(peak, eqNow);
    maxDd = Math.max(maxDd, (peak - eqNow) / peak);
    if (!killed && (peak - eqNow) / peak >= o.killDrawdown) killed = true;
    if (!dayStopped && eqNow <= dayStartEq * (1 - o.dailyLossLimit)) {
      dayStopped = true;
      daysStopped++;
    }

    // 4. Decide whether to enter on the next bar.
    const sig = signals[i];
    if (emit && sig && (o.tradeFrom === undefined || bar.t >= o.tradeFrom)) {
      const side = sig.side ?? 1;
      emit({ type: "signal", t: bar.t, side, price: bar.c, stopDist: sig.stopDist, targetDist: sig.targetDist, trailDist: sig.trailDist });
      const rt = bar.c * (2 * o.feeRate + 2 * o.slippage);
      const reason: RejectReason | null = pos ? "position-open" : killed ? "killed" : dayStopped ? "daily-stop" : i <= cooldownUntil ? "cooldown" : i >= c.length - 1 ? "last-bar"
        : !(sig.stopDist > 0 && sig.targetDist > 0) ? "invalid" : sig.targetDist < o.minEdge * rt || sig.stopDist < o.minStopCost * rt ? "cost" : null;
      emit(reason ? { type: "reject", t: bar.t, side, reason } : { type: "order", t: bar.t, side });
    }
    if (!pos && sig && !killed && !dayStopped && i > cooldownUntil && (o.tradeFrom === undefined || bar.t >= o.tradeFrom) && i < c.length - 1) {
      const roundTrip = bar.c * (2 * o.feeRate + 2 * o.slippage);
      if (sig.stopDist > 0 && sig.targetDist > 0 && sig.targetDist >= o.minEdge * roundTrip && sig.stopDist >= o.minStopCost * roundTrip) pending = sig;
      else if (sig.stopDist > 0 && sig.targetDist > 0) skippedForEdge++;
    }
  }

  let open: SimResult["open"] = null;
  if (pos) {
    const p = pos as NonNullable<typeof pos>;
    open = { side: p.side, entryT: p.entryT, entry: p.entry, qty: p.qty, stop: p.stop, target: p.target };
  }
  const last = c[c.length - 1];
  const endEquity = cash + (last ? posValue(last.c) : 0);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
  return {
    endEquity,
    returnPct: (endEquity / o.startCash - 1) * 100,
    trades,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgR: trades.length ? trades.reduce((s, t) => s + t.r, 0) / trades.length : 0,
    maxDrawdownPct: maxDd * 100,
    fees,
    exposure: c.length ? barsIn / c.length : 0,
    killed,
    skippedForEdge,
    daysStopped,
    equity,
    open,
  };
}

/** Shuffle trade order many times to see how bad the drawdown could have been with worse luck. */
export function monteCarloDrawdown(trades: SimTrade[], startCash: number, runs = 1000, seed = 42): { p50: number; p95: number; worst: number } {
  if (!trades.length) return { p50: 0, p95: 0, worst: 0 };
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const rets = trades.map((t) => t.pnl / startCash);
  const dds: number[] = [];
  for (let k = 0; k < runs; k++) {
    const a = rets.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    let eq = 1, peak = 1, dd = 0;
    for (const r of a) {
      eq *= 1 + r;
      peak = Math.max(peak, eq);
      dd = Math.max(dd, (peak - eq) / peak);
    }
    dds.push(dd * 100);
  }
  dds.sort((x, y) => x - y);
  return { p50: dds[Math.floor(runs * 0.5)], p95: dds[Math.floor(runs * 0.95)], worst: dds[runs - 1] };
}
