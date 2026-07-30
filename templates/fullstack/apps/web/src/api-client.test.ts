import { afterEach, describe, expect, it, vi } from "vitest";

const csrfToken = (character: string) => `${character.repeat(43)}.${character.repeat(43)}`;
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("API client authentication lifecycle", () => {
  it("refreshes once after an authenticated 401 and retries with the new token", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    let protectedCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, authorization: headers.get("authorization") });
      if (url === "/api/account/providers") {
        protectedCalls += 1;
        return protectedCalls === 1
          ? jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401)
          : jsonResponse({ providers: [] });
      }
      if (url === "/api/auth/csrf") return jsonResponse({ csrfToken: csrfToken("a") });
      if (url === "/api/auth/refresh") {
        return jsonResponse({
          accessToken: "new-access-token",
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "user@example.com",
            name: "User",
            role: "USER",
            status: "ACTIVE",
            verified: true,
            createdAt: new Date().toISOString(),
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = await import("@authenik8/api-client");
    client.setAccessToken("old-access-token");

    await expect(client.accountApi.providers()).resolves.toEqual({ providers: [] });
    expect(calls.filter((call) => call.url === "/api/auth/refresh")).toHaveLength(1);
    expect(calls.at(-1)?.authorization).toBe("Bearer new-access-token");
  });

  it("refetches stale CSRF state during logout and always clears local authentication", async () => {
    let csrfCalls = 0;
    let logoutCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/auth/csrf") {
        csrfCalls += 1;
        return jsonResponse({ csrfToken: csrfToken(csrfCalls === 1 ? "a" : "b") });
      }
      if (url === "/api/prime") return jsonResponse({ ok: true });
      if (url === "/api/auth/logout") {
        logoutCalls += 1;
        return logoutCalls === 1
          ? jsonResponse({ error: { code: "CSRF_REJECTED", message: "Request verification failed" } }, 403)
          : jsonResponse({ message: "Signed out" });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = await import("@authenik8/api-client");
    const authenticationLost = vi.fn();
    client.onAuthenticationLost(authenticationLost);
    client.setAccessToken("access-token");
    await client.apiFetch("/prime", { method: "POST", body: "{}" });

    await expect(client.authApi.logout()).resolves.toEqual(undefined);
    expect(csrfCalls).toBe(2);
    expect(logoutCalls).toBe(2);
    expect(authenticationLost).toHaveBeenCalledOnce();
    expect(client.hasAccessToken()).toBe(false);
  });

  it("reuses a peer tab token when another refresh owns the server lock", async () => {
    class TestBroadcastChannel {
      static current: TestBroadcastChannel;
      private listener?: (event: MessageEvent<unknown>) => void;

      constructor(_name: string) {
        TestBroadcastChannel.current = this;
      }

      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) {
        this.listener = listener;
      }

      postMessage(_message: unknown) {}

      emit(message: unknown) {
        this.listener?.({ data: message } as MessageEvent<unknown>);
      }
    }
    vi.stubGlobal("window", { BroadcastChannel: TestBroadcastChannel });
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/csrf") return jsonResponse({ csrfToken: csrfToken("a") });
      if (url === "/api/auth/refresh") {
        setTimeout(() => {
          TestBroadcastChannel.current.emit({ type: "access-token", token: "peer-access-token" });
        }, 0);
        return jsonResponse({
          error: { code: "REFRESH_IN_PROGRESS", message: "Another session refresh is in progress" },
        }, 409);
      }
      if (url === "/api/auth/me") {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer peer-access-token");
        return jsonResponse({
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "user@example.com",
            name: "User",
            role: "USER",
            status: "ACTIVE",
            verified: true,
            createdAt: new Date().toISOString(),
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = await import("@authenik8/api-client");

    await expect(client.authApi.restore()).resolves.toMatchObject({
      user: { email: "user@example.com" },
    });
  });

  it("requests explicit admin collection pages", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/admin/audit?page=3");
      return jsonResponse({ items: [], total: 0, page: 3, pageSize: 50 });
    });
    vi.stubGlobal("fetch", fetch);
    const client = await import("@authenik8/api-client");

    await expect(client.adminApi.audit(3)).resolves.toMatchObject({ page: 3 });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
