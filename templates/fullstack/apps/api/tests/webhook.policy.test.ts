import { describe, expect, it } from "vitest";
import { assertPolicyConsistency } from "@authenik8/policies";
import {
  canReadWebhook,
  canWriteWebhook,
  webhookListScope,
  webhookPolicy,
  webhookPolicyReadSummary,
  webhookPolicyWriteSummary,
} from "../src/modules/webhooks/webhook.policy.js";

describe("Webhook ownership policy", () => {
  const owner = { userId: "user-1", role: "USER" as const };
  const stranger = { userId: "user-2", role: "USER" as const };
  const admin = { userId: "admin-1", role: "ADMIN" as const };
  const webhook = { userId: "user-1" };
  const someoneElses = { userId: "user-9" };

  it("passes the compiled consistency harness for every actor kind", () => {
    // Compiled verification: probe expectations plus the invariant that a
    // record the check denies can never match the actor's list scope.
    assertPolicyConsistency(webhookPolicy, [
      { label: "owner", actor: owner, readable: [webhook], writable: [webhook] },
      {
        label: "stranger",
        actor: stranger,
        readable: [{ userId: "user-2" }],
        denied: [webhook, someoneElses],
        writable: [{ userId: "user-2" }],
        writeDenied: [webhook, someoneElses],
      },
      { label: "admin", actor: admin, readable: [webhook, someoneElses], writable: [webhook, someoneElses] },
    ]);
  });

  it("allows the owner to read and write", () => {
    expect(canReadWebhook(owner, webhook)).toBe(true);
    expect(canWriteWebhook(owner, webhook)).toBe(true);
  });

  it("rejects another normal user", () => {
    expect(canReadWebhook(stranger, webhook)).toBe(false);
    expect(canWriteWebhook(stranger, webhook)).toBe(false);
    expect(webhookListScope(stranger)).toEqual({ userId: "user-2" });
  });

  it("allows an administrator through the explicit policy", () => {
    expect(canReadWebhook(admin, webhook)).toBe(true);
    expect(canWriteWebhook(admin, webhook)).toBe(true);
    expect(webhookListScope(admin)).toEqual({});
  });

  it("summarizes the enforced rule tree for the OpenAPI metadata", () => {
    expect(webhookPolicyReadSummary).toBe("anyOf(inRole(ADMIN), ownerOf(userId))");
    expect(webhookPolicyWriteSummary).toBe("anyOf(inRole(ADMIN), ownerOf(userId))");
  });
});
