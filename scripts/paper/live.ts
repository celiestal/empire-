// Forward paper trading on live Crypto.com prices. Fake money only: no keys, no orders.
//
//   tsx scripts/paper/live.ts freeze   Lock today's settings (from research.json) and start the clock.
//   tsx scripts/paper/live.ts loop     Keep running: pull new 1-minute candles every minute,
//                                       log the live bid/ask spread, write .paper-data/live-status.json.
//   tsx scripts/paper/live.ts          One pass + a printed report of everything since the start.
//
// Each pass replays every closed candle since the start time through the same simulator
// with the frozen settings, so a restart or a gap in the loop never changes the result:
// the bot only ever sees candles that had closed at the time it "decides".
// Needs NODE_USE_ENV_PROXY=1 in the cloud sandbox.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { applyRegime, applyRegimeShort, mergeSides, shortSignals, strategyById, type Params } from "../../lib/paper/scalp/strategies";
import { applyRegimeSwitch, METHOD_KIND, regimeParamsFrom, skipRegimes, type Regime } from "../../lib/paper/scalp/regime";
import { simulate, type SimResult } from "../../lib/paper/scalp/engine";
import { fetchCandlesSince, fetchSpread } from "../../lib/paper/scalp/feed";

// LIVE=<name> runs a separate forward test with its own config and data (e.g. LIVE=4h).
const NAME = process.env.LIVE ?? "";
const CONFIG = `lib/paper/scalp/live-config${NAME ? "-" + NAME : ""}.json`;
const DIR = `.paper-data/live${NAME ? "-" + NAME : ""}`;
const WARMUP_DAYS = Number(process.env.WARMUP_DAYS ?? 10);
const DAY = 86_400_000;

interface Sleeve { market: string; tf: number; strategy: string; mode: "long" | "both"; params: Params; cash: number; skip?: Regime[] }
/** Same reference classifier as research.ts uses for SKIP. */
const REF_REGIME = { hours: 24, erTrend: 0.3, erRange: 0.15 };
interface LiveConfig { startedAt: number; startedAtIso: string; totalCash: number; why: string; sleeves: Sleeve[] }

// Chosen from the walk-forward research: the best out-of-sample setup of each method,
// re-tuned on the latest 10 days. Includes a true 1-minute scalper so scalping gets a live test.
const PICKS_DEFAULT: { tf: number; strategy: string; mode: "long" | "both" }[] = [
  { tf: 1, strategy: "vwap", mode: "both" },
  { tf: 5, strategy: "vwap", mode: "both" },
  { tf: 15, strategy: "pullback", mode: "both" },
  { tf: 60, strategy: "meanrev", mode: "both" },
  { tf: 60, strategy: "breakout", mode: "both" },
];

// PICKS="240:breakout:long,240:tsmom:both" and RESEARCH=<file> override the defaults for a named test.
const PICKS = process.env.PICKS
  ? process.env.PICKS.split(",").map((x) => { const [tf, strategy, mode] = x.split(":"); return { tf: Number(tf), strategy, mode: mode as "long" | "both" }; })
  : PICKS_DEFAULT;

function freeze() {
  const research = JSON.parse(readFileSync(process.env.RESEARCH ?? ".paper-data/research.json", "utf8"));
  const markets: string[] = research.markets;
  const startedAt = Math.ceil(Date.now() / 60_000) * 60_000;
  const totalCash = 10_000;
  const n = PICKS.length * markets.length;
  const sleeves: Sleeve[] = [];
  for (const pk of PICKS) {
    const row = research.rows.find((r: any) => r.tf === pk.tf && r.strategy === pk.strategy && r.mode === pk.mode);
    // Too few trades in the latest 10 days to tune? Use the settings from the most recent walk-forward window.
    const params = row?.latestParams ?? [...(row?.windows ?? [])].reverse().find((w: any) => Object.keys(w.params).length)?.params;
    if (!params) throw new Error(`No tuned params for ${pk.tf}m ${pk.strategy}/${pk.mode}`);
    row.latestParams = params;
    const skip = (process.env.SKIP ?? "").split(",").filter(Boolean) as Regime[];
    for (const market of markets) sleeves.push({ market, ...pk, params: row.latestParams, cash: totalCash / n, ...(skip.length ? { skip } : {}) });
  }
  const cfg: LiveConfig = {
    startedAt,
    startedAtIso: new Date(startedAt).toISOString(),
    totalCash,
    why: process.env.WHY ?? "Best out-of-sample setup per method from scripts/paper/research.ts (walk-forward, 5 coins, 30 days of 1m candles), settings re-tuned on the latest 10 days and frozen for the forward test.",
    sleeves,
  };
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 1) + "\n");
  console.log(`Frozen ${sleeves.length} sleeves of $${(totalCash / n).toFixed(0)} each. Clock starts ${cfg.startedAtIso}.`);
}

const candles: Record<string, Candle[]> = {};

