"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthenik8Client, ApiError } from "@/lib/authenik8";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const client = getAuthenik8Client();
      await client.auth.login({ email, password });
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fields?.email?.[0] ?? err.fields?.password?.[0]
          ?? `${err.message} (${err.status})`);
      } else {
        setError("Sign-in could not reach the API. Check NEXT_PUBLIC_API_URL and that the API is running.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 420, margin: "0 auto" }}>
      <h1>Sign in</h1>
      {/* The typed client performs the CSRF bootstrap for this POST. Never
          call /api/auth/* with raw fetch. Access tokens stay in memory and
          the refresh token stays in the sealed HttpOnly cookie. */}
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
        <button type="submit" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
      </form>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
    </main>
  );
}
