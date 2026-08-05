import { csrfTokenSchema, registerSchema } from "@authenik8/contracts";
import type {
  AdminUserUpdateInput,
  AuditEvent,
  AuthResponse,
  ChangePasswordInput,
  LinkedProvider,
  LoginInput,
  OAuthProvider,
  Page,
  ProfileInput,
  Project,
  ProjectCreateInput,
  ProjectUpdateInput,
  RegisterInput,
  Session,
  User,
  UserStatus,
  Role,
} from "@authenik8/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Authenik8ClientOptions = {
  /**
   * API origin, for example https://api.example.com. A trailing /api is also
   * accepted. Omit it for the generated same-origin /api deployment.
   */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  broadcastChannelName?: string;
};

export type AuthStateListener = (user: User | null) => void;

function normalizeBaseUrl(value: string | undefined): string {
  const candidate = value?.trim() ?? "";
  if (!candidate || candidate === "/") return "";
  if (candidate.includes("?") || candidate.includes("#")) {
    throw new Error("Authenik8 API baseUrl must not contain a query string or fragment");
  }

  if (/^https?:\/\//i.test(candidate)) {
    const url = new URL(candidate);
    if (url.username || url.password) {
      throw new Error("Authenik8 API baseUrl must not contain credentials");
    }
    const pathname = url.pathname.replace(/\/+$/, "");
    if (pathname && pathname !== "/api") {
      throw new Error("Authenik8 API baseUrl path must be /api or empty");
    }
    return `${url.origin}${pathname}`;
  }

  const relative = candidate.replace(/\/+$/, "");
  if (relative !== "/api") {
    throw new Error("Authenik8 API baseUrl must be an HTTP(S) origin, /api, or empty");
  }
  return relative;
}

function apiPrefix(baseUrl: string): string {
  if (!baseUrl) return "/api";
  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "The request could not be completed",
      error?.fields,
    );
  }
  return body as T;
}

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

async function responseHasCode(response: Response, status: number, code: string): Promise<boolean> {
  if (response.status !== status) return false;
  const body = await response.clone().json().catch(() => null);
  return body?.error?.code === code;
}

