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
 * Project authorization, declared once and compiled by @authenik8/policies:
 * administrators act on every project; users act on their own.
 *
 * One declaration compiles to every enforcement and verification shape:
 * record checks and list scopes (project.service.ts), route-level
 * middleware (project.routes.ts), the consistency harness driven by
 * project.policy.test.ts, and the OpenAPI `x-authenik8-policy` metadata
 * (rule summaries below). The service keeps its own checks: the
 * middleware is an additional boundary, not a replacement.
 */

type Actor = { userId: string; role: "USER" | "ADMIN" };
type Resource = { ownerId: string };

const readRule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("ownerId"));
const writeRule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("ownerId"));

export const projectPolicy = definePolicy<Actor, Resource>({
  read: readRule,
  write: writeRule,
});

export const canReadProject = projectPolicy.canRead;
export const canWriteProject = projectPolicy.canWrite;
export const projectListScope = projectPolicy.listScope;

/**
 * Rule-tree summaries for OpenAPI `x-authenik8-policy` metadata. Derived
 * from the declaration, so the documented contract cannot silently drift
 * from the enforced rules (asserted in tests/openapi.test.ts).
 */
export const projectPolicyReadSummary = describeRule(readRule);
export const projectPolicyWriteSummary = describeRule(writeRule);

/**
 * Route-level access middleware for a single project. Denials are masked
 * as 404 PROJECT_NOT_FOUND — identical to the service's response — so the
 * middleware leaks no record existence to non-owners.
 */
export function requireProjectAccess<TRequest extends { user?: { userId: string; role: string } | undefined; id?: unknown }>(
  mode: "read" | "write",
  loadResource: (req: TRequest) => Promise<Resource | null>,
) {
  return requireAccess<Resource, TRequest>({
    rule: mode === "read" ? readRule : writeRule,
    loadResource,
    denialVisibility: "masked",
    notFound: { code: "PROJECT_NOT_FOUND", message: "Project not found" },
  });
}
