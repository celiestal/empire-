import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/paper/strategy";
import { simulate, type RiskOptions } from "@/lib/paper/scalp/engine";
import { ema, resample, rsi } from "@/lib/paper/scalp/indicators";
import { meanReversion, shortSignals, type EntrySignal } from "@/lib/paper/scalp/strategies";

const MIN = 60_000;
const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ t: i * MIN, o, h, l, c, v: 1 });
const flat = (n: number, p = 100) => Array.from({ length: n }, (_, i) => bar(i, p, p, p, p));
const noCosts: Partial<RiskOptions> = { feeRate: 0, slippage: 0, minEdge: 0, minStopCost: 0, startCash: 1000, riskPerTrade: 0.01 };

describe("indicators", () => {
  it("EMA starts at the simple average and RSI is 100 on a straight climb", () => {
    expect(ema([1, 2, 3, 4], 3)[2]).toBe(2);
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100);
  });

  it("resample merges complete buckets only", () => {
    const c = [bar(0, 1, 2, 0.5, 1.5), bar(1, 1.5, 3, 1, 2), bar(2, 2, 2, 2, 2)];
    const r = resample(c, 2);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ o: 1, h: 3, l: 0.5, c: 2, v: 2 });
  });
});

describe("simulate", () => {
  it("enters on the next bar's open and takes profit at the target", () => {
    const c = [...flat(3), bar(3, 100, 103, 99.5, 102), bar(4, 102, 102, 102, 102)];
    const sig: (EntrySignal | null)[] = c.map((_, i) => (i === 2 ? { stopDist: 1, targetDist: 2, maxBars: 10 } : null));
    const r = simulate(c, sig, noCosts);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ entry: 100, exit: 102, reason: "target", side: 1 });
    // Risk 1% of $1000 = $10 over a $1 stop = 10 coins; +$2 each.
    expect(r.trades[0].pnl).toBeCloseTo(20);
    expect(r.trades[0].r).toBeCloseTo(2);
  });

  it("assumes the stop hit first when one candle touches both", () => {
    const c = [...flat(3), bar(3, 100, 105, 95, 100), ...flat(2)];
    const sig = c.map((_, i) => (i === 2 ? { stopDist: 1, targetDist: 2, maxBars: 10 } : null));
    expect(simulate(c, sig, noCosts).trades[0].reason).toBe("stop");
  });

  it("books a short's profit when price falls", () => {
    const c = [...flat(3), bar(3, 100, 100.5, 97, 98), ...flat(2, 98)];
    const sig: (EntrySignal | null)[] = c.map((_, i) => (i === 2 ? { side: -1, stopDist: 1, targetDist: 2, maxBars: 10 } : null));
    const r = simulate(c, sig, noCosts);
    expect(r.trades[0]).toMatchObject({ side: -1, exit: 98, reason: "target" });
    expect(r.endEquity).toBeCloseTo(1020);
  });

  it("skips trades that fees would eat", () => {
    const c = [...flat(3), bar(3, 100, 100.3, 99.9, 100.2), ...flat(2)];
    const sig = c.map((_, i) => (i === 2 ? { stopDist: 0.1, targetDist: 0.2, maxBars: 10 } : null));
    const r = simulate(c, sig, { feeRate: 0.001, slippage: 0.0002 });
    expect(r.trades).toHaveLength(0);
    expect(r.skippedForEdge).toBe(1);
  });

  it("never opens a trade before tradeFrom", () => {
    const c = [...flat(3), bar(3, 100, 103, 99.5, 102), ...flat(2, 102)];
    const sig = c.map((_, i) => (i === 2 ? { stopDist: 1, targetDist: 2, maxBars: 10 } : null));
    expect(simulate(c, sig, { ...noCosts, tradeFrom: 3 * MIN }).trades).toHaveLength(0);
  });

  it("stops trading for the day after the daily loss limit", () => {
    const c: Candle[] = [];
    for (let i = 0; i < 40; i++) c.push(i % 2 ? bar(i, 100, 100, 90, 95) : bar(i, 100, 100, 100, 100));
    const sig = c.map((x, i) => (i % 2 === 0 ? { stopDist: 1, targetDist: 5, maxBars: 5 } : null));
    const r = simulate(c, sig, { ...noCosts, dailyLossLimit: 0.02, maxConsecutiveLosses: 99 });
    expect(r.daysStopped).toBe(1);
    expect(r.trades.length).toBeLessThanOrEqual(3);
  });
});

describe("signals have no look-ahead", () => {
  it("adding future candles never changes past signals", () => {
    let s = 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    let p = 100;
    const c = Array.from({ length: 400 }, (_, i) => {
      const o = p;
      p *= 1 + (rnd() - 0.5) * 0.01;
      return bar(i, o, Math.max(o, p) * 1.001, Math.min(o, p) * 0.999, p);
    });
    const params = meanReversion.grid[0];
    const full = meanReversion.signals(c, params);
    const part = meanReversion.signals(c.slice(0, 300), params);
    expect(full.slice(0, 300)).toEqual(part);
    const fullShort = shortSignals(meanReversion, c, params);
    expect(fullShort.slice(0, 300)).toEqual(shortSignals(meanReversion, c.slice(0, 300), params));
  });
});
