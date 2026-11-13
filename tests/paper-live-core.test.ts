import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/paper/strategy";
import { applyRegime, breakout } from "@/lib/paper/scalp/strategies";
import { resample } from "@/lib/paper/scalp/indicators";
import { barNoise, baseMinutes, evaluateConfig, eventLog, feeScenarioReport, randomSignals, sleeveSignals, statusDir, summarize, warmupDays, type LiveConfig, type Sleeve } from "@/lib/paper/scalp/live-core";

const H = 3_600_000;
function hourly(n: number, seed: number, drift = 0.0005): Candle[] {
  let s = seed, p = 100;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    p *= 1 + drift + (rnd() - 0.5) * 0.02;
    return { t: i * H, o, h: Math.max(o, p) * (1 + rnd() * 0.01), l: Math.min(o, p) * (1 - rnd() * 0.01), c: p, v: 1 + rnd() * (i % 17 === 0 ? 5 : 1) };
  });
}
const params = { n: 20, volMult: 1.5, stopAtr: 1.5, rr: 2, trend: 0, regimeHours: 0 };
const markets = ["BTC_USD", "ETH_USD"];
function cfg4h(startedAt: number): LiveConfig {
  const sleeves: Sleeve[] = [];
  for (const m of markets) {
    sleeves.push({ market: m, tf: 240, strategy: "breakout", mode: "long", params, cash: 500, config: "breakout-long" });
    sleeves.push({ market: m, tf: 240, strategy: "breakout", mode: "both", params, cash: 500, config: "breakout-long-short" });
    sleeves.push({ market: m, tf: 240, strategy: "random", mode: "long", params: { prob: 0.05, stopAtr: 1.5, rr: 2 }, cash: 500, config: "baseline-random", role: "baseline" });
  }
  return { experimentId: "exp-test", startedAt, startedAtIso: new Date(startedAt).toISOString(), totalCash: 2000, why: "test", baseTf: "1h", warmupDays: 60, statusDir: ".paper-data/test", logEvents: true, feeScenarios: [{ label: "x", feeRate: 0.005, slippage: 0.0005 }], sleeves };
}
const data = () => ({ BTC_USD: hourly(4000, 1), ETH_USD: hourly(4000, 2, -0.0003) });

describe("live core: defaults keep the original 1m test unchanged", () => {
  it("uses 1m candles, a 10-day warm-up and the old folder when the optional fields are absent", () => {
    const old: LiveConfig = { startedAt: 0, startedAtIso: "", totalCash: 1, why: "", sleeves: [] };
    expect(baseMinutes(old)).toBe(1);
    expect(warmupDays(old)).toBe(10);
    expect(statusDir(old)).toBe(".paper-data/live");
  });

  it("produces the old report shape (no experiment sections) for a config without experimentId", () => {
    const c = cfg4h(2000 * H);
    const { experimentId: _x, ...plain } = c;
    const sleeves = plain.sleeves.filter((s) => !s.role).map(({ config: _c, ...s }) => s);
    const p: LiveConfig = { ...plain, sleeves };
    const s = summarize(p, data(), evaluateConfig(p, data()));
    expect(Object.keys(s)).toEqual(["updatedAt", "startedAt", "dataThrough", "hoursLive", "startCash", "equity", "pnl", "returnPct", "trades", "wins", "fees", "maxSleeveDrawdownPct", "sleevesStoppedForDay", "sleevesKilled", "byMethod", "buyHoldPct", "openPositions", "tradeLog"]);
    expect(Object.keys(s.byMethod as object)).toEqual(["240m breakout"]);
  });
});

describe("live core: 4h experiment", () => {
  it("builds 4h bars from hourly candles and the same signals the research uses", () => {
    const c = resample(data().BTC_USD, 240, 60);
    expect(c[1].t - c[0].t).toBe(4 * H);
    const s: Sleeve = { market: "BTC_USD", tf: 240, strategy: "breakout", mode: "long", params, cash: 1 };
    expect(sleeveSignals(s, c)).toEqual(applyRegime(c, breakout.signals(c, params), 240, 0));
  });

  it("never trades before the start and keeps baselines out of the totals", () => {
    const startedAt = 2000 * H;
    const cfg = cfg4h(startedAt);
    const res = evaluateConfig(cfg, data(), {}, true);
    const all = res.flatMap((x) => x.r.trades);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((t) => t.entryT >= startedAt)).toBe(true);
    const s = summarize(cfg, data(), res) as any;
    const strat = res.filter((x) => !x.sleeve.role);
    expect(s.equity).toBeCloseTo(strat.reduce((a, x) => a + x.r.endEquity, 0));
    expect(Object.keys(s.perConfig).sort()).toEqual(["breakout-long", "breakout-long-short"]);
    expect(s.baselines.randomEntry.trades).toBeGreaterThan(0);
    expect(s.experimentId).toBe("exp-test");
  });

  it("is a deterministic replay: more candles never change trades that were already closed", () => {
    const cfg = cfg4h(2000 * H);
    const full = data();
    const part = { BTC_USD: full.BTC_USD.slice(0, 3000), ETH_USD: full.ETH_USD.slice(0, 3000) };
    const a = evaluateConfig(cfg, part), b = evaluateConfig(cfg, full);
    for (let i = 0; i < a.length; i++) {
      const closed = a[i].r.trades;
      expect(b[i].r.trades.slice(0, closed.length)).toEqual(closed);
    }
  });

  it("logs every signal, order, fill, exit and rejection with its configuration", () => {
    const res = evaluateConfig(cfg4h(2000 * H), data(), {}, true);
    const ev = eventLog(res);
    const types = new Set(ev.map((e) => e.type));
    for (const t of ["signal", "order", "fill", "exit", "reject"]) expect(types.has(t as any)).toBe(true);
    expect(ev.every((e) => e.config && e.market && e.at)).toBe(true);
    expect(ev.filter((e) => e.type === "exit").length).toBe(res.reduce((a, x) => a + x.r.trades.length, 0));
  });

  it("reports higher costs as lower returns", () => {
    const cfg = cfg4h(2000 * H);
    const base = summarize(cfg, data(), evaluateConfig(cfg, data())) as any;
    const high = feeScenarioReport(cfg, data()).x;
    expect(high["breakout-long"]).toBeLessThan(base.perConfig["breakout-long"].returnPct);
  });

  it("the random baseline is deterministic per market and bar, independent of how much data exists", () => {
    expect(barNoise("BTC_USD", 123 * H)).toBe(barNoise("BTC_USD", 123 * H));
    expect(barNoise("BTC_USD", 123 * H)).not.toBe(barNoise("ETH_USD", 123 * H));
    const c = resample(data().BTC_USD, 240, 60);
    const p = { prob: 0.05, stopAtr: 1.5, rr: 2 };
    expect(randomSignals(c.slice(0, 500), "BTC_USD", p).slice(100)).toEqual(randomSignals(c, "BTC_USD", p).slice(100, 500));
    const rate = randomSignals(c, "BTC_USD", p).filter(Boolean).length / c.length;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.08);
  });
});
