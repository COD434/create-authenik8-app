export async function getHealth() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}
