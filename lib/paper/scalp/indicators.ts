// Indicators for the scalping bot. Each returns an array aligned with the input,
// using only data up to and including that index (no look-ahead). NaN = not ready.
import type { Candle } from "../strategy";

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sum += values[i];
      continue;
    }
    if (i === period - 1) {
      sum += values[i];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function stdev(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    sq += values[i] * values[i];
    if (i >= period) {
      sum -= values[i - period];
      sq -= values[i - period] * values[i - period];
    }
    if (i >= period - 1) {
      const m = sum / period;
      out[i] = Math.sqrt(Math.max(0, sq / period - m * m));
    }
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    if (i <= period) {
      gain += g / period;
      loss += l / period;
      if (i === period) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

/** Wilder's Average True Range. */
export function atr(c: Candle[], period: number): number[] {
  const out = new Array<number>(c.length).fill(NaN);
  let prev = NaN;
  let sum = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].h - c[i].l : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + tr) / period;
      out[i] = prev;
    }
  }
  return out;
}

/** Highest high of the previous `period` bars (excluding the current bar). */
export function priorHigh(c: Candle[], period: number): number[] {
  const out = new Array<number>(c.length).fill(NaN);
  for (let i = period; i < c.length; i++) {
    let m = -Infinity;
    for (let j = i - period; j < i; j++) if (c[j].h > m) m = c[j].h;
    out[i] = m;
  }
  return out;
}

/** Rolling volume-weighted average price over `period` bars, using the typical price. */
export function rollingVwap(c: Candle[], period: number): number[] {
  const out = new Array<number>(c.length).fill(NaN);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < c.length; i++) {
    const v = c[i].v ?? 1;
    const tp = (c[i].h + c[i].l + c[i].c) / 3;
    pv += tp * v;
    vol += v;
    if (i >= period) {
      const o = c[i - period];
      const ov = o.v ?? 1;
      pv -= ((o.h + o.l + o.c) / 3) * ov;
      vol -= ov;
    }
    if (i >= period - 1 && vol > 0) out[i] = pv / vol;
  }
  return out;
}

/** Merge 1-minute candles into `minutes`-minute candles. Only complete buckets are kept. */
export function resample(c1m: Candle[], minutes: number): Candle[] {
  if (minutes === 1) return c1m;
  const ms = minutes * 60_000;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let count = 0;
  for (const c of c1m) {
    const start = Math.floor(c.t / ms) * ms;
    if (!cur || cur.t !== start) {
      if (cur && count === minutes) out.push(cur);
      cur = { t: start, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v ?? 0 };
      count = 1;
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v = (cur.v ?? 0) + (c.v ?? 0);
      count++;
    }
  }
  if (cur && count === minutes) out.push(cur);
  return out;
}
