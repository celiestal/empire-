// E1: market-filtered trend on the untouched H2 coins (docs/research/2026-11-13-e1-preregistration.md). Run once.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";

const COINS = ["ADA_USD", "LINK_USD", "AVAX_USD", "LTC_USD", "DOT_USD", "XLM_USD", "NEAR_USD", "BCH_USD"];
const DAY = 864e5, H = 36e5, END = Date.parse("2026-11-13");
const d1: Record<string, Candle[]> = Object.fromEntries(COINS.map((m) => [m, resample(JSON.parse(readFileSync(`.paper-data/h2/${m}_1h.json`, "utf8")), 1440, 60)]));
const btcUp = btcUpByTime(resample(JSON.parse(readFileSync(".paper-data/hist/BTC_USD_1h.json", "utf8")), 240, 60));
const START = Math.max(...COINS.map((m) => d1[m][0].t)) + 60 * DAY;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

function run(cost: number, trend = true) {
  const byDay = new Map<number, number>();
  const perCoin: Record<string, number> = {};
  for (const m of COINS) {
    const c = d1[m]; let w0 = 0, eq = 1;
    for (let i = 31; i < c.length; i++) {
      if (c[i].t < START || c[i].t >= END) continue;
      const j = i - 1; // decide at the previous close
      const vol = sd(Array.from({ length: 20 }, (_, k) => c[j - k].c / c[j - k - 1].c - 1)) * Math.sqrt(365);
      const on = trend ? c[j].c > c[j - 30].c && !!btcUp.get(c[j].t + DAY - 4 * H) : true;
      const w = trend ? (on ? Math.min(1, 0.4 / vol) : 0) : 1;
      const r = w * (c[i].c / c[j].c - 1) - Math.abs(w - w0) * cost; w0 = w;
      eq *= 1 + r;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + r / COINS.length);
    }
    perCoin[m] = +(100 * (eq - 1)).toFixed(1);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const d = days.map(([, r]) => r);
  let e = 1, pk = 1, dd = 0; const byYear: Record<string, number> = {}; const eqs: number[] = [];
  for (const [t, r] of days) { e *= 1 + r; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); const y = new Date(t).getUTCFullYear(); byYear[y] = (byYear[y] ?? 1) * (1 + r); eqs.push(e); }
  const wk: number[] = []; for (let i = 7; i < eqs.length; i += 7) wk.push(eqs[i] / eqs[i - 7] - 1);
  return { totalPct: +(100 * (e - 1)).toFixed(1), avgDailyPct: +(100 * mean(d)).toFixed(3), cagrPct: +(100 * (e ** (365 / d.length) - 1)).toFixed(1), sharpe: +((mean(d) / sd(d)) * Math.sqrt(365)).toFixed(2), maxDDPct: +(100 * dd).toFixed(1), worstDayPct: +(100 * Math.min(...d)).toFixed(1), worstWeekPct: +(100 * Math.min(...wk)).toFixed(1), byYearPct: Object.fromEntries(Object.entries(byYear).map(([y, v]) => [y, +(100 * (v - 1)).toFixed(1)])), perCoin };
}
const base = run(0.0012), stress = run(0.0027), hold = run(0, false);
const gates = {
  positiveTotal: base.totalPct > 0,
  atLeast5of8CoinsPositive: Object.values(base.perCoin).filter((x) => x > 0).length >= 5,
  sharpeAtLeast05: base.sharpe >= 0.5,
  positiveAtStressCost: stress.totalPct > 0,
  maxDDAtMost25: base.maxDDPct <= 25,
};
const out = { span: [new Date(START).toISOString().slice(0, 10), new Date(END).toISOString().slice(0, 10)], base, stress, buyHold: hold, gates, passed: Object.values(gates).every(Boolean) };
writeFileSync(".paper-data/e1.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
