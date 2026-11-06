import { anyOf, definePolicy, inRole, ownerOf, requireAccess, type PolicyRequest } from "@authenik8/policies";

/**
 * Project authorization, declared once and compiled by @authenik8/policies:
 * administrators act on every project; users act on their own.
 *
 * One declaration compiles to every enforcement shape the API consumes —
 * record checks and list scopes (project.service.ts) AND route-level
 * middleware (project.routes.ts). The service keeps its own checks:
 * the middleware is an additional boundary, not a replacement.
 *
 * The exported shapes are the same the controllers and repositories have
 * always consumed; project.policy.test.ts pins this contract.
 */

type Actor = { userId: string; role: "USER" | "ADMIN" };
type Resource = { ownerId: string };

const readRule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("ownerId"));
const writeRule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("ownerId"));

const projectPolicy = definePolicy<Actor, Resource>({
  read: readRule,
  write: writeRule,
});

export const canReadProject = projectPolicy.canRead;
export const canWriteProject = projectPolicy.canWrite;
export const projectListScope = projectPolicy.listScope;

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
