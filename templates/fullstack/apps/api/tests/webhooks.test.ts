import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

// The repository is the only Prisma surface the service touches. Note the
// arg forms: list() and findActiveSubscribers() both call
// prisma.webhook.findMany, so every test that exercises either path sets
// webhookFindMany freshly; CRUD and delivery rows are separate fns.
const mocks = vi.hoisted(() => ({
  webhookFindMany: vi.fn(),
  findWebhookById: vi.fn(),
  countWebhooks: vi.fn(),
  createWebhookRow: vi.fn(),
  updateWebhookRow: vi.fn(),
  removeWebhookRow: vi.fn(),
  deliveryFindMany: vi.fn(),
  countDeliveries: vi.fn(),
  createDeliveries: vi.fn(),
  recordDeliveryRow: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    webhook: {
      findMany: mocks.webhookFindMany,
      findUnique: mocks.findWebhookById,
      count: mocks.countWebhooks,
      create: mocks.createWebhookRow,
      update: mocks.updateWebhookRow,
      delete: mocks.removeWebhookRow,
    },
    webhookDelivery: {
      findMany: mocks.deliveryFindMany,
      createMany: mocks.createDeliveries,
      update: mocks.recordDeliveryRow,
      count: mocks.countDeliveries,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    REFRESH_SECRET: "test-refresh-secret-with-more-than-32-characters",
  },
}));

import {
  createWebhook,
  deleteWebhook,
  deliverDueWebhookDeliveries,
  emitWebhookEvent,
  getWebhook,
  listWebhookDeliveries,
  listWebhooks,
  updateWebhook,
  webhookSignature,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_SECONDS,
} from "../src/modules/webhooks/webhook.service.js";
import {
  webhookCreateSchema,
  webhookEventCatalog,
  webhookEventTypeSchema,
  webhookUpdateSchema,
} from "@authenik8/contracts";
import { openSealedValue, sealValue } from "../src/utils/sealed-value.js";

const REFRESH_SECRET = "test-refresh-secret-with-more-than-32-characters";
const WEBHOOK_URL = "https://ops.example.com/hooks/authenik8";

const owner = { userId: "user-1", role: "USER" as const };
const stranger = { userId: "user-2", role: "USER" as const };
const admin = { userId: "admin-1", role: "ADMIN" as const };

function aWebhook(overrides: Record<string, unknown> = {}) {
  const signingSecret = String(overrides.signingSecret ?? "raw-signing-secret-thirtytwo-long-000");
  const webhook = {
    id: String(overrides.id ?? "webhook-1"),
    userId: String(overrides.userId ?? "user-1"),
    url: String(overrides.url ?? WEBHOOK_URL),
    events: (overrides.events ?? ["project.created"]) as string[],
    secret: String(overrides.secret ?? sealValue(signingSecret, REFRESH_SECRET)),
    active: overrides.active ?? true,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
  };
  return { webhook, signingSecret };
}

function aDueDelivery(overrides: Record<string, unknown> = {}) {
  const { webhook, signingSecret } = aWebhook(overrides.webhookOverrides ?? {});
  const delivery = {
    id: "delivery-1",
    webhookId: webhook.id,
    event: "project.created",
    payload: JSON.stringify({ id: "project-1", name: "Launch checklist" }),
    status: "PENDING" as const,
    attempts: 0,
    nextAttemptAt: new Date("2026-01-02T03:04:05.000Z"),
    respondedAt: null,
    lastStatus: null,
    lastError: null,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    webhook,
    ...(overrides.deliveryOverrides ?? {}),
  };
  return { delivery, signingSecret, webhook };
}

function webhookResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as unknown as Response;
}

