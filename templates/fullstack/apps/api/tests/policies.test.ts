import { describe, expect, it, vi } from "vitest";
import {
  allOf,
  anyOf,
  assertPolicyConsistency,
  definePolicy,
  describeRule,
  inRole,
  ownerOf,
  requireAccess,
  resourceMatchesWhere,
  PolicyConsistencyError,
  type PolicyRequest,
  type PolicyResponse,
  type PolicyRule,
} from "@authenik8/policies";

type Actor = { userId: string; role: "USER" | "ADMIN" };
type Resource = { ownerId: string };

const owner: Actor = { userId: "user-1", role: "USER" };
const stranger: Actor = { userId: "user-2", role: "USER" };
const admin: Actor = { userId: "admin-1", role: "ADMIN" };
const project: Resource = { ownerId: "user-1" };

describe("policy rules", () => {
  it("ownerOf grants only the owning actor and scopes lists to ownership", () => {
    const rule: PolicyRule<Actor, Resource> = ownerOf("ownerId");
    expect(rule.allows(owner, project)).toBe(true);
    expect(rule.allows(stranger, project)).toBe(false);
    expect(rule.compile(owner)).toEqual({ kind: "where", where: { ownerId: "user-1" } });
  });

  it("inRole compiles matching roles to unrestricted and others to denied", () => {
    const rule = inRole<Actor, Resource>("ADMIN");
    expect(rule.allows(admin, project)).toBe(true);
    expect(rule.allows(owner, project)).toBe(false);
    expect(rule.compile(admin)).toEqual({ kind: "unrestricted" });
    expect(rule.compile(owner)).toEqual({ kind: "denied" });
  });

  it("anyOf compiles an unrestricted child to unrestricted access", () => {
    const rule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("ownerId"));
    expect(rule.compile(admin)).toEqual({ kind: "unrestricted" });
    expect(rule.allows(admin, project)).toBe(true);
  });

  it("anyOf flattens a single surviving where instead of wrapping it in OR", () => {
    const rule = anyOf<Actor, Resource>(inRole("ADMIN"), ownerOf("ownerId"));
    expect(rule.compile(owner)).toEqual({ kind: "where", where: { ownerId: "user-1" } });
    expect(rule.compile(stranger)).toEqual({ kind: "where", where: { ownerId: "user-2" } });
  });

  it("anyOf combines multiple surviving wheres under OR and denies when all deny", () => {
    const dualOwner = anyOf<Actor, Record<string, unknown>>(
      ownerOf("ownerId"),
      ownerOf("editorId"),
    );
    expect(dualOwner.compile(owner)).toEqual({
      kind: "where",
      where: { OR: [{ ownerId: "user-1" }, { editorId: "user-1" }] },
    });
    const deniedOnly = anyOf<Actor, Resource>(inRole("ADMIN"), inRole("OWNER"));
    expect(deniedOnly.compile(owner)).toEqual({ kind: "denied" });
  });

  it("anyOf requires at least one rule", () => {
    expect(() => anyOf<Actor, Resource>()).toThrow("anyOf() requires at least one rule");
  });

  it("allOf merges where fragments, propagates denial, and passes unrestricted through", () => {
    const merged = allOf<Actor, Resource>(
      inRole("USER"),
      ownerOf("ownerId"),
    );
    expect(merged.allows(owner, project)).toBe(true);
    expect(merged.allows(admin, project)).toBe(false);
    expect(merged.compile(owner)).toEqual({ kind: "where", where: { ownerId: "user-1" } });
    expect(merged.compile(admin)).toEqual({ kind: "denied" });

    const unconstrained = allOf<Actor, Resource>(inRole("ADMIN"), inRole("ADMIN"));
    expect(unconstrained.compile(admin)).toEqual({ kind: "where", where: {} });
  });

  it("allOf requires at least one rule", () => {
    expect(() => allOf<Actor, Resource>()).toThrow("allOf() requires at least one rule");
  });
});

