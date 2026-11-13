// Public Crypto.com Exchange market data. Read only, no key, never places orders.
import type { Candle } from "../strategy";

const BASE = "https://api.crypto.com/exchange/v1/public";

async function getJson(url: string, tries = 4): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

/** One page of candles (max 300), oldest first, ending at endTs (ms) if given. */
export async function fetchCandlesPage(market: string, timeframe: string, count = 300, endTs?: number): Promise<Candle[]> {
  let url = `${BASE}/get-candlestick?instrument_name=${encodeURIComponent(market)}&timeframe=${timeframe}&count=${count}`;
  if (endTs) url += `&end_ts=${endTs}`;
  const body = await getJson(url);
  const rows: { t: number; o: string; h: string; l: string; c: string; v: string }[] = body.result?.data ?? [];
  return rows
    .map((r) => ({ t: Number(r.t), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v) }))
    .filter((c) => Number.isFinite(c.c) && c.c > 0)
    .sort((a, b) => a.t - b.t);
}

/** All candles of `timeframe` (default 1m) from sinceTs (exclusive) up to now, oldest first. */
export async function fetchCandlesSince(market: string, sinceTs: number, timeframe = "1m"): Promise<Candle[]> {
  const all = new Map<number, Candle>();
  let end: number | undefined = undefined;
  for (let guard = 0; guard < 100; guard++) {
    const page = await fetchCandlesPage(market, timeframe, 300, end);
    if (!page.length) break;
    for (const c of page) all.set(c.t, c);
    if (page[0].t <= sinceTs) break;
    end = page[0].t - 1;
  }
  return [...all.values()].filter((c) => c.t > sinceTs).sort((a, b) => a.t - b.t);
}

/** Best bid/ask right now, for checking the spread assumption. */
export async function fetchSpread(market: string): Promise<{ bid: number; ask: number; spreadPct: number } | null> {
  try {
    const body = await getJson(`${BASE}/get-tickers?instrument_name=${encodeURIComponent(market)}`, 2);
    const t = body.result?.data?.[0];
    const bid = Number(t?.b), ask = Number(t?.k);
    if (!(bid > 0 && ask > 0)) return null;
    return { bid, ask, spreadPct: ((ask - bid) / ((ask + bid) / 2)) * 100 };
  } catch {
    return null;
  }
}
