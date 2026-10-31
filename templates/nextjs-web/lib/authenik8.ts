import { ApiError, createAuthenik8Client } from "@authenik8/api-client";

export { ApiError };

let client: ReturnType<typeof createAuthenik8Client> | undefined;

/**
 * Lazy singleton so the browser-only client (WebSocket-free, in-memory access
 * token, CSRF bootstrap, BroadcastChannel coordination) is never constructed
 * while this client component is still rendering on the server.
 */
export function getAuthenik8Client(): ReturnType<typeof createAuthenik8Client> {
  if (typeof window === "undefined") {
    throw new Error("The Authenik8 browser client is only available in the browser on the client side.");
  }
  client ??= createAuthenik8Client({
    baseUrl: process.env.NEXT_PUBLIC_API_URL,
  });
  return client;
}
