import { describe, expect, it } from "vitest";
import { backtest, sma, type Candle } from "@/lib/paper/strategy";

const series = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ t: i * 3_600_000, o: c, h: c, l: c, c }));

describe("sma", () => {
  it("averages over the window and is null before it fills", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });
});

describe("backtest", () => {
  it("buys on an uptrend crossover and sells on a downtrend crossover", () => {
    const closes = [...Array(10).fill(100), ...Array.from({ length: 10 }, (_, i) => 101 + i * 2), ...Array.from({ length: 10 }, (_, i) => 118 - i * 4)];
    const r = backtest(series(closes), { fast: 2, slow: 5, startCash: 1000, feeRate: 0 });
    expect(r.trades.map((t) => t.side)).toEqual(["buy", "sell"]);
    expect(r.inPosition).toBe(false);
    expect(r.endValue).toBeCloseTo(r.trades[1].cash);
  });

  it("does nothing on a flat market and keeps the cash", () => {
    const r = backtest(series(Array(50).fill(100)), { fast: 3, slow: 8 });
    expect(r.trades).toHaveLength(0);
    expect(r.endValue).toBe(1000);
    expect(r.returnPct).toBe(0);
  });

  it("charges fees, so a round trip at the same price loses money", () => {
    const closes = [...Array(6).fill(100), 110, 120, 130, 100, 90, 80, 100];
    const withFees = backtest(series(closes), { fast: 2, slow: 4, feeRate: 0.01 });
    const noFees = backtest(series(closes), { fast: 2, slow: 4, feeRate: 0 });
    expect(withFees.feesPaid).toBeGreaterThan(0);
    expect(withFees.endValue).toBeLessThan(noFees.endValue);
  });

  it("rejects a fast average that is not shorter than the slow one", () => {
    expect(() => backtest(series([1, 2, 3]), { fast: 5, slow: 5 })).toThrow();
  });
});

import { clientsFor, SERVICE_PACKAGES } from "@/lib/services";

describe("service packages", () => {
  it("shows how many clients reach $1,000 a month", () => {
    const byId = Object.fromEntries(SERVICE_PACKAGES.map((p) => [p.id, clientsFor(1000, p)]));
    expect(byId).toEqual({ starter: 7, growth: 4, pro: 3 });
  });
});
