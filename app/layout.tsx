import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { isOwner } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Empire",
  description: "Plan, write and edit short-form videos with AI, and run your online business on autopilot.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="brand">
              EMPIRE
            </Link>
            <nav>
              <Link href="/studio">Content Studio</Link>
              <Link href="/editor">Auto Editor</Link>
              <Link href="/pricing">Pricing</Link>
              {isOwner(user) && <Link href="/dashboard">Agents</Link>}
            </nav>
            <span className="spacer" />
            <nav>
              {user ? <Link href="/account">Account</Link> : <Link href="/login">Log in</Link>}
            </nav>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site">
          <div className="wrap">Empire. AI-generated content should be reviewed before you post it.</div>
        </footer>
      </body>
    </html>
  );
}
