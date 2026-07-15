type Actor = { userId: string; role: "USER" | "ADMIN" };
type Resource = { ownerId: string };

export function canReadProject(actor: Actor, project: Resource): boolean {
  return actor.role === "ADMIN" || project.ownerId === actor.userId;
}

export function canWriteProject(actor: Actor, project: Resource): boolean {
  return actor.role === "ADMIN" || project.ownerId === actor.userId;
}

export function projectListScope(actor: Actor) {
  return actor.role === "ADMIN" ? {} : { ownerId: actor.userId };
}