describe("definePolicy", () => {
  const policy = definePolicy<Actor, Resource>({
    read: anyOf(inRole("ADMIN"), ownerOf("ownerId")),
    write: anyOf(inRole("ADMIN"), ownerOf("ownerId")),
  });

  it("passes the compiled consistency harness for every actor kind", () => {
    // One call verifies probe expectations AND the record-check/list-scope
    // invariant for every probed resource — the check this suite used to
    // hand-roll with a local matchesScope helper.
    assertPolicyConsistency(policy, [
      {
        label: "owner",
        actor: owner,
        readable: [project],
        writable: [project],
      },
      {
        label: "stranger",
        actor: stranger,
        readable: [{ ownerId: "user-2" }],
        denied: [project],
        writable: [{ ownerId: "user-2" }],
        writeDenied: [project],
      },
      {
        label: "admin",
        actor: admin,
        readable: [project, { ownerId: "user-9" }],
        writable: [project, { ownerId: "user-9" }],
      },
    ]);
  });

  it("reports the mismatch when record checks and list scopes diverge", () => {
    // Deliberately broken hand-written policy: the list scope admits every
    // row while the record check denies strangers — the exact bug the
    // harness exists to catch.
    const broken = {
      canRead: (actor: Actor, resource: Resource) => actor.role === "ADMIN" || resource.ownerId === actor.userId,
      canWrite: () => false,
      listScope: () => ({}), // unrestricted lists, restricted reads
    };
    expect(() =>
      assertPolicyConsistency(broken, [{ label: "stranger", actor: stranger, denied: [project] }]),
    ).toThrow(PolicyConsistencyError);
    expect(() =>
      assertPolicyConsistency(broken, [{ label: "stranger", actor: stranger, denied: [project] }]),
    ).toThrow(/canRead\(.*\) is false.*listScope \{\} matches/);
  });

  it("grants owners, scopes strangers to their own rows, and lets administrators through", () => {
    expect(policy.canRead(owner, project)).toBe(true);
    expect(policy.canWrite(owner, project)).toBe(true);
    expect(policy.canRead(stranger, project)).toBe(false);
    expect(policy.canWrite(stranger, project)).toBe(false);
    expect(policy.listScope(stranger)).toEqual({ ownerId: "user-2" });
    expect(policy.listScope(admin)).toEqual({});
    expect(policy.canRead(admin, project)).toBe(true);
    expect(policy.canWrite(admin, project)).toBe(true);
  });

  it("compiles total denial to a zero-row scope, overridable per table", () => {
    const adminsOnly = definePolicy<Actor, Resource>(
      { read: inRole("ADMIN"), write: inRole("ADMIN") },
      { denyScope: { key: { in: [] } } },
    );
    expect(adminsOnly.listScope(owner)).toEqual({ key: { in: [] } });
    expect(adminsOnly.listScope(admin)).toEqual({});
  });
});

describe("resourceMatchesWhere (compiled test evaluator)", () => {
  const record = { ownerId: "user-1", editorId: "user-2", title: "hello" };

  it("evaluates the fragments the compiler emits", () => {
    expect(resourceMatchesWhere(record, {})).toBe(true); // unrestricted
    expect(resourceMatchesWhere(record, { ownerId: "user-1" })).toBe(true);
    expect(resourceMatchesWhere(record, { ownerId: "user-9" })).toBe(false);
    expect(resourceMatchesWhere(record, { OR: [{ ownerId: "user-9" }, { editorId: "user-2" }] })).toBe(true);
    expect(resourceMatchesWhere(record, { AND: [{ ownerId: "user-1" }, { title: "hello" }] })).toBe(true);
    expect(resourceMatchesWhere(record, { AND: [{ ownerId: "user-1" }, { title: "nope" }] })).toBe(false);
  });

  it("evaluates operator objects and fails closed on unknown ones", () => {
    expect(resourceMatchesWhere(record, { id: { in: [] } })).toBe(false); // denyScope default
    expect(resourceMatchesWhere(record, { ownerId: { in: ["user-1", "user-2"] } })).toBe(true);
    expect(resourceMatchesWhere(record, { ownerId: { equals: "user-1" } })).toBe(true);
    expect(resourceMatchesWhere(record, { ownerId: { unsupported: 1 } })).toBe(false);
  });

  it("treats empty OR branches as matching everything, per Prisma semantics", () => {
    expect(resourceMatchesWhere(record, { OR: [{}] })).toBe(true);
  });
});

