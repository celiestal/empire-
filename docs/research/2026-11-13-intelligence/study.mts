// Research study for the "adaptive trading intelligence" audit. Development data only (5 coins, H1 + research period).
// Periods: B = 2021-09-01..2024-11-13 (older), A = 2024-11-13..2026-11-13 (newer). Selection always trains on the past.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "/home/user/empire-/lib/paper/strategy";
import { atr, ema, priorHigh, resample } from "/home/user/empire-/lib/paper/scalp/indicators";
import { applyRegime, applyRegimeShort, applyTrail, shortSignals, strategyById, type EntrySignal, type Params } from "/home/user/empire-/lib/paper/scalp/strategies";
import { applyBtcGate, btcUpByTime, classify } from "/home/user/empire-/lib/paper/scalp/regime";
import { simulate } from "/home/user/empire-/lib/paper/scalp/engine";

const M = ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"];
const DAY = 864e5, H = 36e5;
const P0 = Date.parse("2021-09-01"), PSPLIT = Date.parse("2024-11-13T05:00:00Z"), P1 = Date.parse("2026-11-13T06:00:00Z");
const periods = { B_2021_24: [P0, PSPLIT], A_2024_26: [PSPLIT, P1] } as const;
const h1: Record<string, Candle[]> = Object.fromEntries(M.map((m) => [m, JSON.parse(readFileSync(`/home/user/empire-/.paper-data/hist/${m}_1h.json`, "utf8")).filter((c: Candle) => c.t >= P0 - 60 * DAY && c.t < P1)]));
const c4: Record<string, Candle[]> = Object.fromEntries(M.map((m) => [m, resample(h1[m], 240, 60)]));
const d1: Record<string, Candle[]> = Object.fromEntries(M.map((m) => [m, resample(h1[m], 1440, 60)]));
const out: Record<string, unknown> = {};
const r2 = (x: number) => Math.round(x * 100) / 100, r3 = (x: number) => Math.round(x * 1000) / 1000;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const tstat = (a: number[]) => (a.length > 1 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : 0);
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
const rank = (a: number[]) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => (r[i] = k)); return r; };
const spearman = (a: number[], b: number[]) => corr(rank(a), rank(b));
const inP = (t: number, p: readonly number[]) => t >= p[0] && t < p[1];
const rets = (c: Candle[]) => c.map((x, i) => (i ? x.c / c[i - 1].c - 1 : 0));

