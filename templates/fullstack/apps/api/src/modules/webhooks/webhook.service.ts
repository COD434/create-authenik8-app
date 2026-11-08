import { randomBytes, createHmac } from "node:crypto";
import {
  webhookCreateSchema,
  webhookUpdateSchema,
  type WebhookEventType,
} from "@authenik8/contracts";
import type { Webhook } from "@prisma/client";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/http.js";
import { openSealedValue, sealValue } from "../../utils/sealed-value.js";
import { canReadWebhook, canWriteWebhook, webhookListScope } from "./webhook.policy.js";
import { type DueDelivery, webhookRepository } from "./webhook.repository.js";

type Actor = { userId: string; role: "USER" | "ADMIN" };

/**
 * Outbound webhook deliveries (roadmap item 12, first parcel: events and
 * webhooks).
 *
 * Services call `emitWebhookEvent` AFTER committing a domain change: it
 * only records PENDING delivery rows (best-effort, never eager) and the
 * delivery worker performs the actual HTTP deliveries with HMAC-SHA256
 * signatures and bounded retries, so emit points never block user
 * requests on network I/O.
 *
 * Delivery workers are per-instance, DB-backed and single-node in v1;
 * multiple replicas deliver at-least-once, and receivers must treat the
 * `Authenik8-Signature` header as the authenticity boundary. Secrets are
 * sealed at rest with the refresh-token vault key, returned exactly once
 * at subscription creation, and never appear in any other response, in
 * logs, or in signed URL parameters.
 */

const MAX_WEBHOOKS_PER_USER = 50;
export const WEBHOOK_MAX_ATTEMPTS = 8;
export const WEBHOOK_RETRY_DELAYS_SECONDS = [30, 120, 300, 900, 3600] as const;
const WEBHOOK_DELIVERY_TIMEOUT_MS = 10_000;
const WEBHOOK_DELIVERY_BATCH = 10;
const WORKER_INTERVAL_MS = 15_000;
const MAX_ERROR_LOG_LENGTH = 300;

function present(webhook: Webhook) {
  return {
    id: webhook.id,
    userId: webhook.userId,
    url: webhook.url,
    events: [...webhook.events] as WebhookEventType[],
    active: webhook.active,
    createdAt: webhook.createdAt.toISOString(),
    updatedAt: webhook.updatedAt.toISOString(),
  };
}

