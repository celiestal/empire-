// Hardened research runner (see lib/paper/scalp/evaluate.ts). Does not touch research.json or the live tests.
//
//   tsx scripts/paper/robust.ts wf      Walk-forward of existing strategies from several start offsets,
//                                       old per-window reset vs continuous, random-entry benchmark, costs.
//   tsx scripts/paper/robust.ts fixed   Pre-registered fixed variants (docs/research/2026-11-13-p1-preregistration.md)
//                                       scored against the written gates.
//
// Data: hourly candles in $DATA/<MARKET>_1h.json (default .paper-data/hist), e.g. from
//   NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/download.ts 2000 "" 1h && mkdir -p .paper-data/hist && mv .paper-data/*_1h.json .paper-data/hist/
// Env: DATA, MARKETS, TF (minutes, default 240), PERIODS ("name:warmFrom:from:to;..."), RUNS ("breakout:long,..."),
//      OFFSETS (days, "0,3,7,11,17"), SEEDS (200), OUT.
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { applyRegime, applyRegimeShort, applyTrail, mergeSides, shortSignals, strategyById, type Params } from "../../lib/paper/scalp/strategies";
import { applyBtcGate, btcUpByTime } from "../../lib/paper/scalp/regime";
import { DEFAULT_RISK, type RiskOptions, type SimTrade } from "../../lib/paper/scalp/engine";
import {
  DAY, assertNoLookahead, percentileOf, pooledT, portfolioStats, randomEntryBenchmark, runContinuous, runLegacy, stitch, topCoinShare, tradeStats, walkForward, type CoinRun, type Sig,
} from "../../lib/paper/scalp/evaluate";

const E = process.env;
const DATA = E.DATA ?? ".paper-data/hist";
const MARKETS = (E.MARKETS ?? "BTC_USD,ETH_USD,SOL_USD,XRP_USD,DOGE_USD").split(",");
const TF = Number(E.TF ?? 240);
const SEEDS = Number(E.SEEDS ?? 200);
const SC = DEFAULT_RISK.startCash;
const iso = (s: string) => Date.parse(s.length <= 10 ? `${s}T00:00:00Z` : s);
// Periods from the pre-registration. "research" = the period earlier research used; "h1" = first holdout.
const PERIODS = (E.PERIODS ?? "research:2024-11-13T05:00:00Z:2025-02-11:2026-11-13T06:00:00Z;h1:2021-09-01:2021-12-01:2024-11-13T05:00:00Z")
  .split(";").map((p) => {
    const [name, ...rest] = p.split(":");
    // ISO strings contain ':' too, so re-split on the date boundaries.
    const parts = rest.join(":").match(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?/g)!;
    return { name, warmFrom: iso(parts[0]), from: iso(parts[1]), to: iso(parts[2]) };
  });

const raw: Record<string, Candle[]> = Object.fromEntries(MARKETS.map((m) => [m, JSON.parse(readFileSync(`${DATA}/${m}_1h.json`, "utf8"))]));
const seriesFor = (p: { warmFrom: number; to: number }, markets = MARKETS) =>
  Object.fromEntries(markets.map((m) => [m, resample(raw[m].filter((c) => c.t >= p.warmFrom && c.t < p.to), TF, 60)]));
const r2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);

function signalsFor(c: Candle[], sid: string, mode: string, p: Params): Sig[] {
  const st = strategyById(sid);
  const h = p.regimeHours ?? 0;
  const L = mode === "short" ? null : applyRegime(c, st.signals(c, p), TF, h);
  const S = mode === "long" ? null : applyRegimeShort(c, shortSignals(st, c, p), TF, h);
  return L && S ? mergeSides(L, S) : (L ?? S)!;
}

function describeRuns(runs: CoinRun[], extra: Record<string, unknown> = {}) {
  const trades = runs.flatMap((r) => r.trades);
  const ts = tradeStats(trades, SC, runs.length);
  const ps = portfolioStats(runs);
  return { returnPct: r2(ps.avgReturnPct), annPct: r2(ps.annReturnPct), sharpe: r2(ps.sharpe), sortino: r2(ps.sortino), maxDD: r2(ps.maxDrawdownPct), trades: ts.trades, win: r2(ts.winRate * 100), avgWinR: r2(ts.avgWinR), avgLossR: r2(ts.avgLossR), pf: r2(ts.profitFactor), expR: r2(ts.expectancyR), t: r2(ts.tStat), pNeg: ts.bootstrapPNegative, feesPctOfPreFeeProfit: r2(ts.feesPctOfPreFeeProfit), dropTop10: r2(ts.dropTop10Pct), ...extra };
}

// Look-ahead guard on every strategy before any result is computed (house rules).
for (const st of ["breakout", "tsmom", "meanrev", "pullback", "vwap"]) {
  const g = strategyById(st).grid, p = g[Math.floor(g.length / 2)], c = resample(raw.BTC_USD.slice(-6000), TF, 60);
  for (const mode of ["long", "short"]) assertNoLookahead(`${st} ${mode}`, (cc) => signalsFor(cc, st, mode, p), c, 10);
}