async function refresh(cfg: LiveConfig) {
  mkdirSync(DIR, { recursive: true });
  const markets = [...new Set(cfg.sleeves.map((s) => s.market))];
  for (const m of markets) {
    const file = `${DIR}/${m}.json`;
    if (!candles[m]) candles[m] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    const have = candles[m];
    const since = have.length ? have[have.length - 1].t : cfg.startedAt - WARMUP_DAYS * DAY;
    const fresh = await fetchCandlesSince(m, since);
    // Drop the candle that is still forming: only closed candles are allowed into decisions.
    const closed = fresh.filter((c) => c.t + 60_000 <= Date.now());
    if (closed.length) {
      have.push(...closed);
      writeFileSync(file, JSON.stringify(have));
    }
  }
}

function evaluate(cfg: LiveConfig) {
  const out: { sleeve: Sleeve; r: SimResult }[] = [];
  for (const s of cfg.sleeves) {
    const c = resample(candles[s.market] ?? [], s.tf);
    if (c.length < 50) continue;
    const strat = strategyById(s.strategy);
    const long = applyRegime(c, strat.signals(c, s.params), s.tf, s.params.regimeHours ?? 0);
    let sigs = s.mode === "both" ? mergeSides(long, applyRegimeShort(c, shortSignals(strat, c, s.params), s.tf, s.params.regimeHours ?? 0)) : long;
    const rg = regimeParamsFrom(s.params);
    if (rg) sigs = applyRegimeSwitch(c, sigs, s.tf, METHOD_KIND[s.strategy], rg);
    if (s.skip?.length) sigs = skipRegimes(c, sigs, s.tf, REF_REGIME, s.skip);
    out.push({ sleeve: s, r: simulate(c, sigs, { startCash: s.cash, tradeFrom: cfg.startedAt }) });
  }
  return out;
}

function summarize(cfg: LiveConfig, res: ReturnType<typeof evaluate>) {
  const total = res.reduce((a, x) => a + x.r.endEquity, 0);
  const trades = res.flatMap((x) => x.r.trades.map((t) => ({ ...t, market: x.sleeve.market, tf: x.sleeve.tf, strategy: x.sleeve.strategy })));
  const byMethod: Record<string, { pnl: number; trades: number; wins: number }> = {};
  for (const x of res) {
    const k = `${x.sleeve.tf}m ${x.sleeve.strategy}`;
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
  return {
    updatedAt: new Date().toISOString(),
    startedAt: cfg.startedAtIso,
    dataThrough: new Date(lastT + 60_000).toISOString(),
    hoursLive: Math.max(0, (lastT + 60_000 - cfg.startedAt) / 3_600_000),
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
    openPositions: res.filter((x) => x.r.open).map((x) => ({ market: x.sleeve.market, method: `${x.sleeve.tf}m ${x.sleeve.strategy}`, ...x.r.open })),
    tradeLog: trades.sort((a, b) => a.exitT - b.exitT).map((t) => ({
      market: t.market, method: `${t.tf}m ${t.strategy}`, side: t.side === 1 ? "long" : "short",
      entryAt: new Date(t.entryT).toISOString(), exitAt: new Date(t.exitT).toISOString(),
      entry: t.entry, exit: t.exit, reason: t.reason, pnl: Number(t.pnl.toFixed(2)), r: Number(t.r.toFixed(2)),
    })),
  };
}

async function logSpreads(cfg: LiveConfig) {
  const markets = [...new Set(cfg.sleeves.map((s) => s.market))];
  for (const m of markets) {
    const s = await fetchSpread(m);
    if (s) appendFileSync(`${DIR}/spreads.jsonl`, JSON.stringify({ t: Date.now(), m, ...s }) + "\n");
  }
}

function spreadStats() {
  const f = `${DIR}/spreads.jsonl`;
  if (!existsSync(f)) return {};
  const rows = readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const by: Record<string, number[]> = {};
  for (const r of rows) (by[r.m] ??= []).push(r.spreadPct);
  return Object.fromEntries(Object.entries(by).map(([m, v]) => { v.sort((a, b) => a - b); return [m, { samples: v.length, medianPct: v[Math.floor(v.length / 2)], p90Pct: v[Math.floor(v.length * 0.9)] }]; }));
}

async function pass(cfg: LiveConfig) {
  await refresh(cfg);
  const status = { ...summarize(cfg, evaluate(cfg)), spreads: spreadStats() };
  writeFileSync(`${DIR}/status.json`, JSON.stringify(status, null, 1));
  return status;
}

const cmd = process.argv[2] ?? "once";
if (cmd === "freeze") freeze();
else {
  const cfg: LiveConfig = JSON.parse(readFileSync(CONFIG, "utf8"));
  if (cmd === "loop") {
    let n = 0;
    for (;;) {
      try {
        if (n % 5 === 0) await logSpreads(cfg);
        const s = await pass(cfg);
        if (n % 15 === 0) console.log(`${s.updatedAt} equity $${s.equity.toFixed(2)} (${s.returnPct.toFixed(3)}%) trades ${s.trades} open ${s.openPositions.length}`);
      } catch (e) {
        console.error(new Date().toISOString(), "pass failed:", (e as Error).message);
      }
      n++;
      await new Promise((r) => setTimeout(r, 60_000 - (Date.now() % 60_000) + 5_000));
    }
  } else {
    const s = await pass(cfg);
    const { tradeLog, ...rest } = s;
    console.log(JSON.stringify(rest, null, 1));
    console.log(`${tradeLog.length} trades; last 10:`, tradeLog.slice(-10));
  }
}