// ---------- A. Coin characteristics ----------
{
  const res: Record<string, unknown> = {};
  for (const [pn, p] of Object.entries(periods)) {
    const dailyR: Record<string, Map<number, number>> = {};
    for (const m of M) { const c = d1[m]; dailyR[m] = new Map(); c.forEach((x, i) => { if (i && inP(x.t, p)) dailyR[m].set(x.t, x.c / c[i - 1].c - 1); }); }
    const days = [...dailyR.BTC_USD.keys()].filter((t) => M.every((m) => dailyR[m].has(t)));
    for (const m of M) {
      const dr = days.map((t) => dailyR[m].get(t)!);
      const c = c4[m].filter((x) => inP(x.t, p));
      const r4 = rets(c).slice(1);
      const a = atr(c4[m], 14);
      const atrPct = mean(c4[m].map((x, i) => (inP(x.t, p) && a[i] > 0 ? a[i] / x.c : NaN)).filter(Number.isFinite));
      // variance ratio: var of k-period returns / (k * var of 1-period)
      const vr = (r: number[], k: number) => { const kr: number[] = []; for (let i = k; i <= r.length; i += 1) kr.push(r.slice(i - k, i).reduce((s, x) => s + x, 0)); return (sd(kr) ** 2) / (k * sd(r) ** 2); };
      const ac1 = corr(r4.slice(1), r4.slice(0, -1)), acD = corr(dr.slice(1), dr.slice(0, -1));
      // breakouts on 4h: close above prior 20-bar high
      const full = c4[m], hi = priorHigh(full, 20);
      const fwd: number[] = [], base: number[] = []; let fails = 0, n = 0;
      for (let i = 21; i < full.length - 6; i++) {
        if (!inP(full[i].t, p)) continue;
        const f = full[i + 6].c / full[i].c - 1; base.push(f);
        if (full[i].c > hi[i] && full[i - 1].c <= hi[i - 1]) { n++; fwd.push(f); if (Math.min(full[i + 1].c, full[i + 2].c, full[i + 3].c) < hi[i]) fails++; }
      }
      let peak = 0, mdd = 0; for (const x of c) { peak = Math.max(peak, x.c); mdd = Math.max(mdd, 1 - x.c / peak); }
      const qv = mean(h1[m].filter((x) => inP(x.t, p)).map((x) => (x.v ?? 0) * x.c));
      res[`${pn} ${m}`] = {
        annVolPct: r2(sd(dr) * Math.sqrt(365) * 100), atr4hPct: r2(atrPct * 100), buyHoldPct: r2((c[c.length - 1].c / c[0].o - 1) * 100), maxDrawdownPct: r2(mdd * 100),
        corrBTC: r2(corr(dr, days.map((t) => dailyR.BTC_USD.get(t)!))), avgCorrOthers: r2(mean(M.filter((x) => x !== m).map((o) => corr(dr, days.map((t) => dailyR[o].get(t)!))))),
        ac1_4h: r3(ac1), ac1_daily: r3(acD), VR_4h_k6: r3(vr(r4, 6)), VR_daily_k7: r3(vr(dr, 7)),
        breakouts: n, breakoutFwd24hPct: r3(mean(fwd) * 100), unconditionalFwd24hPct: r3(mean(base) * 100), breakoutEdgePct: r3((mean(fwd) - mean(base)) * 100), breakoutEdgeT: r2(tstat(fwd.map((x) => x - mean(base)))), falseBreakoutPct: r2((fails / Math.max(1, n)) * 100),
        avgHourlyQuoteVolUSD: Math.round(qv),
      };
    }
  }
  out.coinCharacteristics = res;
}

