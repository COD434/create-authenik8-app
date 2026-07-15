import { describe, expect, it } from "vitest";
import { canReadProject, canWriteProject, projectListScope } from "../src/modules/projects/project.policy.js";

describe("Project ownership policy", () => {
  const owner = { userId: "user-1", role: "USER" as const };
  const stranger = { userId: "user-2", role: "USER" as const };
  const admin = { userId: "admin-1", role: "ADMIN" as const };
  const project = { ownerId: "user-1" };

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
});
