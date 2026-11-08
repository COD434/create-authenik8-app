import {
  anyOf,
  definePolicy,
  describeRule,
  inRole,
  ownerOf,
  requireAccess,
  type PolicyRequest,
} from "@authenik8/policies";

/**
 * Webhook authorization, declared once and compiled by @authenik8/policies:
 * administrators act on every webhook; users act on their own.
 *
 * One declaration compiles to every enforcement and verification shape:
 * record checks and list scopes (webhook.service.ts), route-level
 * middleware (webhook.routes.ts), the consistency harness driven by
 * webhook.policy.test.ts, and the OpenAPI `x-authenik8-policy` metadata
 * (rule summaries below). The service keeps its own checks: the
 * middleware is an additional boundary, not a replacement.
 *
 * The signing secret is a credential, never a response payload: reads and
 * writes return webhook metadata only, and only POST /webhooks answers
 * with the one-time `signingSecret`.
 */

type Actor = { userId: string; role: "USER" | "ADMIN" };
type Resource = { userId: string };

const readRule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("userId"));
const writeRule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("userId"));

export const webhookPolicy = definePolicy<Actor, Resource>({
  read: readRule,
  write: writeRule,
});

export const canReadWebhook = webhookPolicy.canRead;
export const canWriteWebhook = webhookPolicy.canWrite;
export const webhookListScope = webhookPolicy.listScope;

/**
 * Rule-tree summaries for OpenAPI `x-authenik8-policy` metadata. Derived
 * from the declaration, so the documented contract cannot silently drift
 * from the enforced rules (asserted in tests/openapi.test.ts).
 */
export const webhookPolicyReadSummary = describeRule(readRule);
export const webhookPolicyWriteSummary = describeRule(writeRule);

export function requireWebhookAccess<TRequest extends { user?: { userId: string; role: string } | undefined; id?: unknown }>(
  mode: "read" | "write",
  loadResource: (req: TRequest) => Promise<Resource | null>,
) {
  return requireAccess<Resource, TRequest>({
    rule: mode === "read" ? readRule : writeRule,
    loadResource,
    denialVisibility: "masked",
    notFound: { code: "WEBHOOK_NOT_FOUND", message: "Webhook not found" },
  });
}