// ---------- B. Strategy x coin matrix (fixed params, continuous, 4h) and coin-specific selection ----------
type Spec = { id: string; sid: string; mode: "long" | "short"; p: Params; trail?: number; gate?: boolean };
const SPECS: Spec[] = [
  { id: "breakout-L", sid: "breakout", mode: "long", p: { n: 40, volMult: 1.5, stopAtr: 1.5, rr: 2, trend: 0 } },
  { id: "breakout-S", sid: "breakout", mode: "short", p: { n: 40, volMult: 1.5, stopAtr: 1.5, rr: 2, trend: 0 } },
  { id: "breakoutTG-L", sid: "breakout", mode: "long", p: { n: 40, volMult: 1.5, stopAtr: 1.5, rr: 2, trend: 0 }, trail: 3, gate: true },
  { id: "tsmom-L", sid: "tsmom", mode: "long", p: { look: 72, stopAtr: 3, rr: 6, hold: 72 } },
  { id: "tsmom-S", sid: "tsmom", mode: "short", p: { look: 72, stopAtr: 3, rr: 6, hold: 72 } },
  { id: "meanrev-L", sid: "meanrev", mode: "long", p: { bb: 20, k: 2.5, rsiLen: 14, rsiMax: 30, stopAtr: 2.5, trend: 0 } },
  { id: "meanrev-S", sid: "meanrev", mode: "short", p: { bb: 20, k: 2.5, rsiLen: 14, rsiMax: 30, stopAtr: 2.5, trend: 0 } },
  { id: "pullback-L", sid: "pullback", mode: "long", p: { fast: 20, slow: 100, stopAtr: 1.5, rr: 2 } },
  { id: "vwap-L", sid: "vwap", mode: "long", p: { len: 60, z: 2.5, stopAtr: 2.5, trend: 0 } },
];
const btcUp4 = btcUpByTime(c4.BTC_USD);
const sigFor = (s: Spec, c: Candle[]): (EntrySignal | null)[] => {
  const st = strategyById(s.sid);
  let x = s.mode === "long" ? applyRegime(c, st.signals(c, s.p), 240, 0) : applyRegimeShort(c, shortSignals(st, c, s.p), 240, 0);
  if (s.trail) x = applyTrail(c, x, s.trail, 120);
  if (s.gate) x = applyBtcGate(c, x, btcUp4);
  return x;
};
// daily returns of each spec on each coin over the whole span (one continuous account), by UTC day
const daily: Record<string, Record<string, Map<number, number>>> = {};
const tradesBy: Record<string, Record<string, { entryT: number; pnl: number; r: number }[]>> = {};
for (const s of SPECS) {
  daily[s.id] = {}; tradesBy[s.id] = {};
  for (const m of M) {
    const c = c4[m]; const a = c.findIndex((x) => x.t >= P0);
    const r = simulate(c.slice(a), sigFor(s, c).slice(a), { startCash: 1000 });
    const dm = new Map<number, number>(); let prevV = 1000, prevD = -1, dayStart = 1000;
    for (const e of r.equity) { const d = Math.floor(e.t / DAY) * DAY; if (d !== prevD) { if (prevD >= 0) dm.set(prevD, prevV / dayStart - 1); dayStart = prevV; prevD = d; } prevV = e.v; }
    dm.set(prevD, prevV / dayStart - 1);
    daily[s.id][m] = dm; tradesBy[s.id][m] = r.trades.map((t) => ({ entryT: t.entryT, pnl: t.pnl, r: t.r }));
  }
}
const allDays = [...daily[SPECS[0].id].BTC_USD.keys()].sort((a, b) => a - b);
const sumRet = (dm: Map<number, number>, p: readonly number[]) => { let e = 1; for (const [t, v] of dm) if (inP(t, p)) e *= 1 + v; return (e - 1) * 100; };
const sharpeOf = (a: number[]) => (sd(a) > 0 ? (mean(a) / sd(a)) * Math.sqrt(365) : 0);
{
  const matrix: Record<string, Record<string, number[]>> = {};
  const cellsA: number[] = [], cellsB: number[] = [];
  for (const s of SPECS) {
    matrix[s.id] = {};
    for (const m of M) {
      const b = sumRet(daily[s.id][m], periods.B_2021_24), a = sumRet(daily[s.id][m], periods.A_2024_26);
      matrix[s.id][m.replace("_USD", "")] = [r2(b), r2(a)]; cellsA.push(a); cellsB.push(b);
    }
  }
  // remove the strategy-wide component: does the COIN-specific part persist?
  const resid = (cells: number[]) => cells.map((v, i) => { const si = Math.floor(i / M.length); const row = cells.slice(si * M.length, si * M.length + M.length); return v - mean(row); });
  // forward test of per-coin selection: pick per coin the best spec in B, trade it in A
  const pick: Record<string, unknown> = {};
  let selA = 0, allA = 0, bestGlobalA = 0;
  const globalBest = SPECS.map((s, si) => [mean(M.map((_, mi) => cellsB[si * M.length + mi])), si]).sort((x, y) => y[0] - x[0])[0][1];
  M.forEach((m, mi) => {
    const best = SPECS.map((s, si) => [cellsB[si * M.length + mi], si]).sort((x, y) => y[0] - x[0])[0];
    const aRet = cellsA[best[1] * M.length + mi];
    pick[m] = { chosenInB: SPECS[best[1]].id, itsReturnInB: r2(best[0]), itsReturnInA: r2(aRet), rankInA: 1 + SPECS.map((_, si) => cellsA[si * M.length + mi]).filter((v) => v > aRet).length };
    selA += aRet / M.length; allA += mean(SPECS.map((_, si) => cellsA[si * M.length + mi])) / M.length; bestGlobalA += cellsA[globalBest * M.length + mi] / M.length;
  });
  out.strategyCoinMatrix = { note: "[% in B 2021-24, % in A 2024-26], 0.5% risk/trade, fee 0.1%", matrix, spearmanAllCells_BvsA: r2(spearman(cellsB, cellsA)), spearmanCoinSpecificPart_BvsA: r2(spearman(resid(cellsB), resid(cellsA))), perCoinSelection: pick, avgReturnInA: { perCoinPickFromB: r2(selA), sameStrategyForAllCoins_bestInB: r2(bestGlobalA), averageOfAllStrategies: r2(allA), globalBestInB: SPECS[globalBest].id } };
}

