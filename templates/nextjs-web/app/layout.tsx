import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Authenik8 Next.js starter",
  description: "Next.js frontend scaffold for an Authenik8 backend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui" }}>
        <nav style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", gap: 12 }}>
          <Link href="/">Home</Link>
          <Link href="/login">Login</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
