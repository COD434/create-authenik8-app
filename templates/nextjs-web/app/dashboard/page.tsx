export default function Dashboard() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720, margin: "0 auto" }}>
      <h1>Dashboard</h1>
      <p>Protected area. Wire this page to the Authenik8 typed client and session state.</p>
      <p>
        <a href="/login">Sign in</a>
      </p>
    </main>
  );
}
