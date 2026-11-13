import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/paper/strategy";
import { simulate, type RiskOptions, type SimEvent } from "@/lib/paper/scalp/engine";
import type { EntrySignal } from "@/lib/paper/scalp/strategies";

const MIN = 60_000;
const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ t: i * MIN, o, h, l, c, v: 1 });
const flat = (n: number, p = 100, from = 0) => Array.from({ length: n }, (_, i) => bar(from + i, p, p, p, p));
const noCosts: Partial<RiskOptions> = { feeRate: 0, slippage: 0, minEdge: 0, minStopCost: 0, startCash: 1000, riskPerTrade: 0.01 };

/** A random walk with random signals, to compare runs. */
function randomCase(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const c: Candle[] = [];
  let p = 100;
  for (let i = 0; i < 3000; i++) {
    const o = p;
    p *= 1 + (rnd() - 0.5) * 0.02;
    c.push({ t: i * 3_600_000, o, h: Math.max(o, p) * (1 + rnd() * 0.005), l: Math.min(o, p) * (1 - rnd() * 0.005), c: p, v: 1 });
  }
  const sig: (EntrySignal | null)[] = c.map(() => (rnd() < 0.05 ? { side: rnd() < 0.5 ? 1 : -1, stopDist: p * 0.01 * (0.5 + rnd()), targetDist: p * 0.02 * (0.5 + rnd()), maxBars: 20 } : null));
  return { c, sig };
}

describe("simulate audit log", () => {
  it("never changes results when the event log is switched on", () => {
    for (const seed of [1, 2, 3]) {
      const { c, sig } = randomCase(seed);
      const off = simulate(c, sig);
      const events: SimEvent[] = [];
      const on = simulate(c, sig, { onEvent: (e) => events.push(e) });
      expect(JSON.stringify(on)).toBe(JSON.stringify(off));
      expect(events.length).toBeGreaterThan(0);
    }
  });

  it("logs every signal as either an order or a rejection with a reason, and every trade as a fill and an exit", () => {
    const { c, sig } = randomCase(4);
    const events: SimEvent[] = [];
    const r = simulate(c, sig, { onEvent: (e) => events.push(e) });
    const count = (t: SimEvent["type"]) => events.filter((e) => e.type === t).length;
    const signalRejects = events.filter((e) => e.type === "reject" && e.reason !== "not-filled").length;
    expect(count("signal")).toBe(sig.filter(Boolean).length);
    expect(count("order") + signalRejects).toBe(count("signal"));
    expect(count("fill")).toBe(r.trades.length + (r.open ? 1 : 0));
    expect(count("exit")).toBe(r.trades.length);
    expect(events.some((e) => e.type === "reject" && e.reason === "position-open")).toBe(true);
  });

  it("records cost-filter rejections", () => {
    const c = flat(5);
    const sig = c.map((_, i) => (i === 1 ? { stopDist: 0.01, targetDist: 0.01, maxBars: 5 } : null));
    const events: SimEvent[] = [];
    simulate(c, sig, { onEvent: (e) => events.push(e) });
    expect(events).toContainEqual({ type: "reject", t: MIN, side: 1, reason: "cost" });
  });
});

describe("trailing stop", () => {
  it("follows the high and exits when price falls back by the trail distance", () => {
    // Enter at 100, price climbs to 110, then falls; trail 3 → stop ratchets to 107.
    const c = [...flat(2), bar(2, 100, 101, 99.5, 101), bar(3, 101, 110, 101, 109), bar(4, 109, 109, 106, 106), ...flat(2, 106, 5)];
    const sig = c.map((_, i) => (i === 1 ? { stopDist: 2, targetDist: Infinity, maxBars: 100, trailDist: 3 } : null));
    const r = simulate(c, sig, noCosts);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ entry: 100, exit: 107, reason: "stop" });
  });

  it("never applies a bar's own high to that same bar (no look-ahead)", () => {
    // One candle spikes to 110 and closes at 100.5: the trail must not stop it out on that candle.
    const c = [...flat(2), bar(2, 100, 110, 100, 100.5), ...flat(2, 100.5, 3)];
    const sig = c.map((_, i) => (i === 1 ? { stopDist: 2, targetDist: Infinity, maxBars: 100, trailDist: 3 } : null));
    const r = simulate(c, sig, noCosts);
    // Stop moves to 107 only from bar 3, which opens at 100.5, below it: gap fill at the open.
    expect(r.trades[0]).toMatchObject({ exitT: 3 * MIN, exit: 100.5, reason: "stop" });
  });

  it("works for shorts", () => {
    const c = [...flat(2), bar(2, 100, 100.5, 95, 95), bar(3, 95, 98, 94, 98), ...flat(2, 98, 4)];
    const sig = c.map((_, i) => (i === 1 ? { side: -1 as const, stopDist: 2, targetDist: Infinity, maxBars: 100, trailDist: 3 } : null));
    const r = simulate(c, sig, noCosts);
    expect(r.trades[0]).toMatchObject({ side: -1, entry: 100, exit: 98, reason: "stop" });
  });

  it("leaves results unchanged when no trail is given", () => {
    const { c, sig } = randomCase(5);
    const withUndef = sig.map((s) => (s ? { ...s, trailDist: undefined } : null));
    expect(JSON.stringify(simulate(c, withUndef))).toBe(JSON.stringify(simulate(c, sig)));
  });
});
