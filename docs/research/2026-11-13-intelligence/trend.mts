// Sensitivity of the simple long/flat trend rule on development data (5 coins). No H2 coins.
import { readFileSync } from "node:fs";
import { resample } from "/home/user/empire-/lib/paper/scalp/indicators";
import { btcUpByTime } from "/home/user/empire-/lib/paper/scalp/regime";
const M = ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"], DAY = 864e5, H = 36e5;
const P0 = Date.parse("2021-09-01"), PS = Date.parse("2024-11-13T05:00:00Z"), P1 = Date.parse("2026-11-13T06:00:00Z");
const h1 = Object.fromEntries(M.map((m) => [m, JSON.parse(readFileSync(`/home/user/empire-/.paper-data/hist/${m}_1h.json`, "utf8"))]));
const d1: Record<string, any[]> = Object.fromEntries(M.map((m) => [m, resample(h1[m], 1440, 60)]));
const btcUp = btcUpByTime(resample(h1.BTC_USD, 240, 60));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length, sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function run(look: number, useBtc: boolean, cost: number, from: number, to: number, volTarget = 0) {
  const byDay = new Map<number, number[]>(); const turn: number[] = [];
  for (const m of M) {
    const c = d1[m]; let prev = 0;
    for (let i = Math.max(look, 21); i < c.length - 1; i++) {
      if (c[i].t < from || c[i].t >= to) continue;
      let w = c[i].c > c[i - look].c && (!useBtc || btcUp.get(c[i].t + DAY - 4 * H)) ? 1 : 0;
      if (w && volTarget) { const v = sd(Array.from({ length: 20 }, (_, k) => c[i - k].c / c[i - k - 1].c - 1)) * Math.sqrt(365); w = Math.min(1, volTarget / v); }
      const r = w * (c[i + 1].c / c[i].c - 1) - Math.abs(w - prev) * cost; turn.push(Math.abs(w - prev)); prev = w;
      (byDay.get(c[i + 1].t) ?? byDay.set(c[i + 1].t, []).get(c[i + 1].t)!).push(r);
    }
  }
  const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => mean(v));
  let e = 1, pk = 1, dd = 0; const eq: number[] = []; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); eq.push(e); }
  const weeks: number[] = []; for (let i = 7; i < eq.length; i += 7) weeks.push(eq[i] / eq[i - 7] - 1);
  let streak = 0, worstStreak = 0; for (const x of d) { streak = x < 0 ? streak + 1 : 0; worstStreak = Math.max(worstStreak, streak); }
  const yrs = d.length / 365;
  return { total: +(100 * (e - 1)).toFixed(1), cagr: +(100 * (e ** (1 / yrs) - 1)).toFixed(1), avgDailyBp: +(mean(d) * 1e4).toFixed(1), sharpe: +((mean(d) / sd(d)) * Math.sqrt(365)).toFixed(2), maxDD: +(100 * dd).toFixed(1), worstDay: +(100 * Math.min(...d)).toFixed(1), worstWeek: +(100 * Math.min(...weeks)).toFixed(1), losingDayStreak: worstStreak, tradesPerCoinPerYear: +(turn.reduce((s, x) => s + x, 0) / M.length / yrs / 2).toFixed(1) };
}
const per = { B: [P0, PS], A: [PS, P1] } as const;
const bh = (from: number, to: number) => run(1, false, 0, from, to); // placeholder not used
console.log("look btc cost | B 2021-24 | A 2024-26");
for (const look of [14, 30, 60, 90]) for (const btc of [true, false]) {
  const cost = 0.0012;
  console.log(String(look).padStart(3), btc ? "btc " : "none", cost, "|", JSON.stringify(run(look, btc, cost, ...per.B)), "|", JSON.stringify(run(look, btc, cost, ...per.A)));
}
console.log("\ncost sensitivity, look 30 + btc:");
for (const cost of [0.0005, 0.0012, 0.0027, 0.0055]) console.log(cost, "|", JSON.stringify(run(30, true, cost, ...per.B)), "|", JSON.stringify(run(30, true, cost, ...per.A)));
console.log("\nvol-targeted 40% annual, look 30 + btc:", JSON.stringify(run(30, true, 0.0012, ...per.B, 0.4)), "|", JSON.stringify(run(30, true, 0.0012, ...per.A, 0.4)));
// Buy and hold equal-weight for reference
function hold(from: number, to: number) { const byDay = new Map<number, number[]>(); for (const m of M) { const c = d1[m]; for (let i = 1; i < c.length; i++) if (c[i - 1].t >= from && c[i - 1].t < to) (byDay.get(c[i].t) ?? byDay.set(c[i].t, []).get(c[i].t)!).push(c[i].c / c[i - 1].c - 1); } const d = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => mean(v)); let e = 1, pk = 1, dd = 0; for (const x of d) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); } return { total: +(100 * (e - 1)).toFixed(1), sharpe: +((mean(d) / sd(d)) * Math.sqrt(365)).toFixed(2), maxDD: +(100 * dd).toFixed(1), worstDay: +(100 * Math.min(...d)).toFixed(1) }; }
console.log("\nbuy&hold equal weight:", JSON.stringify(hold(...per.B)), "|", JSON.stringify(hold(...per.A)));
void bh;
