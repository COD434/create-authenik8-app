import { anyOf, definePolicy, inRole, ownerOf } from "@authenik8/policies";

/**
 * Project authorization, declared once and compiled by @authenik8/policies:
 * administrators act on every project; users act on their own.
 *
 * The exported shapes (record checks + list scope) are the same the
 * controllers and repositories have always consumed; project.policy.test.ts
 * pins this contract.
 */

type Actor = { userId: string; role: "USER" | "ADMIN" };
type Resource = { ownerId: string };

const adminOrOwner = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("ownerId"));

const projectPolicy = definePolicy<Actor, Resource>({
  read: adminOrOwner,
  write: adminOrOwner,
});

export const canReadProject = projectPolicy.canRead;
export const canWriteProject = projectPolicy.canWrite;
export const projectListScope = projectPolicy.listScope;
