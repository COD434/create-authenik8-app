import { describe, expect, it } from "vitest";
import { assertPolicyConsistency } from "@authenik8/policies";
import {
  canReadProject,
  canWriteProject,
  projectListScope,
  projectPolicy,
  projectPolicyReadSummary,
  projectPolicyWriteSummary,
} from "../src/modules/projects/project.policy.js";

describe("Project ownership policy", () => {
  const owner = { userId: "user-1", role: "USER" as const };
  const stranger = { userId: "user-2", role: "USER" as const };
  const admin = { userId: "admin-1", role: "ADMIN" as const };
  const project = { ownerId: "user-1" };
  const someoneElses = { ownerId: "user-9" };

  it("passes the compiled consistency harness for every actor kind", () => {
    // Compiled verification: probe expectations plus the invariant that a
    // record the check denies can never match the actor's list scope.
    assertPolicyConsistency(projectPolicy, [
      { label: "owner", actor: owner, readable: [project], writable: [project] },
      {
        label: "stranger",
        actor: stranger,
        readable: [{ ownerId: "user-2" }],
        denied: [project, someoneElses],
        writable: [{ ownerId: "user-2" }],
        writeDenied: [project, someoneElses],
      },
      { label: "admin", actor: admin, readable: [project, someoneElses], writable: [project, someoneElses] },
    ]);
  });

  it("allows the owner to read and write", () => {
    expect(canReadProject(owner, project)).toBe(true);
    expect(canWriteProject(owner, project)).toBe(true);
  });

  it("rejects another normal user", () => {
    expect(canReadProject(stranger, project)).toBe(false);
    expect(canWriteProject(stranger, project)).toBe(false);
    expect(projectListScope(stranger)).toEqual({ ownerId: "user-2" });
  });

  it("allows an administrator through the explicit policy", () => {
    expect(canReadProject(admin, project)).toBe(true);
    expect(canWriteProject(admin, project)).toBe(true);
    expect(projectListScope(admin)).toEqual({});
  });

  it("summarizes the enforced rule tree for the OpenAPI metadata", () => {
    expect(projectPolicyReadSummary).toBe("anyOf(inRole(ADMIN), ownerOf(ownerId))");
    expect(projectPolicyWriteSummary).toBe("anyOf(inRole(ADMIN), ownerOf(ownerId))");
  });
});
