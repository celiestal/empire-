import "server-only";
import type { Candle } from "./strategy";

// Public market data from the Crypto.com Exchange. No key needed, read only.
const API = "https://api.crypto.com/exchange/v1/public/get-candlestick";

export const MARKETS = ["BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD", "DOGE_USD"] as const;
export const TIMEFRAMES = { "15m": "15 minutes", "1h": "1 hour", "4h": "4 hours", "1D": "1 day" } as const;
export type Timeframe = keyof typeof TIMEFRAMES;

export async function fetchCandles(market: string, timeframe: Timeframe, count = 300): Promise<Candle[]> {
  const url = `${API}?instrument_name=${encodeURIComponent(market)}&timeframe=${timeframe}&count=${count}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Price feed returned ${res.status}`);
  const body = (await res.json()) as { result?: { data?: { t: number; o: string; h: string; l: string; c: string }[] } };
  const rows = body.result?.data ?? [];
  return rows
    .map((r) => ({ t: Number(r.t), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c) }))
    .filter((c) => Number.isFinite(c.c) && c.c > 0)
    .sort((a, b) => a.t - b.t);
}
