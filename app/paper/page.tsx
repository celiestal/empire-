import { fetchCandles, MARKETS, TIMEFRAMES, type Timeframe } from "@/lib/paper/market";
import { backtest, type BacktestResult } from "@/lib/paper/strategy";
import { requireOwner } from "@/lib/session";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const when = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";

function clampInt(v: string | undefined, def: number, min: number, max: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

function EquityChart({ r }: { r: BacktestResult }) {
  const pts = r.equity;
  if (pts.length < 2) return null;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals, r.startCash), hi = Math.max(...vals, r.startCash);
  const span = hi - lo || 1;
  const W = 600, H = 160;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * H;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const up = r.endValue >= r.startCash;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Fake account value over time">
      <line x1={0} x2={W} y1={y(r.startCash)} y2={y(r.startCash)} stroke="var(--line)" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke={up ? "var(--good)" : "var(--bad)"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default async function PaperTrading({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; tf?: string; cash?: string; fast?: string; slow?: string }>;
}) {
  await requireOwner();
  const q = await searchParams;
  const market = (MARKETS as readonly string[]).includes(q.market ?? "") ? q.market! : "BTC_USD";
  const tf: Timeframe = q.tf && q.tf in TIMEFRAMES ? (q.tf as Timeframe) : "1h";
  const cash = clampInt(q.cash, 1000, 10, 1_000_000);
  const fast = clampInt(q.fast, 9, 2, 100);
  const slow = clampInt(q.slow, 21, 3, 200);

  let result: BacktestResult | null = null;
  let error: string | null = null;
  let lastPrice = 0;
  try {
    const candles = await fetchCandles(market, tf, 300);
    if (candles.length < slow + 2) throw new Error("Not enough price history came back. Try another market.");
    lastPrice = candles[candles.length - 1].c;
    result = backtest(candles, { startCash: cash, fast: Math.min(fast, slow - 1), slow });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h1>Paper Trading</h1>
      <p className="notice">
        <strong>Fake money only.</strong> This bot never touches a real account. It replays the last 300 price
        candles from the Crypto.com public feed and shows what a simple trend-following rule would have done, with
        a 0.1% fee on every trade. Past results do not predict future ones. If it can&apos;t beat &quot;buy and
        hold&quot; here, it won&apos;t make $44 into $11K either.
      </p>

      <form className="card row" method="get">
        <label>
          Market{" "}
          <select name="market" defaultValue={market}>
            {MARKETS.map((m) => (
              <option key={m} value={m}>{m.replace("_", "/")}</option>
            ))}
          </select>
        </label>
        <label>
          Candle{" "}
          <select name="tf" defaultValue={tf}>
            {Object.entries(TIMEFRAMES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Fake cash $ <input name="cash" type="number" min={10} defaultValue={cash} style={{ width: 110 }} />
        </label>
        <label>
          Fast avg <input name="fast" type="number" min={2} defaultValue={fast} style={{ width: 70 }} />
        </label>
        <label>
          Slow avg <input name="slow" type="number" min={3} defaultValue={slow} style={{ width: 70 }} />
        </label>
        <button className="primary">Run</button>
      </form>

      {error && <p className="notice error">Couldn&apos;t load prices: {error}</p>}

      {result && (
        <>
          <section className="grid three" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="muted small">Fake account now</div>
              <div className="price">{usd(result.endValue)}</div>
              <span className={`pill ${result.returnPct >= 0 ? "good" : "bad"}`}>{pct(result.returnPct)}</span>
            </div>
            <div className="card">
              <div className="muted small">If you just bought and held</div>
              <div className="price">{pct(result.buyHoldPct)}</div>
              <span className={`pill ${result.returnPct >= result.buyHoldPct ? "good" : "bad"}`}>
                Bot {result.returnPct >= result.buyHoldPct ? "beat" : "lost to"} holding
              </span>
            </div>
            <div className="card">
              <div className="muted small">Bot says right now</div>
              <div className="price" style={{ textTransform: "uppercase" }}>{result.signal}</div>
              <span className="pill">
                {result.inPosition ? "Holding" : "In cash"} · {market.replace("_", "/")} {usd(lastPrice)}
              </span>
            </div>
          </section>

          <section className="card stack" style={{ marginTop: 16 }}>
            <h2>Fake account value</h2>
            <EquityChart r={result} />
            <p className="small muted">
              {result.wins} winning and {result.losses} losing trades. Worst drop from a high: {result.maxDrawdownPct.toFixed(1)}%.
              Fees paid: {usd(result.feesPaid)}.
            </p>
          </section>

          <section className="card stack" style={{ marginTop: 16 }}>
            <h2>Trades</h2>
            {result.trades.length === 0 ? (
              <p className="muted">No trades in this window.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>When</th><th>Side</th><th>Price</th><th>Cash after</th><th>Profit</th></tr>
                  </thead>
                  <tbody>
                    {[...result.trades].reverse().map((t, i) => (
                      <tr key={i}>
                        <td>{when(t.t)}</td>
                        <td>{t.side}</td>
                        <td>{usd(t.price)}</td>
                        <td>{t.side === "sell" ? usd(t.cash) : "—"}</td>
                        <td>{t.pnl == null ? "—" : <span className={`pill ${t.pnl > 0 ? "good" : "bad"}`}>{usd(t.pnl)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