function dueBatch(deliveryOverrides: Record<string, unknown> = {}) {
  const { delivery } = aDueDelivery({ deliveryOverrides });
  mocks.deliveryFindMany.mockResolvedValue([delivery]);
  mocks.recordDeliveryRow.mockResolvedValue(delivery);
  return delivery;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhook contracts", () => {
  it("requires https, allowing plain http only for localhost development", () => {
    expect(webhookCreateSchema.safeParse({ url: WEBHOOK_URL, events: ["project.created"] }).success).toBe(true);
    expect(webhookCreateSchema.safeParse({ url: "http://localhost:4000/hook", events: ["project.created"] }).success).toBe(true);
    expect(webhookCreateSchema.safeParse({ url: "http://127.0.0.1:9000/hook", events: ["project.created"] }).success).toBe(true);
    expect(webhookCreateSchema.safeParse({ url: "http://insecure.example.com/hook", events: ["project.created"] }).success).toBe(false);
    expect(webhookCreateSchema.safeParse({ url: WEBHOOK_URL, events: [] }).success).toBe(false);
    expect(webhookCreateSchema.safeParse({ url: "not-a-url", events: ["project.created"] }).success).toBe(false);
  });

  it("applies the update contract's partial refinement", () => {
    expect(webhookUpdateSchema.safeParse({ active: false }).success).toBe(true);
    expect(webhookUpdateSchema.safeParse({ events: ["project.updated"] }).success).toBe(true);
    expect(webhookUpdateSchema.safeParse({}).success).toBe(false);
    expect(webhookUpdateSchema.safeParse({ active: "yes" }).success).toBe(false);
  });

  it("keeps the subscription enum and the declared event catalog aligned", () => {
    const topics = Object.keys(webhookEventCatalog);
    expect(topics).toEqual([...(webhookEventTypeSchema as unknown as { options: string[] }).options]);
    // Every declared event's example payload is accepted by its own schema,
    // so the cataloged examples are always deliverable documents.
    for (const [topic, purpose] of Object.entries(webhookEventCatalog)) {
      expect(webhookEventTypeSchema.safeParse(topic).success).toBe(true);
      expect(purpose.schema.safeParse(purpose.example).success).toBe(true);
    }
  });
});

