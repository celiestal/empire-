// H1: PAXG instead of cash in the trend rule (docs/research/hypotheses/H1-paxg-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight, type TrendParams } from "../../lib/paper/trend/daily";

const DAY = 86_400_000;
const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const daily = (dir: string, m: string) => resample(JSON.parse(readFileSync(`${dir}/${m}_1h.json`, "utf8")) as Candle[], 1440, 60);
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const paxg = daily(".paper-data/hist", "PAXG_USD");
const paxgRet = new Map(paxg.map((x, i) => [x.t, i ? x.c / paxg[i - 1].c - 1 : 0]));

/** Equal-weight portfolio of coin slices; idle part in PAXG (or cash). Daily returns from `from` to `to`. */
function run(coins: Record<string, Candle[]>, from: number, to: number, p: TrendParams, useGold: boolean) {
  const byDay = new Map<number, number>();
  const n = Object.keys(coins).length, cost = p.feePerSide + p.slippage;
  for (const c of Object.values(coins)) {
    let w0 = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const w = targetWeight(c, i - 1, btcUp, p);
      const g = useGold ? paxgRet.get(c[i].t) ?? 0 : 0;
      const r = w * (c[i].c / c[i - 1].c - 1) + (1 - w) * g - Math.abs(w - w0) * cost * (useGold ? 2 : 1);
      w0 = w;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / n);
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1));
  const cagr = e ** (365 / d.length) - 1;
  return { totalPct: +(100 * (e - 1)).toFixed(1), cagrPct: +(100 * cagr).toFixed(1), avgDailyPct: +(100 * m).toFixed(3), sharpe: +((m / sd) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), cagrPerDD: +(cagr / Math.max(dd, 1e-9)).toFixed(2) };
}

const cells: Record<string, unknown> = {};
const g = { positive: true, sharpe05: true, stressPositive: true, dd25: true, neighbours80: false, betterThanCash3of4: false };
let nbPos = 0, nbAll = 0, better = 0;
for (const [gn, grp] of Object.entries(G)) {
  const coins = Object.fromEntries(grp.coins.map((m) => [m, daily(grp.dir, m)]));
  for (const [wn, [f, t]] of Object.entries(W)) {
    const gold = run(coins, f, t, E1_PARAMS, true), cash = run(coins, f, t, E1_PARAMS, false);
    const stress = run(coins, f, t, { ...E1_PARAMS, feePerSide: 0.0025 }, true);
    const nb = [{ lookback: 20 }, { lookback: 45 }, { volTarget: 0.3 }, { volTarget: 0.5 }].map((x) => run(coins, f, t, { ...E1_PARAMS, ...x }, true).totalPct);
    cells[`${gn} ${wn}`] = { gold, cashBaseline: cash, goldAtStress: stress.totalPct, neighbours: nb };
    if (gold.totalPct <= 0) g.positive = false;
    if (gold.sharpe < 0.5) g.sharpe05 = false;
    if (stress.totalPct <= 0) g.stressPositive = false;
    if (gold.maxDDPct > 25) g.dd25 = false;
    nbPos += nb.filter((x) => x > 0).length; nbAll += nb.length;
    if (gold.cagrPerDD > cash.cagrPerDD) better++;
  }
}
g.neighbours80 = nbPos / nbAll >= 0.8;
g.betterThanCash3of4 = better >= 3;
const out = { cells, gates: g, passed: Object.values(g).every(Boolean), neighboursPositive: `${nbPos}/${nbAll}`, betterThanCash: `${better}/4` };
writeFileSync(".paper-data/h1-paxg.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
