// Diagnostic re-run of scripts/paper/research.ts's walk-forward, with deeper analysis.
// Replicates: grid x REGIMES(0,12,48), tune TRAIN days on all coins (score = ret - 0.5*DD, >= MIN trades), trade next TEST days.
// Env: DATA (dir), SUF (1h), FROM, TO (ISO), MARKETS, TF (240), RUNS ("breakout:long,..."), TRAIN, TEST, SEEDS, OUT, FEES
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "/home/user/empire-/lib/paper/strategy";
import { atr, ema, resample } from "/home/user/empire-/lib/paper/scalp/indicators";
import { applyRegime, applyRegimeShort, mergeSides, shortSignals, strategyById, type EntrySignal, type Params } from "/home/user/empire-/lib/paper/scalp/strategies";
import { classify } from "/home/user/empire-/lib/paper/scalp/regime";
import { DEFAULT_RISK, simulate, type RiskOptions, type SimTrade } from "/home/user/empire-/lib/paper/scalp/engine";

const E = process.env;
const DATA = E.DATA!;
const SUF = E.SUF ?? "1h";
const BASE = 60;
const MARKETS = (E.MARKETS ?? "BTC_USD,ETH_USD,SOL_USD,XRP_USD,DOGE_USD").split(",");
const TF = Number(E.TF ?? 240);
const RUNS = (E.RUNS ?? "breakout:long,breakout:both,breakout:short,tsmom:both,tsmom:long,tsmom:short").split(",").map((s) => s.split(":") as [string, string]);
const TRAIN = Number(E.TRAIN ?? 90), TEST = Number(E.TEST ?? 30), MIN = Number(E.MIN ?? 15);
const SEEDS = Number(E.SEEDS ?? 200);
const REGIMES = [0, 12, 48];
const DAY = 86_400_000;
const FROM = E.FROM ? Date.parse(E.FROM) : -Infinity, TO = E.TO ? Date.parse(E.TO) : Infinity;
const FEES = (E.FEES ?? "0.0005,0.001,0.0015,0.002,0.0025").split(",").map(Number);

const raw: Record<string, Candle[]> = Object.fromEntries(MARKETS.map((m) => [m, (JSON.parse(readFileSync(`${DATA}/${m}_${SUF}.json`, "utf8")) as Candle[]).filter((c) => c.t >= FROM && c.t < TO)]));
const series = Object.fromEntries(MARKETS.map((m) => [m, resample(raw[m], TF, BASE)]));
const start = Math.max(...MARKETS.map((m) => raw[m][0].t));
const end = Math.min(...MARKETS.map((m) => raw[m][raw[m].length - 1].t)) + BASE * 60_000;
const hourGaps = Object.fromEntries(MARKETS.map((m) => { const c = raw[m]; let miss = 0; for (let i = 1; i < c.length; i++) miss += Math.round((c[i].t - c[i - 1].t) / 3_600_000) - 1; return [m, { missingHours: miss, tfBars: series[m].length, expectedTfBars: Math.floor((c[c.length - 1].t - c[0].t) / (TF * 60_000)) }]; }));

const idxAt = (c: Candle[], t: number) => { let lo = 0, hi = c.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid].t < t) lo = mid + 1; else hi = mid; } return lo; };
const rangeIdx = (c: Candle[], from: number, to: number): [number, number] => [idxAt(c, from), idxAt(c, to)];

// context features
const btc = series["BTC_USD"];
const btcE = ema(btc.map((x) => x.c), 42); // ~7 days of 4h bars
const btcMap = new Map(btc.map((x, i) => [x.t, i]));
const ctx: Record<string, { reg: string[]; volT: string[]; atr: number[] }> = {};
for (const m of MARKETS) {
  const c = series[m];
  const reg = classify(c, TF, { hours: 24, erTrend: 0.3, erRange: 0.15 });
  const a = atr(c, 14);
  const pct = a.map((v, i) => v / c[i].c);
  const volT = pct.map((v, i) => { if (i < 180 || !(v > 0)) return "na"; const w = pct.slice(i - 180, i).filter((x) => x > 0).sort((x, y) => x - y); const r = idxAt(w.map((x) => ({ t: x })) as any, v) / w.length; return r < 1 / 3 ? "lowVol" : r < 2 / 3 ? "midVol" : "highVol"; });
  ctx[m] = { reg, volT, atr: a };
}
const btcTrend = (t: number) => { const i = btcMap.get(t); if (i === undefined || i < 7 || Number.isNaN(btcE[i])) return "na"; return btc[i].c > btcE[i] && btcE[i] > btcE[i - 6] ? "btcUp" : btc[i].c < btcE[i] && btcE[i] < btcE[i - 6] ? "btcDown" : "btcMixed"; };

