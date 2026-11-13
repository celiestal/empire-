import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/paper/strategy";
import { simulate } from "@/lib/paper/scalp/engine";
import { applyTrail, type EntrySignal } from "@/lib/paper/scalp/strategies";
import { applyBtcGate, btcUpByTime } from "@/lib/paper/scalp/regime";
import { DAY, indexAt, pooledT, randomEntryBenchmark, runContinuous, stitch, topCoinShare, tradeStats, walkForward, withClosedEnd, type Window } from "@/lib/paper/scalp/evaluate";

const H4 = 4 * 3_600_000;
function walk(n: number, seed: number, drift = 0): Candle[] {
  let s = seed, p = 100;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    p *= 1 + drift + (rnd() - 0.5) * 0.03;
    return { t: i * H4, o, h: Math.max(o, p) * 1.004, l: Math.min(o, p) * 0.996, c: p, v: 1 };
  });
}
const every = (c: Candle[], k: number, side: 1 | -1 = 1): (EntrySignal | null)[] => c.map((x, i) => (i % k === 0 ? { side, stopDist: x.c * 0.02, targetDist: x.c * 0.04, maxBars: 10 } : null));

describe("evaluate", () => {
  it("indexAt finds the first candle at or after a time", () => {
    const c = walk(10, 1);
    expect(indexAt(c, 0)).toBe(0);
    expect(indexAt(c, 3 * H4)).toBe(3);
    expect(indexAt(c, 3 * H4 + 1)).toBe(4);
    expect(indexAt(c, 99 * H4)).toBe(10);
  });

  it("walkForward picks the setting that worked in training, and stitch uses it only inside its window", () => {
    const c = walk(2000, 2, 0.002); // rising market: longs win, shorts lose
    const series = { X: c };
    const sigs = { X: [every(c, 5, -1), every(c, 5, 1)] };
    const w = walkForward(series, sigs, { start: 0, end: c[c.length - 1].t, trainDays: 60, testDays: 30, minTrades: 5 });
    expect(w.length).toBeGreaterThan(5);
    expect(w.every((x) => x.k === 1)).toBe(true);
    const st = stitch(c, sigs.X, w);
    expect(st.slice(0, indexAt(c, w[0].from)).every((x) => x === null)).toBe(true);
    expect(st.filter(Boolean).every((x) => x!.side === 1)).toBe(true);
  });

  it("runContinuous is one account over the span and closes a position left open at the end", () => {
    const c = walk(600, 3);
    const sig = every(c, 7);
    sig[598] = { stopDist: 50, targetDist: 50, maxBars: 99 }; // forces a trade still open at the end
    const from = c[100].t, to = c[600 - 1].t + H4;
    const [run] = runContinuous({ X: c }, { X: sig }, from, to);
    const direct = simulate(c.slice(100), sig.slice(100));
    expect(run.result.returnPct).toBeCloseTo(direct.returnPct, 10);
    expect(direct.open).not.toBeNull();
    expect(run.trades.length).toBe(direct.trades.length + 1);
    expect(run.trades[run.trades.length - 1].reason).toBe("end");
    expect(withClosedEnd(direct, c.slice(100)).length).toBe(direct.trades.length + 1);
  });

  it("tradeStats and pooledT compute the basics", () => {
    const t = (pnl: number, r: number) => ({ side: 1 as const, entryT: 0, exitT: 1, entry: 1, exit: 1, qty: 1, reason: "stop" as const, pnl, r, fees: 1 });
    const s = tradeStats([t(20, 2), t(-10, -1), t(-10, -1), t(20, 2)], 1000, 1);
    expect(s.winRate).toBe(0.5);
    expect(s.profitFactor).toBe(2);
    expect(s.expectancyR).toBeCloseTo(0.5);
    expect(s.sumPct).toBeCloseTo(2);
    expect(s.feesPctOfPreFeeProfit).toBeCloseTo((4 / 24) * 100);
    expect(pooledT([[t(1, 1), t(1, 1)], [t(1, 1)]])).toBe(0); // no spread
    expect(pooledT([[t(1, 1), t(1, 2)], [t(1, 3)]])).toBeGreaterThan(2);
  });

  it("random-entry benchmark is deterministic and only uses allowed bars", () => {
    const c = walk(800, 4);
    const sig = { X: every(c, 9) };
    const a = randomEntryBenchmark({ X: c }, sig, c[100].t, c[799].t + H4, { seeds: 20 });
    const b = randomEntryBenchmark({ X: c }, sig, c[100].t, c[799].t + H4, { seeds: 20 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(20);
    // With no allowed bars there can be no trades, so every seed returns exactly 0.
    const none = randomEntryBenchmark({ X: c }, sig, c[100].t, c[799].t + H4, { seeds: 5, allowed: { X: c.map(() => false) } });
    expect(none).toEqual([0, 0, 0, 0, 0]);
  });

  it("topCoinShare measures concentration of profit", () => {
    const t = (pnl: number) => ({ side: 1 as const, entryT: 0, exitT: 1, entry: 1, exit: 1, qty: 1, reason: "stop" as const, pnl, r: 0, fees: 0 });
    expect(topCoinShare([{ market: "A", trades: [t(30)] }, { market: "B", trades: [t(10)] }])).toBeCloseTo(0.75);
    expect(topCoinShare([{ market: "A", trades: [t(-30)] }])).toBeNaN();
    expect(DAY).toBe(86_400_000);
  });
});

describe("P1 building blocks", () => {
  it("applyTrail removes the fixed target and trails by k ATRs", () => {
    const c = walk(100, 5);
    const s = applyTrail(c, every(c, 10), 3, 120);
    const x = s[50]!;
    expect(x.targetDist).toBe(Infinity);
    expect(x.trailDist).toBeGreaterThan(0);
    expect(x.maxBars).toBe(120);
    expect(s[51]).toBeNull();
  });

  it("the BTC gate blocks longs when BTC is falling, keeps them when rising, and never blocks shorts", () => {
    const up = walk(300, 6, 0.01), down = walk(300, 6, -0.01);
    const coin = walk(300, 7);
    const longs = every(coin, 3), shorts = every(coin, 3, -1);
    expect(applyBtcGate(coin, longs, btcUpByTime(down)).slice(100).filter(Boolean)).toHaveLength(0);
    expect(applyBtcGate(coin, longs, btcUpByTime(up)).slice(100).filter(Boolean).length).toBeGreaterThan(50);
    expect(applyBtcGate(coin, shorts, btcUpByTime(down)).filter(Boolean).length).toBe(shorts.filter(Boolean).length);
  });

  it("the BTC gate only uses closed bars (adding future candles never changes past decisions)", () => {
    const btc = walk(400, 8, 0.002);
    const full = btcUpByTime(btc), part = btcUpByTime(btc.slice(0, 250));
    for (let i = 0; i < 250; i++) expect(part.get(btc[i].t)).toBe(full.get(btc[i].t));
  });
});

// Keep the Window type exercised for the type checker.
const _w: Window | null = null;
void _w;