// ---------- C. Rolling adaptive selectors (monthly, trailing 365d, causal) ----------
{
  const months: number[] = []; for (let t = Date.parse("2022-09-01"); t < P1; ) { months.push(t); const d = new Date(t); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  const trailing = (id: string, m: string, to: number) => { let e = 1; for (const [t, v] of daily[id][m]) if (t >= to - 365 * DAY && t < to) e *= 1 + v; return e - 1; };
  const series: Record<string, number[]> = { static_breakoutTG: [], static_breakoutL: [], perCoin_bestTrailing: [], pooled_bestTrailing: [], perCoin_bestOrNone: [] };
  const chosen: Record<string, Record<string, number>> = {};
  for (let k = 0; k < months.length; k++) {
    const from = months[k], to = months[k + 1] ?? P1;
    const pooledScores = SPECS.map((s) => mean(M.map((m) => trailing(s.id, m, from))));
    const pooled = SPECS[pooledScores.indexOf(Math.max(...pooledScores))].id;
    const pick: Record<string, string | null> = {};
    for (const m of M) {
      const sc = SPECS.map((s) => trailing(s.id, m, from));
      const best = sc.indexOf(Math.max(...sc));
      pick[m] = SPECS[best].id; (chosen[m] ??= {})[SPECS[best].id] = ((chosen[m] ??= {})[SPECS[best].id] ?? 0) + 1;
      (pick as any)[m + "_none"] = sc[best] > 0 ? SPECS[best].id : null;
    }
    for (const d of allDays.filter((t) => t >= from && t < to)) {
      const avg = (f: (m: string) => number) => mean(M.map(f));
      const g = (id: string | null, m: string) => (id ? daily[id][m].get(d) ?? 0 : 0);
      series.static_breakoutTG.push(avg((m) => g("breakoutTG-L", m)));
      series.static_breakoutL.push(avg((m) => g("breakout-L", m)));
      series.perCoin_bestTrailing.push(avg((m) => g(pick[m], m)));
      series.pooled_bestTrailing.push(avg((m) => g(pooled, m)));
      series.perCoin_bestOrNone.push(avg((m) => g((pick as any)[m + "_none"], m)));
    }
  }
  const summ = (a: number[]) => { let e = 1, pk = 1, dd = 0; for (const x of a) { e *= 1 + x; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); } return { totalPct: r2((e - 1) * 100), sharpe: r2(sharpeOf(a)), maxDDPct: r2(dd * 100) }; };
  out.adaptiveSelectors = { span: "2022-09 .. 2026-11 (first 12 months used only as history)", note: "monthly re-selection on trailing 365d of fixed-param daily returns; switching costs at month ends ignored (small)", results: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, summ(v)])), perCoinChoices: chosen };
}

