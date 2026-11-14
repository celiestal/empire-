// Market-regime detector for the scalping bot: decides, candle by candle, whether the
// market is trending up, trending down, ranging (going sideways), or choppy, and lets
// each method trade only in the regime it is built for:
//   - trend methods (breakout, trend pullback): long in an uptrend, short in a downtrend
//   - reversion methods (dip-buy, VWAP snap-back): both sides, only in a range
//   - chop (in between): sit out
//
// The measure is Kaufman's efficiency ratio on hourly steps: how far price got over the
// last N hours divided by the total distance it travelled hour to hour. 1 = a straight
// line (trend), near 0 = back and forth (range). It only reads closed candles.
import type { Candle } from "../strategy";
import type { EntrySignal, Params } from "./strategies";

export type Regime = "up" | "down" | "range" | "chop" | "unknown";
export type MethodKind = "trend" | "reversion";

export const METHOD_KIND: Record<string, MethodKind> = {
  breakout: "trend",
  pullback: "trend",
  meanrev: "reversion",
  vwap: "reversion",
  tsmom: "trend",
};

export interface RegimeParams {
  /** Look-back in hours. */
  hours: number;
  /** Efficiency ratio at or above this = trend. */
  erTrend: number;
  /** Efficiency ratio at or below this = range. */
  erRange: number;
}

/** Efficiency ratio on hourly steps, plus the net direction, for each bar. NaN while warming up. */
export function efficiencyRatio(c: Candle[], tfMinutes: number, hours: number): { er: number[]; dir: number[] } {
  const step = Math.max(1, Math.round(60 / tfMinutes));
  const n = Math.max(2, Math.round(hours / Math.max(1, tfMinutes / 60)));
  const er = new Array(c.length).fill(NaN);
  const dir = new Array(c.length).fill(0);
  for (let i = n * step; i < c.length; i++) {
    let path = 0;
    for (let k = 0; k < n; k++) path += Math.abs(c[i - k * step].c - c[i - (k + 1) * step].c);
    const net = c[i].c - c[i - n * step].c;
    er[i] = path > 0 ? Math.abs(net) / path : 0;
    dir[i] = Math.sign(net);
  }
  return { er, dir };
}

export function classify(c: Candle[], tfMinutes: number, p: RegimeParams): Regime[] {
  const { er, dir } = efficiencyRatio(c, tfMinutes, p.hours);
  return er.map((e, i) => {
    if (Number.isNaN(e)) return "unknown";
    if (e >= p.erTrend) return dir[i] > 0 ? "up" : "down";
    if (e <= p.erRange) return "range";
    return "chop";
  });
}

export const regimeParamsFrom = (p: Params): RegimeParams | null =>
  p.rgHours ? { hours: p.rgHours, erTrend: p.rgTrend, erRange: p.rgRange } : null;

/** Keep only the signals that suit the current regime for this kind of method. */
export function applyRegimeSwitch(
  c: Candle[],
  sigs: (EntrySignal | null)[],
  tfMinutes: number,
  kind: MethodKind,
  p: RegimeParams,
): (EntrySignal | null)[] {
  const reg = classify(c, tfMinutes, p);
  return sigs.map((s, i) => {
    if (!s) return null;
    const side = s.side ?? 1;
    if (kind === "trend") return (reg[i] === "up" && side === 1) || (reg[i] === "down" && side === -1) ? s : null;
    return reg[i] === "range" ? s : null;
  });
}

/** Regime grid searched by the walk-forward research (rgHours=0 = switch off). */
export const REGIME_GRID: Params[] = [
  { rgHours: 0, rgTrend: 0, rgRange: 0 },
  ...[12, 24].flatMap((rgHours) =>
    [0.3, 0.45].flatMap((rgTrend) => [0.15, 0.25].map((rgRange) => ({ rgHours, rgTrend, rgRange }))),
  ),
];

/** Drop every entry (either side) made while the market is in one of the `skip` regimes. */
export function skipRegimes(c: Candle[], sigs: (EntrySignal | null)[], tfMinutes: number, p: RegimeParams, skip: Regime[]): (EntrySignal | null)[] {
  const reg = classify(c, tfMinutes, p);
  return sigs.map((s, i) => (s && !skip.includes(reg[i]) ? s : null));
}
