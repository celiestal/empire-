import Link from "next/link";
import { logIn } from "@/app/actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="card stack" style={{ maxWidth: 420 }}>
      <h1>Log in</h1>
      {error && <p className="notice error">{error}</p>}
      <form action={logIn} className="stack">
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <button className="primary">Log in</button>
      </form>
      <p className="small muted">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </div>
  );
}
