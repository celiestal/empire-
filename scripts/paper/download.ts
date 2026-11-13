// Download 1-minute candles from Crypto.com's public API (no key) into .paper-data/.
// Usage: tsx scripts/paper/download.ts [days=30] [markets=BTC_USD,ETH_USD,...]
import { mkdirSync, writeFileSync } from "node:fs";
import { fetchCandlesPage } from "../../lib/paper/scalp/feed";

const days = Number(process.argv[2] ?? 30);
const markets = (process.argv[3] ?? "BTC_USD,ETH_USD,SOL_USD,XRP_USD,DOGE_USD").split(",");
mkdirSync(".paper-data", { recursive: true });

for (const m of markets) {
  const since = Date.now() - days * 86_400_000;
  const all = new Map<number, unknown>();
  let end = Date.now();
  while (end > since) {
    const page = await fetchCandlesPage(m, "1m", 300, end);
    if (!page.length) break;
    for (const c of page) all.set(c.t, c);
    end = page[0].t - 1;
    await new Promise((r) => setTimeout(r, 120));
  }
  const rows = [...all.values()].sort((a: any, b: any) => a.t - b.t).filter((c: any) => c.t >= since);
  writeFileSync(`.paper-data/${m}_1m.json`, JSON.stringify(rows));
  console.log(m, rows.length, "candles");
}
