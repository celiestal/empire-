// Walk-forward research + stress tests for the scalping bot, on real downloaded candles.
//
// For every timeframe × strategy × mode (long only, or long + short):
//   - Roll through the history: tune the settings on 10 days using ALL coins together
//     (one setting must work across BTC, ETH, SOL, XRP, DOGE — harder to overfit),
//     then trade the NEXT 5 days with those settings frozen. Step 5 days, repeat.
//   - Only those next-5-day ("out-of-sample") results count as performance.
// Then stress-test: higher/lower fees, 3× slippage, no cost filters, removing the best trades,
// and shuffling trade order (Monte Carlo) for a bad-luck drawdown.
//
// Regime switch (SWITCH=1): also searches the regime detector in lib/paper/scalp/regime.ts, which
// lets trend methods trade only in trends (with the trend) and reversion methods only in ranges.
// Every row also splits its out-of-sample P&L by the market regime at entry (fixed reference
// classifier), to show which method makes or loses money in which kind of market.
//
// Usage: tsx scripts/paper/research.ts   (env: MARKETS, TFS, MODES, REGIMES, SWITCH, OUT)
import { readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { applyRegime, applyRegimeShort, mergeSides, shortSignals, STRATEGIES, type EntrySignal, type Params } from "../../lib/paper/scalp/strategies";
import { applyRegimeSwitch, classify, METHOD_KIND, REGIME_GRID, type Regime } from "../../lib/paper/scalp/regime";
import { DEFAULT_RISK, monteCarloDrawdown, simulate, type RiskOptions, type SimTrade } from "../../lib/paper/scalp/engine";

const MARKETS = (process.env.MARKETS ?? "BTC_USD,ETH_USD,SOL_USD,XRP_USD,DOGE_USD").split(",");
const TFS = (process.env.TFS ?? "1,5,15,60").split(",").map(Number);
const MODES = (process.env.MODES ?? "long,both").split(",");
const SWITCH = process.env.SWITCH === "1";
const REGIMES = (process.env.REGIMES ?? (SWITCH ? "0" : "0,12,48")).split(",").map(Number);
// RG="hours,erTrend,erRange" forces one fixed detector setting (always on) instead of searching.
const RG = process.env.RG?.split(",").map(Number);
const RGRID = RG ? [{ rgHours: RG[0], rgTrend: RG[1], rgRange: RG[2] }] : SWITCH ? REGIME_GRID : [REGIME_GRID[0]];
const OUT = process.env.OUT ?? (SWITCH ? ".paper-data/research-switch.json" : ".paper-data/research.json");
/** Fixed reference classifier used only to label trades for the by-regime breakdown. */
const REF_REGIME = { hours: 24, erTrend: 0.3, erRange: 0.15 };
const STRATS = process.env.STRATS?.split(",");
// BASE=60 reads hourly files (<market>_1h.json, from `download.ts 730 "" 1h`) for long-history tests.
const BASE = Number(process.env.BASE ?? 1);
const FILE_TF = BASE === 1 ? "1m" : BASE % 60 === 0 ? `${BASE / 60}h` : `${BASE}m`;
const DAY = 86_400_000;
const TRAIN_DAYS = Number(process.env.TRAIN_DAYS ?? 10);
const TEST_DAYS = Number(process.env.TEST_DAYS ?? 5);
const MIN_TRAIN_TRADES = Number(process.env.MIN_TRAIN_TRADES ?? 15);

const raw: Record<string, Candle[]> = Object.fromEntries(MARKETS.map((m) => [m, JSON.parse(readFileSync(`.paper-data/${m}_${FILE_TF}.json`, "utf8"))]));
const start = Math.max(...MARKETS.map((m) => raw[m][0].t));
const end = Math.min(...MARKETS.map((m) => raw[m][raw[m].length - 1].t)) + BASE * 60_000;

function range(c: Candle[], from: number, to: number): [number, number] {
  let a = 0;
  while (a < c.length && c[a].t < from) a++;
  let b = a;
  while (b < c.length && c[b].t < to) b++;
  return [a, b];
}

interface Window { from: number; to: number; params: Params; perMarket: Record<string, { ret: number; trades: number; dd: number }>; trainScore: number }
interface Row {
  tf: number;
  strategy: string;
  mode: string;
  windows: Window[];
  /** Average out-of-sample return per coin, summed over the test windows (%). */
  oosAvgReturn: number;
  perMarketReturn: Record<string, number>;
  trades: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  positiveWindows: number;
  latestParams: Params | null;
  stress: Record<string, number>;
  /** Out-of-sample P&L (% of one coin's capital, averaged over coins) and trade count by regime at entry. */
  byRegime: Record<string, { pnlPct: number; trades: number; wins: number }>;
}

const rows: Row[] = [];
const t0 = Date.now();

for (const tf of TFS) {
  const series = Object.fromEntries(MARKETS.map((m) => [m, resample(raw[m], tf, BASE)]));
  for (const strat of STRATEGIES.filter((x) => !STRATS || STRATS.includes(x.id))) {
    for (const mode of MODES) {
      // Signals are causal, so compute them once on the full series and slice by time.
      const params: Params[] = strat.grid.flatMap((p) => REGIMES.flatMap((h) => RGRID.map((rg) => ({ ...p, regimeHours: h, ...rg }))));
      const sigs: Record<string, (EntrySignal | null)[][]> = {};
      for (const m of MARKETS) {
        const c = series[m];
        sigs[m] = [];
        for (const p of strat.grid) {
          const base = strat.signals(c, p);
          const baseShort = mode === "both" ? shortSignals(strat, c, p) : null;
          for (const h of REGIMES) {
            const long = applyRegime(c, base, tf, h);
            const merged = baseShort ? mergeSides(long, applyRegimeShort(c, baseShort, tf, h)) : long;
            for (const rg of RGRID) {
              sigs[m].push(rg.rgHours ? applyRegimeSwitch(c, merged, tf, METHOD_KIND[strat.id], { hours: rg.rgHours, erTrend: rg.rgTrend, erRange: rg.rgRange }) : merged);
            }
          }
        }
      }
      const refRegime: Record<string, Map<number, Regime>> = {};
      for (const m of MARKETS) {
        const reg = classify(series[m], tf, REF_REGIME);
        refRegime[m] = new Map(series[m].map((x, i) => [x.t, reg[i]]));
      }
      const run = (m: string, k: number, from: number, to: number, opt: Partial<RiskOptions> = {}) => {
        const [a, b] = range(series[m], from, to);
        return simulate(series[m].slice(a, b), sigs[m][k].slice(a, b), opt);
      };
      const pick = (from: number, to: number) => {
        let best = -1, bestScore = -Infinity;
        for (let k = 0; k < params.length; k++) {
          let sc = 0, n = 0;
          for (const m of MARKETS) {
            const r = run(m, k, from, to);
            sc += r.returnPct - 0.5 * r.maxDrawdownPct;
            n += r.trades.length;
          }
          if (n >= MIN_TRAIN_TRADES && sc > bestScore) [best, bestScore] = [k, sc];
        }
        return { k: best, score: bestScore };
      };

      const windows: (Window & { k: number })[] = [];
      for (let ws = start; ws + (TRAIN_DAYS + TEST_DAYS) * DAY <= end + DAY / 2; ws += TEST_DAYS * DAY) {
        const trainTo = ws + TRAIN_DAYS * DAY;
        const testTo = Math.min(end, trainTo + TEST_DAYS * DAY);
        const { k, score } = pick(ws, trainTo);
        const perMarket: Window["perMarket"] = {};
        for (const m of MARKETS) {
          const r = k < 0 ? null : run(m, k, trainTo, testTo);
          perMarket[m] = { ret: r?.returnPct ?? 0, trades: r?.trades.length ?? 0, dd: r?.maxDrawdownPct ?? 0 };
        }
        windows.push({ from: trainTo, to: testTo, params: k < 0 ? {} : params[k], perMarket, trainScore: score, k });
      }

      const byRegime: Row["byRegime"] = {};
      const oos = (opt: Partial<RiskOptions> = {}, tag = false) => {
        const trades: SimTrade[] = [];
        let total = 0;
        const perMarket: Record<string, number> = Object.fromEntries(MARKETS.map((m) => [m, 0]));
        let positive = 0;
        for (const w of windows) {
          if (w.k < 0) continue;
          let wsum = 0;
          for (const m of MARKETS) {
            const r = run(m, w.k, w.from, w.to, opt);
            trades.push(...r.trades);
            if (tag) {
              for (const tr of r.trades) {
                // Label by the regime on the signal candle (the one before the entry fill).
                const sigT = series[m][series[m].findIndex((x) => x.t >= tr.entryT) - 1]?.t ?? tr.entryT;
                const g = refRegime[m].get(sigT) ?? "unknown";
                const b = (byRegime[g] ??= { pnlPct: 0, trades: 0, wins: 0 });
                b.pnlPct += (tr.pnl / DEFAULT_RISK.startCash) * 100 / MARKETS.length;
                b.trades++;
                if (tr.pnl > 0) b.wins++;
              }
            }
            perMarket[m] += r.returnPct;
            wsum += r.returnPct;
          }
          total += wsum;
          if (wsum > 0) positive++;
        }
        return { avg: total / MARKETS.length, trades, perMarket, positive };
      };

      const base = oos({}, true);
      const t = base.trades;
      const gw = t.filter((x) => x.pnl > 0).reduce((s, x) => s + x.pnl, 0);
      const gl = -t.filter((x) => x.pnl <= 0).reduce((s, x) => s + x.pnl, 0);
      const sorted = [...t].sort((a, b) => b.pnl - a.pnl);
      const dropTop = sorted.slice(Math.ceil(t.length * 0.1)).reduce((s, x) => s + x.pnl, 0) / DEFAULT_RISK.startCash * 100 / MARKETS.length;
      const mc = monteCarloDrawdown(t, DEFAULT_RISK.startCash);
      const latest = pick(end - TRAIN_DAYS * DAY, end);
      const row: Row = {
        tf,
        strategy: strat.id,
        mode,
        windows: windows.map(({ k, ...w }) => w),
        oosAvgReturn: base.avg,
        perMarketReturn: base.perMarket,
        trades: t.length,
        winRate: t.length ? t.filter((x) => x.pnl > 0).length / t.length : 0,
        profitFactor: gl > 0 ? gw / gl : gw > 0 ? 99 : 0,
        avgR: t.length ? t.reduce((s, x) => s + x.r, 0) / t.length : 0,
        positiveWindows: base.positive,
        latestParams: latest.k < 0 ? null : params[latest.k],
        stress: {
          fee025: oos({ feeRate: 0.0025 }).avg,
          fee005: oos({ feeRate: 0.0005 }).avg,
          slip3x: oos({ slippage: 0.0006 }).avg,
          noCostFilters: oos({ minEdge: 0, minStopCost: 0 }).avg,
          dropTop10pct: dropTop,
          mcDdP95: mc.p95,
        },
        byRegime,
      };
      rows.push(row);
      console.log(
        `${String(tf).padStart(2)}m ${(strat.id + "/" + mode).padEnd(14)} OOS avg/coin ${row.oosAvgReturn.toFixed(2).padStart(6)}%  trades ${String(t.length).padStart(4)}  win ${(row.winRate * 100).toFixed(0).padStart(3)}%  PF ${row.profitFactor.toFixed(2)}  avgR ${row.avgR.toFixed(2).padStart(5)}  +win ${row.positiveWindows}/${windows.length} | fee.25 ${row.stress.fee025.toFixed(2)} fee.05 ${row.stress.fee005.toFixed(2)} slip3x ${row.stress.slip3x.toFixed(2)} noFilt ${row.stress.noCostFilters.toFixed(2)} dropTop ${dropTop.toFixed(2)}`,
      );
      console.log(
        "      by regime: " + Object.entries(byRegime).map(([g, b]) => `${g} ${b.pnlPct.toFixed(2)}% (${b.trades}, ${b.trades ? ((b.wins / b.trades) * 100).toFixed(0) : 0}% win)`).join("  ") +
          (SWITCH ? `  | latest switch: ${row.latestParams?.rgHours ? `${row.latestParams.rgHours}h ER ${row.latestParams.rgTrend}/${row.latestParams.rgRange}` : "off"}` : ""),
      );
    }
  }
}

const hold: Record<string, number> = {};
for (const m of MARKETS) {
  const c = raw[m];
  const first = c.find((x) => x.t >= start + TRAIN_DAYS * DAY)!;
  hold[m] = (c[c.length - 1].c / first.o - 1) * 100;
}
console.log("Buy & hold over the out-of-sample span:", Object.entries(hold).map(([k, v]) => `${k} ${v.toFixed(2)}%`).join("  "));
// Time spent in each regime (reference classifier, 60m), per coin, over the out-of-sample span.
const regimeShare: Record<string, Record<string, number>> = {};
for (const m of MARKETS) {
  const c = resample(raw[m], Math.max(60, BASE), BASE);
  const reg = classify(c, 60, REF_REGIME);
  const counts: Record<string, number> = {};
  let n = 0;
  c.forEach((x, i) => {
    if (x.t < start + TRAIN_DAYS * DAY) return;
    counts[reg[i]] = (counts[reg[i]] ?? 0) + 1;
    n++;
  });
  regimeShare[m] = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]));
  console.log(`${m} time in regime:`, Object.entries(regimeShare[m]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join("  "));
}
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), switch: SWITCH, regimeShare, from: start, to: end, trainDays: TRAIN_DAYS, testDays: TEST_DAYS, markets: MARKETS, hold, rows }, null, 1));
console.log("wrote", OUT);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
