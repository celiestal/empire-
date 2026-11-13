import { readFileSync } from "node:fs";
import { resample } from "/home/user/empire-/lib/paper/scalp/indicators";
import { applyRegime, strategyById } from "/home/user/empire-/lib/paper/scalp/strategies";
import { simulate } from "/home/user/empire-/lib/paper/scalp/engine";
// Fixed tsmom long params over 30-day windows: compare returnPct with closed-trade P&L.
const M = ["BTC_USD","ETH_USD","SOL_USD","XRP_USD","DOGE_USD"]; const DAY = 864e5;
const s = strategyById("tsmom");
for (const p of [{ look: 72, stopAtr: 3, rr: 6, hold: 72 }, { look: 168, stopAtr: 4, rr: 6, hold: 72 }, { look: 24, stopAtr: 2, rr: 3, hold: 24 }]) {
  let ret = 0, closed = 0, openN = 0, openGain = 0, entryAtEndBar = 0;
  for (const m of M) {
    const c = resample(JSON.parse(readFileSync(`/home/user/empire-/.paper-data/${m}_1h.json`,"utf8")).filter((x:any)=>x.t>=Date.parse("2025-02-11")), 240, 60);
    const sg = applyRegime(c, s.signals(c, p), 240, 0);
    for (let w = c[0].t; w + 30*DAY <= c[c.length-1].t; w += 30*DAY) {
      const a = c.findIndex(x => x.t >= w), b = c.findIndex(x => x.t >= w + 30*DAY);
      const r = simulate(c.slice(a,b), sg.slice(a,b));
      ret += r.returnPct; const cp = r.trades.reduce((q,t)=>q+t.pnl,0)/10; closed += cp;
      if (r.open) { openN++; openGain += r.returnPct - cp; if (r.open.entryT === c[b-1].t) entryAtEndBar++; }
    }
  }
  console.log(JSON.stringify(p), `sum returnPct/coin ${(ret/5).toFixed(2)}  closed-trade/coin ${(closed/5).toFixed(2)}  open-at-end ${openN} (entered on last bar ${entryAtEndBar}), their MTM/coin ${(openGain/5).toFixed(2)}`);
}
