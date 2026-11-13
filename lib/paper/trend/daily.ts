// Market-filtered trend (the rule that passed E1). Pure and deterministic. Fake money only.
//
// Each UTC day, for each coin, decided at the previous daily close:
//   in  = close > close `lookback` days earlier  AND  the BTC gate was open at the last 4h bar of that day
//   size = min(1, volTarget / 20-day realised annualised volatility) of that coin's equal slice; else cash.
// The day's return is size x the coin's close-to-close return, minus (fee + slippage) x |change in size|.
import type { Candle } from "../strategy";

export interface TrendParams { lookback: number; volTarget: number; volLen: number; feePerSide: number; slippage: number }
export const E1_PARAMS: TrendParams = { lookback: 30, volTarget: 0.4, volLen: 20, feePerSide: 0.001, slippage: 0.0002 };

const DAY = 86_400_000, H4 = 4 * 3_600_000;
const sd = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

/** Target weight (0..1) for a coin on the day after bar j closes. Uses bars up to and including j only. */
export function targetWeight(c: Candle[], j: number, btcUp: Map<number, boolean>, p: TrendParams): number {
  if (j < Math.max(p.lookback, p.volLen + 1)) return 0;
  const vol = sd(Array.from({ length: p.volLen }, (_, k) => c[j - k].c / c[j - k - 1].c - 1)) * Math.sqrt(365);
  const on = c[j].c > c[j - p.lookback].c && !!btcUp.get(c[j].t + DAY - H4);
  return on && vol > 0 ? Math.min(1, p.volTarget / vol) : 0;
}

export interface TrendOrder { day: string; market: string; from: number; to: number; price: number; cost: number }
export interface TrendRun {
  equity: { t: number; v: number }[];
  orders: TrendOrder[];
  weights: Record<string, number>;
  perCoinPnl: Record<string, number>;
  fees: number;
}

/** Equal-weight portfolio from `from` (inclusive, UTC day start) over the daily candles given. */
export function runTrend(daily: Record<string, Candle[]>, btcUp: Map<number, boolean>, from: number, startCash: number, p: TrendParams): TrendRun {
  const markets = Object.keys(daily);
  const slice = startCash / markets.length;
  const byDay = new Map<number, number>();
  const orders: TrendOrder[] = [];
  const weights: Record<string, number> = {};
  const perCoinPnl: Record<string, number> = {};
  let fees = 0;
  for (const m of markets) {
    const c = daily[m];
    let w0 = 0, value = slice;
    perCoinPnl[m] = 0;
    for (let i = 1; i < c.length; i++) {
      if (c[i].t < from) continue;
      const w = targetWeight(c, i - 1, btcUp, p);
      const cost = Math.abs(w - w0) * (p.feePerSide + p.slippage) * value;
      if (w !== w0) orders.push({ day: new Date(c[i].t).toISOString().slice(0, 10), market: m, from: +w0.toFixed(4), to: +w.toFixed(4), price: c[i - 1].c, cost: +cost.toFixed(4) });
      const pnl = w * value * (c[i].c / c[i - 1].c - 1) - cost;
      fees += cost; value += pnl; perCoinPnl[m] += pnl; w0 = w;
      byDay.set(c[i].t, (byDay.get(c[i].t) ?? 0) + pnl);
    }
    // weight to hold for the next (still forming) day, decided at the last close
    weights[m] = +targetWeight(c, c.length - 1, btcUp, p).toFixed(4);
  }
  let v = startCash;
  const equity = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([t, pnl]) => ({ t, v: (v += pnl) }));
  return { equity, orders, weights, perCoinPnl, fees };
}
