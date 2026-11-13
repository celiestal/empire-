// Backtester self-checks (the video's "test the back tester before trusting it").
// Pass ranges are fixed here, before any run:
//   1. Planted edge: price gets +1% on the bar after every flag. A rule that buys each flag at the next open and sells
//      at that bar's close must make 0.55%..0.95% per trade after costs (0.24% round trip at default costs).
//   2. Pure noise: same flags, no bump. Per-trade result must be between -0.45% and -0.05% (about minus costs) and
//      never a profit.
//   3. Cheating signal: a rule that looks at the next bar's close must be caught by assertNoLookahead, and every real
//      strategy (plus the BTC gate and trailing exit) must pass it.
import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/paper/strategy";
import { simulate } from "@/lib/paper/scalp/engine";
import { applyRegime, applyTrail, shortSignals, STRATEGIES, type EntrySignal } from "@/lib/paper/scalp/strategies";
import { applyBtcGate, btcUpByTime } from "@/lib/paper/scalp/regime";
import { assertNoLookahead } from "@/lib/paper/scalp/evaluate";

const H4 = 4 * 3_600_000;
function market(n: number, seed: number, bump: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const c: Candle[] = [];
  const flags: boolean[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const flaggedBefore = i > 0 && flags[i - 1];
    const o = p;
    const move = (rnd() - 0.5) * 0.004 + (flaggedBefore ? bump : 0);
    p = o * (1 + move);
    c.push({ t: i * H4, o, h: Math.max(o, p) * 1.0005, l: Math.min(o, p) * 0.9995, c: p, v: 1 });
    flags.push(rnd() < 0.08);
  }
  return { c, flags };
}
/** Buy at the next open after a flag, sell at that bar's close (time exit after 1 bar); stop/target far away. */
const perTrade = (bump: number, seed: number) => {
  const { c, flags } = market(3000, seed, bump);
  const sig: (EntrySignal | null)[] = flags.map((f, i) => (f ? { stopDist: c[i].c * 0.5, targetDist: c[i].c * 0.5, maxBars: 1 } : null));
  const r = simulate(c, sig, { riskPerTrade: 1, maxPositionFrac: 1, minEdge: 0, minStopCost: 0, dailyLossLimit: 1, killDrawdown: 1, maxConsecutiveLosses: 1e9 });
  const per = r.trades.map((t) => t.pnl / (t.qty * t.entry));
  return { n: per.length, avg: per.reduce((a, b) => a + b, 0) / per.length };
};

describe("backtester self-check", () => {
  it("finds a planted +1% edge, minus costs", () => {
    for (const seed of [1, 2, 3]) {
      const { n, avg } = perTrade(0.01, seed);
      expect(n).toBeGreaterThan(150);
      expect(avg).toBeGreaterThan(0.0055);
      expect(avg).toBeLessThan(0.0095);
    }
  });

  it("finds nothing but costs in pure noise", () => {
    for (const seed of [4, 5, 6]) {
      const { avg } = perTrade(0, seed);
      expect(avg).toBeLessThan(-0.0005);
      expect(avg).toBeGreaterThan(-0.0045);
    }
  });

  it("catches a cheating signal that peeks at the next bar", () => {
    const { c } = market(800, 7, 0);
    const cheat = (cc: Candle[]) => cc.map((x, i) => (i + 1 < cc.length && cc[i + 1].c > x.c ? { stopDist: 1, targetDist: 1, maxBars: 5 } : null));
    expect(() => assertNoLookahead("cheat", cheat, c)).toThrow(/look-ahead/);
  });

  it("every real strategy, its short mirror, the BTC gate and the trailing exit pass the look-ahead guard", () => {
    const { c } = market(900, 8, 0);
    const btc = market(900, 9, 0).c;
    for (const st of STRATEGIES) {
      const p = st.grid[Math.floor(st.grid.length / 2)];
      assertNoLookahead(`${st.id} long`, (cc) => applyRegime(cc, st.signals(cc, p), 240, 12), c, 10);
      assertNoLookahead(`${st.id} short`, (cc) => shortSignals(st, cc, p), c, 10);
      assertNoLookahead(`${st.id} trail+gate`, (cc) => applyBtcGate(cc, applyTrail(cc, st.signals(cc, p), 3, 120), btcUpByTime(btc.slice(0, cc.length))), c, 10);
    }
  });
});
