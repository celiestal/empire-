// Entry rules for the scalping bot. Each strategy looks at closed candles only and
// says "go long now" with a stop distance and a target distance (in price units).
// The engine fills at the NEXT candle's open, so nothing here can see the future.
// Long only, no leverage: the bot holds the coin or holds cash, never borrows.
import type { Candle } from "../strategy";
import { atr, ema, priorHigh, rollingVwap, rsi, sma, stdev } from "./indicators";

export interface EntrySignal {
  /** 1 = buy (default), -1 = sell short. */
  side?: 1 | -1;
  stopDist: number;
  targetDist: number;
  /** Close the trade at market after this many bars if neither stop nor target hit. */
  maxBars: number;
}

export type Params = Record<string, number>;

export interface Strategy {
  id: string;
  label: string;
  /** Plain-English summary for the report. */
  describe: string;
  grid: Params[];
  signals(c: Candle[], p: Params): (EntrySignal | null)[];
}

function cartesian(spec: Record<string, number[]>): Params[] {
  let out: Params[] = [{}];
  for (const [k, vals] of Object.entries(spec)) out = out.flatMap((p) => vals.map((v) => ({ ...p, [k]: v })));
  return out;
}

const closes = (c: Candle[]) => c.map((x) => x.c);
/** Long-term trend is up: the slow EMA is rising over the last 20 bars. trend=0 disables the filter. */
function trendUp(e: number[], i: number) {
  return i >= 20 && e[i] > e[i - 20];
}

/** 1. Mean reversion: buy a sharp dip below the lower Bollinger band while RSI is oversold, sell at the middle band. */
export const meanReversion: Strategy = {
  id: "meanrev",
  label: "Dip buy (Bollinger + RSI)",
  describe: "Buys when price snaps below its lower Bollinger band with RSI oversold, aiming for a bounce back to the average. Only in an uptrend.",
  grid: cartesian({ bb: [20], k: [2, 2.5, 3], rsiLen: [7, 14], rsiMax: [20, 30], stopAtr: [1.5, 2.5], trend: [0, 200] }),
  signals(c, p) {
    const cl = closes(c);
    const mid = sma(cl, p.bb);
    const sd = stdev(cl, p.bb);
    const r = rsi(cl, p.rsiLen);
    const a = atr(c, 14);
    const tr = p.trend ? ema(cl, p.trend) : [];
    return c.map((x, i) => {
      if (!(a[i] > 0) || Number.isNaN(mid[i]) || Number.isNaN(r[i])) return null;
      if (p.trend && !trendUp(tr, i)) return null;
      const lower = mid[i] - p.k * sd[i];
      if (x.c >= lower || r[i] >= p.rsiMax) return null;
      return { stopDist: p.stopAtr * a[i], targetDist: mid[i] - x.c, maxBars: 30 };
    });
  },
};

/** 2. Breakout: buy when price closes above the recent high on strong volume, ride it with a fixed reward:risk target. */
export const breakout: Strategy = {
  id: "breakout",
  label: "Breakout (range high + volume)",
  describe: "Buys when price closes above its recent high on above-average volume, with a stop under the breakout and a target 1.5–3× the risk.",
  grid: cartesian({ n: [20, 40, 60], volMult: [1.5, 2.5], stopAtr: [1, 1.5, 2], rr: [1.5, 2, 3], trend: [0, 100] }),
  signals(c, p) {
    const cl = closes(c);
    const hi = priorHigh(c, p.n);
    const a = atr(c, 14);
    const vavg = sma(c.map((x) => x.v ?? 0), 20);
    const tr = p.trend ? ema(cl, p.trend) : [];
    return c.map((x, i) => {
      if (i < 1 || !(a[i] > 0) || Number.isNaN(hi[i]) || !(vavg[i - 1] > 0)) return null;
      if (p.trend && !trendUp(tr, i)) return null;
      if (x.c <= hi[i] || (x.v ?? 0) < p.volMult * vavg[i - 1]) return null;
      const stop = p.stopAtr * a[i];
      return { stopDist: stop, targetDist: p.rr * stop, maxBars: 60 };
    });
  },
};

/** 3. Trend pullback: in an uptrend, buy when price dips to the fast EMA and closes back above it. */
export const pullback: Strategy = {
  id: "pullback",
  label: "Trend pullback (EMA)",
  describe: "When the fast average is above the slow one and rising, buys the first dip that touches the fast average and bounces, targeting 1.5–3× the risk.",
  grid: cartesian({ fast: [9, 20], slow: [50, 100, 200], stopAtr: [1, 1.5, 2], rr: [1.5, 2, 3] }),
  signals(c, p) {
    const cl = closes(c);
    const f = ema(cl, p.fast);
    const s = ema(cl, p.slow);
    const a = atr(c, 14);
    return c.map((x, i) => {
      if (i < 21 || !(a[i] > 0) || Number.isNaN(s[i - 20])) return null;
      if (!(f[i] > s[i] && s[i] > s[i - 20])) return null;
      if (!(x.l <= f[i] && x.c > f[i] && x.c > x.o && c[i - 1].c > f[i - 1])) return null;
      const stop = p.stopAtr * a[i];
      return { stopDist: stop, targetDist: p.rr * stop, maxBars: 60 };
    });
  },
};

