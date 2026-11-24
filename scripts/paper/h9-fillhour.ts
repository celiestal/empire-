// H9: execution-hour robustness of the trend rule (docs/research/hypotheses/H9-fillhour-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";

const HOUR = 3_600_000;
const G = {
  original5: { dir: ".paper-data/hist", coins: ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] },
  h2_8: { dir: ".paper-data/h2", coins: ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"] },
};
const W = { w1: [Date.parse("2022-12-11"), Date.parse("2024-11-13")], w2: [Date.parse("2024-11-13"), Date.parse("2026-11-13")] } as const;
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const HOURS = [0, 4, 8, 12, 16, 20];

function run(coins: Record<string, { d: Candle[]; open: Map<number, number> }>, from: number, to: number, h: number, cost: number) {
  const byDay = new Map<number, number>(); const n = Object.keys(coins).length;
  for (const { d: c, open } of Object.values(coins)) {
    let w0 = 0;
    for (let i = 1; i < c.length - 1; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      const w = targetWeight(c, i - 1, btcUp, E1_PARAMS); // decided at 00:00 of day i
      const p0 = open.get(c[i].t + h * HOUR), p1 = open.get(c[i + 1].t + h * HOUR);
      const ret = p0 && p1 ? p1 / p0 - 1 : 0; // missing hour -> flat (counted below)
      const r = w * ret - Math.abs(w - w0) * cost; w0 = w;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / n);
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); }
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  return { totalPct: +(100 * (e - 1)).toFixed(1), sharpe: +((m / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1) };
}

const cells: Record<string, unknown> = {};
let allPositive = 0, allRuns = 0, zeroBest = 0, missing = 0;
for (const [gn, grp] of Object.entries(G)) {
  const coins = Object.fromEntries(grp.coins.map((m) => {
    const hrs = JSON.parse(readFileSync(`${grp.dir}/${m}_1h.json`, "utf8")) as Candle[];
    return [m, { d: resample(hrs, 1440, 60), open: new Map(hrs.map((x) => [x.t, x.o])) }];
  }));
  for (const c of Object.values(coins)) for (const x of c.d) for (const h of HOURS) if (x.t >= W.w1[0] && x.t < W.w2[1] && !c.open.has(x.t + h * HOUR)) missing++;
  for (const [wn, [f, t]] of Object.entries(W)) {
    const r = Object.fromEntries(HOURS.map((h) => [`h${h}`, run(coins, f, t, h, 0.0012)]));
    const totals = HOURS.map((h) => (r[`h${h}`] as { totalPct: number }).totalPct);
    allRuns += totals.length; allPositive += totals.filter((x) => x > 0).length;
    const best = Math.max(...totals);
    if (totals[0] === best) zeroBest++;
    cells[`${gn} ${wn}`] = { ...r, spreadPts: +(best - Math.min(...totals)).toFixed(1), h0Rank: 1 + totals.filter((x) => x > totals[0]).length };
  }
}
const out = { cells, allPositive: `${allPositive}/${allRuns}`, criterion1: allPositive === allRuns, h0BestIn: `${zeroBest}/4`, criterion2: zeroBest <= 2, passed: allPositive === allRuns && zeroBest <= 2, missingHourlyBars: missing };
writeFileSync(".paper-data/h9-fillhour.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
