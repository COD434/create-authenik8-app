import { csrfTokenSchema, registerSchema } from "@authenik8/contracts";
import type {
  AdminUserUpdateInput,
  AuditEvent,
  AuthResponse,
  ChangePasswordInput,
  LinkedProvider,
  LoginInput,
  Page,
  ProfileInput,
  Project,
  ProjectCreateInput,
  ProjectUpdateInput,
  RegisterInput,
  Session,
  User,
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

let accessToken: string | null = null;
let refreshRequest: Promise<boolean> | null = null;
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

async function parseResponse<T>(response: Response): Promise<T> {
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

async function getCsrfToken(force = false): Promise<string> {
  if (force) {
    csrfToken = null;
    csrfRequest = null;
  }
  if (csrfToken) return csrfToken;

  if (!csrfRequest) {
    csrfRequest = fetch("/api/auth/csrf", {
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

  return await csrfRequest;
}

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  const body = await response.clone().json().catch(() => null);
  return body?.error?.code === "CSRF_REJECTED";
}

async function requestTokenRefresh(forceCsrf = false): Promise<Response> {
  const token = await getCsrfToken(forceCsrf);
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "X-CSRF-Token": token },
  });
  if (!forceCsrf && await isCsrfRejection(response)) return requestTokenRefresh(true);
  return response;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshRequest) {
    refreshRequest = requestTokenRefresh()
      .then(async (response) => {
        if (!response.ok) return false;
        const result = await response.json() as AuthResponse;
        accessToken = result.accessToken;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (isUnsafeMethod(method)) headers.set("X-CSRF-Token", await getCsrfToken());

  const response = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
  if (retry && isUnsafeMethod(method) && await isCsrfRejection(response)) {
    await getCsrfToken(true);
    return apiFetch<T>(path, init, false);
  }
  if (response.status === 401 && retry && path !== "/auth/refresh") {
    if (await refreshAccessToken()) return apiFetch<T>(path, init, false);
    accessToken = null;
  }
  return parseResponse<T>(response);
}

const json = (value: unknown) => JSON.stringify(value);

export const authApi = {
  register: (input: RegisterInput) => apiFetch<{ message: string; devVerificationToken?: string }>("/auth/register", {
    method: "POST",
    body: json(registerSchema.parse(input)),
  }),
  login: async (input: LoginInput) => {
    const result = await apiFetch<AuthResponse>("/auth/login", { method: "POST", body: json(input) });
    setAccessToken(result.accessToken);
    return result;
  },
  restore: async () => {
    const ok = await refreshAccessToken();
    if (!ok) return null;
    return apiFetch<{ user: User }>("/auth/me", {}, false);
  },
  logout: async () => {
    try {
      await apiFetch<{ message: string }>("/auth/logout", { method: "POST" }, false);
    } finally {
      setAccessToken(null);
    }
  },
  exchangeOAuth: async (code: string) => {
    const result = await apiFetch<AuthResponse>("/auth/oauth/exchange", { method: "POST", body: json({ code }) });
    setAccessToken(result.accessToken);
    return result;
  },
  forgotPassword: (email: string) => apiFetch<{ message: string; devResetToken?: string }>("/auth/forgot-password", { method: "POST", body: json({ email }) }),
  resetPassword: (token: string, password: string) => apiFetch<{ message: string }>("/auth/reset-password", { method: "POST", body: json({ token, password }) }),
  verifyEmail: (token: string) => apiFetch<{ message: string }>("/auth/verify-email", { method: "POST", body: json({ token }) }),
  resendVerification: () => apiFetch<{ message: string; devVerificationToken?: string }>("/auth/resend-verification", { method: "POST" }),
};

export const accountApi = {
  updateProfile: (input: ProfileInput) => apiFetch<{ user: User }>("/account/profile", { method: "PATCH", body: json(input) }),
  changePassword: (input: ChangePasswordInput) => apiFetch<{ message: string }>("/account/password", { method: "PUT", body: json(input) }),
  sessions: () => apiFetch<{ sessions: Session[] }>("/account/sessions"),
  revokeSession: (id: string) => apiFetch<{ message: string }>(`/account/sessions/${id}`, { method: "DELETE" }),
  providers: () => apiFetch<{ providers: LinkedProvider[] }>("/account/providers"),
  startProviderLink: (provider: "google" | "github") => apiFetch<{ url: string }>(`/auth/oauth/${provider}/link-intent`, { method: "POST" }),
};

export const projectApi = {
  list: () => apiFetch<{ projects: Project[] }>("/projects"),
  get: (id: string) => apiFetch<{ project: Project }>(`/projects/${id}`),
  create: (input: ProjectCreateInput) => apiFetch<{ project: Project }>("/projects", { method: "POST", body: json(input) }),
  update: (id: string, input: ProjectUpdateInput) => apiFetch<{ project: Project }>(`/projects/${id}`, { method: "PATCH", body: json(input) }),
  remove: (id: string) => apiFetch<void>(`/projects/${id}`, { method: "DELETE" }),
};

export const adminApi = {
  users: (page = 1) => apiFetch<Page<User>>(`/admin/users?page=${page}`),
  updateUser: (id: string, input: AdminUserUpdateInput) => apiFetch<{ user: User }>(`/admin/users/${id}`, { method: "PATCH", body: json(input) }),
  revokeSessions: (id: string) => apiFetch<{ message: string }>(`/admin/users/${id}/sessions`, { method: "DELETE" }),
  audit: () => apiFetch<{ events: AuditEvent[] }>("/admin/audit"),
};

export const healthApi = {
  status: () => apiFetch<{ status: string; database: string; redis: string }>("/health/ready"),
};