function buildSignals(sid: string, mode: string) {
  const strat = strategyById(sid);
  const params: Params[] = strat.grid.flatMap((p) => REGIMES.map((h) => ({ ...p, regimeHours: h })));
  const sigs: Record<string, (EntrySignal | null)[][]> = {};
  for (const m of MARKETS) {
    const c = series[m];
    sigs[m] = [];
    for (const p of strat.grid) {
      const base = mode === "short" ? null : strat.signals(c, p);
      const bs = mode === "long" ? null : shortSignals(strat, c, p);
      for (const h of REGIMES) {
        const L = base ? applyRegime(c, base, TF, h) : null;
        const S = bs ? applyRegimeShort(c, bs, TF, h) : null;
        sigs[m].push(L && S ? mergeSides(L, S) : (L ?? S)!);
      }
    }
  }
  return { strat, params, sigs };
}

function walk(S: ReturnType<typeof buildSignals>, opt: Partial<RiskOptions> = {}) {
  const run = (m: string, sg: (EntrySignal | null)[], from: number, to: number, o: Partial<RiskOptions> = opt) => { const [a, b] = rangeIdx(series[m], from, to); return { r: simulate(series[m].slice(a, b), sg.slice(a, b), o), a, b }; };
  const windows: { from: number; to: number; k: number }[] = [];
  for (let ws = start; ws + (TRAIN + TEST) * DAY <= end + DAY / 2; ws += TEST * DAY) {
    const trainTo = ws + TRAIN * DAY, testTo = Math.min(end, trainTo + TEST * DAY);
    let best = -1, bs = -Infinity;
    for (let k = 0; k < S.params.length; k++) {
      let sc = 0, n = 0;
      for (const m of MARKETS) { const { r } = run(m, S.sigs[m][k], ws, trainTo); sc += r.returnPct - 0.5 * r.maxDrawdownPct; n += r.trades.length; }
      if (n >= MIN && sc > bs) [best, bs] = [k, sc];
    }
    windows.push({ from: trainTo, to: testTo, k: best });
  }
  return { windows, run };
}

const stats = (rs: number[]) => { const n = rs.length; const mu = n ? rs.reduce((a, b) => a + b, 0) / n : 0; const sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1)) : 0; return { n, mu, sd, t: sd > 0 ? mu / (sd / Math.sqrt(n)) : 0 }; };
let seed = 7; const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const report: any = { data: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), markets: MARKETS, tf: TF, hourGaps }, runs: {} };
const hold: Record<string, number> = {};
for (const m of MARKETS) { const c = series[m]; const i = idxAt(c, start + TRAIN * DAY); hold[m] = (c[c.length - 1].c / c[i].o - 1) * 100; }
report.buyHoldOOS = hold;
console.log("span", report.data.from, "->", report.data.to, "| B&H over OOS:", Object.entries(hold).map(([k, v]) => `${k.replace("_USD", "")} ${v.toFixed(0)}%`).join(" "));
console.log("data gaps:", JSON.stringify(hourGaps));

