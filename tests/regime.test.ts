import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/paper/strategy";
import { applyRegimeSwitch, classify, efficiencyRatio, skipRegimes } from "@/lib/paper/scalp/regime";

const hourly = (closes: number[]): Candle[] => closes.map((c, i) => ({ t: i * 3_600_000, o: c, h: c, l: c, c, v: 1 }));
const p = { hours: 4, erTrend: 0.5, erRange: 0.2 };

describe("regime detector", () => {
  it("calls a straight climb an uptrend and a straight fall a downtrend", () => {
    expect(classify(hourly([1, 2, 3, 4, 5, 6]), 60, p).slice(4)).toEqual(["up", "up"]);
    expect(classify(hourly([6, 5, 4, 3, 2, 1]), 60, p).slice(4)).toEqual(["down", "down"]);
  });

  it("calls back-and-forth a range and is unknown while warming up", () => {
    const r = classify(hourly([10, 11, 10, 11, 10, 11]), 60, p);
    expect(r.slice(0, 4)).toEqual(["unknown", "unknown", "unknown", "unknown"]);
    expect(r[4]).toBe("range");
  });

  it("steps hourly on smaller timeframes and never reads ahead", () => {
    const c = hourly([1, 2, 3, 4, 5, 6, 7, 8]).flatMap((x) => Array.from({ length: 4 }, (_, k) => ({ ...x, t: x.t + k * 900_000 })));
    const full = efficiencyRatio(c, 15, 4).er;
    const cut = efficiencyRatio(c.slice(0, 20), 15, 4).er;
    expect(cut).toEqual(full.slice(0, 20));
  });

  it("lets trend methods trade only with the trend and reversion methods only in ranges", () => {
    const up = hourly([1, 2, 3, 4, 5, 6]);
    const sig = { stopDist: 1, targetDist: 1, maxBars: 5 };
    const both = [null, null, null, null, { ...sig, side: 1 as const }, { ...sig, side: -1 as const }];
    expect(applyRegimeSwitch(up, both, 60, "trend", p).map((s) => s?.side ?? null)).toEqual([null, null, null, null, 1, null]);
    expect(applyRegimeSwitch(up, both, 60, "reversion", p).every((s) => s === null)).toBe(true);
  });

  it("skipRegimes drops entries on both sides while the market is falling", () => {
    const c = hourly([6, 5, 4, 3, 2, 1]);
    const sig = { stopDist: 1, targetDist: 1, maxBars: 5 };
    const out = skipRegimes(c, [null, null, null, null, sig, { ...sig, side: -1 as const }], 60, p, ["down"]);
    expect(out).toEqual([null, null, null, null, null, null]);
    const up = skipRegimes(hourly([1, 2, 3, 4, 5, 6]), [null, null, null, null, sig, null], 60, p, ["down"]);
    expect(up[4]).toEqual(sig);
  });
});