describe("webhook subscriptions", () => {
  it("scopes lists through the compiled policy and never exposes the secret", async () => {
    const { webhook } = aWebhook();
    mocks.webhookFindMany.mockResolvedValue([webhook]);

    expect(await listWebhooks(owner)).toEqual([{
      id: webhook.id,
      userId: webhook.userId,
      url: webhook.url,
      events: ["project.created"],
      active: true,
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
    }]);
    expect(mocks.webhookFindMany.mock.calls[0]?.[0]).toEqual({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("serves reads to the owner and the admin, and masks strangers", async () => {
    const { webhook } = aWebhook();
    mocks.findWebhookById.mockResolvedValue(webhook);

    expect(await getWebhook(owner, webhook.id)).toMatchObject({ id: webhook.id });
    expect(await getWebhook(admin, webhook.id)).toMatchObject({ id: webhook.id });
    await expect(getWebhook(stranger, webhook.id)).rejects.toMatchObject({
      code: "WEBHOOK_NOT_FOUND",
      status: 404,
    });
    await expect(getWebhook(owner, webhook.id)).resolves.toMatchObject({ id: webhook.id });
  });

  it("seals the signing secret at rest and returns it exactly once", async () => {
    mocks.countWebhooks.mockResolvedValue(0);
    mocks.createWebhookRow.mockImplementation(async (args: { data: Record<string, unknown> }) =>
      aWebhook({
        userId: args.data.userId as string,
        url: args.data.url as string,
        events: args.data.events as string[],
        secret: args.data.secret as string,
      }).webhook);

    const result = await createWebhook(
      owner,
      { url: WEBHOOK_URL, events: ["project.created", "project.updated"] },
    );

    expect(mocks.createWebhookRow.mock.calls[0]?.[0]).toMatchObject({
      data: {
        userId: "user-1",
        url: WEBHOOK_URL,
        events: ["project.created", "project.updated"],
      },
    });
    const stored = (mocks.createWebhookRow.mock.calls[0]?.[0] as { data?: { secret?: string } })?.data;
    // The secret is sealed at rest with the refresh vault, rounds back to
    // the value carried by this one response, and never appears on the
    // presented webhook.
    expect(stored?.secret?.split(".")).toHaveLength(3);
    expect(openSealedValue(stored?.secret, REFRESH_SECRET)).toBe(result.signingSecret);
    expect(result.signingSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.webhook).not.toHaveProperty("secret");
    expect(result.webhook).toMatchObject({ url: WEBHOOK_URL, events: ["project.created", "project.updated"] });
  });

  it("enforces the per-user webhook limit", async () => {
    mocks.countWebhooks.mockResolvedValue(50);

    await expect(createWebhook(owner, { url: WEBHOOK_URL, events: ["project.created"] }))
      .rejects.toMatchObject({ code: "WEBHOOK_LIMIT_REACHED", status: 422 });
    expect(mocks.createWebhookRow).toHaveBeenCalledTimes(0);
  });

  it("updates and deletes only authorized rows", async () => {
    const { webhook } = aWebhook();
    mocks.findWebhookById.mockResolvedValue(webhook);
    mocks.updateWebhookRow.mockResolvedValue({ ...webhook, active: false });

    expect(await updateWebhook(owner, webhook.id, { active: false })).toMatchObject({ active: false });
    expect(mocks.updateWebhookRow.mock.calls[0]?.[0]).toMatchObject({
      where: { id: webhook.id },
      data: { active: false },
    });
    mocks.removeWebhookRow.mockResolvedValue(webhook);
    await expect(deleteWebhook(owner, webhook.id)).resolves.toBeUndefined();
    expect(mocks.removeWebhookRow.mock.calls[0]?.[0]).toEqual({ where: { id: webhook.id } });
    await expect(updateWebhook(stranger, webhook.id, { active: false }))
      .rejects.toMatchObject({ code: "WEBHOOK_NOT_FOUND" });
    await expect(updateWebhook(owner, webhook.id, { url: "http://insecure.example.com/x" }))
      .rejects.toBeInstanceOf(Error);
    expect(mocks.updateWebhookRow).toHaveBeenCalledTimes(1);
  });
});

describe("webhook event emission", () => {
  it("records PENDING deliveries only for active matching subscribers", async () => {
    const payload = webhookEventCatalog["project.created"].example;
    mocks.webhookFindMany.mockResolvedValue([{ id: "webhook-1" }, { id: "webhook-2" }]);
    mocks.createDeliveries.mockResolvedValue(2);

    await expect(emitWebhookEvent("project.created", payload)).resolves.toBeUndefined();

    expect(mocks.webhookFindMany.mock.calls[0]?.[0]).toEqual({
      where: { active: true, events: { has: "project.created" } },
      select: { id: true },
    });
    const rows = ((mocks.createDeliveries.mock.calls[0]?.[0] as { data?: Array<Record<string, unknown>> } | undefined)?.data) ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      webhookId: "webhook-1",
      event: "project.created",
      payload: JSON.stringify(payload),
    });
    expect(rows[0]?.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("drops payloads that violate the declared event catalog before enqueueing", async () => {
    mocks.webhookFindMany.mockResolvedValue([{ id: "webhook-1" }]);

    await expect(
      emitWebhookEvent("project.created", { id: "project-1", malformed: true }),
    ).resolves.toBeUndefined();

    // Fail closed: not even a subscriber lookup happens for an undeclared
    // payload shape, and no delivery row is ever created.
    expect(mocks.webhookFindMany).toHaveBeenCalledTimes(0);
    expect(mocks.createDeliveries).toHaveBeenCalledTimes(0);
  });

  it("never fails the committed domain change when emission fails", async () => {
    const payload = webhookEventCatalog["project.created"].example;
    mocks.webhookFindMany.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(emitWebhookEvent("project.created", payload)).resolves.toBeUndefined();
    mocks.webhookFindMany.mockResolvedValueOnce([{ id: "webhook-1" }]);
    mocks.createDeliveries.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(emitWebhookEvent("project.created", payload)).resolves.toBeUndefined();
  });

  it("emits nothing when nobody subscribes", async () => {
    mocks.webhookFindMany.mockResolvedValue([]);
    await expect(emitWebhookEvent("project.updated", webhookEventCatalog["project.updated"].example)).resolves.toBeUndefined();
    expect(mocks.createDeliveries).toHaveBeenCalledTimes(0);
  });
});

describe("webhook delivery", () => {
  it("queries a batch bounded by max attempts, due dates, and at most 10 per tick", async () => {
    mocks.deliveryFindMany.mockResolvedValue([]);
    await deliverDueWebhookDeliveries({ fetchImpl: vi.fn(), now: () => 1_700_000_000_000 });
    expect(mocks.deliveryFindMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        attempts: { lt: WEBHOOK_MAX_ATTEMPTS },
        nextAttemptAt: { lte: new Date(1_700_000_000_000) },
      },
      take: 10,
      orderBy: { nextAttemptAt: "asc" },
      include: { webhook: true },
    });
  });

  it("delivers with an HMAC-SHA256 signature over the timestamped body", async () => {
    const { delivery, signingSecret } = aDueDelivery();
    mocks.deliveryFindMany.mockResolvedValue([delivery]);
    mocks.recordDeliveryRow.mockResolvedValue(delivery);
    const fetchImpl = vi.fn().mockResolvedValue(webhookResponse(200));
    const attemptedAtMs = 1_700_000_000_000;

    await deliverDueWebhookDeliveries({ fetchImpl, now: () => attemptedAtMs });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK_URL);
    const body = String(init.body);
    expect(JSON.parse(body)).toMatchObject({
      id: delivery.id,
      event: "project.created",
      data: { id: "project-1", name: "Launch checklist" },
      deliveryAttempt: 1,
    });
    const signatureMatch = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(
      String((init.headers as Record<string, string>)["authenik8-signature"]),
    );
    if (signatureMatch === null) throw new Error("delivery did not carry a signature header");
    const timestampPart = signatureMatch[1]!;
    const signaturePart = signatureMatch[2]!;
    expect(timestampPart).toBe(String(Math.floor(attemptedAtMs / 1000)));
    expect(signaturePart).toBe(
      createHmac("sha256", signingSecret).update(`${timestampPart}.${body}`).digest("hex"),
    );
    expect(mocks.recordDeliveryRow).toHaveBeenCalledWith(
      { where: { id: delivery.id }, data: {
        status: "DELIVERED",
        respondedAt: new Date(attemptedAtMs),
        lastStatus: 200,
        lastError: null,
        attempts: 1,
      } },
    );
  });

  it("retries other failures with exponential backoff until max attempts", async () => {
    dueBatch();
    const fetchImpl = vi.fn().mockResolvedValue(webhookResponse(503));
    const attemptedAtMs = 1_700_000_000_000;

    await deliverDueWebhookDeliveries({ fetchImpl, now: () => attemptedAtMs });

    expect(mocks.recordDeliveryRow).toHaveBeenCalledWith(
      { where: { id: "delivery-1" }, data: {
        status: "PENDING",
        lastStatus: 503,
        lastError: "Endpoint answered 503",
        attempts: 1,
        nextAttemptAt: new Date(attemptedAtMs + WEBHOOK_RETRY_DELAYS_SECONDS[0] * 1000),
      } },
    );

    // A failure that exhausts the attempt budget closes the cycle.
    dueBatch({ attempts: WEBHOOK_MAX_ATTEMPTS - 1 });
    await deliverDueWebhookDeliveries({ fetchImpl, now: () => attemptedAtMs });
    expect(mocks.recordDeliveryRow).toHaveBeenLastCalledWith(
      { where: { id: "delivery-1" }, data: expect.objectContaining({ status: "FAILED", attempts: WEBHOOK_MAX_ATTEMPTS }) },
    );
  });

  it("fails immediately when an endpoint retires the subscription", async () => {
    dueBatch();
    const fetchImpl = vi.fn().mockResolvedValue(webhookResponse(410));
    await deliverDueWebhookDeliveries({ fetchImpl, now: () => 1_700_000_000_000 });
    expect(mocks.recordDeliveryRow).toHaveBeenCalledWith(
      { where: { id: "delivery-1" }, data: expect.objectContaining({
        status: "FAILED",
        lastStatus: 410,
        lastError: "Endpoint retired the subscription (410 Gone)",
      }) },
    );
  });

  it("fails immediately when the secret cannot be unsealed or the payload corrupts", async () => {
    const { delivery } = aDueDelivery();
    const unsealable = { ...delivery, webhook: { ...delivery.webhook, secret: "not-a-sealed-value" } };
    const corrupt = { ...delivery, id: "delivery-2", payload: "{not json", webhook: delivery.webhook };
    mocks.deliveryFindMany.mockResolvedValue([unsealable, corrupt]);
    mocks.recordDeliveryRow.mockResolvedValue(delivery);
    const fetchImpl = vi.fn();
    await deliverDueWebhookDeliveries({ fetchImpl, now: () => 1_700_000_000_000 });

    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(mocks.recordDeliveryRow.mock.calls.map((call) => ((call[0] as { data: { status: string } }).data).status))
      .toEqual(["FAILED", "FAILED"]);
    expect(mocks.recordDeliveryRow.mock.calls[0]?.[0]).toMatchObject(
      { data: { lastError: "Signing secret could not be unsealed" } },
    );
    expect(mocks.recordDeliveryRow.mock.calls[1]?.[0]).toMatchObject(
      { data: { lastError: "Stored event payload is not valid JSON" } },
    );
  });

  it("treats network failures as retryable", async () => {
    dueBatch();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
    await deliverDueWebhookDeliveries({ fetchImpl, now: () => 1_700_000_000_000 });
    expect(mocks.recordDeliveryRow).toHaveBeenCalledWith(
      { where: { id: "delivery-1" }, data: expect.objectContaining({
        status: "PENDING",
        lastStatus: null,
        lastError: "connect ECONNREFUSED",
      }) },
    );
  });
});

describe("webhook signatures (public helper)", () => {
  it("follows the documented t / v1 header format", () => {
    const body = JSON.stringify({ event: "project.created" });
    const signature = webhookSignature("shared-secret", 1_700_000_000, body);
    expect(signature).toBe(
      `t=1700000000,v1=${createHmac("sha256", "shared-secret").update(`1700000000.${body}`).digest("hex")}`,
    );
  });
});

describe("webhook delivery history", () => {
  function historyMocks(overrides: Record<string, unknown> = {}) {
    mocks.transaction.mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
    const delivery = {
      id: "delivery-9",
      webhookId: "webhook-1",
      event: "project.created",
      payload: JSON.stringify({ id: "project-1", name: "Launch checklist" }),
      status: "DELIVERED" as const,
      attempts: 1,
      nextAttemptAt: new Date("2026-01-02T03:04:05.000Z"),
      respondedAt: new Date("2026-01-02T03:05:05.000Z") as Date | null,
      lastStatus: 200 as number | null,
      lastError: null as string | null,
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      ...overrides,
    };
    mocks.deliveryFindMany.mockResolvedValue([delivery]);
    mocks.countDeliveries.mockResolvedValue(1);
    return delivery;
  }

  it("serves paginated history to authorized readers and masks strangers", async () => {
    historyMocks();
    const { webhook } = aWebhook();
    mocks.findWebhookById.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === webhook.id ? webhook : null);

    const result = await listWebhookDeliveries(owner, "webhook-1", 2);

    expect(result.items[0]).toEqual({
      id: "delivery-9",
      event: "project.created",
      data: { id: "project-1", name: "Launch checklist" },
      status: "DELIVERED",
      attempts: 1,
      nextAttemptAt: "2026-01-02T03:04:05.000Z",
      respondedAt: "2026-01-02T03:05:05.000Z",
      lastStatus: 200,
      lastError: null,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    // The page slice and count flow through one repository transaction and
    // are fenced to the authorized webhook.
    expect(mocks.deliveryFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { webhookId: "webhook-1" },
      skip: 50,
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    expect(mocks.countDeliveries.mock.calls[0]?.[0]).toEqual({ where: { webhookId: "webhook-1" } });
    await expect(listWebhookDeliveries(stranger, "webhook-1", 1))
      .rejects.toMatchObject({ code: "WEBHOOK_NOT_FOUND" });
    await expect(listWebhookDeliveries(owner, "missing-id", 1))
      .rejects.toMatchObject({ code: "WEBHOOK_NOT_FOUND" });
    expect(mocks.deliveryFindMany).toHaveBeenCalledTimes(1);
  });

  it("clamps the page defensively before querying", async () => {
    historyMocks();
    mocks.findWebhookById.mockResolvedValue(aWebhook().webhook);

    const result = await listWebhookDeliveries(owner, "webhook-1", 0);

    expect(result.page).toBe(1);
    expect(mocks.deliveryFindMany.mock.calls[0]?.[0]).toMatchObject({ skip: 0, take: 50 });
  });

  it("presents a corrupted stored payload as null data instead of throwing", async () => {
    historyMocks({ payload: "{not json", status: "FAILED" as const, lastStatus: null, lastError: "Stored event payload is not valid JSON" });
    mocks.findWebhookById.mockResolvedValue(aWebhook().webhook);

    const result = await listWebhookDeliveries(owner, "webhook-1", 1);

    expect(result.items[0]).toMatchObject({
      data: null,
      status: "FAILED",
      lastError: "Stored event payload is not valid JSON",
    });
  });
});