export function createAuthenik8Client(options: Authenik8ClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const prefix = apiPrefix(baseUrl);
  const fetchRequest = options.fetch
    ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  let accessToken: string | null = null;
  let user: User | null = null;
  let refreshRequest: Promise<AuthResponse | null> | null = null;
  let csrfToken: string | null = null;
  let csrfRequest: Promise<string> | null = null;
  const authStateListeners = new Set<AuthStateListener>();
  const authenticationLostListeners = new Set<() => void>();
  const peerTokenWaiters = new Set<(available: boolean) => void>();
  const channel = typeof window !== "undefined" && typeof window.BroadcastChannel === "function"
    ? new BroadcastChannel(options.broadcastChannelName ?? "authenik8:session")
    : null;

  const endpoint = (path: string) => `${prefix}${path.startsWith("/") ? path : `/${path}`}`;

  function publishAuthState(nextUser: User | null): void {
    user = nextUser;
    for (const listener of authStateListeners) listener(user);
  }

  function clearAuthentication(broadcast = true): void {
    const hadAuthentication = accessToken !== null || user !== null;
    accessToken = null;
    publishAuthState(null);
    if (hadAuthentication) {
      for (const listener of authenticationLostListeners) listener();
    }
    if (broadcast) channel?.postMessage({ type: "signed-out" });
  }

  channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (!message || typeof message !== "object" || !("type" in message)) return;
    if (
      message.type === "access-token"
      && "token" in message
      && typeof message.token === "string"
      && message.token.length > 0
      && message.token.length <= 8192
    ) {
      accessToken = message.token;
      for (const resolve of peerTokenWaiters) resolve(true);
      peerTokenWaiters.clear();
    }
    if (message.type === "signed-out") clearAuthentication(false);
  });

  async function getCsrfToken(force = false): Promise<string> {
    if (force) {
      csrfToken = null;
      csrfRequest = null;
    }
    if (csrfToken) return csrfToken;

    if (!csrfRequest) {
      csrfRequest = fetchRequest(endpoint("/auth/csrf"), {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
        .then((response) => parseResponse<{ csrfToken: unknown }>(response))
        .then((body) => {
          const token = csrfTokenSchema.parse(body.csrfToken);
          csrfToken = token;
          return token;
        })
        .finally(() => {
          csrfRequest = null;
        });
    }
    return csrfRequest;
  }

  function waitForPeerAccessToken(previousToken: string | null): Promise<boolean> {
    if (accessToken && accessToken !== previousToken) return Promise.resolve(true);
    if (!channel) return Promise.resolve(false);

    return new Promise((resolve) => {
      const complete = (available: boolean) => {
        clearTimeout(timeout);
        peerTokenWaiters.delete(complete);
        resolve(available);
      };
      const timeout = setTimeout(() => complete(false), 2_000);
      peerTokenWaiters.add(complete);
    });
  }

  async function requestTokenRefresh(forceCsrf = false): Promise<Response> {
    const token = await getCsrfToken(forceCsrf);
    const response = await fetchRequest(endpoint("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "X-CSRF-Token": token },
    });
    if (!forceCsrf && await responseHasCode(response, 403, "CSRF_REJECTED")) {
      return requestTokenRefresh(true);
    }
    return response;
  }

  async function refreshAccessToken(): Promise<AuthResponse | null> {
    if (!refreshRequest) {
      const previousToken = accessToken;
      refreshRequest = requestTokenRefresh()
        .then(async (response) => {
          if (await responseHasCode(response, 409, "REFRESH_IN_PROGRESS")) {
            const available = await waitForPeerAccessToken(previousToken);
            if (!available || !accessToken) return null;
            const current = await request<{ user: User }>("/auth/me", {}, false);
            publishAuthState(current.user);
            return { accessToken, user: current.user };
          }
          if (!response.ok) return null;
          const result = await parseResponse<AuthResponse>(response);
          accessToken = result.accessToken;
          publishAuthState(result.user);
          channel?.postMessage({ type: "access-token", token: result.accessToken });
          return result;
        })
        .catch(() => null)
        .finally(() => {
          refreshRequest = null;
        });
    }
    return refreshRequest;
  }

  async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    const method = (init.method ?? "GET").toUpperCase();
    const sentAccessToken = accessToken;
    headers.set("Accept", "application/json");
    const hasFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
    if (init.body && !hasFormData) headers.set("Content-Type", "application/json");
    if (sentAccessToken) headers.set("Authorization", `Bearer ${sentAccessToken}`);
    if (isUnsafeMethod(method)) headers.set("X-CSRF-Token", await getCsrfToken());

    const response = await fetchRequest(endpoint(path), {
      ...init,
      headers,
      credentials: "include",
    });
    if (retry && isUnsafeMethod(method) && await responseHasCode(response, 403, "CSRF_REJECTED")) {
      await getCsrfToken(true);
      return request<T>(path, init, false);
    }
    if (response.status === 401 && sentAccessToken && path !== "/auth/refresh") {
      if (retry && await refreshAccessToken()) return request<T>(path, init, false);
      clearAuthentication();
    }
    return parseResponse<T>(response);
  }

  const json = (value: unknown) => JSON.stringify(value);

  const auth = {
    register: (input: RegisterInput) =>
      request<{ message: string; devVerificationToken?: string }>("/auth/register", {
        method: "POST",
        body: json(registerSchema.parse(input)),
      }),
    login: async (input: LoginInput) => {
      const result = await request<AuthResponse>("/auth/login", {
        method: "POST",
        body: json(input),
      });
      accessToken = result.accessToken;
      publishAuthState(result.user);
      return result;
    },
    refresh: async () => {
      const result = await refreshAccessToken();
      if (!result) clearAuthentication();
      return result;
    },
    restore: async () => {
      const result = await refreshAccessToken();
      return result ? { user: result.user } : null;
    },
    logout: async () => {
      try {
        await request<{ message: string }>("/auth/logout", { method: "POST" });
      } finally {
        clearAuthentication();
      }
    },
    currentUser: async () => {
      const result = await request<{ user: User }>("/auth/me");
      publishAuthState(result.user);
      return result;
    },
    exchangeOAuth: async (code: string) => {
      const result = await request<AuthResponse>("/auth/oauth/exchange", {
        method: "POST",
        body: json({ code }),
      });
      accessToken = result.accessToken;
      publishAuthState(result.user);
      return result;
    },
    oauthUrl: (provider: OAuthProvider) => endpoint(`/auth/oauth/${provider}`),
    forgotPassword: (email: string) =>
      request<{ message: string; devResetToken?: string }>("/auth/forgot-password", {
        method: "POST",
        body: json({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: json({ token, password }),
      }),
    verifyEmail: (token: string) =>
      request<{ message: string }>("/auth/verify-email", {
        method: "POST",
        body: json({ token }),
      }),
    resendVerification: () =>
      request<{ message: string; devVerificationToken?: string }>("/auth/resend-verification", {
        method: "POST",
      }),
  };

  const account = {
    getProfile: () => request<{ user: User }>("/account/profile"),
    updateProfile: (input: ProfileInput) =>
      request<{ user: User }>("/account/profile", { method: "PATCH", body: json(input) }),
    changePassword: async (input: ChangePasswordInput) => {
      const result = await request<{ message: string }>("/account/password", {
        method: "PUT",
        body: json(input),
      });
      clearAuthentication();
      return result;
    },
    linkedProviders: () => request<{ providers: LinkedProvider[] }>("/account/providers"),
    unlinkProvider: (provider: OAuthProvider) =>
      request<{ message: string }>(`/account/providers/${provider}`, { method: "DELETE" }),
    startProviderLink: (provider: OAuthProvider) =>
      request<{ url: string }>(`/auth/oauth/${provider}/link-intent`, { method: "POST" }),
  };

  const sessions = {
    list: () => request<{ sessions: Session[] }>("/account/sessions"),
    revoke: (id: string) =>
      request<{ message: string }>(`/account/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
    revokeOthers: () =>
      request<{ message: string; revoked: number }>("/account/sessions", { method: "DELETE" }),
  };

  const projects = {
    list: () => request<{ projects: Project[] }>("/projects"),
    get: (id: string) => request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`),
    create: (input: ProjectCreateInput) =>
      request<{ project: Project }>("/projects", { method: "POST", body: json(input) }),
    update: (id: string, input: ProjectUpdateInput) =>
      request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: json(input),
      }),
    remove: (id: string) =>
      request<void>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };

  const admin = {
    users: {
      list: (page = 1) => request<Page<User>>(`/admin/users?page=${page}`),
      get: (id: string) => request<{ user: User }>(`/admin/users/${encodeURIComponent(id)}`),
      updateStatus: (id: string, status: UserStatus) =>
        request<{ user: User }>(`/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: json({ status }),
        }),
      updateRoles: (id: string, role: Role) =>
        request<{ user: User }>(`/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: json({ role }),
        }),
      update: (id: string, input: AdminUserUpdateInput) =>
        request<{ user: User }>(`/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: json(input),
        }),
      revokeSessions: (id: string) =>
        request<{ message: string }>(`/admin/users/${encodeURIComponent(id)}/sessions`, {
          method: "DELETE",
        }),
    },
    audit: {
      list: (page = 1) => request<Page<AuditEvent>>(`/admin/audit?page=${page}`),
    },
  };

  return {
    auth,
    account,
    sessions,
    projects,
    admin,
    health: {
      status: () => request<{ status: string; database: string; redis: string }>("/health/ready"),
    },
    request,
    setAccessToken(token: string | null) {
      accessToken = token;
    },
    hasAccessToken() {
      return accessToken !== null;
    },
    subscribe(listener: AuthStateListener) {
      authStateListeners.add(listener);
      return () => {
        authStateListeners.delete(listener);
      };
    },
    onAuthenticationLost(listener: () => void) {
      authenticationLostListeners.add(listener);
      return () => {
        authenticationLostListeners.delete(listener);
      };
    },
  };
}

export type Authenik8Client = ReturnType<typeof createAuthenik8Client>;

const defaultClient = createAuthenik8Client();

export const apiFetch = <T>(path: string, init: RequestInit = {}, retry = true) =>
  defaultClient.request<T>(path, init, retry);
export const setAccessToken = (token: string | null) => defaultClient.setAccessToken(token);
export const hasAccessToken = () => defaultClient.hasAccessToken();
export const onAuthenticationLost = (listener: () => void) =>
  defaultClient.onAuthenticationLost(listener);

export const authApi = defaultClient.auth;
export const accountApi = {
  getProfile: defaultClient.account.getProfile,
  updateProfile: defaultClient.account.updateProfile,
  changePassword: defaultClient.account.changePassword,
  sessions: defaultClient.sessions.list,
  revokeSession: defaultClient.sessions.revoke,
  revokeOtherSessions: defaultClient.sessions.revokeOthers,
  providers: defaultClient.account.linkedProviders,
  unlinkProvider: defaultClient.account.unlinkProvider,
  startProviderLink: defaultClient.account.startProviderLink,
};
export const projectApi = defaultClient.projects;
export const adminApi = {
  users: defaultClient.admin.users.list,
  getUser: defaultClient.admin.users.get,
  updateUser: defaultClient.admin.users.update,
  updateUserStatus: defaultClient.admin.users.updateStatus,
  updateUserRoles: defaultClient.admin.users.updateRoles,
  revokeSessions: defaultClient.admin.users.revokeSessions,
  audit: defaultClient.admin.audit.list,
};
export const healthApi = defaultClient.health;
