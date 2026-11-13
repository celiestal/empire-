// Paper trading: a simple trend-following bot run on past prices with fake money.
// Pure functions only, so the results can be tested and reproduced.

export interface Candle {
  /** Open time, ms since epoch. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Volume in base units, when known. */
  v?: number;
}

export interface PaperTrade {
  side: "buy" | "sell";
  t: number;
  price: number;
  units: number;
  /** Cash after the trade. */
  cash: number;
  /** Profit on the round trip (sells only). */
  pnl: number | null;
}

export interface BacktestResult {
  startCash: number;
  endValue: number;
  returnPct: number;
  /** What simply buying at the first candle and holding would have returned. */
  buyHoldPct: number;
  maxDrawdownPct: number;
  trades: PaperTrade[];
  wins: number;
  losses: number;
  feesPaid: number;
  /** What the bot wants to do right now, based on the latest candle. */
  signal: "buy" | "sell" | "hold";
  inPosition: boolean;
  equity: { t: number; value: number }[];
}

export interface BacktestOptions {
  startCash: number;
  fast: number;
  slow: number;
  /** Fee per trade as a fraction, e.g. 0.001 = 0.1%. */
  feeRate: number;
}

export const DEFAULT_OPTIONS: BacktestOptions = { startCash: 1000, fast: 9, slow: 21, feeRate: 0.001 };

/** Simple moving average; null until there are enough points. */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/**
 * Moving-average crossover: buy when the fast average crosses above the slow one,
 * sell when it crosses below. Always all-in or all-out, long only, fees on every trade.
 */
export function backtest(candles: Candle[], opts: Partial<BacktestOptions> = {}): BacktestResult {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  if (o.fast >= o.slow) throw new Error("The fast average must be shorter than the slow one");
  if (!(o.startCash > 0)) throw new Error("Starting cash must be above zero");

  const closes = candles.map((c) => c.c);
  const fast = sma(closes, o.fast);
  const slow = sma(closes, o.slow);

  let cash = o.startCash;
  let units = 0;
  let entryCost = 0;
  let fees = 0;
  let peak = o.startCash;
  let maxDd = 0;
  const trades: PaperTrade[] = [];
  const equity: { t: number; value: number }[] = [];
  let signal: BacktestResult["signal"] = "hold";

  for (let i = 0; i < candles.length; i++) {
    const price = closes[i];
    const f = fast[i], s = slow[i], pf = fast[i - 1], ps = slow[i - 1];
    let crossed: "up" | "down" | null = null;
    if (f != null && s != null && pf != null && ps != null) {
      if (pf <= ps && f > s) crossed = "up";
      else if (pf >= ps && f < s) crossed = "down";
    }

    if (crossed === "up" && units === 0) {
      const fee = cash * o.feeRate;
      units = (cash - fee) / price;
      entryCost = cash;
      fees += fee;
      cash = 0;
      trades.push({ side: "buy", t: candles[i].t, price, units, cash, pnl: null });
    } else if (crossed === "down" && units > 0) {
      const gross = units * price;
      const fee = gross * o.feeRate;
      cash = gross - fee;
      fees += fee;
      trades.push({ side: "sell", t: candles[i].t, price, units, cash, pnl: cash - entryCost });
      units = 0;
    }

    if (i === candles.length - 1) signal = crossed === "up" ? "buy" : crossed === "down" ? "sell" : "hold";

    const value = cash + units * price;
    equity.push({ t: candles[i].t, value });
    peak = Math.max(peak, value);
    maxDd = Math.max(maxDd, (peak - value) / peak);
  }

  const last = closes[closes.length - 1] ?? 0;
  const first = closes[0] ?? 0;
  const endValue = cash + units * last;
  const sells = trades.filter((t) => t.side === "sell");
  return {
    startCash: o.startCash,
    endValue,
    returnPct: ((endValue - o.startCash) / o.startCash) * 100,
    buyHoldPct: first > 0 ? ((last * (1 - o.feeRate) ** 2 - first) / first) * 100 : 0,
    maxDrawdownPct: maxDd * 100,
    trades,
    wins: sells.filter((t) => (t.pnl ?? 0) > 0).length,
    losses: sells.filter((t) => (t.pnl ?? 0) <= 0).length,
    feesPaid: fees,
    signal,
    inPosition: units > 0,
    equity,
  };
}
