// usage: dl.mts <outdir> <tf> <sinceISO> <markets>
import { writeFileSync } from "node:fs";
import { fetchCandlesPage } from "/home/user/empire-/lib/paper/scalp/feed";
const [out, tf, sinceIso, mk] = process.argv.slice(2);
const since = Date.parse(sinceIso);
for (const m of mk.split(",")) {
  const all = new Map<number, any>(); let end = Date.now();
  while (end > since) { const p = await fetchCandlesPage(m, tf, 300, end); if (!p.length) break; for (const c of p) all.set(c.t, c); end = p[0].t - 1; await new Promise(r => setTimeout(r, 100)); }
  const rows = [...all.values()].sort((a, b) => a.t - b.t).filter(c => c.t >= since);
  writeFileSync(`${out}/${m}_${tf}.json`, JSON.stringify(rows));
  console.log(m, tf, rows.length, rows[0] && new Date(rows[0].t).toISOString());
}
