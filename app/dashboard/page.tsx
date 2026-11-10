import { decideApproval, runCycleNow, saveOwnerSettings, toggleKillSwitch } from "@/app/actions";
import { aiEnabled } from "@/lib/ai";
import { fmt, spentThisMonthCents } from "@/lib/policy";
import { requireOwner } from "@/lib/session";
import { getStore } from "@/lib/store";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; ran?: string }> }) {
  const { error, ran } = await searchParams;
  await requireOwner();
  const store = getStore();
  const [settings, approvals, projects, opps, agents, audit, ledger, tasks] = await Promise.all([
    store.settings(),
    store.list("approvals"),
    store.list("projects"),
    store.list("opportunities"),
    store.list("agents"),
    store.list("audit"),
    store.list("ledger"),
    store.list("tasks"),
  ]);
  const pending = approvals.filter((a) => a.status === "pending");
  const spent = spentThisMonthCents(ledger);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Agents</h1>
        <form action={toggleKillSwitch}>
          <button className={settings.killSwitch ? "good" : "danger"}>
            {settings.killSwitch ? "Kill switch ON: turn agents back on" : "Kill switch: stop all agents"}
          </button>
        </form>
      </div>
      {error && <p className="notice error">{error}</p>}
      {ran && <p className="notice ok">Cycle finished. See the activity log below.</p>}
      {!aiEnabled() && <p className="notice">Add ANTHROPIC_API_KEY on the server to let the agents run.</p>}

      <section className="grid three">
        <div className="card">
          <label>Pending approvals</label>
          <div className="price">{pending.length}</div>
        </div>
        <div className="card">
          <label>Spent this month</label>
          <div className="price">{fmt(spent)}</div>
          <div className="small muted">of {fmt(settings.monthlyBudgetCents)} budget</div>
        </div>
        <div className="card">
          <label>Projects / opportunities</label>
          <div className="price">
            {projects.length} / {opps.length}
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Waiting for your approval</h2>
        <p className="small muted">
          Agents can research, plan and write on their own. Anything that spends money, contacts people, publishes,
          deploys or signs something waits here for you.
        </p>
        {pending.length === 0 && <p className="muted small">Nothing waiting.</p>}
        <ul className="clean">
          {pending.map((a) => (
            <li key={a.id} className="stack">
              <div className="row">
                <span className="pill premium">{a.kind}</span>
                <strong>{a.summary}</strong>
                {a.amountCents > 0 && <span className="pill">{fmt(a.amountCents)}</span>}
                <span className="small muted">from {agentName(a.requestedBy)}</span>
              </div>
              <pre>{a.detail}</pre>
              <form action={decideApproval} className="row">
                <input type="hidden" name="id" value={a.id} />
                <button name="decision" value="approve" className="good">
                  Approve
                </button>
                <button name="decision" value="reject" className="danger">
                  Reject
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid two">
        <form action={runCycleNow} className="card stack">
          <h2>Run a cycle now</h2>
          <p className="small muted">
            The CEO Agent reviews the business, delegates research and planning, and files approval requests. One cycle
            uses roughly a few dollars of AI usage.
          </p>
          <input name="note" type="text" placeholder="Optional instruction for the CEO Agent" />
          <button className="primary" disabled={settings.killSwitch || !aiEnabled()}>
            Run cycle
          </button>
        </form>

        <form action={saveOwnerSettings} className="card stack">
          <h2>Goals and limits</h2>
          <div>
            <label htmlFor="ownerGoals">Your goals (the CEO Agent reads this every cycle)</label>
            <textarea id="ownerGoals" name="ownerGoals" defaultValue={settings.ownerGoals} />
          </div>
          <div className="grid two">
            <div>
              <label htmlFor="monthlyBudget">Monthly budget ($)</label>
              <input id="monthlyBudget" name="monthlyBudget" type="number" min={0} step={1} defaultValue={settings.monthlyBudgetCents / 100} />
            </div>
            <div>
              <label htmlFor="perActionLimit">Max per purchase ($)</label>
              <input id="perActionLimit" name="perActionLimit" type="number" min={0} step={1} defaultValue={settings.perActionLimitCents / 100} />
            </div>
          </div>
          <button>Save</button>
        </form>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Opportunities</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Idea</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...opps]
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 15)
                  .map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.title}</strong>
                        <div className="small muted">
                          {fmt(o.startupCostCents)} to start, ~{fmt(o.monthlyRevenueEstimateCents)}/mo, risk {o.risk}/5
                        </div>
                      </td>
                      <td>{o.score}</td>
                      <td>
                        <span className="pill">{o.status}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Projects</h2>
          <ul className="clean">
            {projects.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> <span className="pill">{p.status}</span>
                <div className="small muted">{p.goal}</div>
              </li>
            ))}
          </ul>
          <h2 style={{ marginTop: 20 }}>Team</h2>
          <p className="small muted">{agents.filter((a) => a.status === "active").map((a) => a.name).join(", ") || "Hired on the first cycle."}</p>
        </div>
      </section>

      <section className="card">
        <h2>Activity</h2>
        <ul className="clean">
          {audit.slice(0, 40).map((e) => (
            <li key={e.id} className="small">
              <span className="muted">{new Date(e.createdAt).toLocaleString()}</span> <strong>{e.actor}</strong>{" "}
              {e.action.replace(/_/g, " ")}
              {e.detail && <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{e.detail.slice(0, 600)}</div>}
            </li>
          ))}
        </ul>
        {tasks.length > 0 && <p className="small muted">{tasks.length} tasks delegated so far.</p>}
      </section>
    </>
  );
}
