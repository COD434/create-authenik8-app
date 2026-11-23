/**
 * User-triggered outbound integrations for the local studio.
 *
 * Trust boundary:
 * - tokens and keys arrive per request, are used for one provider call, and
 *   are never written to disk, logged, or echoed back;
 * - Supabase is a managed Postgres, Storage, and Realtime target only. It is
 *   never an identity authority: Authenik8 keeps users, sessions, OAuth,
 *   CSRF, roles, and authorization;
 * - only the public anon/publishable Supabase key is accepted for browser-safe
 *   configuration. Secret/service-role keys are refused before any request;
 * - deploys are static only, because a static host cannot run the generated
 *   Express API. Fullstack projects get an explicit handoff instead of a
 *   deploy that would break auth;
 * - `.env` writes are atomic, preserve unrelated lines, and never leave the
 *   sandbox (export, preview, and deploy collection all skip dotfiles).
 */

export type FetchLike = typeof fetch;

export class IntegrationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "integration_error") {
    super(message);
    this.name = "IntegrationError";
    this.status = status;
    this.code = code;
  }
}
