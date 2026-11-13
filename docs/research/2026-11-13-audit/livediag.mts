// For each frozen live sleeve: expected signal/trade rate and outcomes over the last 30 days of 1m data,
// plus how many bars the resampler drops because of missing 1m candles. (Params were tuned on part of this
// period, so P&L here is optimistic; the point is trade frequency and filter attrition.)
import { readFileSync } from "node:fs";
import type { Candle } from "/home/user/empire-/lib/paper/strategy";
import { resample } from "/home/user/empire-/lib/paper/scalp/indicators";
import { applyRegime, applyRegimeShort, mergeSides, shortSignals, strategyById } from "/home/user/empire-/lib/paper/scalp/strategies";
import { simulate } from "/home/user/empire-/lib/paper/scalp/engine";
const SP = "/tmp/claude-0/-home-user-empire-/c9727d73-abe8-584c-aaa5-862245264b32/scratchpad";
const cfg = JSON.parse(readFileSync("/home/user/empire-/lib/paper/scalp/live-config.json", "utf8"));
const data: Record<string, Candle[]> = {};
for (const s of cfg.sleeves) data[s.market] ??= JSON.parse(readFileSync(`${SP}/data/${s.market}_1m.json`, "utf8"));
for (const [m, c] of Object.entries(data)) {
  let miss = 0; for (let i = 1; i < c.length; i++) miss += Math.round((c[i].t - c[i - 1].t) / 60000) - 1;
  const parts = [5, 15, 60].map((tf) => { const r = resample(c, tf); const exp = Math.floor((c[c.length - 1].t - c[0].t) / (tf * 60000)); return `${tf}m dropped ${((1 - r.length / exp) * 100).toFixed(1)}%`; });
  console.log(m, `1m candles ${c.length}, missing minutes ${miss} (${((miss / (c.length + miss)) * 100).toFixed(2)}%) |`, parts.join(", "));
}
const agg: Record<string, { sig: number; tr: number; skip: number; pnl: number; wins: number; fees: number; gross: number; days: number; reasons: Record<string, number>; sides: Record<string, number> }> = {};
for (const s of cfg.sleeves) {
  const c = resample(data[s.market], s.tf);
  const st = strategyById(s.strategy);
  const long = applyRegime(c, st.signals(c, s.params), s.tf, s.params.regimeHours ?? 0);
  const sg = s.mode === "both" ? mergeSides(long, applyRegimeShort(c, shortSignals(st, c, s.params), s.tf, s.params.regimeHours ?? 0)) : long;
  const from = c[0].t + 3 * 86400000; // 3-day warm-up
  const r = simulate(c, sg, { startCash: 400, tradeFrom: from });
  const k = `${s.tf}m ${s.strategy}`;
  const a = (agg[k] ??= { sig: 0, tr: 0, skip: 0, pnl: 0, wins: 0, fees: 0, gross: 0, days: (c[c.length - 1].t - from) / 86400000, reasons: {}, sides: {} });
  a.sig += sg.filter((x, i) => x && c[i].t >= from).length; a.tr += r.trades.length; a.skip += r.skippedForEdge; a.pnl += r.endEquity - 400; a.wins += r.wins; a.fees += r.fees;
  a.gross += r.trades.reduce((q, t) => q + t.pnl + t.fees, 0);
  for (const t of r.trades) { a.reasons[t.reason] = (a.reasons[t.reason] ?? 0) + 1; const sd = t.side === 1 ? "long" : "short"; a.sides[sd] = (a.sides[sd] ?? 0) + t.pnl; }
}
for (const [k, a] of Object.entries(agg)) console.log(k.padEnd(14), `days ${a.days.toFixed(0)} | signals/day/coin ${(a.sig / a.days / 5).toFixed(2)}  skipped-for-cost ${((a.skip / Math.max(1, a.sig)) * 100).toFixed(0)}%  trades/day (5 coins) ${(a.tr / a.days).toFixed(2)}  win ${((a.wins / Math.max(1, a.tr)) * 100).toFixed(0)}%  P&L $${a.pnl.toFixed(2)} on $2000  gross $${a.gross.toFixed(2)} fees $${a.fees.toFixed(2)} | exits ${JSON.stringify(a.reasons)} sides ${JSON.stringify(Object.fromEntries(Object.entries(a.sides).map(([x, y]) => [x, +y.toFixed(2)])))}`);
