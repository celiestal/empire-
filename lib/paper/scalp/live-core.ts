// Pure core of the forward paper tests (scripts/paper/live.ts). Fake money only: no keys, no orders.
//
// A config is a frozen list of sleeves (one coin, one method, its own cash). Every pass replays all closed
// candles since the start through the same simulator, so results are deterministic and survive restarts.
// The original 1-minute test (lib/paper/scalp/live-config.json) uses none of the optional fields below and
// behaves exactly as before. The 4h experiment (live-4h-config.json) uses hourly candles, a longer warm-up,
// its own folder, named configurations, fee scenarios, a random-entry baseline and a full event log.
import type { Candle } from "../strategy";
import { atr, resample } from "./indicators";
import { applyRegime, applyRegimeShort, applyTrail, mergeSides, shortSignals, strategyById, type EntrySignal, type Params } from "./strategies";
import { applyBtcGate, btcUpByTime } from "./regime";
import { simulate, type RiskOptions, type SimEvent, type SimResult } from "./engine";

export interface Sleeve {
  market: string;
  /** Bar size in minutes. */
  tf: number;
  /** Strategy id, or "random" for the random-entry baseline. */
  strategy: string;
  mode: "long" | "both";
  params: Params;
  cash: number;
  /** Name of the configuration this sleeve belongs to (e.g. "breakout-long"). Results are grouped by it. */
  config?: string;
  /** "baseline" sleeves are reported separately and never counted in the experiment's totals. */
  role?: "baseline";
  /** Optional trailing exit (ATR multiple) and BTC gate. */
  trail?: number;
  gate?: boolean;
}

export interface FeeScenario { label: string; feeRate: number; slippage: number }

export interface LiveConfig {
  startedAt: number;
  startedAtIso: string;
  totalCash: number;
  why: string;
  sleeves: Sleeve[];
  experimentId?: string;
  /** Candle feed: "1m" (default) or "1h". */
  baseTf?: "1m" | "1h";
  warmupDays?: number;
  statusDir?: string;
  /** Optional committed copy of the status report. */
  reportPath?: string;
  /** Extra cost scenarios, reported next to the main one (the main one is the engine default). */
  feeScenarios?: FeeScenario[];
  logEvents?: boolean;
}

export const baseMinutes = (cfg: LiveConfig) => (cfg.baseTf === "1h" ? 60 : 1);
export const warmupDays = (cfg: LiveConfig) => cfg.warmupDays ?? 10;
export const statusDir = (cfg: LiveConfig) => cfg.statusDir ?? ".paper-data/live";