// ---------- D. Regime-conditional strategy returns and persistence ----------
{
  // regime at the start of each day (from the previous day's closed 4h bars)
  const lab = (m: string) => {
    const c = c4[m], er = classify(c, 240, { hours: 72, erTrend: 0.3, erRange: 0.15 }), a = atr(c, 14);
    const pct = a.map((v, i) => v / c[i].c);
    const map = new Map<number, { btc: string; er: string; vol: string }>();
    for (let i = 200; i < c.length; i++) {
      if (new Date(c[i].t).getUTCHours() !== 20) continue; // last 4h bar of the day; label applies to the next day
      const w = pct.slice(i - 180, i).sort((x, y) => x - y); const q = w.filter((x) => x < pct[i]).length / w.length;
      map.set(Math.floor(c[i].t / DAY) * DAY + DAY, { btc: btcUp4.get(c[i].t) ? "btcUp" : "btcNotUp", er: er[i], vol: q < 1 / 3 ? "lowVol" : q < 2 / 3 ? "midVol" : "highVol" });
    }
    return map;
  };
  const labels = Object.fromEntries(M.map((m) => [m, lab(m)]));
  const table: Record<string, Record<string, unknown>> = {};
  const persist: number[][] = [[], []];
  for (const dim of ["btc", "er", "vol"] as const) {
    for (const s of SPECS) {
      const acc: Record<string, Record<string, number[]>> = {};
      for (const m of M) for (const [d, v] of daily[s.id][m]) { const L = labels[m].get(d); if (!L) continue; const pn = inP(d, periods.B_2021_24) ? "B" : inP(d, periods.A_2024_26) ? "A" : null; if (!pn) continue; ((acc[L[dim]] ??= {})[pn] ??= []).push(v); }
      for (const [g, by] of Object.entries(acc)) {
        const b = (by.B ?? []).map((x) => x * 1e4), a = (by.A ?? []).map((x) => x * 1e4);
        (table[`${dim}:${g}`] ??= {})[s.id] = `B ${r2(mean(b))}bp/d (t ${r2(tstat(b))}) | A ${r2(mean(a))}bp/d (t ${r2(tstat(a))})`;
        if (b.length > 30 && a.length > 30) { persist[0].push(mean(b)); persist[1].push(mean(a)); }
      }
    }
  }
  out.regimeConditional = { note: "mean daily return in basis points of the sleeve (0.5% risk/trade) on days starting in each regime; label from the prior day close", table, spearman_regimeStrategyCells_BvsA: r2(spearman(persist[0], persist[1])), cells: persist[0].length };
}

// ---------- E. BTC influence on altcoins ----------
{
  const res: Record<string, unknown> = {};
  for (const [pn, p] of Object.entries(periods)) for (const m of M.filter((x) => x !== "BTC_USD")) {
    const c = c4[m]; const hi = priorHigh(c, 20);
    const g: Record<string, { f: number[]; crash: number; brk: number[] }> = { btcUp: { f: [], crash: 0, brk: [] }, btcNotUp: { f: [], crash: 0, brk: [] } };
    for (let i = 21; i < c.length - 6; i++) {
      if (!inP(c[i].t, p)) continue;
      const k = btcUp4.get(c[i].t) ? "btcUp" : "btcNotUp";
      const f = c[i + 6].c / c[i].c - 1; g[k].f.push(f); if (Math.min(...c.slice(i + 1, i + 7).map((x) => x.l)) / c[i].c - 1 < -0.08) g[k].crash++;
      if (c[i].c > hi[i] && c[i - 1].c <= hi[i - 1]) g[k].brk.push(f);
    }
    res[`${pn} ${m}`] = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { bars: v.f.length, fwd24hBp: r2(mean(v.f) * 1e4), t: r2(tstat(v.f)), pDrop8pctIn24h: r2((v.crash / v.f.length) * 100), breakouts: v.brk.length, breakoutFwd24hBp: r2(mean(v.brk) * 1e4) }]));
  }
  // lead-lag: does BTC's last 4h return predict the alt's next 4h return?
  const ll: Record<string, number> = {};
  for (const [pn, p] of Object.entries(periods)) for (const m of M.filter((x) => x !== "BTC_USD")) {
    const bt = new Map(c4.BTC_USD.map((x, i) => [x.t, i ? x.c / c4.BTC_USD[i - 1].c - 1 : 0]));
    const xs: number[] = [], ys: number[] = [];
    const c = c4[m]; for (let i = 1; i < c.length - 1; i++) if (inP(c[i].t, p) && bt.has(c[i].t)) { xs.push(bt.get(c[i].t)!); ys.push(c[i + 1].c / c[i].c - 1); }
    ll[`${pn} ${m}`] = r3(corr(xs, ys));
  }
  out.btcInfluence = { conditional: res, leadLagCorr_BTC4h_to_altNext4h: ll };
}