for (const [sid, mode] of RUNS) {
  const S = buildSignals(sid, mode);
  const W = walk(S);
  const trades: (SimTrade & { m: string; holdBars: number; reg: string; btc: string; vol: string; mfeR: number; postR: number; stopDist: number; gross: number })[] = [];
  let rawSigs = 0, skippedEdge = 0, positiveWindows = 0, used = 0;
  const perCoin: Record<string, number> = Object.fromEntries(MARKETS.map((m) => [m, 0]));
  const barRet = new Map<number, number[]>();
  for (const w of W.windows) {
    if (w.k < 0) continue;
    used++;
    let wsum = 0;
    for (const m of MARKETS) {
      const sg = S.sigs[m][w.k];
      const { r, a, b } = W.run(m, sg, w.from, w.to);
      const c = series[m];
      for (let i = a; i < b - 1; i++) if (sg[i]) rawSigs++;
      skippedEdge += r.skippedForEdge;
      perCoin[m] += r.returnPct; wsum += r.returnPct;
      for (let j = 1; j < r.equity.length; j++) { const t = r.equity[j].t; const v = r.equity[j].v / r.equity[j - 1].v - 1; (barRet.get(t) ?? barRet.set(t, []).get(t)!).push(v); }
      const all = [...r.trades];
      if (r.open) { const o = r.open, lc = c[b - 1].c * (1 - o.side * DEFAULT_RISK.slippage), ef = o.qty * lc * DEFAULT_RISK.feeRate, nf = o.qty * o.entry * DEFAULT_RISK.feeRate; const pnl = o.side * o.qty * (lc - o.entry) - ef - nf; const risk = o.qty * Math.abs(o.entry - o.stop); all.push({ side: o.side, entryT: o.entryT, exitT: c[b - 1].t, entry: o.entry, exit: lc, qty: o.qty, reason: "end", pnl, r: risk > 0 ? pnl / risk : 0, fees: ef + nf }); }
      for (const tr of all) {
        const ei = idxAt(c, tr.entryT), xi = idxAt(c, tr.exitT);
        const risk = tr.r !== 0 ? tr.pnl / tr.r : NaN; const stopDist = risk / tr.qty;
        let mfe = 0; for (let i = ei; i <= xi && i < c.length; i++) mfe = Math.max(mfe, tr.side === 1 ? c[i].h - tr.entry : tr.entry - c[i].l);
        let post = -Infinity; for (let i = xi + 1; i <= Math.min(c.length - 1, xi + 30); i++) post = Math.max(post, tr.side === 1 ? c[i].h - tr.entry : tr.entry - c[i].l);
        const sigT = c[ei - 1]?.t ?? tr.entryT;
        trades.push({ ...tr, m, holdBars: xi - ei + 1, reg: ctx[m].reg[ei - 1] ?? "na", btc: btcTrend(sigT), vol: ctx[m].volT[ei - 1] ?? "na", mfeR: mfe / stopDist, postR: post / stopDist, stopDist, gross: tr.pnl + tr.fees });
      }
    }
    if (wsum > 0) positiveWindows++;
  }
  const N = MARKETS.length, SC = DEFAULT_RISK.startCash;
  const pctOf = (x: number) => (x / SC) * 100 / N; // same unit as research: avg % per coin, summed
  const total = Object.values(perCoin).reduce((a, b) => a + b, 0) / N;
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = -losses.reduce((s, t) => s + t.pnl, 0);
  const R = stats(trades.map((t) => t.r));
  const fees = trades.reduce((s, t) => s + t.fees, 0), gross = trades.reduce((s, t) => s + t.gross, 0);
  const sorted = [...trades].sort((a, b) => b.pnl - a.pnl);
  const dropTop = pctOf(sorted.slice(Math.ceil(trades.length * 0.1)).reduce((s, t) => s + t.pnl, 0));
  // bootstrap P(sum<=0)
  let neg = 0; for (let k = 0; k < 2000; k++) { let s = 0; for (let i = 0; i < trades.length; i++) s += trades[Math.floor(rand() * trades.length)].pnl; if (s <= 0) neg++; }
  // portfolio daily series (equal weight across coins, bar-level average)
  const byDay = new Map<number, number>();
  for (const [t, v] of [...barRet.entries()].sort((a, b) => a[0] - b[0])) { const d = Math.floor(t / DAY); const avg = v.reduce((a, b) => a + b, 0) / N; byDay.set(d, (1 + (byDay.get(d) ?? 0)) * (1 + avg) - 1); }
  const dr = [...byDay.values()]; const ds = stats(dr); const down = Math.sqrt(dr.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / Math.max(1, dr.length));
  let eq = 1, pk = 1, mdd = 0; for (const x of dr) { eq *= 1 + x; pk = Math.max(pk, eq); mdd = Math.max(mdd, 1 - eq / pk); }
  const years = dr.length / 365;
  const group = (key: (t: (typeof trades)[number]) => string) => { const g: Record<string, { n: number; pnlPct: number; win: number; avgR: number }> = {}; for (const t of trades) { const k = key(t); const x = (g[k] ??= { n: 0, pnlPct: 0, win: 0, avgR: 0 }); x.n++; x.pnlPct += pctOf(t.pnl); if (t.pnl > 0) x.win++; x.avgR += t.r; } for (const x of Object.values(g)) { x.avgR /= x.n; x.win = Math.round((x.win / x.n) * 100); x.pnlPct = +x.pnlPct.toFixed(2); x.avgR = +x.avgR.toFixed(2); } return g; };
  const med = (a: number[]) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? +s[Math.floor(s.length / 2)].toFixed(2) : NaN; };
  const stopTr = trades.filter((t) => t.reason === "stop"), tgtTr = trades.filter((t) => t.reason === "target"), timeTr = trades.filter((t) => t.reason === "time");
  const exitDiag = {
    stopsWithMfeAbove1R: stopTr.filter((t) => t.mfeR >= 1).length, stops: stopTr.length,
    stopsThatLaterReached2R: stopTr.filter((t) => t.postR >= 2).length,
    targetsMedianPostRunR: med(tgtTr.map((t) => t.postR)), targetsRanFurther2RBeyond: tgtTr.filter((t) => t.postR >= 2 + (t.r > 0 ? t.r : 0)).length, targets: tgtTr.length,
    timeExitMedianR: med(timeTr.map((t) => t.r)), timeExits: timeTr.length,
    medianMfeR_losers: med(losses.map((t) => t.mfeR)), medianMfeR_winners: med(wins.map((t) => t.mfeR)),
  };

  // random-entry benchmark: same windows, same chosen params' stop/target/hold, same signal density and side mix
  const runShortShare = trades.length ? trades.filter((t) => t.side === -1).length / trades.length : 0;
  const rnd: number[] = [];
  const strat = S.strat;
  for (let s = 0; s < SEEDS; s++) {
    let tot = 0;
    for (const w of W.windows) {
      if (w.k < 0) continue;
      const p = S.params[w.k];
      for (const m of MARKETS) {
        const c = series[m]; const sg = S.sigs[m][w.k]; const [a, b] = rangeIdx(c, w.from, w.to);
        let nL = 0, nS = 0; for (let i = a; i < b; i++) if (sg[i]) (sg[i]!.side === -1 ? nS++ : nL++);
        const dens = (nL + nS) / Math.max(1, b - a), pS = runShortShare;
        const hold = strat.id === "tsmom" ? p.hold : 60;
        const rs: (EntrySignal | null)[] = [];
        for (let i = a; i < b; i++) { const at = ctx[m].atr[i]; rs.push(rand() < dens && at > 0 ? { side: rand() < pS ? -1 : 1, stopDist: p.stopAtr * at, targetDist: p.rr * p.stopAtr * at, maxBars: hold } : null); }
        tot += simulate(c.slice(a, b), rs).returnPct;
      }
    }
    rnd.push(tot / N);
  }
  rnd.sort((a, b) => a - b);
  const pctile = rnd.filter((x) => x < total).length / rnd.length;

  // parameter plateau: every grid point held fixed over the whole OOS span
  const oosFrom = W.windows[0].from;
  const plateau = S.params.map((_, k) => MARKETS.reduce((s, m) => s + W.run(m, S.sigs[m][k], oosFrom, end).r.returnPct, 0) / N).sort((a, b) => a - b);
  // cost sensitivity with re-selection under the new costs
  const costs: Record<string, number> = {};
  for (const f of FEES) for (const sl of [0.0002, 0.001]) {
    if (sl === 0.001 && f !== 0.001) continue;
    const o = { feeRate: f, slippage: sl }; const W2 = walk(S, o);
    costs[`fee${f * 100}%_slip${sl * 100}%`] = +(W2.windows.filter((w) => w.k >= 0).reduce((s, w) => s + MARKETS.reduce((q, m) => q + W2.run(m, S.sigs[m][w.k], w.from, w.to, o).r.returnPct, 0), 0) / N).toFixed(2);
  }
  const paramsChosen: Record<string, number> = {}; for (const w of W.windows) { const key = w.k < 0 ? "none" : JSON.stringify(S.params[w.k]); paramsChosen[key] = (paramsChosen[key] ?? 0) + 1; }

  const out = {
    oosReturnAvgPerCoinPct: +total.toFixed(2), perCoin: Object.fromEntries(Object.entries(perCoin).map(([k, v]) => [k, +v.toFixed(2)])),
    windows: W.windows.length, windowsTraded: used, positiveWindows, distinctParamSets: Object.keys(paramsChosen).length,
    trades: trades.length, tradesPerCoinPerMonth: +(trades.length / N / (used * TEST / 30)).toFixed(2), rawSignals: rawSigs, skippedForEdge: skippedEdge,
    winRate: +((wins.length / Math.max(1, trades.length)) * 100).toFixed(1), avgWinR: +stats(wins.map((t) => t.r)).mu.toFixed(2), avgLossR: +stats(losses.map((t) => t.r)).mu.toFixed(2),
    profitFactor: +(gw / gl).toFixed(2), expectancyR: +R.mu.toFixed(3), tStatR: +R.t.toFixed(2), bootstrapPnegative: +(neg / 2000).toFixed(3),
    feesPctOfGross: +((fees / Math.max(1e-9, gross)) * 100).toFixed(0), feesPctOfNetEquity: +pctOf(fees).toFixed(2), grossPct: +pctOf(gross).toFixed(2),
    dropTop10Pct: +dropTop.toFixed(2),
    portfolio: { annReturnPct: +((eq ** (1 / years) - 1) * 100).toFixed(2), sharpe: +((ds.mu / ds.sd) * Math.sqrt(365)).toFixed(2), sortino: +((ds.mu / down) * Math.sqrt(365)).toFixed(2), maxDDPct: +(mdd * 100).toFixed(2), exposureNote: "0.5% risk/trade" },
    randomEntry: { p5: +rnd[Math.floor(SEEDS * 0.05)].toFixed(2), p50: +rnd[Math.floor(SEEDS * 0.5)].toFixed(2), p95: +rnd[Math.floor(SEEDS * 0.95)].toFixed(2), strategyPercentile: +(pctile * 100).toFixed(0) },
    plateau: { combos: plateau.length, positiveShare: +((plateau.filter((x) => x > 0).length / plateau.length) * 100).toFixed(0), p10: +plateau[Math.floor(plateau.length * 0.1)].toFixed(2), median: +plateau[Math.floor(plateau.length / 2)].toFixed(2), p90: +plateau[Math.floor(plateau.length * 0.9)].toFixed(2) },
    costs, exitDiag,
    bySide: group((t) => (t.side === 1 ? "long" : "short")), byReason: group((t) => t.reason), byRegime: group((t) => t.reg), byBtc: group((t) => t.btc), byVol: group((t) => t.vol), byCoin: group((t) => t.m.replace("_USD", "")),
    byHold: group((t) => (t.holdBars <= 2 ? "<=8h" : t.holdBars <= 6 ? "8-24h" : t.holdBars <= 18 ? "1-3d" : ">3d")),
    byYear: group((t) => new Date(t.entryT).toISOString().slice(0, 4)),
    paramsChosen,
  };
  report.runs[`${sid}:${mode}`] = out;
  console.log(`\n=== ${TF / 60}h ${sid}/${mode}: OOS ${out.oosReturnAvgPerCoinPct}%/coin  trades ${out.trades} (${out.tradesPerCoinPerMonth}/coin/mo)  win ${out.winRate}%  PF ${out.profitFactor}  E[R] ${out.expectancyR} t=${out.tStatR}  P(<=0) ${out.bootstrapPnegative}  +win ${positiveWindows}/${used}`);
  console.log(`  portfolio ann ${out.portfolio.annReturnPct}% sharpe ${out.portfolio.sharpe} sortino ${out.portfolio.sortino} maxDD ${out.portfolio.maxDDPct}% | fees ${out.feesPctOfGross}% of gross | dropTop10 ${out.dropTop10Pct}`);
  console.log(`  random-entry p5/p50/p95 ${out.randomEntry.p5}/${out.randomEntry.p50}/${out.randomEntry.p95} -> strategy pctile ${out.randomEntry.strategyPercentile} | plateau ${out.plateau.positiveShare}% positive, med ${out.plateau.median}`);
  console.log(`  costs ${JSON.stringify(costs)}`);
  console.log(`  exits ${JSON.stringify(exitDiag)}`);
  for (const k of ["bySide", "byReason", "byRegime", "byBtc", "byVol", "byCoin", "byHold", "byYear"]) console.log(`  ${k} ${JSON.stringify((out as any)[k])}`);
  console.log(`  signals ${rawSigs} -> skippedEdge ${skippedEdge}, taken ${trades.length}; distinct param sets ${out.distinctParamSets}/${used}`);
}
if (E.OUT) writeFileSync(E.OUT, JSON.stringify(report, null, 1));