describe("assertPolicyConsistency (compiled test harness)", () => {
  const policy = definePolicy<Actor, Resource>({
    read: anyOf(inRole("ADMIN"), ownerOf("ownerId")),
    write: anyOf(inRole("ADMIN"), ownerOf("ownerId")),
  });

  it("names the probe, the resource, and both sides of a probe-expectation failure", () => {
    expect(() =>
      assertPolicyConsistency(policy, [{ label: "stranger", actor: stranger, readable: [project] }]),
    ).toThrow(PolicyConsistencyError);
    expect(() =>
      assertPolicyConsistency(policy, [{ label: "stranger", actor: stranger, readable: [project] }]),
    ).toThrow(/probe "stranger" must be able to read \{"ownerId":"user-1"\}/);
  });

  it("verifies write probes", () => {
    expect(() =>
      assertPolicyConsistency(policy, [{ label: "stranger", actor: stranger, writeDenied: [project] }]),
    ).not.toThrow();
    expect(() =>
      assertPolicyConsistency(policy, [{ label: "stranger", actor: stranger, writable: [project] }]),
    ).toThrow(/must be able to write/);
  });
});

describe("describeRule (compiled OpenAPI metadata)", () => {
  it("summarizes the composed rule tree", () => {
    expect(describeRule(anyOf(inRole("ADMIN"), ownerOf("ownerId")))).toBe(
      "anyOf(inRole(ADMIN), ownerOf(ownerId))",
    );
    expect(describeRule(allOf(inRole("USER"), ownerOf("ownerId")))).toBe(
      "allOf(inRole(USER), ownerOf(ownerId))",
    );
    expect(describeRule(ownerOf("editorId"))).toBe("ownerOf(editorId)");
  });

  it("never fabricates semantics for custom rules", () => {
    const custom: PolicyRule<Actor, Resource> = {
      allows: () => true,
      compile: () => ({ kind: "unrestricted" }),
    };
    expect(describeRule(custom)).toBe("(custom rule)");
  });
});

describe("requireAccess (compiled middleware)", () => {
  const makeRes = (): PolicyResponse & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } => {
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockImplementation(() => res);
    return res as unknown as PolicyResponse & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  };
  const rule: PolicyRule<Actor, Resource> = anyOf(inRole("ADMIN"), ownerOf("ownerId"));
  const resource: Resource = { ownerId: "user-1" };

  it("calls next() for an allowed actor without writing a response", async () => {
    const middleware = requireAccess<Resource>({ rule, loadResource: vi.fn(async () => resource) });
    const res = makeRes();
    const next = vi.fn();

    await middleware({ user: { userId: "user-1", role: "USER" }, id: "req-1" }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("grants administrators through the same compiled middleware", async () => {
    const middleware = requireAccess<Resource>({ rule, loadResource: vi.fn(async () => resource) });
    const next = vi.fn();

    await middleware({ user: { userId: "admin-1", role: "ADMIN" } }, makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("masks denial and missing records as the identical 404", async () => {
    const notFound = { code: "PROJECT_NOT_FOUND", message: "Project not found" };
    const denied = requireAccess<Resource>({
      rule,
      loadResource: vi.fn(async () => ({ ownerId: "someone-else" })),
      notFound,
    });
    const missing = requireAccess<Resource>({
      rule,
      loadResource: vi.fn(async () => null),
      notFound,
    });

    for (const middleware of [denied, missing]) {
      const res = makeRes();
      const next = vi.fn();
      await middleware({ user: { userId: "user-2", role: "USER" }, id: "req-1" }, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: notFound, requestId: "req-1" });
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("can expose denial explicitly as 403 while missing records stay 404", async () => {
    const middleware = requireAccess<Resource>({
      rule,
      loadResource: vi.fn(async () => ({ ownerId: "someone-else" })),
      denialVisibility: "explicit",
    });
    const res = makeRes();
    await middleware({ user: { userId: "user-2", role: "USER" }, id: "req-2" }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "FORBIDDEN", message: "Access denied" },
      requestId: "req-2",
    });

    const missing = requireAccess<Resource>({
      rule,
      loadResource: vi.fn(async () => null),
      denialVisibility: "explicit",
    });
    const resForMissing = makeRes();
    await missing({ user: { userId: "user-2", role: "USER" } }, resForMissing, vi.fn());
    expect(resForMissing.status).toHaveBeenCalledWith(404);
  });

  it("fails closed with 401 when no authenticated user is present", async () => {
    const load = vi.fn(async () => resource);
    const middleware = requireAccess<Resource>({ rule, loadResource: load });
    const res = makeRes();

    await middleware({}, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
      requestId: undefined,
    });
    expect(load).not.toHaveBeenCalled();
  });
});