// ---------- F. Time of day / day of week ----------
{
  const hourMean: Record<string, number[]> = {}, hourAbs: Record<string, number[]> = {}, dow: Record<string, number[]> = {};
  const tH: Record<string, number[]> = {};
  for (const [pn, p] of Object.entries(periods)) {
    const byH: number[][] = Array.from({ length: 24 }, () => []), byD: number[][] = Array.from({ length: 7 }, () => []);
    for (const m of M) { const c = h1[m]; for (let i = 1; i < c.length; i++) if (inP(c[i].t, p)) byH[new Date(c[i].t).getUTCHours()].push(c[i].c / c[i - 1].c - 1); const d = d1[m]; for (let i = 1; i < d.length; i++) if (inP(d[i].t, p)) byD[new Date(d[i].t).getUTCDay()].push(d[i].c / d[i - 1].c - 1); }
    hourMean[pn] = byH.map((a) => mean(a) * 1e4); hourAbs[pn] = byH.map((a) => mean(a.map(Math.abs)) * 1e4); dow[pn] = byD.map((a) => mean(a) * 1e4); tH[pn] = byH.map(tstat);
  }
  // tradeable test: choose the 6 best hours in B, hold long only in those hours in A, pay 0.24% round trip per day-session (one entry per contiguous block approximated as per hour)
  const best6 = hourMean.B_2021_24.map((v, h) => [v, h]).sort((a, b) => b[0] - a[0]).slice(0, 6).map((x) => x[1]);
  const grossA = mean(best6.map((h) => hourMean.A_2024_26[h]));
  out.timeEffects = {
    note: "basis points per hour (pooled 5 coins); UTC hours",
    hourMeanCorr_BvsA: r2(corr(hourMean.B_2021_24, hourMean.A_2024_26)), hourVolCorr_BvsA: r2(corr(hourAbs.B_2021_24, hourAbs.A_2024_26)),
    hoursWith_abs_t_gt_2_in_B: tH.B_2021_24.filter((t) => Math.abs(t) > 2).length, hoursWith_abs_t_gt_2_in_A: tH.A_2024_26.filter((t) => Math.abs(t) > 2).length,
    best6HoursInB: best6, theirMeanInA_bpPerHour: r2(grossA), costPerRoundTrip_bp: 24,
    volByHour_A: hourAbs.A_2024_26.map(r2), meanByHour_B: hourMean.B_2021_24.map(r2), meanByHour_A: hourMean.A_2024_26.map(r2),
    dowMean_bp_SunToSat: { B: dow.B_2021_24.map(r2), A: dow.A_2024_26.map(r2) }, dowCorr_BvsA: r2(corr(dow.B_2021_24, dow.A_2024_26)),
  };
}

