// Forward paper trading on live Crypto.com prices. Fake money only: no keys, no orders.
//
//   tsx scripts/paper/live.ts freeze   Lock today's settings (from research.json) and start the clock (1m test only).
//   tsx scripts/paper/live.ts loop     Keep running: pull new candles every minute, log the live bid/ask spread,
//                                       write <statusDir>/status.json.
//   tsx scripts/paper/live.ts          One pass + a printed report of everything since the start.
//   Add `--config <path>` to run another experiment (e.g. lib/paper/scalp/live-4h-config.json). Default: the 1m test.
//
// Each pass replays every closed candle since the start time through the same simulator
// with the frozen settings, so a restart or a gap in the loop never changes the result:
// the bot only ever sees candles that had closed at the time it "decides".
// Logic lives in lib/paper/scalp/live-core.ts. Needs NODE_USE_ENV_PROXY=1 in the cloud sandbox.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Candle } from "../../lib/paper/strategy";
import type { Params } from "../../lib/paper/scalp/strategies";
import { fetchCandlesSince, fetchSpread } from "../../lib/paper/scalp/feed";
import { baseMinutes, evaluateConfig, eventLog, feeScenarioReport, statusDir, summarize, warmupDays, type LiveConfig, type Sleeve } from "../../lib/paper/scalp/live-core";

const DEFAULT_CONFIG = "lib/paper/scalp/live-config.json";
const DAY = 86_400_000;
const args = process.argv.slice(2);
const ci = args.indexOf("--config");
const CONFIG = ci >= 0 ? args[ci + 1] : DEFAULT_CONFIG;
const cmd = args.filter((_, i) => ci < 0 || (i !== ci && i !== ci + 1))[0] ?? "once";

// Chosen from the walk-forward research: the best out-of-sample setup of each method,
// re-tuned on the latest 10 days. Includes a true 1-minute scalper so scalping gets a live test.
const PICKS: { tf: number; strategy: string; mode: "long" | "both" }[] = [
  { tf: 1, strategy: "vwap", mode: "both" },
  { tf: 5, strategy: "vwap", mode: "both" },
  { tf: 15, strategy: "pullback", mode: "both" },
  { tf: 60, strategy: "meanrev", mode: "both" },
  { tf: 60, strategy: "breakout", mode: "both" },
];

function freeze() {
  if (CONFIG !== DEFAULT_CONFIG) throw new Error("freeze only writes the original 1m test; experiments have their own freeze script");
  const research = JSON.parse(readFileSync(".paper-data/research.json", "utf8"));
  const markets: string[] = research.markets;
  const startedAt = Math.ceil(Date.now() / 60_000) * 60_000;
  const totalCash = 10_000;
  const n = PICKS.length * markets.length;
  const sleeves: Sleeve[] = [];
  for (const pk of PICKS) {
    const row = research.rows.find((r: any) => r.tf === pk.tf && r.strategy === pk.strategy && r.mode === pk.mode);
    if (!row?.latestParams) throw new Error(`No tuned params for ${pk.tf}m ${pk.strategy}/${pk.mode}`);
    for (const market of markets) sleeves.push({ market, ...pk, params: row.latestParams as Params, cash: totalCash / n });
  }
  const cfg: LiveConfig = {
    startedAt,
    startedAtIso: new Date(startedAt).toISOString(),
    totalCash,
    why: "Best out-of-sample setup per method from scripts/paper/research.ts (walk-forward, 5 coins, 30 days of 1m candles), settings re-tuned on the latest 10 days and frozen for the forward test.",
    sleeves,
  };
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 1) + "\n");
  console.log(`Frozen ${sleeves.length} sleeves of $${(totalCash / n).toFixed(0)} each. Clock starts ${cfg.startedAtIso}.`);
}

const candles: Record<string, Candle[]> = {};

async function refresh(cfg: LiveConfig) {
  const DIR = statusDir(cfg);
  mkdirSync(DIR, { recursive: true });
  const baseMs = baseMinutes(cfg) * 60_000;
  const markets = [...new Set(cfg.sleeves.map((s) => s.market))];
  for (const m of markets) {
    const file = `${DIR}/${m}.json`;
    if (!candles[m]) candles[m] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    const have = candles[m];
    const since = have.length ? have[have.length - 1].t : cfg.startedAt - warmupDays(cfg) * DAY;
    const fresh = await fetchCandlesSince(m, since, cfg.baseTf ?? "1m");
    // Drop the candle that is still forming: only closed candles are allowed into decisions.
    const closed = fresh.filter((c) => c.t + baseMs <= Date.now());
    if (closed.length) {
      have.push(...closed);
      writeFileSync(file, JSON.stringify(have));
    }
  }
}

async function logSpreads(cfg: LiveConfig) {
  const markets = [...new Set(cfg.sleeves.map((s) => s.market))];
  mkdirSync(statusDir(cfg), { recursive: true });
  for (const m of markets) {
    const s = await fetchSpread(m);
    if (s) appendFileSync(`${statusDir(cfg)}/spreads.jsonl`, JSON.stringify({ t: Date.now(), m, ...s }) + "\n");
  }
}

function spreadStats(cfg: LiveConfig) {
  const f = `${statusDir(cfg)}/spreads.jsonl`;
  if (!existsSync(f)) return {};
  const rows = readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const by: Record<string, number[]> = {};
  for (const r of rows) (by[r.m] ??= []).push(r.spreadPct);
  return Object.fromEntries(Object.entries(by).map(([m, v]) => { v.sort((a, b) => a - b); return [m, { samples: v.length, medianPct: v[Math.floor(v.length / 2)], p90Pct: v[Math.floor(v.length * 0.9)] }]; }));
}

async function pass(cfg: LiveConfig) {
  await refresh(cfg);
  const res = evaluateConfig(cfg, candles, {}, !!cfg.logEvents);
  const status: Record<string, any> = { ...summarize(cfg, candles, res), spreads: spreadStats(cfg) };
  if (cfg.feeScenarios?.length) status.feeScenarios = feeScenarioReport(cfg, candles);
  writeFileSync(`${statusDir(cfg)}/status.json`, JSON.stringify(status, null, 1));
  if (cfg.logEvents) writeFileSync(`${statusDir(cfg)}/events.json`, JSON.stringify(eventLog(res), null, 1));
  if (cfg.reportPath) {
    mkdirSync(dirname(cfg.reportPath), { recursive: true });
    writeFileSync(cfg.reportPath, JSON.stringify({ ...status, events: cfg.logEvents ? eventLog(res) : undefined }, null, 1) + "\n");
  }
  return status;
}

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
    if (cfg.experimentId) await logSpreads(cfg);
    const s = await pass(cfg);
    const { tradeLog, ...rest } = s;
    console.log(JSON.stringify(rest, null, 1));
    console.log(`${tradeLog.length} trades; last 10:`, tradeLog.slice(-10));
  }
}