const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), tf: TF, markets: MARKETS, periods: PERIODS.map((p) => ({ ...p, warmFrom: new Date(p.warmFrom).toISOString(), from: new Date(p.from).toISOString(), to: new Date(p.to).toISOString() })) };
const cmd = process.argv[2] ?? "wf";

if (cmd === "wf") {
  // Existing strategies, walk-forward exactly as research.ts (grid x regime 0/12/48, tune 90 / trade 30).
  const RUNS = (E.RUNS ?? "breakout:long,breakout:both,tsmom:long,tsmom:both").split(",").map((s) => s.split(":"));
  const OFFSETS = (E.OFFSETS ?? "0,3,7,11,17").split(",").map(Number);
  const TRAIN = Number(E.TRAIN_DAYS ?? 90), TEST = Number(E.TEST_DAYS ?? 30);
  const out: Record<string, unknown> = {};
  for (const per of PERIODS) {
    const series = seriesFor(per);
    for (const [sid, mode] of RUNS) {
      const grid = strategyById(sid).grid.flatMap((p) => [0, 12, 48].map((h) => ({ ...p, regimeHours: h })));
      const sigs = Object.fromEntries(MARKETS.map((m) => [m, grid.map((p) => signalsFor(series[m], sid, mode, p))]));
      const end = Math.min(...MARKETS.map((m) => series[m][series[m].length - 1].t)) + TF * 60_000;
      const perOffset = OFFSETS.map((off) => {
        const start = per.warmFrom + off * DAY;
        const windows = walkForward(series, sigs, { start, end, trainDays: TRAIN, testDays: TEST, minTrades: 15 });
        const legacy = runLegacy(series, sigs, windows);
        const st = Object.fromEntries(MARKETS.map((m) => [m, stitch(series[m], sigs[m], windows)]));
        const oosFrom = windows[0].from;
        const cont = runContinuous(series, st, oosFrom, end);
        return { off, windows, legacy, st, oosFrom, cont };
      });
      const o0 = perOffset[0];
      const rnd = randomEntryBenchmark(series, o0.st, o0.oosFrom, end, { seeds: SEEDS });
      const contRets = perOffset.map((x) => portfolioStats(x.cont).avgReturnPct);
      const costs: Record<string, number> = {};
      for (const [fee, slip] of [[0.001, 0.0002], [0.002, 0.0005], [0.0025, 0.0002], [0.005, 0.0005]]) {
        const opt: Partial<RiskOptions> = { feeRate: fee, slippage: slip };
        const w = walkForward(series, sigs, { start: per.warmFrom, end, trainDays: TRAIN, testDays: TEST, minTrades: 15, opt });
        const st = Object.fromEntries(MARKETS.map((m) => [m, stitch(series[m], sigs[m], w)]));
        costs[`fee${fee * 100}%/slip${slip * 100}%`] = r2(portfolioStats(runContinuous(series, st, w[0].from, end, opt)).avgReturnPct);
      }
      const key = `${per.name} ${TF / 60}h ${sid}/${mode}`;
      const row = describeRuns(o0.cont, {
        legacyByOffset: perOffset.map((x) => r2(x.legacy.avgReturnPct)),
        continuousByOffset: contRets.map(r2),
        positiveOffsets: `${contRets.filter((x) => x > 0).length}/${contRets.length}`,
        distinctSettings: `${new Set(o0.windows.map((w) => w.k)).size}/${o0.windows.length}`,
        randomP50: r2(rnd[Math.floor(rnd.length / 2)]), randomP90: r2(rnd[Math.floor(rnd.length * 0.9)]),
        randomPctile: Math.round(percentileOf(rnd, portfolioStats(o0.cont).avgReturnPct) * 100),
        costs,
      });
      out[key] = row;
      console.log(`\n${key}`, JSON.stringify(row));
    }
  }
  report.wf = out;
} else if (cmd === "fixed") {
  // Pre-registered P1 variants. Changing these after seeing results is not allowed (see the pre-registration).
  const BASE: Params = { n: 40, volMult: 1.5, stopAtr: 1.5, rr: 2, trend: 0, regimeHours: 0 };
  interface Spec { id: string; p: Params; trail?: number; gate?: boolean }
  const SPECS: Spec[] = [
    { id: "base", p: BASE },
    { id: "trail", p: BASE, trail: 3 },
    { id: "gate", p: BASE, gate: true },
    { id: "trail+gate", p: BASE, trail: 3, gate: true },
  ];
  const neighbours = (s: Spec): Spec[] => {
    const out: Spec[] = [];
    for (const n of [20, 60]) out.push({ ...s, p: { ...s.p, n } });
    for (const stopAtr of [1, 2]) out.push({ ...s, p: { ...s.p, stopAtr } });
    if (s.trail) for (const trail of [2, 4]) out.push({ ...s, trail });
    return out;
  };
  const per = PERIODS.map((p) => {
    const series = seriesFor(p);
    const btc = btcUpByTime(series.BTC_USD);
    return { ...p, series, btc };
  });
  const build = (s: Spec, P: (typeof per)[number], opt?: Partial<RiskOptions>) => {
    const sig: Record<string, Sig[]> = {}, allowed: Record<string, boolean[]> = {};
    for (const m of MARKETS) {
      const c = P.series[m];
      let x = signalsFor(c, "breakout", "long", s.p);
      if (s.trail) x = applyTrail(c, x, s.trail, 120);
      if (s.gate) x = applyBtcGate(c, x, P.btc);
      sig[m] = x;
      allowed[m] = c.map((k) => !s.gate || !!P.btc.get(k.t));
    }
    return { sig, allowed, runs: runContinuous(P.series, sig, P.from, P.to, opt) };
  };
  const res: Record<string, unknown> = {};
  for (const s of SPECS) {
    const perPeriod = per.map((P) => {
      const b = build(s, P);
      const ret = portfolioStats(b.runs).avgReturnPct;
      const rnd = randomEntryBenchmark(P.series, b.sig, P.from, P.to, { seeds: SEEDS, allowed: b.allowed });
      const stressed = portfolioStats(build(s, P, { feeRate: 0.002, slippage: 0.0005 }).runs).avgReturnPct;
      const nb = neighbours(s).map((v) => portfolioStats(build(v, P).runs).avgReturnPct);
      const hold = Object.fromEntries(MARKETS.map((m) => { const c = P.series[m]; const a = c.findIndex((k) => k.t >= P.from); return [m, r2((c[c.length - 1].c / c[a].o - 1) * 100)]; }));
      const byYear: Record<string, number> = {};
      for (const t of b.runs.flatMap((r) => r.trades)) { const y = new Date(t.entryT).toISOString().slice(0, 4); byYear[y] = r2((byYear[y] ?? 0) + (t.pnl / SC) * 100 / MARKETS.length); }
      const byCoin = Object.fromEntries(b.runs.map((r) => [r.market, r2(r.trades.reduce((q, t) => q + t.pnl, 0) / SC * 100)]));
      return { name: P.name, b, ret, rnd, stressed, nb, hold, byYear, byCoin };
    });
    const allTrades: SimTrade[][] = perPeriod.map((x) => x.b.runs.flatMap((r) => r.trades));
    const pt = pooledT(allTrades);
    const tcs = topCoinShare(perPeriod.flatMap((x) => x.b.runs));
    const gates = [
      { name: "1 positive in both periods", pass: perPeriod.every((x) => x.ret > 0), detail: perPeriod.map((x) => `${x.name} ${r2(x.ret)}%`).join(", ") },
      { name: "2 pooled t >= 2", pass: pt >= 2, detail: `t=${r2(pt)}` },
      { name: "3 >= 90th pct of random entries in both", pass: perPeriod.every((x) => percentileOf(x.rnd, x.ret) >= 0.9), detail: perPeriod.map((x) => `${x.name} p${Math.round(percentileOf(x.rnd, x.ret) * 100)}`).join(", ") },
      { name: "4 positive at 0.2% fee + 0.05% slip in both", pass: perPeriod.every((x) => x.stressed > 0), detail: perPeriod.map((x) => `${x.name} ${r2(x.stressed)}%`).join(", ") },
      { name: "5 no coin > 50% of profit", pass: tcs <= 0.5, detail: `top coin ${Number.isNaN(tcs) ? "n/a (no profit)" : Math.round(tcs * 100) + "%"}` },
      { name: "6 Sharpe >= 0.5 in both", pass: perPeriod.every((x) => portfolioStats(x.b.runs).sharpe >= 0.5), detail: perPeriod.map((x) => `${x.name} ${r2(portfolioStats(x.b.runs).sharpe)}`).join(", ") },
      { name: "7 >= 80% of neighbours positive in both", pass: perPeriod.every((x) => x.nb.filter((v) => v > 0).length / x.nb.length >= 0.8), detail: perPeriod.map((x) => `${x.name} ${x.nb.map(r2).join("/")}`).join(", ") },
    ];
    const passed = gates.every((g) => g.pass);
    res[s.id] = { passed, gates, periods: perPeriod.map((x) => ({ name: x.name, ...describeRuns(x.b.runs, { randomP50: r2(x.rnd[Math.floor(x.rnd.length / 2)]), stressed: r2(x.stressed), byYear: x.byYear, byCoin: x.byCoin, buyHold: x.hold }) })) };
    console.log(`\n=== ${s.id}: ${passed ? "PASSES development gates" : "FAILS"}`);
    for (const g of gates) console.log(`  ${g.pass ? "pass" : "FAIL"}  ${g.name}: ${g.detail}`);
    for (const x of (res[s.id] as any).periods) console.log(`  ${JSON.stringify(x)}`);
  }
  report.fixed = res;
} else throw new Error(`unknown command ${cmd}`);

const OUT = E.OUT ?? `.paper-data/robust-${cmd}.json`;
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log("\nwrote", OUT);