// ---------- G. Simple ML vs simple rule (daily, walk-forward, pooled coins) ----------
{
  type Row = { t: number; m: string; x: number[]; y: number; r: number };
  const rows: Row[] = [];
  const btcD = d1.BTC_USD, btcIdx = new Map(btcD.map((x, i) => [x.t, i]));
  for (const m of M) {
    const c = d1[m];
    for (let i = 31; i < c.length - 1; i++) {
      const bi = btcIdx.get(c[i].t); if (bi === undefined || bi < 31) continue;
      const r = (k: number, cc = c, j = i) => cc[j].c / cc[j - k].c - 1;
      const vol = sd(Array.from({ length: 20 }, (_, k) => c[i - k].c / c[i - k - 1].c - 1));
      const x = [r(1), r(7), r(30), vol, r(7, btcD, bi), r(30, btcD, bi), btcUp4.get(c[i].t + DAY - 4 * H) ? 1 : 0, [0, 6].includes(new Date(c[i].t).getUTCDay()) ? 1 : 0];
      const fr = c[i + 1].c / c[i].c - 1;
      rows.push({ t: c[i].t, m, x, y: fr > 0 ? 1 : 0, r: fr });
    }
  }
  rows.sort((a, b) => a.t - b.t);
  const fitLR = (tr: Row[]) => {
    const k = tr[0].x.length; const mu = Array.from({ length: k }, (_, j) => mean(tr.map((r) => r.x[j]))); const s = Array.from({ length: k }, (_, j) => sd(tr.map((r) => r.x[j])) || 1);
    const z = (x: number[]) => x.map((v, j) => (v - mu[j]) / s[j]); const w = new Array(k + 1).fill(0);
    for (let it = 0; it < 300; it++) { const g = new Array(k + 1).fill(0); for (const r of tr) { const zx = z(r.x); const p = 1 / (1 + Math.exp(-(w[0] + zx.reduce((q, v, j) => q + v * w[j + 1], 0)))); const e = p - r.y; g[0] += e; zx.forEach((v, j) => (g[j + 1] += e * v)); } for (let j = 0; j <= k; j++) w[j] -= (0.5 * g[j]) / tr.length + 0.001 * (j ? w[j] : 0); }
    return (x: number[]) => { const zx = z(x); return 1 / (1 + Math.exp(-(w[0] + zx.reduce((q, v, j) => q + v * w[j + 1], 0)))); };
  };
  const res: Record<string, unknown> = {};
  for (const [pn, p] of Object.entries(periods)) {
    const preds: { p: number; y: number; r: number; m: string; t: number; rule: number }[] = [];
    for (let t = p[0]; t < p[1]; t += 30 * DAY) {
      const tr = rows.filter((r) => r.t >= t - 365 * DAY && r.t < t - DAY); // gap of one day: label of t-1 uses close at t
      const te = rows.filter((r) => r.t >= t && r.t < Math.min(p[1], t + 30 * DAY));
      if (tr.length < 300 || !te.length) continue;
      const f = fitLR(tr);
      for (const r of te) preds.push({ p: f(r.x), y: r.y, r: r.r, m: r.m, t: r.t, rule: r.x[2] > 0 && r.x[6] === 1 ? 1 : 0 });
    }
    const acc = mean(preds.map((q) => ((q.p > 0.5 ? 1 : 0) === q.y ? 1 : 0)));
    // AUC
    const pos = preds.filter((q) => q.y === 1).map((q) => q.p), neg = preds.filter((q) => q.y === 0).map((q) => q.p);
    let auc = 0; const sn = [...neg].sort((a, b) => a - b); for (const v of pos) { let lo = 0, hi = sn.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sn[mid] < v) lo = mid + 1; else hi = mid; } auc += lo; } auc /= pos.length * neg.length;
    // long/flat strategies per coin with costs on position changes (0.12% per side)
    const strat = (pos: (q: (typeof preds)[number]) => number) => { const byM: Record<string, (typeof preds)> = {}; for (const q of preds) (byM[q.m] ??= []).push(q); const daily: Map<number, number[]> = new Map(); for (const qs of Object.values(byM)) { let prev = 0; for (const q of qs) { const w = pos(q); const r = w * q.r - Math.abs(w - prev) * 0.0012; prev = w; (daily.get(q.t) ?? daily.set(q.t, []).get(q.t)!).push(r); } } const d = [...daily.values()].map(mean); let e = 1; for (const x of d) e *= 1 + x; return { totalPct: r2((e - 1) * 100), sharpe: r2(sharpeOf(d)), timeInMarketPct: r2(mean(preds.map((q) => pos(q))) * 100) }; };
    res[pn] = { predictions: preds.length, accuracy: r3(acc), baseRateUp: r3(mean(preds.map((q) => q.y))), auc: r3(auc), mlLongFlat_p055: strat((q) => (q.p > 0.55 ? 1 : 0)), ruleLongFlat_30dUp_and_btcUp: strat((q) => q.rule), buyHold: strat(() => 1) };
  }
  out.ml = { note: "logistic regression, 8 features at daily close, trained on trailing 365d, refit every 30d, target = next-day direction, pooled 5 coins; equal-weight long/flat, 0.12% per side on changes", res };
}

writeFileSync("/tmp/claude-0/-home-user-empire-/c9727d73-abe8-584c-aaa5-862245264b32/scratchpad/study.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
