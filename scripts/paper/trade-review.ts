// Why each paper trade won or lost (daily routine step 3). Reads a frozen experiment's config and stored candles,
// replays it with the same code, and labels every closed trade. Fake money only; changes nothing.
//   npx tsx scripts/paper/trade-review.ts [config=lib/paper/scalp/live-config.json] [sinceISO]
import { readFileSync, existsSync } from "node:fs";
import type { Candle } from "../../lib/paper/strategy";
import { atr, resample } from "../../lib/paper/scalp/indicators";
import { btcUpByTime } from "../../lib/paper/scalp/regime";
import { E1_PARAMS, targetWeight } from "../../lib/paper/trend/daily";
import { baseMinutes, evaluateConfig, statusDir, type LiveConfig } from "../../lib/paper/scalp/live-core";

const cfgPath = process.argv[2] ?? "lib/paper/scalp/live-config.json";
const since = process.argv[3] ? Date.parse(process.argv[3]) : 0;
const cfg: LiveConfig = JSON.parse(readFileSync(cfgPath, "utf8"));
const dir = statusDir(cfg), base = baseMinutes(cfg);
const markets = [...new Set(cfg.sleeves.map((s) => s.market))];
const candles: Record<string, Candle[]> = Object.fromEntries(markets.filter((m) => existsSync(`${dir}/${m}.json`)).map((m) => [m, JSON.parse(readFileSync(`${dir}/${m}.json`, "utf8"))]));
// Market context from the long hourly history, extended by the experiment's own candles when needed.
const hourlyOf = (m: string): Candle[] => {
  const hist = existsSync(`.paper-data/hist/${m}_1h.json`) ? (JSON.parse(readFileSync(`.paper-data/hist/${m}_1h.json`, "utf8")) as Candle[]) : [];
  const own = resample(candles[m] ?? [], 60, base);
  const last = hist.length ? hist[hist.length - 1].t : 0;
  return [...hist, ...own.filter((c) => c.t > last)];
};
const btcH = hourlyOf("BTC_USD");
const btcUp = btcUpByTime(resample(btcH, 240, 60));
const H4 = 4 * 3_600_000, DAY = 86_400_000;
const gateAt = (t: number) => !!btcUp.get(Math.floor(t / H4) * H4 - H4); // last closed 4h bar before t

const rows: Record<string, unknown>[] = [];
for (const x of evaluateConfig(cfg, candles)) {
  if (x.sleeve.role === "baseline") continue;
  const c = resample(candles[x.sleeve.market], x.sleeve.tf, base);
  const at = atr(c, 14);
  const hourly = hourlyOf(x.sleeve.market), daily = resample(hourly, 1440, 60);
  const atrPct = at.map((v, i) => v / c[i].c);
  for (const t of x.r.trades) {
    if (t.exitT < since) continue;
    const ei = c.findIndex((k) => k.t >= t.entryT), xi = c.findIndex((k) => k.t >= t.exitT);
    const stopDist = t.r !== 0 ? Math.abs(t.pnl / t.r) / t.qty : NaN;
    let mfe = 0, mae = 0;
    for (let i = ei; i <= xi; i++) { mfe = Math.max(mfe, t.side === 1 ? c[i].h - t.entry : t.entry - c[i].l); mae = Math.max(mae, t.side === 1 ? t.entry - c[i].l : c[i].h - t.entry); }
    let post = 0; for (let i = xi + 1; i < Math.min(c.length, xi + 1 + Math.max(10, xi - ei)); i++) post = Math.max(post, t.side === 1 ? c[i].h - t.entry : t.entry - c[i].l);
    const di = daily.findIndex((d) => d.t === Math.floor(t.entryT / DAY) * DAY);
    const coinTrendUp = di > 0 && targetWeight(daily, di - 1, new Map([[daily[di - 1].t + DAY - H4, true]]), E1_PARAMS) > 0; // coin's own 30-day trend (gate forced open)
    const gate = gateAt(t.entryT);
    const w = atrPct.slice(Math.max(0, ei - 200), ei).filter((v) => v > 0).sort((a, b) => a - b);
    const q = w.length ? w.filter((v) => v < atrPct[ei - 1]).length / w.length : NaN;
    const gross = t.pnl + t.fees;
    const withRegime = t.side === 1 ? gate : !gate;
    const mfeR = mfe / stopDist, maeR = mae / stopDist, postR = post / stopDist;
    let why: string;
    if (t.pnl > 0) why = withRegime ? "won with the market (right regime)" : "won against the market (lucky timing)";
    else if (gross > 0) why = "costs: profitable before fees, lost after";
    else if (t.reason === "stop" && postR >= 1) why = "stopped by noise: price later moved 1R+ in the trade's favour";
    else if (mfeR >= 1) why = "gave back profit: was 1R+ ahead, then reversed";
    else why = withRegime ? "wrong call in the right regime (entry had no follow-through)" : "wrong regime: traded against the BTC trend";
    rows.push({ market: x.sleeve.market.replace("_USD", ""), method: x.sleeve.config ?? `${x.sleeve.tf}m ${x.sleeve.strategy}`, side: t.side === 1 ? "long" : "short", entryAt: new Date(t.entryT).toISOString().slice(5, 16), holdMin: Math.round((t.exitT - t.entryT) / 60000), exit: t.reason, pnl: +t.pnl.toFixed(2), r: +t.r.toFixed(2), gross: +gross.toFixed(2), fees: +t.fees.toFixed(2), mfeR: +mfeR.toFixed(2), maeR: +maeR.toFixed(2), btcGate: gate ? "open" : "closed", coinTrend: coinTrendUp ? "up" : "not up", volTercile: Number.isNaN(q) ? "na" : q < 1 / 3 ? "low" : q < 2 / 3 ? "mid" : "high", why });
  }
}
rows.sort((a, b) => String(a.entryAt).localeCompare(String(b.entryAt)));
const tally: Record<string, { n: number; pnl: number }> = {};
for (const r of rows) { const k = r.why as string; (tally[k] ??= { n: 0, pnl: 0 }).n++; tally[k].pnl += r.pnl as number; }
const sum = (k: string) => rows.reduce((s, r) => s + (r[k] as number), 0);
console.log(JSON.stringify({ trades: rows.length, net: +sum("pnl").toFixed(2), gross: +sum("gross").toFixed(2), fees: +sum("fees").toFixed(2), byReason: Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, { n: v.n, pnl: +v.pnl.toFixed(2) }])), rows }, null, 1));
