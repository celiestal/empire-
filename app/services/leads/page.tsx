import { updateLead } from "@/app/actions";
import { clientsFor, SERVICE_PACKAGES } from "@/lib/services";
import { requireOwner } from "@/lib/session";
import { getStore } from "@/lib/store";

const STATUSES = ["new", "contacted", "won", "lost"] as const;

export default async function Leads() {
  await requireOwner();
  const leads = await getStore().list("leads");
  const price = (id: string) => SERVICE_PACKAGES.find((p) => p.id === id)?.monthlyUsd ?? 0;
  const monthly = leads.filter((l) => l.status === "won").reduce((sum, l) => sum + price(l.packageId), 0);
  const growth = SERVICE_PACKAGES[1];

  return (
    <>
      <h1>Service requests</h1>
      <section className="grid three">
        <div className="card">
          <div className="muted small">Won, per month</div>
          <div className="price">${monthly.toLocaleString()}</div>
          <span className={`pill ${monthly >= 1000 ? "good" : ""}`}>Goal $1,000</span>
        </div>
        <div className="card">
          <div className="muted small">Still to win</div>
          <div className="price">{monthly >= 1000 ? 0 : clientsFor(1000 - monthly, growth)}</div>
          <span className="pill">Growth clients</span>
        </div>
        <div className="card">
          <div className="muted small">Open requests</div>
          <div className="price">{leads.filter((l) => l.status === "new" || l.status === "contacted").length}</div>
        </div>
      </section>

      <section className="card stack" style={{ marginTop: 16 }}>
        {leads.length === 0 ? (
          <p className="muted">No requests yet. Share the /services page in your DMs and posts.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Contact</th>
                  <th>Package</th>
                  <th>Note</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>{l.business}</td>
                    <td>
                      {l.name}
                      <br />
                      <a href={`mailto:${l.email}`}>{l.email}</a>
                    </td>
                    <td>
                      {l.packageId} (${price(l.packageId)})
                    </td>
                    <td className="small">{l.message || "—"}</td>
                    <td>
                      <form key={l.status} action={updateLead} className="row">
                        <input type="hidden" name="id" value={l.id} />
                        <select name="status" defaultValue={l.status}>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button>Save</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
