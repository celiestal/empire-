// Write kill lines for an experiment (video prompt 12): replay its FROZEN settings through the same live code over a
// past window, take each configuration's worst drawdown and trade rate, and set the kill line at 2x that drawdown.
// Writes <report dir>/kill-lines.json once; refuses to overwrite (lines are fixed before trading, never moved later).
//   npx tsx scripts/paper/kill-lines.ts lib/paper/scalp/live-4h-config.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Candle } from "../../lib/paper/strategy";
import { configDrawdowns, evaluateConfig, type KillLine, type LiveConfig } from "../../lib/paper/scalp/live-core";

const path = process.argv[2];
const cfg: LiveConfig = JSON.parse(readFileSync(path, "utf8"));
if (!cfg.reportPath) throw new Error("config has no reportPath");
const out = `${dirname(cfg.reportPath)}/kill-lines.json`;
if (existsSync(out)) throw new Error(`${out} exists; kill lines are fixed once written`);
const S = JSON.parse(readFileSync("lib/paper/settings.json", "utf8"));
const [from, to] = S.periods.A_dev_seen.map((d: string) => Date.parse(d));
const mult = S.risk.killLineMultipleOfTestedDrawdown;
const markets = [...new Set(cfg.sleeves.map((s) => s.market))];
const warm = from - (cfg.warmupDays ?? 60) * 86_400_000;
const candles: Record<string, Candle[]> = Object.fromEntries(markets.map((m) => [m, (JSON.parse(readFileSync(`.paper-data/hist/${m}_1h.json`, "utf8")) as Candle[]).filter((c) => c.t >= warm && c.t < to)]));
const replay: LiveConfig = { ...cfg, startedAt: from };
const res = evaluateConfig(replay, candles);
const dd = configDrawdowns(replay, res);
const days = (to - from) / 86_400_000;
const lines: KillLine[] = Object.keys(dd).map((config) => {
  const n = res.filter((x) => (x.sleeve.config ?? "") === config && !x.sleeve.role).reduce((a, x) => a + x.r.trades.length, 0);
  return { config, testedMaxDrawdownPct: Number(dd[config].toFixed(3)), killLinePct: Number((mult * dd[config]).toFixed(3)), testedTradesPer30d: Number(((n / days) * 30).toFixed(2)), testedFrom: new Date(from).toISOString().slice(0, 10), testedTo: new Date(to).toISOString().slice(0, 10) };
});
writeFileSync(out, JSON.stringify({ experimentId: cfg.experimentId, writtenAt: new Date().toISOString(), rule: `kill line = ${mult} x worst drawdown of the frozen settings replayed over the test window; reporting only`, lines }, null, 1) + "\n");
console.log(JSON.stringify(lines, null, 1));
