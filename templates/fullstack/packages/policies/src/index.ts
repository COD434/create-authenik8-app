/**
 * Declarative resource policies (roadmap item 13).
 *
 * A policy is declared as a rule tree and COMPILED to the shapes the API
 * already consumes: boolean access checks for single records (`canRead`,
 * `canWrite`) and a Prisma `where` fragment for list queries
 * (`listScope`). Declaring rules once keeps record checks and list
 * filters from drifting apart — the class of bug where a list endpoint
 * leaks rows an individual GET would deny.
 *
 * Server-side only. Rules never bypass `authenticate`; they assume an
 * authenticated actor and decide authorization alone.
 */

/** Structural shape of an authenticated actor (see `authenticate.ts`). */
export type ActorLike = { userId: string; role: string };

/**
 * What a rule compiles to for ONE actor, as a list-query scope:
 * - `unrestricted`: the actor may see every row (e.g. an administrator)
 * - `denied`: the actor may see no rows through this rule
 * - `where`: a Prisma `where` fragment narrowing the actor's rows
 */
export type CompiledFilter =
  | { kind: "unrestricted" }
  | { kind: "denied" }
  | { kind: "where"; where: Record<string, unknown> };

/**
 * One authorization rule.
 *
 * `allows` decides a single record access. `compile` derives the same
 * rule's list scope for an actor. The two MUST stay consistent: a row an
 * individual check denies must never appear in a compiled list scope.
 */
export type PolicyRule<Actor extends ActorLike, Resource> = {
  allows(actor: Actor, resource: Resource): boolean;
  compile(actor: Actor): CompiledFilter;
};

/** The actor owns the row: `resource[ownerKey] === actor.userId`. */
export function ownerOf<Resource extends Record<string, unknown>>(
  ownerKey: string,
): PolicyRule<ActorLike, Resource> {
  return {
    allows: (actor, resource) => resource[ownerKey] === actor.userId,
    compile: (actor) => ({ kind: "where", where: { [ownerKey]: actor.userId } }),
  };
}

/** The actor's role matches exactly. Role membership is not a row filter:
 * matching the role compiles to unrestricted access, not matching to denied. */
export function inRole<Actor extends ActorLike, Resource>(role: string): PolicyRule<Actor, Resource> {
  return {
    allows: (actor) => actor.role === role,
    compile: (actor) => (actor.role === role ? { kind: "unrestricted" } : { kind: "denied" }),
  };
}

/**
 * Grant when ANY rule grants. List-scope compilation:
 * unrestricted child wins, a single surviving `where` is returned as-is
 * (no redundant OR wrapper), multiple survivors combine under `OR`, and
 * all-denied compiles to denied.
 */
export function anyOf<Actor extends ActorLike, Resource>(
  ...rules: Array<PolicyRule<Actor, Resource>>
): PolicyRule<Actor, Resource> {
  if (rules.length === 0) {
    throw new Error("anyOf() requires at least one rule");
  }
  return {
    allows: (actor, resource) => rules.some((rule) => rule.allows(actor, resource)),
    compile: (actor) => {
      const scopes = rules.map((rule) => rule.compile(actor));
      if (scopes.some((scope) => scope.kind === "unrestricted")) {
        return { kind: "unrestricted" };
      }
      const wheres = scopes
        .filter((scope): scope is { kind: "where"; where: Record<string, unknown> } => scope.kind === "where")
        .map((scope) => scope.where);
      if (wheres.length === 1) return { kind: "where", where: wheres[0]! };
      if (wheres.length > 1) return { kind: "where", where: { OR: wheres } };
      return { kind: "denied" };
    },
  };
}

/**
 * Grant when EVERY rule grants. List-scope compilation: any denied child
 * denies; surviving `where` fragments merge (later fragments win on key
 * conflicts); no constraint means unrestricted.
 */
export function allOf<Actor extends ActorLike, Resource>(
  ...rules: Array<PolicyRule<Actor, Resource>>
): PolicyRule<Actor, Resource> {
  if (rules.length === 0) {
    throw new Error("allOf() requires at least one rule");
  }
  return {
    allows: (actor, resource) => rules.every((rule) => rule.allows(actor, resource)),
    compile: (actor) => {
      const merged: Record<string, unknown> = {};
      for (const rule of rules) {
        const scope = rule.compile(actor);
        if (scope.kind === "denied") return { kind: "denied" };
        if (scope.kind === "where") Object.assign(merged, scope.where);
      }
      return { kind: "where", where: merged };
    },
  };
}

export type PolicyDefinition<Actor extends ActorLike, Resource> = {
  /** Rule for single-record reads. Also compiles the list scope. */
  read: PolicyRule<Actor, Resource>;
  /** Rule for single-record writes. */
  write: PolicyRule<Actor, Resource>;
};

export type ResourcePolicy<Actor extends ActorLike, Resource> = {
  canRead(actor: Actor, resource: Resource): boolean;
  canWrite(actor: Actor, resource: Resource): boolean;
  /**
   * Prisma `where` fragment for list endpoints, derived from the read
   * rule. Unrestricted access compiles to `{}` (no filter).
   */
  listScope(actor: Actor): Record<string, unknown>;
};

export type DefinePolicyOptions = {
  /**
   * Prisma fragment used when the read rule denies an actor entirely.
   * Defaults to a zero-row filter on the standard `id` field; override
   * for tables whose key is named differently.
   */
  denyScope?: Record<string, unknown>;
};

/**
 * Declare a resource policy once; consume it as record checks and list
 * scopes. The list scope is derived from the READ rule so a row an
 * individual GET would deny can never appear in a list.
 */
export function definePolicy<Actor extends ActorLike, Resource>(
  definition: PolicyDefinition<Actor, Resource>,
  options: DefinePolicyOptions = {},
): ResourcePolicy<Actor, Resource> {
  const denyScope = options.denyScope ?? { id: { in: [] } };
  return {
    canRead: (actor, resource) => definition.read.allows(actor, resource),
    canWrite: (actor, resource) => definition.write.allows(actor, resource),
    listScope: (actor) => {
      const scope = definition.read.compile(actor);
      if (scope.kind === "unrestricted") return {};
      if (scope.kind === "denied") return denyScope;
      return scope.where;
    },
  };
}
