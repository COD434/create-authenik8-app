import { getHealth } from "@/lib/api";

export default async function Home() {
  let health: unknown = null;
  let error: string | null = null;
  try {
    health = await getHealth();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720, margin: "0 auto" }}>
      <h1>Authenik8 + Next.js</h1>
      <p>Next.js App Router starter connected to your Authenik8 API.</p>
      <h2>API health</h2>
      {error ? <p style={{ color: "crimson" }}>Error: {error}</p> : <pre>{JSON.stringify(health, null, 2)}</pre>}
      <p>
        Configure <code>NEXT_PUBLIC_API_URL</code> to point at your API (default
        http://localhost:3000).
      </p>
    </main>
  );
}
