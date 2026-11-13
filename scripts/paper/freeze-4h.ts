// Freeze the separate 4h paper experiment (fake money only). Writes lib/paper/scalp/live-4h-config.json once;
// refuses to overwrite it unless --force is given. Does not touch the original 1m test.
//
//   NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/freeze-4h.ts
//   then: NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/live.ts --config lib/paper/scalp/live-4h-config.json
//
// Settings: each configuration is tuned once on the latest 90 days of 4h bars with the same rule research.ts uses
// for its "latest" pick (all 5 coins together, score = return - 0.5 x drawdown, >= 15 trades), then frozen.
// These configurations did NOT pass the robustness gates (docs/research/2026-11-13-strategy-audit.md); this
// experiment collects forward evidence, it does not certify anything.
import { existsSync, writeFileSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { resample } from "../../lib/paper/scalp/indicators";
import { fetchCandlesSince } from "../../lib/paper/scalp/feed";
import { strategyById, type Params } from "../../lib/paper/scalp/strategies";
import { pickBest } from "../../lib/paper/scalp/evaluate";
import { sleeveSignals, type LiveConfig, type Sleeve } from "../../lib/paper/scalp/live-core";

const OUT = "lib/paper/scalp/live-4h-config.json";
const MARKETS = ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"];
const DAY = 86_400_000, H = 3_600_000, TF = 240;
const CONFIGS: { config: string; strategy: string; mode: "long" | "both" }[] = [
  { config: "breakout-long", strategy: "breakout", mode: "long" },
  { config: "breakout-long-short", strategy: "breakout", mode: "both" },
  { config: "tsmom-long-short", strategy: "tsmom", mode: "both" },
];

if (existsSync(OUT) && !process.argv.includes("--force")) throw new Error(`${OUT} exists; the experiment is already frozen (use --force only to deliberately restart it)`);

const now = Date.now();
const startedAt = Math.ceil(now / (4 * H)) * 4 * H; // next 4h boundary: the first bar that opens after freezing
const raw: Record<string, Candle[]> = {};
for (const m of MARKETS) raw[m] = (await fetchCandlesSince(m, now - 160 * DAY, "1h")).filter((c) => c.t + H <= now);
const series = Object.fromEntries(MARKETS.map((m) => [m, resample(raw[m], TF, 60)]));
const end = Math.min(...MARKETS.map((m) => series[m][series[m].length - 1].t)) + TF * 60_000;
const tuneFrom = end - 90 * DAY;

const totalCash = 10_000;
const each = totalCash / (CONFIGS.length * MARKETS.length);
const sleeves: Sleeve[] = [];
const tuning: Record<string, unknown> = {};
for (const k of CONFIGS) {
  const grid: Params[] = strategyById(k.strategy).grid.flatMap((p) => [0, 12, 48].map((h) => ({ ...p, regimeHours: h })));
  const sigs = Object.fromEntries(MARKETS.map((m) => [m, grid.map((p) => sleeveSignals({ market: m, tf: TF, strategy: k.strategy, mode: k.mode, params: p, cash: each }, series[m]))]));
  const best = pickBest(series, sigs, tuneFrom, end, 15);
  if (best.k < 0) throw new Error(`no setting for ${k.config} had 15 trades in the tuning window`);
  tuning[k.config] = { params: grid[best.k], trainScore: Number(best.score.toFixed(3)) };
  for (const market of MARKETS) sleeves.push({ market, tf: TF, strategy: k.strategy, mode: k.mode, params: grid[best.k], cash: each, config: k.config });
}
// Shadow baseline, reported separately and not part of the $10,000: random long entries with breakout-like exits.
for (const market of MARKETS) sleeves.push({ market, tf: TF, strategy: "random", mode: "long", params: { prob: 0.012, stopAtr: 1.5, rr: 2, maxBars: 60 }, cash: each, config: "baseline-random", role: "baseline" });

const cfg: LiveConfig & { tuning: unknown } = {
  experimentId: "exp-4h-2026-11",
  startedAt,
  startedAtIso: new Date(startedAt).toISOString(),
  totalCash,
  why:
    "Separate forward paper test of the 4h research leads (breakout long, breakout long+short, trend following long+short), " +
    `each tuned once on 4h bars ${new Date(tuneFrom).toISOString().slice(0, 10)} to ${new Date(end).toISOString().slice(0, 10)} with research.ts's rule and frozen. ` +
    "Unvalidated: none passed the robustness gates in docs/research/2026-11-13-strategy-audit.md. Fake money only.",
  baseTf: "1h",
  warmupDays: 60,
  statusDir: ".paper-data/live-4h",
  reportPath: "docs/research/exp-4h-2026-11/status.json",
  logEvents: true,
  feeScenarios: [
    { label: "fee 0.25% + slip 0.02%", feeRate: 0.0025, slippage: 0.0002 },
    { label: "fee 0.5% + slip 0.05%", feeRate: 0.005, slippage: 0.0005 },
  ],
  tuning,
  sleeves,
};
writeFileSync(OUT, JSON.stringify(cfg, null, 1) + "\n");
console.log(`Frozen ${cfg.experimentId}: ${sleeves.length} sleeves (${CONFIGS.length * MARKETS.length} strategy + ${MARKETS.length} baseline). Clock starts ${cfg.startedAtIso}.`);
console.log(JSON.stringify(tuning, null, 1));