/** Deterministic per-(market, bar) uniform number, so the random baseline never changes as data grows. */
export function barNoise(market: string, t: number): number {
  let x = Math.floor(t / 60_000) | 0;
  for (const ch of market) x = (Math.imul(x, 31) + ch.charCodeAt(0)) | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Random-entry baseline: on each bar enters long with probability p.prob, stop p.stopAtr ATR, target p.rr x stop. */
export function randomSignals(c: Candle[], market: string, p: Params): (EntrySignal | null)[] {
  const a = atr(c, 14);
  return c.map((x, i) => (a[i] > 0 && barNoise(market, x.t) < p.prob ? { stopDist: p.stopAtr * a[i], targetDist: p.rr * p.stopAtr * a[i], maxBars: p.maxBars ?? 60 } : null));
}

export function sleeveSignals(s: Sleeve, c: Candle[], btc?: Candle[]): (EntrySignal | null)[] {
  if (s.strategy === "random") return randomSignals(c, s.market, s.params);
  const strat = strategyById(s.strategy);
  const long = applyRegime(c, strat.signals(c, s.params), s.tf, s.params.regimeHours ?? 0);
  let sigs = s.mode === "both" ? mergeSides(long, applyRegimeShort(c, shortSignals(strat, c, s.params), s.tf, s.params.regimeHours ?? 0)) : long;
  if (s.trail) sigs = applyTrail(c, sigs, s.trail, 120);
  if (s.gate) {
    if (!btc) throw new Error("BTC candles are needed for the BTC gate");
    sigs = applyBtcGate(c, sigs, btcUpByTime(btc));
  }
  return sigs;
}

export interface SleeveResult { sleeve: Sleeve; r: SimResult; events?: SimEvent[] }

/** Replay every sleeve over the candles we have. `opt` overrides costs (for fee scenarios). */
export function evaluateConfig(cfg: LiveConfig, candles: Record<string, Candle[]>, opt: Partial<RiskOptions> = {}, withEvents = false): SleeveResult[] {
  const base = baseMinutes(cfg);
  const out: SleeveResult[] = [];
  const btc = candles.BTC_USD;
  for (const s of cfg.sleeves) {
    const c = resample(candles[s.market] ?? [], s.tf, base);
    if (c.length < 50) continue;
    const sigs = sleeveSignals(s, c, s.gate && btc ? resample(btc, s.tf, base) : undefined);
    const events: SimEvent[] | undefined = withEvents ? [] : undefined;
    const r = simulate(c, sigs, { startCash: s.cash, tradeFrom: cfg.startedAt, ...opt, ...(events ? { onEvent: (e: SimEvent) => events.push(e) } : {}) });
    out.push(events ? { sleeve: s, r, events } : { sleeve: s, r });
  }
  return out;
}

const groupKey = (s: Sleeve) => s.config ?? `${s.tf}m ${s.strategy}`;

export function summarize(cfg: LiveConfig, candles: Record<string, Candle[]>, all: SleeveResult[], now = Date.now()) {
  const res = all.filter((x) => x.sleeve.role !== "baseline");
  const baseMs = baseMinutes(cfg) * 60_000;
  const total = res.reduce((a, x) => a + x.r.endEquity, 0);
  const trades = res.flatMap((x) => x.r.trades.map((t) => ({ ...t, market: x.sleeve.market, tf: x.sleeve.tf, strategy: x.sleeve.strategy, key: groupKey(x.sleeve) })));
  const byMethod: Record<string, { pnl: number; trades: number; wins: number }> = {};
  for (const x of res) {
    const k = groupKey(x.sleeve);
    byMethod[k] ??= { pnl: 0, trades: 0, wins: 0 };
    byMethod[k].pnl += x.r.endEquity - x.sleeve.cash;
    byMethod[k].trades += x.r.trades.length;
    byMethod[k].wins += x.r.wins;
  }
  const hold: Record<string, number> = {};
  for (const m of Object.keys(candles)) {
    const c = candles[m];
    const first = c.find((k) => k.t >= cfg.startedAt);
    if (first) hold[m] = (c[c.length - 1].c / first.o - 1) * 100;
  }
  const lastT = Math.min(...Object.values(candles).map((c) => c[c.length - 1]?.t ?? 0));
  const status: Record<string, unknown> = {
    updatedAt: new Date(now).toISOString(),
    startedAt: cfg.startedAtIso,
    dataThrough: new Date(lastT + baseMs).toISOString(),
    hoursLive: Math.max(0, (lastT + baseMs - cfg.startedAt) / 3_600_000),
    startCash: cfg.totalCash,
    equity: total,
    pnl: total - cfg.totalCash,
    returnPct: (total / cfg.totalCash - 1) * 100,
    trades: trades.length,
    wins: trades.filter((t) => t.pnl > 0).length,
    fees: res.reduce((a, x) => a + x.r.fees, 0),
    maxSleeveDrawdownPct: Math.max(0, ...res.map((x) => x.r.maxDrawdownPct)),
    sleevesStoppedForDay: res.filter((x) => x.r.daysStopped > 0).length,
    sleevesKilled: res.filter((x) => x.r.killed).length,
    byMethod,
    buyHoldPct: hold,
    openPositions: res.filter((x) => x.r.open).map((x) => ({ market: x.sleeve.market, method: cfg.experimentId ? groupKey(x.sleeve) : `${x.sleeve.tf}m ${x.sleeve.strategy}`, ...x.r.open })),
    tradeLog: trades.sort((a, b) => a.exitT - b.exitT).map((t) => ({
      market: t.market, method: cfg.experimentId ? t.key : `${t.tf}m ${t.strategy}`, side: t.side === 1 ? "long" : "short",
      entryAt: new Date(t.entryT).toISOString(), exitAt: new Date(t.exitT).toISOString(),
      entry: t.entry, exit: t.exit, reason: t.reason, pnl: Number(t.pnl.toFixed(2)), r: Number(t.r.toFixed(2)),
    })),
  };
  if (cfg.experimentId) {
    // Extra sections for experiments; the original 1m test's report keeps its exact old shape.
    status.experimentId = cfg.experimentId;
    const perConfig: Record<string, { cash: number; equity: number; returnPct: number; trades: number; wins: number; fees: number; open: number; maxDrawdownPct: number }> = {};
    for (const x of res) {
      const k = groupKey(x.sleeve);
      const p = (perConfig[k] ??= { cash: 0, equity: 0, returnPct: 0, trades: 0, wins: 0, fees: 0, open: 0, maxDrawdownPct: 0 });
      p.cash += x.sleeve.cash; p.equity += x.r.endEquity; p.trades += x.r.trades.length; p.wins += x.r.wins; p.fees += x.r.fees; p.open += x.r.open ? 1 : 0;
      p.maxDrawdownPct = Math.max(p.maxDrawdownPct, x.r.maxDrawdownPct);
    }
    for (const p of Object.values(perConfig)) p.returnPct = (p.equity / p.cash - 1) * 100;
    status.perConfig = perConfig;
    const baselines = all.filter((x) => x.sleeve.role === "baseline");
    if (baselines.length) {
      const cash = baselines.reduce((a, x) => a + x.sleeve.cash, 0), eq = baselines.reduce((a, x) => a + x.r.endEquity, 0);
      status.baselines = {
        randomEntry: { returnPct: (eq / cash - 1) * 100, trades: baselines.reduce((a, x) => a + x.r.trades.length, 0) },
        buyHoldAvgPct: Object.values(hold).length ? Object.values(hold).reduce((a, b) => a + b, 0) / Object.values(hold).length : 0,
      };
    }
  }
  return status;
}

/** Group every sleeve's events, tagged with market and configuration. */
export function eventLog(all: SleeveResult[]) {
  return all.flatMap((x) => (x.events ?? []).map((e) => ({ market: x.sleeve.market, config: groupKey(x.sleeve), role: x.sleeve.role ?? "strategy", ...e, at: new Date(e.t).toISOString() })));
}

/** Per-configuration returns under alternative costs. */
export function feeScenarioReport(cfg: LiveConfig, candles: Record<string, Candle[]>) {
  const out: Record<string, Record<string, number>> = {};
  for (const f of cfg.feeScenarios ?? []) {
    const res = evaluateConfig(cfg, candles, { feeRate: f.feeRate, slippage: f.slippage }).filter((x) => x.sleeve.role !== "baseline");
    const by: Record<string, { cash: number; eq: number }> = {};
    for (const x of res) { const k = groupKey(x.sleeve); const b = (by[k] ??= { cash: 0, eq: 0 }); b.cash += x.sleeve.cash; b.eq += x.r.endEquity; }
    out[f.label] = Object.fromEntries(Object.entries(by).map(([k, b]) => [k, Number(((b.eq / b.cash - 1) * 100).toFixed(3))]));
  }
  return out;
}
