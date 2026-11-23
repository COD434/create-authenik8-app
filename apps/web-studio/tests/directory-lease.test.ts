import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLeaseManager } from "../src/directory-lease.js";

describe("directory leases", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "authenik8-lease-"));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("leases a sandbox-relative directory and normalizes the path", () => {
    const leases = createLeaseManager();
    const result = leases.acquire(sandbox, "src/components/");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lease.relativeRoot).toBe("src/components");
    expect(result.lease.root).toBe(path.join(sandbox, "src", "components"));
    expect(leases.active()).toHaveLength(1);
  });

  it("rejects escapes, reserved directories, and environment paths", () => {
    const leases = createLeaseManager();
    expect(leases.acquire(sandbox, "../outside").ok).toBe(false);
    expect(leases.acquire(sandbox, "/absolute").ok).toBe(false);
    expect(leases.acquire(sandbox, "").ok).toBe(false);
    expect(leases.acquire(sandbox, ".authenik8").ok).toBe(false);
    expect(leases.acquire(sandbox, "src/.authenik8").ok).toBe(false);
    expect(leases.acquire(sandbox, ".git").ok).toBe(false);
    expect(leases.acquire(sandbox, "node_modules").ok).toBe(false);
    expect(leases.acquire(sandbox, ".env").ok).toBe(false);
    expect(leases.acquire(sandbox, "config/.env.local").ok).toBe(false);
  });

  it("rejects overlapping leases and allows disjoint ones", () => {
    const leases = createLeaseManager();
    expect(leases.acquire(sandbox, "src").ok).toBe(true);
    expect(leases.acquire(sandbox, "src/components").ok).toBe(false);
    expect(leases.acquire(sandbox, "src/..cache").ok).toBe(false);
    expect(leases.acquire(sandbox, "src2").ok).toBe(true);
    expect(leases.acquire(sandbox, ".").ok).toBe(false);
  });

  it("releases a lease so the directory can be leased again", () => {
    const leases = createLeaseManager();
    const first = leases.acquire(sandbox, "src");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    leases.release(first.lease);
    expect(leases.active()).toHaveLength(0);
    expect(leases.acquire(sandbox, "src").ok).toBe(true);
  });

  it("makes release idempotent", () => {
    const leases = createLeaseManager();
    const result = leases.acquire(sandbox, "src");
    if (!result.ok) throw new Error(result.error);
    leases.release(result.lease);
    leases.release(result.lease);
    expect(leases.active()).toHaveLength(0);
  });

  it("leases the project root with '.'", () => {
    const leases = createLeaseManager();
    const result = leases.acquire(sandbox, ".");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lease.relativeRoot).toBe(".");
    expect(result.lease.root).toBe(path.resolve(sandbox));
  });
});