/** 4. VWAP reversion: buy a stretched move below the rolling VWAP once a green candle prints, target the VWAP. */
export const vwapReversion: Strategy = {
  id: "vwap",
  label: "VWAP snap-back",
  describe: "Buys when price is stretched well below its volume-weighted average and the next candle turns green, aiming to snap back to the average.",
  grid: cartesian({ len: [60, 240], z: [2, 2.5, 3], stopAtr: [1.5, 2.5], trend: [0, 200] }),
  signals(c, p) {
    const cl = closes(c);
    const vw = rollingVwap(c, p.len);
    const dev = stdev(cl.map((v, i) => (Number.isNaN(vw[i]) ? 0 : v - vw[i])), p.len);
    const a = atr(c, 14);
    const tr = p.trend ? ema(cl, p.trend) : [];
    return c.map((x, i) => {
      if (i < p.len * 2 || !(a[i] > 0) || !(dev[i] > 0)) return null;
      if (p.trend && !trendUp(tr, i)) return null;
      const prev = c[i - 1];
      const stretched = prev.c < vw[i - 1] - p.z * dev[i - 1];
      if (!stretched || !(x.c > x.o) || x.c >= vw[i]) return null;
      return { stopDist: p.stopAtr * a[i], targetDist: vw[i] - x.c, maxBars: 45 };
    });
  },
};

/**
 * 5. Time-series momentum (trend following): the method with the most support in crypto research.
 * Goes with the move of the last `look` bars when price is also on the right side of its average,
 * with a wide ATR stop and a large target, and re-enters while the trend lasts. Shorts are the
 * mirror image (see shortSignals), so in a falling market it sells first and buys back lower.
 */
export const momentum: Strategy = {
  id: "tsmom",
  label: "Trend following (momentum)",
  describe: "Follows the trend: buys when price is higher than it was a set time ago and above its average, shorts the mirror image, with a wide stop and a big target.",
  grid: cartesian({ look: [24, 72, 168], stopAtr: [2, 3, 4], rr: [3, 6], hold: [24, 72] }),
  signals(c, p) {
    const cl = closes(c);
    const e = ema(cl, p.look);
    const a = atr(c, 14);
    return c.map((x, i) => {
      if (i < p.look || !(a[i] > 0)) return null;
      if (!(x.c > cl[i - p.look] && x.c > e[i] && e[i] > e[i - 1])) return null;
      const stop = p.stopAtr * a[i];
      return { stopDist: stop, targetDist: p.rr * stop, maxBars: p.hold };
    });
  },
};

export const STRATEGIES: Strategy[] = [meanReversion, breakout, pullback, vwapReversion, momentum];
export const strategyById = (id: string) => {
  const s = STRATEGIES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown strategy ${id}`);
  return s;
};

/**
 * Bigger-picture trend filter: only allow entries when price is above its
 * `hours`-hour EMA and that EMA is higher than it was an hour ago.
 * Keeps the long-only bot in cash during sustained downtrends. hours=0 turns it off.
 */
export function applyRegime(c: Candle[], sigs: (EntrySignal | null)[], tfMinutes: number, hours: number): (EntrySignal | null)[] {
  if (!hours) return sigs;
  const len = Math.max(2, Math.round((hours * 60) / tfMinutes));
  const lookback = Math.max(1, Math.round(60 / tfMinutes));
  const e = ema(closes(c), len);
  return sigs.map((s, i) => (s && i >= lookback && c[i].c > e[i] && e[i] > e[i - lookback] ? s : null));
}

/** Turn price upside down (1/price) so a long-only rule finds short setups. */
function invert(c: Candle[]): Candle[] {
  return c.map((x) => ({ t: x.t, o: 1 / x.o, h: 1 / x.l, l: 1 / x.h, c: 1 / x.c, v: x.v }));
}

/**
 * The mirror image of a strategy: runs its rules on the upside-down price chart,
 * so "buy the dip" becomes "sell the spike". Distances are converted back as
 * fractions of the price.
 */
export function shortSignals(strategy: Strategy, c: Candle[], p: Params): (EntrySignal | null)[] {
  const inv = invert(c);
  return strategy.signals(inv, p).map((s, i) => {
    if (!s) return null;
    const ratio = c[i].c / inv[i].c;
    return { side: -1, stopDist: s.stopDist * ratio, targetDist: s.targetDist * ratio, maxBars: s.maxBars };
  });
}

/** Mirror of applyRegime for shorts: only when price is below a falling EMA. */
export function applyRegimeShort(c: Candle[], sigs: (EntrySignal | null)[], tfMinutes: number, hours: number): (EntrySignal | null)[] {
  return applyRegime(invert(c), sigs, tfMinutes, hours);
}

/** Merge long and short signals; if both fire on the same bar, skip it (no clear direction). */
export function mergeSides(a: (EntrySignal | null)[], b: (EntrySignal | null)[]): (EntrySignal | null)[] {
  return a.map((x, i) => (x && b[i] ? null : x ?? b[i]));
}
