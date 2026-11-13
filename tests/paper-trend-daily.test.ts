import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/paper/strategy";
import { E1_PARAMS, runTrend, targetWeight } from "@/lib/paper/trend/daily";

const DAY = 86_400_000, H4 = 4 * 3_600_000;
function days(n: number, seed: number, drift: number): Candle[] {
  let s = seed, p = 100;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: n }, (_, i) => { const o = p; p *= 1 + drift + (rnd() - 0.5) * 0.06; return { t: i * DAY, o, h: Math.max(o, p), l: Math.min(o, p), c: p, v: 1 }; });
}
const gate = (open: boolean, n: number) => new Map(Array.from({ length: n }, (_, i) => [i * DAY + DAY - H4, open]));

describe("market-filtered trend (exp-trend-daily)", () => {
  it("is in cash when the BTC gate is closed and sizes by volatility when open", () => {
    const c = days(200, 1, 0.01);
    expect(targetWeight(c, 150, gate(false, 200), E1_PARAMS)).toBe(0);
    const w = targetWeight(c, 150, gate(true, 200), E1_PARAMS);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(1);
  });

  it("never uses future bars: the weight for day j+1 is the same with or without later data", () => {
    const c = days(300, 2, 0.002), g = gate(true, 300);
    for (const j of [60, 120, 250]) expect(targetWeight(c.slice(0, j + 1), j, g, E1_PARAMS)).toBe(targetWeight(c, j, g, E1_PARAMS));
  });

  it("is a deterministic replay: more days never change earlier equity, and costs only lower it", () => {
    const d = { A: days(400, 3, 0.003), B: days(400, 4, -0.001) }, g = gate(true, 400);
    const full = runTrend(d, g, 100 * DAY, 10_000, E1_PARAMS);
    const part = runTrend({ A: d.A.slice(0, 300), B: d.B.slice(0, 300) }, g, 100 * DAY, 10_000, E1_PARAMS);
    expect(full.equity.slice(0, part.equity.length)).toEqual(part.equity);
    const free = runTrend(d, g, 100 * DAY, 10_000, { ...E1_PARAMS, feePerSide: 0, slippage: 0 });
    expect(free.equity[free.equity.length - 1].v).toBeGreaterThan(full.equity[full.equity.length - 1].v);
    expect(full.fees).toBeGreaterThan(0);
    expect(full.orders.length).toBeGreaterThan(0);
  });
});
