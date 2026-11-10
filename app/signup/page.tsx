import Link from "next/link";
import { signUp } from "@/app/actions";

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="card stack" style={{ maxWidth: 420 }}>
      <h1>Create your account</h1>
      <p className="muted small">Basic is free. No card needed.</p>
      {error && <p className="notice error">{error}</p>}
      <form action={signUp} className="stack">
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password">Password (8+ characters)</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <button className="primary">Create account</button>
      </form>
      <p className="small muted">
        Already have one? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