/** `t=<unix seconds>,v1=<hex hmac-sha256(secret, t + "." + body)>`. */
export function webhookSignature(secret: string, timestampSeconds: number, body: string): string {
  const signature = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

async function authorizedWebhook(actor: Actor, id: string, write = false): Promise<Webhook> {
  const webhook = await webhookRepository.findById(id);
  const allowed = webhook && (write ? canWriteWebhook(actor, webhook) : canReadWebhook(actor, webhook));
  if (!webhook || !allowed) throw new AppError(404, "WEBHOOK_NOT_FOUND", "Webhook not found");
  return webhook;
}

export async function listWebhooks(actor: Actor) {
  return (await webhookRepository.list(webhookListScope(actor))).map(present);
}

export async function getWebhook(actor: Actor, id: string) {
  return present(await authorizedWebhook(actor, id));
}

export async function createWebhook(actor: Actor, body: unknown) {
  const input = webhookCreateSchema.parse(body);
  const owned = await webhookRepository.countByUser(actor.userId);
  if (owned >= MAX_WEBHOOKS_PER_USER) {
    throw new AppError(422, "WEBHOOK_LIMIT_REACHED", `At most ${MAX_WEBHOOKS_PER_USER} webhooks per user`);
  }

  // Returned exactly once in the 201 response and sealed at rest before
  // it is ever persisted.
  const signingSecret = randomBytes(32).toString("base64url");
  const webhook = await webhookRepository.create({
    userId: actor.userId,
    url: input.url,
    events: input.events,
    secret: sealValue(signingSecret, env.REFRESH_SECRET),
  });
  return { webhook: present(webhook), signingSecret };
}

export async function updateWebhook(actor: Actor, id: string, body: unknown) {
  await authorizedWebhook(actor, id, true);
  return present(await webhookRepository.update(id, webhookUpdateSchema.parse(body)));
}

export async function deleteWebhook(actor: Actor, id: string) {
  await authorizedWebhook(actor, id, true);
  await webhookRepository.remove(id);
}

/**
 * Record PENDING deliveries for every active webhook subscribed to
 * `event`. Never throws: an emission failure must not fail the (already
 * committed) domain change that triggered it.
 */
export async function emitWebhookEvent(event: WebhookEventType, data: Record<string, unknown>): Promise<void> {
  try {
    const subscribers = await webhookRepository.findActiveSubscribers(event);
    if (subscribers.length === 0) return;
    await webhookRepository.createDeliveries(subscribers.map((subscriber) => ({
      webhookId: subscriber.id,
      event,
      payload: JSON.stringify(data),
      nextAttemptAt: new Date(),
    })));
  } catch (error) {
    logger.error({ err: error, event }, "Recording webhook deliveries failed");
  }
}

/**
 * Attempt every due PENDING delivery within this tick. Pure with respect
 * to timing (delay decisions and signatures depend on injected `now`), and
 * HTTP is injectable for tests (defaults to global `fetch`).
 */
export async function deliverDueWebhookDeliveries({
  fetchImpl = fetch,
  now = Date.now,
}: { fetchImpl?: typeof fetch; now?: () => number } = {}) {
  const attemptedAt = now();
  const due = await webhookRepository.findDueDeliveries(
    new Date(attemptedAt),
    WEBHOOK_MAX_ATTEMPTS,
    WEBHOOK_DELIVERY_BATCH,
  );

  for (const delivery of due) {
    await attemptDelivery(delivery, { fetchImpl, attemptedAt });
  }
  return { attempted: due.length };
}

async function attemptDelivery(
  delivery: DueDelivery,
  { fetchImpl, attemptedAt }: { fetchImpl: typeof fetch; attemptedAt: number },
): Promise<void> {
  const timestampSeconds = Math.floor(attemptedAt / 1000);
  const timestamp = new Date(attemptedAt);
  let delivered = false;
  // A delivery ends the retry cycle when it succeeds, when the endpoint
  // retires the subscription, or when the delivery can never succeed
  // (unsealable secret, corrupted payload): retrying would only burn
  // attempt budget.
  let permanent = false;
  let lastError: string | null = null;
  let lastStatus: number | null = null;

  try {
    const secret = openSealedValue(delivery.webhook.secret, env.REFRESH_SECRET);
    if (!secret) {
      lastError = "Signing secret could not be unsealed";
      permanent = true;
    } else {
      let data: unknown;
      try {
        data = JSON.parse(delivery.payload);
      } catch {
        data = null;
      }
      if (data === null && delivery.payload !== "null") {
        lastError = "Stored event payload is not valid JSON";
        permanent = true;
      } else {
        const body = JSON.stringify({
          id: delivery.id,
          event: delivery.event,
          createdAt: delivery.createdAt.toISOString(),
          deliveryAttempt: delivery.attempts + 1,
          data,
        });
        const response = await fetchImpl(delivery.webhook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authenik8-signature": webhookSignature(secret, timestampSeconds, body),
          },
          body,
          signal: AbortSignal.timeout(WEBHOOK_DELIVERY_TIMEOUT_MS),
        });
        lastStatus = response.status;
        if (response.ok) {
          delivered = true;
        } else if (response.status === 410) {
          lastError = "Endpoint retired the subscription (410 Gone)";
          permanent = true;
        } else {
          lastError = `Endpoint answered ${response.status}`;
        }
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? `${error.message}` : String(error);
  }

  const attempts = delivery.attempts + 1;
  const result = delivered || permanent
    ? {
      status: (delivered ? "DELIVERED" : "FAILED") as "DELIVERED" | "FAILED",
      respondedAt: timestamp,
      lastStatus,
      lastError: lastError ? capError(lastError) : null,
      attempts,
    }
    : {
      status: attempts >= WEBHOOK_MAX_ATTEMPTS ? ("FAILED" as const) : ("PENDING" as const),
      lastStatus,
      lastError: lastError ? capError(lastError) : null,
      attempts,
      nextAttemptAt: new Date(attemptedAt + retryDelayMs(attempts)),
    };

  await webhookRepository.recordDelivery(delivery.id, result);
}

function retryDelayMs(attempts: number): number {
  const delay = WEBHOOK_RETRY_DELAYS_SECONDS[Math.min(attempts - 1, WEBHOOK_RETRY_DELAYS_SECONDS.length - 1)];
  return (delay ?? 3600) * 1000;
}

function capError(value: string): string {
  return value.length > MAX_ERROR_LOG_LENGTH ? `${value.slice(0, MAX_ERROR_LOG_LENGTH)}…` : value;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let delivering = false;

/**
 * Start the singleton in-process delivery loop. DB-backed queue, so
 * nothing is lost across restarts; deliveries are at-least-once.
 */
export function startWebhookWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void runWorkerTick();
  }, WORKER_INTERVAL_MS);
  workerTimer.unref();
}

export function stopWebhookWorker(): void {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}

async function runWorkerTick(): Promise<void> {
  if (delivering) return;
  delivering = true;
  try {
    await deliverDueWebhookDeliveries();
  } catch (error) {
    logger.error({ err: error }, "Webhook delivery tick failed");
  } finally {
    delivering = false;
  }
}
